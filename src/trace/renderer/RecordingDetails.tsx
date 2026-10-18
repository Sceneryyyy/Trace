import {useState} from 'react'
import type {Command,TraceState,TakeSummary,AnalysisJobView} from '../shared'
import type {ExportSource} from '../exportTypes'
import {ExportItems,exportLabel} from './ExportPanel'
import {ActionMenu} from './ActionMenu'
import {preferredSource} from './libraryModel'
import {value} from './formatting'
import {userError} from '../userErrors'

type Version={key:string;label:string;source:ExportSource;output?:NonNullable<TakeSummary['exports']>[number]}
const roleLabels={source:'原始文件',deliverable:'成品文件',recovered:'恢复文件',session:'会话视图',export:'导出文件'}
const sourceKey=(s:ExportSource)=>s.role+':'+(s.regionId||s.exportId||'')
function versions(take:TakeSummary):Version[]{
 const result:Version[]=[]
 if(['ready','recovered','failed'].includes(take.status))for(const role of take.roles||[]){
  const regions=(take.regionCount||0)>1?take.analysisRegions?.filter(r=>r.role===role)||[]:[]
  if(regions.length)for(const region of regions){const source={takeId:take.id,role,regionId:region.id};result.push({key:sourceKey(source),source,label:roleLabels[role]+' · 第 '+region.ordinal+' 段 · '+region.sampleRate/1000+' kHz'})}
  else {const source={takeId:take.id,role};result.push({key:sourceKey(source),source,label:roleLabels[role]})}
 }
 for(const output of [...take.exports||[]].reverse()){const source:ExportSource={takeId:take.id,role:'export',exportId:output.id};result.push({key:sourceKey(source),source,output,label:exportLabel(output.preset)+(output.range?' · 选区':'')+' · '+new Date(output.createdAt).toLocaleTimeString('zh-CN',{hour12:false})+(output.phase==='ready'?'':' · '+(output.phase==='failed'?'失败':output.phase==='cancelled'?'已取消':'处理中'))})}
 return result
}
function FileAnalysis({take,source,jobs,disabled,run,onExport}:{onExport:(source:ExportSource)=>void;take:TakeSummary;source:ExportSource;jobs:AnalysisJobView[];disabled:boolean;run:(name:Command,payload:Record<string,unknown>)=>void}){
 const job=jobs.find(item=>item.takeId===take.id&&item.role===source.role&&item.regionId===source.regionId&&!item.selectionRange)
 const unavailable=take.missingRoles?.includes(source.role),running=Boolean(job&&!['ready','failed','cancelled'].includes(job.phase)),repair=Boolean(job&&['failed','cancelled'].includes(job.phase))
 const label=roleLabels[source.role],percent=job&&BigInt(job.totalFrames)>0n?Math.min(100,Number(BigInt(job.frames)*100n/BigInt(job.totalFrames))):0
 const status=unavailable?'文件不可用':!job?'可查看分析':job.phase==='ready'?'分析完成':job.phase==='queued'?'等待分析':job.phase==='hashing'?'读取文件':job.phase==='analyzing'?'正在分析 '+percent+'%':job.phase==='verifying'?'核对结果':job.phase==='cancelled'?'已取消':'分析失败'
 return <section className="analysis-item" data-analysis-role={source.role}>
  <p className={unavailable||repair?'take-error':'settings-hint'}>{label} · {status}</p>
  <div className="version-actions"><button data-file-open={source.role} disabled={disabled||unavailable} onClick={()=>run('file.open',{...source})}>查看分析</button>
   <ActionMenu label={label+'更多操作'} items={[
    {label:'导出',attributes:{'data-export-source':source.role},disabled:disabled||unavailable,onSelect:()=>onExport(source)},
    ...(!running&&!repair?[{label:job?.phase==='ready'?'重新检查':'分析文件',attributes:{'data-analysis-start':source.role},disabled:disabled||unavailable,onSelect:()=>run('analysis.start',{...source})}]:[]),
    {label:'设为参考',disabled:disabled||unavailable,onSelect:()=>run('reference.set',{...source})}
   ]}/>
   {running&&<button data-analysis-cancel={job!.id} onClick={()=>run('job.cancel',{jobId:job!.id})}>取消分析</button>}
   {repair&&<button data-analysis-start={source.role} disabled={disabled||unavailable} onClick={()=>run('analysis.start',{...source})}>重新分析</button>}
  </div>
  {running&&<progress max="100" value={job?.phase==='analyzing'?percent:undefined} aria-label={label+'分析进度'}/>}
  {job?.phase==='ready'&&job.summary&&<dl className="analysis-summary"><div><dt>整段 I</dt><dd>{value(job.summary.integratedToCursor)} <small>LUFS</small></dd></div><div><dt>LRA {BigInt(job.totalFrames)<BigInt(job.sampleRate)*60n?'· 暂估':''}</dt><dd>{value(job.summary.loudnessRange)} <small>LU</small></dd></div><div><dt>MAX TP</dt><dd>{value(job.summary.maxTruePeak)} <small>dBTP</small></dd></div></dl>}
  {job?.error&&<small className="take-error">{userError(job.error)}</small>}
 </section>
}
export type LibraryAction=(command:Command,payload:Record<string,unknown>)=>Promise<boolean>
export function RecordingDetails({take,state,busy,run,act,onExport}:{take:TakeSummary;state:TraceState;busy:boolean;run:(name:Command,payload?:Record<string,unknown>)=>void;act:LibraryAction;onExport:(source:ExportSource)=>void}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(take.name),[selected,setSelected]=useState('')
 const recording=Boolean(state.currentRecord),locked=busy||recording,options=versions(take)
 const current=state.playback?.takeId===take.id?state.playback:null,preferred=current||preferredSource(take)
 const chosen=options.find(v=>v.key===selected)||options.find(v=>preferred&&v.key===sourceKey(preferred))||options[0]
 if(take.status==='unreadable')return <><p className="take-error">记录文件损坏或不兼容：{take.error||'未知原因'}。音频文件仍保留。</p><button onClick={()=>run('record.openFolder',{takeId:take.id})}>打开目录</button></>
 return <>
  {take.availability&&take.availability!=='present'&&<p className="take-error">磁盘文件{take.availability==='missing'?'已移除或移动':'暂不可访问'} · {take.missingFiles||0} 个文件不可用</p>}
  {take.clippedSamples&&BigInt(take.clippedSamples)>0n&&<p className="take-error">保存文件发生削波：{take.clippedSamples} 个采样值</p>}
  {take.status==='recoverable'&&<button disabled={locked} onClick={()=>void act('record.recover',{takeId:take.id})}>恢复录音</button>}
  {chosen&&<div className="file-versions"><label>文件版本<select aria-label="录音文件版本" value={chosen.key} onChange={e=>setSelected(e.target.value)}>{options.map(v=><option key={v.key} value={v.key}>{v.label}{current&&sourceKey(current)===v.key?' · 已载入':''}</option>)}</select></label>
   {chosen.output?<ExportItems items={[chosen.output]} takeId={take.id} jobs={state.analysisJobs||[]} disabled={locked} run={run}/>:<FileAnalysis take={take} source={chosen.source} jobs={state.analysisJobs||[]} disabled={locked} run={run} onExport={onExport}/>}</div>}
  {take.sourceClippedSamples&&BigInt(take.sourceClippedSamples)>0n&&take.sourceClippedSamples!==take.clippedSamples&&<p className="take-error">源 WAV 发生削波：{take.sourceClippedSamples} 个采样值，派生文件无法还原已削去的部分。</p>}
  {take.retention&&take.retention.phase!=='kept'&&<p className={take.retention.phase==='error'?'take-error':'settings-hint'}>{take.retention.phase==='removed'?'独立成品已核验，原始 WAV 已按设置整理':take.retention.phase==='error'?'原始文件整理未完成：'+userError(take.retention.error):'正在核验独立成品，原始文件仍保留'}</p>}
  {take.retention?.phase==='error'&&<button disabled={locked} onClick={()=>void act('retention.retry',{takeId:take.id})}>重试整理</button>}
  {editing&&<form className="take-rename" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setEditing(false)}}} onSubmit={e=>{e.preventDefault();void act('library.rename',{takeId:take.id,name}).then(ok=>{if(ok)setEditing(false)})}}><input autoFocus aria-label="录音名称" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/><button disabled={locked}>保存名称</button><button type="button" onClick={()=>setEditing(false)}>取消</button></form>}
  <div className="take-actions"><ActionMenu label="管理录音" text="管理录音" items={[
   {label:'重命名',disabled:locked,onSelect:()=>{setName(take.name);setEditing(true)}},
   {label:'打开目录',onSelect:()=>run('record.openFolder',{takeId:take.id})},
   {label:'仅清理缓存',disabled:locked,onSelect:()=>void act('library.clearCache',{takeId:take.id})},
   {label:'移除录音',attributes:{'data-remove-take':''},danger:true,disabled:locked||!['ready','failed','recovered','recoverable'].includes(take.status),onSelect:()=>void act('library.remove',{takeId:take.id})}
  ]}/></div>
 </>
}
