import {mkdir,lstat,realpath} from 'node:fs/promises'
import {join,dirname} from 'node:path'
import type {ExportOwner,ExportRepository} from './exportRepository'
import type {ExportService} from './exportService'
import type {ExportRecord} from './exportTypes'
export class DeliveryService{
 private grants=new Set<string>()
 private current:{id:string;controller:AbortController}|undefined
 private running:Promise<void>|undefined
 private paused=false
 private closing=false
 constructor(private recordings:Pick<ExportRepository,'sessions'>,private exporter:ExportService,private changed:()=>void,private canRun:()=>boolean){}
 private find(id:string):{take:ExportOwner;record:ExportRecord}{
  for(const take of this.recordings.sessions()){const record=take.document.exports?.find(r=>r.id===id);if(record)return {take,record}}
  throw Error('UNKNOWN_EXPORT_JOB')
 }
 async plan(id:string,directory:string):Promise<void>{
  const actual=await realpath(directory);if(!(await lstat(actual)).isDirectory())throw Error('INVALID_EXPORT_DIRECTORY')
  const {take,record}=this.find(id)
  record.delivery={phase:'pending',directory:actual,name:take.document.name.slice(0,116)+(record.source.range?'-选区':''),error:null}
  await take.save();this.grants.add(id);this.changed();this.pump()
 }
 busy():boolean{return Boolean(this.current)}
 forgetTake(takeId:string,exportId?:string):void{for(const id of this.grants){try{const r=this.find(id).record;if(r.source.takeId===takeId&&(!exportId||id===exportId))this.grants.delete(id)}catch{this.grants.delete(id)}}}
 observe():void{this.pump()}
 resume():void{this.paused=false;this.pump()}
 async pause():Promise<void>{this.paused=true;this.current?.controller.abort();await this.running}
 private pump():void{
  if(this.paused||this.closing||this.current||!this.canRun())return
  const id=[...this.grants].find(id=>{try{const r=this.find(id).record;return r.phase==='ready'&&r.delivery?.phase==='pending'}catch{this.grants.delete(id);return false}})
  if(!id)return
  const current={id,controller:new AbortController()};this.current=current
  this.running=this.run(id,current.controller.signal).catch(error=>{this.grants.delete(id);try{const d=this.find(id).record.delivery;if(d){d.phase='failed';d.error=String(error)}}catch{}}).finally(()=>{this.current=undefined;this.running=undefined;this.changed();this.pump()})
 }
 private async target(record:ExportRecord):Promise<string>{
  const delivery=record.delivery!,info=this.exporter.saveInfo(record.id)
  const directory=await realpath(delivery.directory);if(directory.toLowerCase()!==delivery.directory.toLowerCase()||!(await lstat(directory)).isDirectory())throw Error('EXPORT_DIRECTORY_CHANGED')
  if(delivery.targetPath){if(delivery.multiple){const info=await lstat(delivery.targetPath);if(!info.isDirectory()||info.isSymbolicLink()||(await realpath(delivery.targetPath)).toLowerCase()!==delivery.targetPath.toLowerCase())throw Error('EXPORT_DIRECTORY_CHANGED')}return delivery.targetPath}
  for(let i=0;i<10000;i++){
   const stem=delivery.name+(i?' ('+(i+1)+')':''),target=join(directory,stem+(info.multiple?'':'.'+info.extension))
   if(info.multiple){try{await mkdir(target);delivery.targetPath=target;delivery.multiple=true;return target}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')continue;throw error}}
   try{await lstat(target)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){delivery.targetPath=target;delivery.multiple=false;return target}throw error}
  }
  throw Error('EXPORT_DESTINATION_FULL')
 }
 private async run(id:string,signal:AbortSignal):Promise<void>{
  const {take,record}=this.find(id),delivery=record.delivery!
  try{
   const target=await this.target(record);delivery.phase='copying';delivery.error=null;await take.save();this.changed()
   if(signal.aborted)throw Error('DELIVERY_PAUSED')
   await this.exporter.saveCopy(id,target,{signal,resume:true,baseName:delivery.name})
   delivery.phase='ready';this.grants.delete(id)
  }catch(error){
   if(signal.aborted&&!this.closing){delivery.phase='pending';delivery.error=null}
   else{delivery.phase='failed';delivery.error=this.closing?'另存因退出中断，请重新另存。':String(error);this.grants.delete(id)}
  }finally{await take.save();this.changed()}
 }
 async markManual(id:string,target:string,multiple:boolean):Promise<void>{
  const {take,record}=this.find(id)
  record.delivery={phase:'ready',directory:multiple?target:dirname(target),targetPath:target,multiple,name:take.document.name,error:null}
  this.grants.delete(id);await take.save();this.changed()
 }
 async folder(id:string):Promise<string>{
  const d=this.find(id).record.delivery;if(!d||d.phase!=='ready'||!d.targetPath)throw Error('EXPORT_DELIVERY_NOT_READY')
  const directory=d.multiple?d.targetPath:dirname(d.targetPath),actual=await realpath(directory)
  if(!(await lstat(actual)).isDirectory())throw Error('INVALID_EXPORT_DIRECTORY')
  return actual
 }
 async shutdown():Promise<void>{
  this.closing=true;await this.pause()
  for(const id of this.grants){const {take,record}=this.find(id);if(record.delivery?.phase==='pending'){record.delivery.phase='failed';record.delivery.error='另存因退出中断，请重新另存。';await take.save()}}
  this.grants.clear()
 }
}
