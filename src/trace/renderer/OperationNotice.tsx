import {useEffect,useRef,useState} from 'react'
import type {TraceState,TakeSummary} from '../shared'
import type {ExportView} from '../exportTypes'
import {userError} from '../userErrors'
export type Notice={key:string;message:string;takeId?:string;exportId?:string;ready:boolean;failed?:boolean;recovery?:boolean;setup?:boolean}
export function recordNotice(take:TakeSummary):Notice{
 const output=take.exports?.find(e=>e.automatic),failed=take.status==='failed'||output?.phase==='failed'||output?.phase==='cancelled'
 const ready=['ready','recovered'].includes(take.status)&&(!output||output.phase==='ready')
 return {key:'record:'+take.id+':'+(failed?'failed':ready?'ready':'progress'),message:(failed?'录音需要处理：':ready?'已保存：':'正在生成文件：')+take.name,takeId:take.id,exportId:output?.phase==='ready'?output.id:undefined,ready,failed}
}
export function exportNotice(job:ExportView):Notice{
 const ready=job.phase==='ready'&&(!job.delivery||job.delivery.phase==='ready'),failed=['failed','cancelled'].includes(job.phase)||job.delivery?.phase==='failed'
 return {key:'export:'+job.id+':'+(ready?'ready':failed?'failed':'progress'),message:ready?(job.delivery?'已另存：':'导出已完成：')+job.label:failed?'导出需要处理：'+userError(job.delivery?.error||job.error):job.phase==='ready'?'正在另存：'+job.label:'正在导出 '+Math.round(job.fraction*100)+'% · '+job.label,takeId:job.takeId,exportId:job.id,ready,failed}
}
export function useOperationNotice(state:TraceState){
 const lastRecord=useRef<string|null>(null),[record,setRecord]=useState<string|null>(null),[job,setJob]=useState<string|null>(null),[dismissed,setDismissed]=useState('')
 useEffect(()=>{
  if(state.currentRecord){lastRecord.current=state.currentRecord.id;setRecord(null);setJob(null)}
  else if(lastRecord.current){setRecord(lastRecord.current);lastRecord.current=null}
 },[state.currentRecord?.id])
 const take=state.recordings?.find(t=>t.id===record),output=state.exportJobs?.find(e=>e.id===job),recoveries=state.recordings?.filter(t=>t.status==='recoverable').length||0
 const notice:Notice|null=state.currentRecord?null:output?exportNotice(output):take?recordNotice(take):recoveries?{key:'recovery:'+state.recordDirectory,message:'发现 '+recoveries+' 条可恢复录音',ready:false,recovery:true}:state.deviceId&&!state.recordDirectory?{key:'setup',message:state.recordDirectoryError?'上次保存目录不可用，请重新选择':'先选择保存目录，随后可直接录音',ready:false,setup:true}:null
 const key=notice?.key,ready=notice?.ready
 useEffect(()=>{if(!key||!ready)return;const timer=setTimeout(()=>setDismissed(key),9000);return()=>clearTimeout(timer)},[key,ready])
 return {notice:notice&&notice.key!==dismissed?notice:null,trackExport:setJob,trackSavedRecord:setRecord,dismiss:()=>{if(key)setDismissed(key)}}
}
export function OperationNotice({notice,busy,open,folder,retry,close}:{notice:Notice;busy:boolean;open:()=>void;folder:()=>void;retry:()=>void;close:()=>void}):React.JSX.Element{
 return <aside className={'operation-notice '+(notice.failed?'notice-error':'')} role="status">
  <span title={notice.message}>{notice.message}</span>
  <button disabled={busy} onClick={open}>{notice.ready?'查看':notice.recovery?'查看恢复':notice.setup?'设置目录':'文件列表'}</button>
  {notice.ready&&<button disabled={busy} onClick={folder}>打开目录</button>}
  {notice.failed&&notice.exportId&&<button disabled={busy} onClick={retry}>重试</button>}
  <button className="notice-close" aria-label="关闭提示" onClick={close}>×</button>
 </aside>
}
