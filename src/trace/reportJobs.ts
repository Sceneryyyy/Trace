import {spawn} from 'node:child_process'
import {join} from 'node:path'
import type {ReportRequest,ReportResult} from './reportTypes'
export type ReportMemory={rss:number;heapUsed:number}
export function runReport(request:ReportRequest,signal:AbortSignal,progress:(rows:number,total:string,memory?:ReportMemory)=>void):Promise<ReportResult>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(Error('REPORT_CANCELLED'));return}
  const child=spawn(process.execPath,[join(__dirname,'report-worker.js')],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true})
  let result:{ok:boolean;result:ReportResult;error:string}|undefined,timer:ReturnType<typeof setTimeout>|undefined,stderr='',aborting=false
  const abort=()=>{if(aborting)return;aborting=true;try{if(child.connected)child.send({kind:'cancel'},()=>{})}catch{};timer=setTimeout(()=>child.kill(),2000)}
  signal.addEventListener('abort',abort,{once:true})
  child.stderr?.on('data',bytes=>{stderr=(stderr+bytes).slice(-4000)})
  child.on('message',(raw:unknown)=>{const m=raw as {type?:string;rows:number;total:string;memory?:ReportMemory}&NonNullable<typeof result>;if(m.type==='progress'){if(!signal.aborted)progress(m.rows,m.total,m.memory)}else result=m})
  child.once('error',error=>{signal.removeEventListener('abort',abort);if(timer)clearTimeout(timer);reject(error)})
  child.once('close',code=>{signal.removeEventListener('abort',abort);if(timer)clearTimeout(timer);if(signal.aborted)reject(Error('REPORT_CANCELLED'));else if(code===0&&result?.ok)resolve(result.result);else reject(Error(result?.error||'REPORT_WORKER_EXIT '+code+': '+stderr))})
  child.send({kind:'report',request},error=>{if(error)child.kill()});if(signal.aborted)abort()
 })
}
