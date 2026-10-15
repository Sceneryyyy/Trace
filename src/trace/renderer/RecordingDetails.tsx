import {useState} from 'react'
import type {Command,TraceState,TakeSummary,AnalysisJobView,PlaybackView} from '../shared'
import type {ExportSource} from '../exportTypes'
import {ExportItems} from './ExportPanel'
import {value} from './formatting'
import {userError} from '../userErrors'

function FileAnalysis({take,jobs,disabled,run,onExport,current}:{onExport:(source:ExportSource)=>void;take:TakeSummary;current?:PlaybackView|null;jobs:AnalysisJobView[];disabled:boolean;run:(name:Command,payload:Record<string,unknown>)=>void}):React.JSX.Element|null {
  const [selected,setSelected]=useState<Record<string,string>>({})
  if(!['ready','recovered','failed'].includes(take.status)||!take.roles?.length)return null
  return <div className="file-analysis">
    {take.roles.map(role=>{
      const choices=take.analysisRegions?.filter(region=>region.role===role)||[]
      const target=(take.regionCount||0)>1&&choices.length?(choices.find(region=>region.id===(selected[role]||(current?.takeId===take.id&&current.role===role?current.regionId:undefined)))||choices[0]):undefined
      const job=jobs.find(item=>item.takeId===take.id&&item.role===role&&item.regionId===target?.id&&!item.selectionRange)
      const unavailable=take.missingRoles?.includes(role)
      const running=Boolean(job&&!['ready','failed','cancelled'].includes(job.phase))
      const label={source:'原始文件',deliverable:'成品文件',recovered:'恢复文件',session:'会话视图',export:'导出文件'}[role]
      const percent=job&&BigInt(job.totalFrames)>0n?Math.min(100,Number(BigInt(job.frames)*100n/BigInt(job.totalFrames))):0
      const status=unavailable?'文件不可用':!job?'可查看分析':job.phase==='ready'?'分析完成':job.phase==='queued'?'等待分析':job.phase==='hashing'?'读取文件':
        job.phase==='analyzing'?'正在分析 '+percent+'%':job.phase==='verifying'?'核对结果':job.phase==='cancelled'?'已取消':'分析失败'
      return <section key={role} className="analysis-item" data-analysis-role={role}>
        <div className="analysis-line"><span>{label} · {status}</span><button data-file-open={role} disabled={disabled||unavailable} onClick={()=>run('file.open',{takeId:take.id,role,...(target?{regionId:target.id}:{})})}>查看</button><button data-export-source={role} disabled={disabled||unavailable} onClick={()=>onExport({takeId:take.id,role,...(target?{regionId:target.id}:{})})}>导出</button>{running?<button data-analysis-cancel={job!.id} onClick={()=>run('job.cancel',{jobId:job!.id})}>取消</button>:
          <button data-analysis-start={role} disabled={disabled||unavailable} onClick={()=>run('analysis.start',{takeId:take.id,role,...(target?{regionId:target.id}:{})})}>{job?.phase==='ready'?'重新检查':'分析文件'}</button>}</div>
        {target&&<select aria-label={label+'连续段'} value={target.id} onChange={event=>setSelected({...selected,[role]:event.target.value})}>{choices.map(region=><option key={region.id} value={region.id}>第 {region.ordinal} 段 · {region.sampleRate/1000} kHz · {region.channelCount===1?'单声道':'双声道'}</option>)}</select>}
        {running&&<progress max="100" value={job?.phase==='analyzing'?percent:undefined} aria-label={label+'分析进度'}/>}
        {job?.phase==='ready'&&job.summary&&<dl className="analysis-summary">
          <div><dt>整段 I</dt><dd>{value(job.summary.integratedToCursor)} <small>LUFS</small></dd></div>
          <div><dt>LRA {BigInt(job.totalFrames)<BigInt(job.sampleRate)*60n?'· 暂估':''}</dt><dd>{value(job.summary.loudnessRange)} <small>LU</small></dd></div>
          <div><dt>MAX TP</dt><dd>{value(job.summary.maxTruePeak)} <small>dBTP</small></dd></div>
        </dl>}
        {job?.error&&<small className="take-error">{job.error}</small>}
      </section>
    })}
  </div>
}

export type LibraryAction=(command:Command,payload:Record<string,unknown>)=>Promise<boolean>
export function RecordingDetails({take,state,busy,run,act,onExport}:{take:TakeSummary;state:TraceState;busy:boolean;run:(name:Command,payload?:Record<string,unknown>)=>void;act:LibraryAction;onExport:(source:ExportSource)=>void}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(take.name)
 const recording=Boolean(state.currentRecord),locked=busy||recording
 if(take.status==='unreadable')return <><p className="take-error">记录文件损坏或不兼容：{take.error||'未知原因'}。音频文件仍保留。</p><button onClick={()=>run('record.openFolder',{takeId:take.id})}>打开目录</button></>
 return <>
  {take.availability&&take.availability!=='present'&&<p className="take-error">磁盘文件{take.availability==='missing'?'已移除或移动':'暂不可访问'} · {take.missingFiles||0} 个文件不可用</p>}
  {take.clippedSamples&&BigInt(take.clippedSamples)>0n&&<p className="take-error">保存文件发生削波：{take.clippedSamples} 个采样值</p>}
  {take.status==='recoverable'&&<button disabled={locked} onClick={()=>void act('record.recover',{takeId:take.id})}>恢复录音</button>}
  <FileAnalysis take={take} current={state.playback} jobs={state.analysisJobs||[]} disabled={locked} run={run} onExport={onExport}/>
  <ExportItems items={take.exports||[]} takeId={take.id} jobs={state.analysisJobs||[]} disabled={locked} run={run}/>
  {take.sourceClippedSamples&&BigInt(take.sourceClippedSamples)>0n&&take.sourceClippedSamples!==take.clippedSamples&&<p className="take-error">源 WAV 发生削波：{take.sourceClippedSamples} 个采样值，派生文件无法还原已削去的部分。</p>}
  {take.retention&&take.retention.phase!=='kept'&&<p className={take.retention.phase==='error'?'take-error':'settings-hint'}>{take.retention.phase==='removed'?'独立成品已核验，原始 WAV 已按设置整理':take.retention.phase==='error'?'原始文件整理未完成：'+userError(take.retention.error):'正在核验独立成品，原始文件仍保留'}</p>}
  {take.retention?.phase==='error'&&<button disabled={locked} onClick={()=>void act('retention.retry',{takeId:take.id})}>重试整理</button>}
  {editing&&<form className="take-rename" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setEditing(false)}}} onSubmit={e=>{e.preventDefault();void act('library.rename',{takeId:take.id,name}).then(ok=>{if(ok)setEditing(false)})}}><input autoFocus aria-label="录音名称" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/><button disabled={locked}>保存名称</button><button type="button" onClick={()=>setEditing(false)}>取消</button></form>}
  <div className="take-actions"><button disabled={locked} onClick={()=>{setName(take.name);setEditing(true)}}>重命名</button><button onClick={()=>run('record.openFolder',{takeId:take.id})}>打开目录</button><button disabled={locked} onClick={()=>void act('library.clearCache',{takeId:take.id})}>仅清理缓存</button><button data-remove-take disabled={locked||!['ready','failed','recovered','recoverable'].includes(take.status)} onClick={()=>void act('library.remove',{takeId:take.id})}>移除录音</button></div>
 </>
}
