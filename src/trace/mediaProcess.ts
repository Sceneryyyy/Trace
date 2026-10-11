import {spawn} from 'node:child_process'
import {join} from 'node:path'
export type ProcessOptions={signal?:AbortSignal;line?:(line:string)=>void;capture?:boolean;maximumOutput?:number}
let createJob:((pid:number)=>{close():void|Promise<void>})|undefined
/** On Windows the main process owns the job before the supervisor may spawn. */
export function configureMediaProcessJobs(factory:typeof createJob){createJob=factory}
export function mediaProcess(program:string,args:string[],options:ProcessOptions={}):Promise<string>{
 if(options.signal?.aborted)return Promise.reject(Error('MEDIA_CANCELLED'))
 return new Promise((resolve,reject)=>{
  // The supervisor remains responsive while FFmpeg runs. IPC disconnect cancels
  // its child even if the Electron main process is terminated unexpectedly.
  const runner=spawn(process.execPath,[join(__dirname,'media-runner.js')],{detached:process.platform!=='win32',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:['ignore','ignore','pipe','ipc']})
  let job:{close():void|Promise<void>}|undefined,childPid:number|undefined,cleanupDone:Promise<void>=Promise.resolve(),cleanupFailed=false
  const cleanup=async()=>{
   await job?.close();job=undefined
   if(process.platform!=='win32'&&runner.pid){try{process.kill(-runner.pid,'SIGKILL')}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error}}
   // Only portable harnesses without the native addon use this fallback.
   else if(childPid&&!createJob&&resultCode===undefined)spawn('taskkill.exe',['/pid',String(childPid),'/t','/f'],{windowsHide:true,stdio:'ignore'}).on('error',()=>{})
  }
  let output='',pending='',error='',settled=false,aborted=false,overflow=false,resultCode:number|undefined
  const abort=()=>{aborted=true;if(runner.connected)runner.send({type:'cancel'},error=>{if(error&&runner.connected)runner.disconnect()})}
  options.signal?.addEventListener('abort',abort,{once:true})
  runner.on('message',(raw:unknown)=>{
   const message=raw as {type:string;text?:string;message?:string;code?:number;pid?:number}
   if(message.type==='spawn')childPid=message.pid
   else if(message.type==='stdout'){
    const text=message.text||''
    if(options.capture){output+=text;if(output.length>(options.maximumOutput??1000000)){overflow=true;abort()}}
    if(options.line){
     pending+=text
     for(;;){const i=pending.indexOf('\n');if(i<0)break;const line=pending.slice(0,i).replace(/\r$/,'');pending=pending.slice(i+1);try{options.line(line)}catch{}}
     if(pending.length>16000){overflow=true;abort()}
    }
   }else if(message.type==='stderr')error=(error+(message.text||'')).slice(-16000)
   else if(message.type==='error')error=(error+(message.message||'')).slice(-16000)
   else if(message.type==='exit')resultCode=message.code
  })
  runner.stderr?.on('data',data=>error=(error+String(data)).slice(-16000))
  const detach=()=>options.signal?.removeEventListener('abort',abort)
  runner.on('error',cause=>{if(settled)return;settled=true;detach();reject(cause)})
  // 'exit' precedes 'close': orphan descendants may still hold pipes open.
  runner.once('exit',()=>{cleanupDone=cleanup().catch(cause=>{cleanupFailed=true;error+=String(cause)})})
  runner.on('close',async code=>{
   await cleanupDone
   if(settled)return;settled=true;detach()
   if(cleanupFailed)reject(Error('MEDIA_PROCESS_TREE_CLEANUP_FAILED: '+error))
   else if(overflow)reject(Error('MEDIA_PROCESS_OUTPUT_LIMIT'))
   else if(aborted||options.signal?.aborted)reject(Error('MEDIA_CANCELLED'))
   else if(code!==0||resultCode!==0)reject(Error('MEDIA_PROCESS_FAILED: '+error))
   else resolve(output)
  })
  try{if(process.platform==='win32'&&createJob&&runner.pid)job=createJob(runner.pid)}catch(cause){error=String(cause);runner.kill();return}
  runner.send({program,args,testReadRate:process.argv.includes('--trace-test')?Number(process.env.TRACE_TEST_MEDIA_READ_RATE)||undefined:undefined},cause=>{if(cause&&!settled){error+=String(cause);abort()}})
  if(options.signal?.aborted)abort()
 })
}
