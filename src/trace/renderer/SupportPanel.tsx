import {useState} from 'react'
import {feedbackEmail} from '../supportContent'
import type {Command} from '../shared'
export function SupportPanel({request,loggingAvailable}:{request:(command:Command,payload?:Record<string,unknown>)=>Promise<unknown>;loggingAvailable?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function act(command:Command){
  setBusy(true);setMessage('')
  try{const result=await request(command) as {cancelled?:boolean}|undefined
   setMessage(result?.cancelled?'已取消':command==='app.exportDiagnostics'?'诊断与反馈模板已导出。':command==='app.feedback'?'已请求打开邮件草稿，请检查内容并手动添加诊断附件。':'已复制诊断信息。')
  }catch{setMessage(command==='app.feedback'?'未能打开邮件客户端。请导出诊断，并手动发送到 '+feedbackEmail+'。':'操作未完成，请重试；导出时可选择其他目录。')}
  finally{setBusy(false)}
 }
 return <section className="support-panel" aria-label="故障诊断与反馈"><h3>诊断与反馈</h3>
  <p>诊断包含运行环境、任务状态与近期故障，不含音频、文件名或个人路径。</p>
  {loggingAvailable===false&&<p role="status">本地故障记录暂时无法保存，仍可尝试导出当前状态。</p>}
  <div className="support-actions"><button disabled={busy} onClick={()=>void act('app.exportDiagnostics')}>导出诊断</button><button disabled={busy} onClick={()=>void act('app.copyDiagnostics')}>复制诊断</button><button disabled={busy} onClick={()=>void act('app.feedback')}>邮件反馈</button></div>
  <p className="support-address">{feedbackEmail} · 附件由你检查后添加</p>
  {message&&<p role="status">{message}</p>}
 </section>
}
