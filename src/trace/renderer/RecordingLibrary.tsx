import {useEffect,useState} from 'react'
import {timecode,timecodeNs} from './time'
import {ExportItems} from './ExportPanel'
import {userError} from '../userErrors'
import type {ExportSource} from '../exportTypes'
import type {LibraryUsage} from '../libraryStorage'
import type {Command,TraceState,TakeSummary,AnalysisJobView} from '../shared'
import {value,formatBytes} from './formatting'

function FileAnalysis({take,jobs,disabled,run,onExport}:{onExport:(source:ExportSource)=>void;take:TakeSummary;jobs:AnalysisJobView[];disabled:boolean;run:(name:Command,payload:Record<string,unknown>)=>void}):React.JSX.Element|null {
  const [selected,setSelected]=useState<Record<string,string>>({})
  if(!['ready','recovered','failed'].includes(take.status)||!take.roles?.length)return null
  return <div className="file-analysis">
    {take.roles.map(role=>{
      const choices=take.analysisRegions?.filter(region=>region.role===role)||[]
      const target=(take.regionCount||0)>1&&choices.length?(choices.find(region=>region.id===selected[role])||choices[0]):undefined
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


export function preferredSource(take:TakeSummary):ExportSource|undefined{
 const output=take.exports?.find(e=>e.id===take.preferredExportId&&(!e.availability||e.availability==='present'))
 if(output)return {takeId:take.id,role:'export',exportId:output.id}
 const role=(['deliverable','session','recovered','source'] as const).find(role=>take.roles?.includes(role)&&!take.missingRoles?.includes(role))
 if(!role)return undefined
 const region=(take.regionCount||0)>1&&['source','recovered'].includes(role)?take.analysisRegions?.find(r=>r.role===role):undefined
 return {takeId:take.id,role,...(region?{regionId:region.id}:{})}
}
const needsAttention=(take:TakeSummary)=>['failed','recoverable'].includes(take.status)||take.availability&&take.availability!=='present'||take.exports?.some(e=>e.phase==='failed'||e.delivery?.phase==='failed')
const localDay=(at:string)=>{const date=new Date(at);return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0')}

export function RecordingLibrary({initialStatus='all',state,busy,run,request,onExport}:{initialStatus?:string;state:TraceState;busy:boolean;run:(name:Command,payload?:Record<string,unknown>)=>void;request:(name:Command,payload?:Record<string,unknown>)=>Promise<unknown>;onExport:(source:ExportSource)=>void}):React.JSX.Element{
 const [query,setQuery]=useState(''),[status,setStatus]=useState(initialStatus),[from,setFrom]=useState(''),[to,setTo]=useState(''),[limit,setLimit]=useState(50)
 const [editing,setEditing]=useState<string|null>(null),[name,setName]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [usage,setUsage]=useState<LibraryUsage|null>(null),[scanning,setScanning]=useState(false)
 const recording=Boolean(state.currentRecord)
 const refreshUsage=async()=>{setScanning(true);try{setUsage(await request('library.storage') as LibraryUsage)}catch(error){setError(userError(error))}finally{setScanning(false)}}
 useEffect(()=>{let active=true;setScanning(true);request('library.storage').then(result=>{if(active)setUsage(result as LibraryUsage)}).catch(error=>{if(active)setError(userError(error))}).finally(()=>{if(active)setScanning(false)});return()=>{active=false}},[state.recordDirectory])
 const act=async(command:Command,payload:Record<string,unknown>={})=>{
  setError('');setNotice('')
  try{const data=await request(command,payload) as {removed?:number;freedBytes?:string;protectedExports?:number}|null
   if(command==='library.rename')setEditing(null)
   if(data?.removed!==undefined)setNotice(data.removed?'已清理 '+data.removed+' 条失效记录':'没有可清理的失效记录；不完整录音仍保留。')
   if(data?.freedBytes!==undefined)setNotice('已清理 '+formatBytes(data.freedBytes)+' 缓存'+(data.protectedExports?'；'+data.protectedExports+' 个成品缺失或变化，已保留对应解码音频。':''))
   if(command!=='library.rename')await refreshUsage()
  }catch(error){setError(userError(error))}
 }
 const takes=(state.recordings||[]).filter(t=>{
  const date=localDay(t.createdAt)
  return t.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(!from||date>=from)&&(!to||date<=to)&&
   (status==='all'||status==='attention'&&needsAttention(t)||status==='ready'&&['ready','recovered'].includes(t.status)||status==='processing'&&(!['ready','recovered','failed','recoverable'].includes(t.status)||t.exports?.some(e=>!['ready','failed','cancelled'].includes(e.phase))))
 })
 return <div className="recording-list">
  <div className="library-directory"><span title="此列表显示当前目录中的 Trace 录音；切换目录保留原目录的全部文件。">当前目录</span><strong>{state.recordDirectory||'尚未选择'}</strong><button disabled={busy||recording} onClick={()=>run('record.chooseDirectory')}>切换目录</button></div>
  <div className="library-toolbar">
   <input aria-label="搜索录音文件" placeholder="搜索录音名称" value={query} onChange={e=>{setQuery(e.target.value);setLimit(50)}}/>
   <select aria-label="录音状态筛选" value={status} onChange={e=>{setStatus(e.target.value);setLimit(50)}}><option value="all">全部状态</option><option value="ready">已保存</option><option value="processing">处理中</option><option value="attention">需要处理</option></select>
   <label>从<input aria-label="开始日期" type="date" value={from} onChange={e=>{setFrom(e.target.value);setLimit(50)}}/></label>
   <label>至<input aria-label="结束日期" type="date" value={to} onChange={e=>{setTo(e.target.value);setLimit(50)}}/></label>
  </div>
  <div className="library-management"><span>{takes.length} 项</span><span>{scanning?'统计空间…':usage?'音频 '+formatBytes(usage.audioBytes)+' · 缓存 '+formatBytes(usage.cacheBytes)+(usage.incomplete?' · 部分不可访问':''):''}</span><button disabled={busy||recording||scanning} onClick={()=>void act('library.refresh')}>刷新</button><button disabled={busy||recording} onClick={()=>void act('library.pruneMissing')}>清理失效记录</button></div>
  {(error||notice)&&<p className={error?'library-message take-error':'library-message'} role={error?'alert':'status'}>{error||notice}</p>}
  {!state.recordings?.length&&<p className="empty-recordings">暂无录音。点击“录音”开始保存系统声音。</p>}
  {Boolean(state.recordings?.length)&&!takes.length&&<p className="empty-recordings">没有匹配的录音。</p>}
  {takes.slice(0,limit).map(take=>{
   const source=preferredSource(take),available=source&&['ready','recovered','failed'].includes(take.status)
   const processing=take.exports?.some(e=>!['ready','failed','cancelled'].includes(e.phase))
   const label=take.status==='recovered'?'已恢复':take.status==='ready'?(take.hasDiscontinuities?'已保存 · 含设备中断':processing?'正在生成成品':'已保存'):take.status==='processing'?'正在生成文件':take.status==='recoverable'?'可恢复的未完成录音':take.status==='failed'?'录音未完整完成：'+userError(take.error):'正在录音'
   return <article key={take.id} className="take-row library-take" data-take-id={take.id}>
    <div className="take-header"><div className="take-identity"><strong>{take.name}</strong><span>{new Date(take.createdAt).toLocaleString('zh-CN',{hour12:false})} · {take.durationNs?timecodeNs(take.durationNs):timecode(take.frames,take.sampleRate)} · {take.encoding==='mp3'?'MP3':take.encoding==='aac'?'AAC':take.encoding==='float32'?'WAV 32f':take.encoding==='pcm24'?'WAV 24-bit':'WAV 16-bit'}</span><small className={needsAttention(take)?'take-error':''}>{label}</small></div>
     <button data-take-open disabled={busy||recording||!available} onClick={()=>source&&run('file.open',{...source})}>查看</button><button data-take-export disabled={busy||recording||!available} onClick={()=>source&&onExport(source)}>导出</button>
    </div>
    {take.availability&&take.availability!=='present'&&<small className="take-error">磁盘文件{take.availability==='missing'?'已移除或移动':'暂不可访问'} · {take.missingFiles||0} 个文件不可用</small>}
    {take.clippedSamples&&BigInt(take.clippedSamples)>0n&&<small className="take-error">保存文件发生削波：{take.clippedSamples} 个采样值</small>}
    {take.status==='recoverable'&&<button disabled={busy||recording} onClick={()=>void act('record.recover',{takeId:take.id})}>恢复录音</button>}
    <details className="take-details"><summary>文件与分析详情{take.exports?.length?' · '+take.exports.length+' 个成品':''}</summary>
     <FileAnalysis take={take} jobs={state.analysisJobs||[]} disabled={busy||recording} run={run} onExport={onExport}/>
     <ExportItems items={take.exports||[]} takeId={take.id} jobs={state.analysisJobs||[]} disabled={busy||recording} run={run}/>
     {take.sourceClippedSamples&&BigInt(take.sourceClippedSamples)>0n&&take.sourceClippedSamples!==take.clippedSamples&&<p className="take-error">源 WAV 发生削波：{take.sourceClippedSamples} 个采样值，派生文件无法还原已削去的部分。</p>}
     {take.retention&&take.retention.phase!=='kept'&&<p className={take.retention.phase==='error'?'take-error':'settings-hint'}>{take.retention.phase==='removed'?'独立成品已核验，原始 WAV 已按设置整理':take.retention.phase==='error'?'原始文件整理未完成：'+userError(take.retention.error):'正在核验独立成品，原始文件仍保留'}</p>}
     {take.retention?.phase==='error'&&<button onClick={()=>void act('retention.retry',{takeId:take.id})}>重试整理</button>}
     {editing===take.id?<form className="take-rename" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setEditing(null)}}} onSubmit={e=>{e.preventDefault();void act('library.rename',{takeId:take.id,name})}}><input autoFocus aria-label="录音名称" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/><button disabled={busy}>保存名称</button><button type="button" onClick={()=>setEditing(null)}>取消</button></form>:null}
     <div className="take-actions"><button disabled={busy||recording} onClick={()=>{setEditing(take.id);setName(take.name)}}>重命名</button><button onClick={()=>run('record.openFolder',{takeId:take.id})}>打开目录</button><button disabled={busy||recording} onClick={()=>void act('library.clearCache',{takeId:take.id})}>仅清理缓存</button><button data-remove-take disabled={busy||recording||!['ready','failed','recovered','recoverable'].includes(take.status)} onClick={()=>void act('library.remove',{takeId:take.id})}>移除录音</button></div>
    </details>
   </article>
  })}
  {takes.length>limit&&<button onClick={()=>setLimit(limit+50)}>显示更多录音</button>}
 </div>
}
