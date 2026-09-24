import {app,dialog,shell,type BrowserWindow} from 'electron'
import {readFile} from 'node:fs/promises'
import {release,totalmem} from 'node:os'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {SupportJournal,type SupportStatus,type SupportEventKind} from './supportJournal'
import {exportSupportReport,feedbackMailto,type SupportReport} from './supportReport'
import {setSupportEventSink} from './supportEvents'
import type {TraceState} from './shared'

export class SupportRuntime {
 private busy=false
 private captureKey=''
 private recordKey=''
 private failedJobs=-1
 private rendererDialog=false
 private terminating=false
 private constructor(private journal:SupportJournal,private version:string,private buildId:string,private state:()=>TraceState,
  private snapshot:()=>unknown,private testRoot?:string){}
 static async create(version:string,entry:string,state:()=>TraceState,snapshot:()=>unknown,changed:()=>void,testRoot?:string){
  const journal=await SupportJournal.open(join(app.getPath('userData'),'support'),changed)
  const buildId=createHash('sha256').update(await readFile(entry)).digest('hex')
  const value=new SupportRuntime(journal,version,buildId,state,snapshot,testRoot)
  setSupportEventSink((kind,detail)=>journal.record(kind,detail))
  app.on('child-process-gone',(_event,details)=>{if(!['clean-exit','killed'].includes(details.reason))journal.record('child-gone',details.exitCode)})
  return value
 }
 get status():SupportStatus{return this.journal.status}
 observe():void{
  const s=this.state(),capture=[s.active,Boolean(s.error)].join(':'),record=s.currentRecord?.phase||'idle'
  if(capture!==this.captureKey){this.captureKey=capture;this.journal.record('capture',s.error?-1:s.active?1:0)}
  if(record!==this.recordKey){this.recordKey=record;this.journal.record('recording',['idle','preparing','armed','recording','reconnecting','finalizing','failed'].indexOf(record))}
  const failed=[...(s.analysisJobs||[]),...(s.exportJobs||[]),...(s.reportJobs||[]),...(s.imports||[])].filter(j=>('phase'in j?j.phase:j.status)==='failed').length
  if(failed!==this.failedJobs){this.failedJobs=failed;if(failed)this.journal.record('jobs',failed)}
 }
 record(kind:SupportEventKind,detail?:number){this.journal.record(kind,detail)}
 async report():Promise<SupportReport>{
  await this.journal.flush()
  let snapshot:unknown=null
  try{snapshot=this.snapshot()}catch{/* A damaged native engine must not prevent diagnostic export. */}
  const gpu=app.getGPUFeatureStatus(),features:Record<string,string>={}
  for(const key of ['gpu_compositing','rasterization','webgl','webgl2']){const value=gpu[key as keyof typeof gpu];if(typeof value==='string'&&/^[a-z_]{1,48}$/.test(value))features[key]=value}
  return {schemaVersion:1,product:'Trace',version:this.version,buildId:this.buildId,capturedAt:new Date().toISOString(),
   runtime:{platform:process.platform,osRelease:release(),arch:process.arch,electron:process.versions.electron,chrome:process.versions.chrome,node:process.versions.node,memoryGiB:Math.round(totalmem()/1024**3),gpu:features},
   status:this.status,events:this.journal.history(),snapshot}
 }
 async export(window?:BrowserWindow|null):Promise<{cancelled?:boolean;directory?:string}>{
  if(this.busy)throw Error('DIAGNOSTICS_BUSY')
  this.busy=true
  try{
   let directory=this.testRoot&&process.env.TRACE_TEST_SUPPORT_DIRECTORY=== '1'?this.testRoot:undefined
   if(!directory){const options:Electron.OpenDialogOptions={title:'选择诊断导出目录',properties:['openDirectory','createDirectory']};const result=window?await dialog.showOpenDialog(window,options):await dialog.showOpenDialog(options);if(result.canceled||!result.filePaths[0])return {cancelled:true};directory=result.filePaths[0]}
   const output=await exportSupportReport(directory,await this.report());this.journal.record('diagnostic-exported')
   if(!this.testRoot)shell.showItemInFolder(join(output,'diagnostics.json'))
   return {directory:output}
  }finally{this.busy=false}
 }
 async feedback():Promise<{opened:boolean;mailto?:string}>{
  const uri=feedbackMailto(this.version)
  if(this.testRoot)return {opened:false,mailto:uri}
  try{await shell.openExternal(uri);return {opened:true}}catch{throw Error('FEEDBACK_MAIL_UNAVAILABLE')}
 }
 reload(window:BrowserWindow):void{this.journal.record('renderer-reload');window.webContents.reload()}
 bindWindow(window:BrowserWindow):void{
  window.webContents.on('render-process-gone',(_event,details)=>{
   if(this.terminating||window.isDestroyed())return
   this.journal.record('renderer-gone',details.exitCode)
   // Defer out of Chromium's process-disposal notification before creating a new renderer.
   setImmediate(()=>{if(!this.terminating&&!window.isDestroyed())void this.recoverRenderer(window).catch(()=>{app.quit()})})
  })
 }
 private async recoverRenderer(window:BrowserWindow):Promise<void>{
  if(this.rendererDialog)return
  this.rendererDialog=true
  try{
   while(!this.terminating&&!window.isDestroyed()){
    const recording=Boolean(this.state().currentRecord)
    const response=this.testRoot&&process.env.TRACE_TEST_SUPPORT_RELOAD==='1'?0:(await dialog.showMessageBox(window,{type:'error',title:'Trace 界面已中断',message:recording?'界面已中断，录音仍由后台处理。':'界面已中断。',detail:'可以恢复界面，或导出诊断后退出。退出将尝试完成已写入录音的收尾；文件完整性以恢复检查为准。',buttons:['恢复界面','导出诊断','结束并退出'],defaultId:0,cancelId:2,noLink:true})).response
    if(response===0){this.reload(window);return}
    if(response===2){app.quit();return}
    try{await this.export(window)}catch{if(!this.testRoot)await dialog.showMessageBox(window,{type:'error',message:'诊断导出失败，请重试或选择其他目录。'})}
   }
  }finally{this.rendererDialog=false}
 }
 fatal(kind:'main-uncaught'|'main-rejection'|'startup-failed'):void{
  this.terminating=true;this.journal.fatal(kind)
  // Do not continue native/file operations after an unknown main-process failure.
  app.exit(1)
 }
 async startupFailure():Promise<void>{
  this.terminating=true;this.journal.record('startup-failed');this.journal.fatal('startup-failed')
  if(!this.testRoot){
   const choice=await dialog.showMessageBox({type:'error',title:'Trace 无法启动',message:'启动未能完成。',detail:'可以导出诊断后反馈；已有录音不会在这里删除。',buttons:['导出诊断并退出','退出'],defaultId:0,cancelId:1,noLink:true})
   if(choice.response===0)try{await this.export()}catch{await dialog.showMessageBox({type:'error',message:'诊断导出失败。本地故障记录将在下次启动时保留。'})}
  }
  app.exit(1)
 }
 /** Records that shutdown exceeded its deadline; the next start can surface it. */
 recordShutdownTimeout(){this.journal.record('shutdown-timeout')}
 async finish(){this.terminating=true;await this.journal.finish();setSupportEventSink(undefined)}
 stopDialogs(){this.terminating=true}
}
