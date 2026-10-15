import {ReviewPanel} from './ReviewPanel'
import {useEffect,useMemo,useState} from 'react'
import {userError} from '../userErrors'
const phases={queued:'等待处理',running:'正在生成',ready:'已生成',failed:'失败',cancelled:'已取消'}
const integrityLabels={complete:'完整',estimated:'含估计区间',gaps:'存在中断',unknown:'待核实'}
const metricLabels={integrated:['I','LUFS'],truePeak:['TP','dBTP'],lra:['LRA','LU'],momentaryMax:['最大 M','LUFS'],shortTermMax:['最大 S','LUFS']}
const metricText=(v:number|null)=>v===null?'—':v.toFixed(2).replace('-','−')
import type {ReportJobView} from '../reportService'
import type {ReportResult} from '../reportTypes'
import type {TargetSettings} from '../targetSettings'
import {targetKey} from '../targetSettings'
import type {Command,PlaybackView} from '../shared'
import './reports.css'
const labels={'true-peak':'TP 超限','integrated-high':'累计 I 高于目标','integrated-low':'累计 I 低于目标','momentary-high':'M 超限','short-term-high':'S 超限','data-gap':'电平数据缺口','data-error':'电平数据错误','loudness-gap':'响度窗口缺口','loudness-error':'响度窗口错误'}
export function ReportPanel({file,targets,jobs,recording,request,onNavigate}:{file?:PlaybackView|null;targets:TargetSettings;jobs:ReportJobView[];recording:boolean;onNavigate:()=>void;request:(name:Command,payload?:Record<string,unknown>)=>Promise<unknown>}){
 const [scope,setScope]=useState<'whole'|'selection'>(file?.selection?'selection':'whole'),[selected,setSelected]=useState(jobs[0]?.id||''),[result,setResult]=useState<ReportResult|null>(null),[error,setError]=useState(''),[page,setPage]=useState(0)
 const job=jobs.find(j=>j.id===selected),ready=Boolean(file&&!file.temporary&&!recording&&(scope==='whole'?file.analysisPhase==='ready':file.selection&&file.selectionAnalysis?.phase==='ready'))
 useEffect(()=>{if(!jobs.some(j=>j.id===selected)){setSelected(jobs[0]?.id||'');setResult(null)}},[jobs,selected])
 useEffect(()=>{setResult(null);setPage(0);if(!job||job.phase!=='ready')return;let active=true;request('report.get',{reportId:job.id}).then(v=>{if(active)setResult(v as ReportResult)}).catch(e=>{if(active)setError(userError(e))});return()=>{active=false}},[job?.id,job?.phase])
 const action=(name:Command,payload:Record<string,unknown>)=>{setError('');void request(name,payload).then(v=>{const value=v as {reportId?:string};if(value?.reportId)setSelected(value.reportId);if(['report.jump','report.markerJump'].includes(name))onNavigate()}).catch(e=>setError(userError(e)))}
 const sameSource=Boolean(file&&result&&file.takeId===result.source.takeId&&file.role===result.source.role&&file.regionId===result.source.regionId&&file.exportId===result.source.exportId)
 const events=useMemo(()=>result?.eventPreview.map((event,index)=>({event,index})).sort((a,b)=>BigInt(a.event.startFrame)<BigInt(b.event.startFrame)?-1:BigInt(a.event.startFrame)>BigInt(b.event.startFrame)?1:0)||[],[result])
 return <div className="report-panel"><ReviewPanel file={file} recording={recording} request={request} onNavigate={onNavigate}/>
  <div className="report-create"><div><strong>{file?.label||'选择已保存的文件'}</strong><small>{file?.temporary?'请先保存缓存，再生成报告。':'报告不会改写音频。临时预览请通过“导出报告”保存。'}</small></div><select aria-label="报告范围" value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="whole">整段</option><option value="selection" disabled={!file?.selection}>选区独立分析</option></select><button disabled={!ready} onClick={()=>file&&action('report.prepare',{playbackId:file.id,scope})}>生成报告</button></div>
  {!ready&&file&&!file.temporary&&<small>{recording?'结束录音后可生成报告。':'等待所选范围的分析完成。'}</small>}
  {jobs.length>0&&<label className="report-select">本次报告<select aria-label="报告任务" value={selected} onChange={e=>setSelected(e.target.value)}>{jobs.map(j=><option key={j.id} value={j.id}>{j.label} · {j.scope.kind==='whole'?'整段':'选区'} · {phases[j.phase]} · {new Date(j.createdAt).toLocaleTimeString('zh-CN',{hour12:false})}</option>)}</select></label>}
  {job&&<div className="report-actions">
   {['queued','running'].includes(job.phase)&&<><progress max={Math.max(1,Number(job.total))} value={job.total==='0'?undefined:job.rows}/><span>{job.phase==='queued'?(recording?'等待录音结束':'等待处理'):job.total==='0'?'准备数据':'正在生成'}{job.total!=='0'&&` · ${job.rows} / ${job.total}`}</span><button onClick={()=>action('report.cancel',{reportId:job.id})}>取消生成</button></>}
   {['failed','cancelled'].includes(job.phase)&&<><span role="status">{job.error?userError(job.error):'已取消'}</span><button disabled={recording} onClick={()=>action('report.retry',{reportId:job.id})}>重试生成</button></>}
   {job.phase==='ready'&&<><button onClick={()=>action('report.open',{reportId:job.id})}>打开预览</button><button disabled={recording||job.exportState?.phase==='writing'} onClick={()=>action('report.export',{reportId:job.id})}>导出报告</button>{job.exportState?.phase==='writing'&&<button onClick={()=>action('report.cancel',{reportId:job.id})}>取消导出</button>}<small>{job.exportState?.phase==='ready'?'已导出：'+job.exportState.directory:job.exportState?.error?userError(job.exportState.error):''}</small></>}
  </div>}
  {result&&<>
   {result.distribution&&<div className="report-result"><span>PLR {result.distribution.plr.value?.toFixed(2)??'—'} LU · PSR 均值 {result.distribution.psr.mean.value?.toFixed(2)??'—'} LU</span><small title={result.distribution.psr.mean.definition}>分布按有效帧时间加权；完整 M/S 分布在 HTML 报告中。</small></div>}
   {result.markers?.length? <details><summary>报告中的复核标记</summary>{result.markers.map((m,index)=><div key={m.id}><button disabled={!sameSource||recording} onClick={()=>action('report.markerJump',{reportId:result===null?'':job!.id,index})}>{m.label} · {(Number(m.startFrame)/result.analysis.sampleRate).toFixed(3)} s</button><span>{m.comment}</span></div>)}</details>:null}
   <div className="report-result" data-report-result={result.evaluation.state}><strong>{result.evaluation.state==='pass'?'符合所选目标':result.evaluation.state==='fail'?'超出所选目标':result.evaluation.state==='disabled'?'未启用目标':'尚不能完整判断'}</strong><span>{result.source.scope.kind==='whole'?'整段':'选区'} · {(Number(result.source.scope.startFrame)/result.analysis.sampleRate).toFixed(3)} ～ {(Number(result.source.scope.endFrame)/result.analysis.sampleRate).toFixed(3)} s</span><span title={result.source.integrity.notes.join('\n')}>完整性：{integrityLabels[result.source.integrity.state]} · {result.events} 条事件</span></div>
   {result.targetKey!==targetKey(targets)&&<p className="report-stale" role="status">目标已改变；这份报告保留生成时的目标，请重新生成以应用新目标。</p>}
   <table className="report-table"><thead><tr><th>指标</th><th>数值</th><th>范围</th><th>结果</th></tr></thead><tbody>{result.evaluation.checks.map(c=><tr key={c.id}><td>{metricLabels[c.id][0]} <small>{metricLabels[c.id][1]}</small></td><td title={String(c.value??c.metricStatus)}>{c.metricStatus==='silence'?'−∞':metricText(c.value)}</td><td>{c.state==='disabled'?'—':`${c.min===null?'不限':metricText(c.min)} ～ ${c.max===null?'不限':metricText(c.max)}`}</td><td>{c.reason||({pass:'目标内',fail:'超出目标',unavailable:'待判定',disabled:'未启用'}[c.state])}</td></tr>)}</tbody></table>
   <h3>事件 <small>预览 {events.length} / {result.events} · 完整明细见 CSV</small></h3><div className="report-event-scroll"><table className="report-table"><thead><tr><th>类型</th><th>起 · s</th><th>止 · s</th><th>极值</th><th/></tr></thead><tbody>{events.slice(page*50,(page+1)*50).map(({event:e,index})=><tr key={index}><td>{labels[e.kind]}{e.channel===null?'':' · '+(result.analysis.channelCount===1?'M':e.channel?'R':'L')}</td><td>{(Number(e.startFrame)/result.analysis.sampleRate).toFixed(3)}</td><td>{(Number(e.endFrame)/result.analysis.sampleRate).toFixed(3)}</td><td title={String(e.extreme??e.status)}>{e.extreme!==null?metricText(e.extreme):e.status==='silence'?'−∞':'—'}{e.extreme!==null&&<small> {e.kind==='true-peak'?'dBTP':'LUFS'}</small>}</td><td><button disabled={!sameSource||recording} title={sameSource?'定位到此观察窗口':'请先打开报告对应的文件'} onClick={()=>action('report.jump',{reportId:job!.id,index})}>定位</button></td></tr>)}</tbody></table></div>
   {events.length>50&&<div className="report-pages"><button disabled={page===0} onClick={()=>setPage(page-1)}>上一页</button><span>{page+1} / {Math.ceil(events.length/50)}</span><button disabled={(page+1)*50>=events.length} onClick={()=>setPage(page+1)}>下一页</button></div>}
   <p className="small-note">TP 为 10 ms 观察窗口，M/S/I 为 10 ms 快照；累计 I 事件不等于最终整段结论。CSV 记录原始数值和状态。</p>
  </>}
  {error&&<p className="report-error" role="status">{error}</p>}
 </div>
}
