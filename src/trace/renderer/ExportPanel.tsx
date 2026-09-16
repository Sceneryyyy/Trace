import {userError} from '../userErrors'
import {useState} from 'react'
import type {Command,AnalysisJobView,Metric} from '../shared'
import type {ExportSource,ExportView} from '../exportTypes'
import type {ExportPreset} from '../mediaTypes'
export function exportLabel(preset:ExportPreset):string{
 if(preset.format==='wav')return 'WAV · '+preset.sampleRate/1000+' kHz · '+(preset.encoding==='float32'?'32-bit float':preset.encoding==='pcm24'?'24-bit':'16-bit')
 return (preset.format==='mp3'?'MP3':'AAC '+preset.container.toUpperCase())+' · '+preset.sampleRate/1000+' kHz · '+preset.bitrate+' kbps'
}
export function ExportDialog({source,busy,submit}:{source:ExportSource;busy:boolean;submit:(preset:ExportPreset,selection:boolean)=>void}):React.JSX.Element{
 const [preset,setPreset]=useState<ExportPreset>({format:'mp3',sampleRate:48000,bitrate:192})
 const [selection,setSelection]=useState(Boolean(source.range))
 const setFormat=(format:string)=>{
  if(format==='wav')setPreset({format:'wav',sampleRate:48000,encoding:'pcm24'})
  else if(format==='mp3')setPreset({format:'mp3',sampleRate:48000,bitrate:192})
  else setPreset({format:'aac',container:'m4a',sampleRate:48000,bitrate:192})
 }
 return <div className="settings-content">
  {source.range&&<label>导出范围<select aria-label="导出范围" value={selection?'selection':'whole'} onChange={e=>setSelection(e.target.value==='selection')}><option value="selection">当前选区</option><option value="whole">整个文件</option></select></label>}
  <label>格式<select aria-label="导出格式" value={preset.format} onChange={e=>setFormat(e.target.value)}><option value="wav">WAV</option><option value="mp3">MP3</option><option value="aac">AAC</option></select></label>
  {preset.format==='aac'&&<label>AAC 封装<select aria-label="AAC 封装" value={preset.container} onChange={e=>setPreset({...preset,container:e.target.value as 'm4a'|'adts'})}><option value="m4a">M4A · 文件回听</option><option value="adts">ADTS · .aac</option></select></label>}
  <label>采样率<select aria-label="导出采样率" value={preset.sampleRate} onChange={e=>setPreset({...preset,sampleRate:Number(e.target.value)} as ExportPreset)}>{(preset.format==='wav'?[44100,48000,88200,96000]:[44100,48000]).map(rate=><option key={rate} value={rate}>{rate/1000} kHz</option>)}</select></label>
  {preset.format==='wav'?<label>采样精度<select aria-label="导出采样精度" value={preset.encoding} onChange={e=>setPreset({...preset,encoding:e.target.value as 'pcm16'|'pcm24'|'float32'})}><option value="pcm16">16-bit PCM</option><option value="pcm24">24-bit PCM</option><option value="float32">32-bit float</option></select></label>:
   <label>目标码率<select aria-label="导出码率" value={preset.bitrate} onChange={e=>setPreset({...preset,bitrate:Number(e.target.value)} as ExportPreset)}>{(preset.format==='mp3'?[128,192,256,320]:[128,192,256]).map(rate=><option value={rate} key={rate}>{rate} kbps</option>)}</select></label>}
  <p className="settings-summary">{selection?'选区':'整段'} → {exportLabel(preset)}</p>
  <p className="settings-hint">成品与本次录音一起保存。后台导出会保留原始文件，完成后可独立回听和分析。</p>
  {preset.format==='aac'&&preset.container==='adts'&&<p className="settings-hint">ADTS 在其他播放器中可能多出首尾填充；本地文件回听建议选择 M4A。Trace 会话会保留准确的有效范围。</p>}
  <button className="primary-button" data-export-submit disabled={busy} onClick={()=>submit(preset,selection)}>开始导出</button>
 </div>
}
const value=(metric?:Metric)=>metric?.status==='ready'&&metric.value!==null?metric.value.toFixed(1).replace('-','−'):metric?.status==='silence'?'−∞':'—'
export function ExportItems({items,takeId,jobs,disabled,run}:{items:ExportView[];takeId:string;jobs:AnalysisJobView[];disabled:boolean;run:(command:Command,payload?:Record<string,unknown>)=>void}):React.JSX.Element|null{
 if(!items.length)return null
 const labels={queued:'等待导出',hashing:'核对来源',normalizing:'准备音频',encoding:'正在编码',decoding:'准备回听',verifying:'核对成品',ready:'已完成',failed:'导出失败',cancelled:'已取消'}
 return <section className="export-items"><h3>成品与导出</h3><p className="settings-hint">此处管理 Trace 保存的成品；另存副本在所选目录独立管理。</p>{[...items].reverse().map(item=>{
  const missing=item.availability&&item.availability!=='present'
  const active=!['ready','failed','cancelled'].includes(item.phase),job=jobs.find(j=>j.takeId===takeId&&j.role==='export'&&j.exportId===item.id&&!j.selectionRange)
  return <div className="export-item" data-export-id={item.id} key={item.id}>
   <strong>{exportLabel(item.preset)}{item.range?' · 选区':''}{item.automatic?' · 录音成品':''}</strong>
   <div className="analysis-line"><span>{missing?(item.availability==='missing'?'文件已移除或移动':'文件暂不可访问'):labels[item.phase]}{active?' · '+Math.round(item.fraction*100)+'%':''}</span>
    {active?<button onClick={()=>run('job.cancel',{jobId:item.id})}>取消导出</button>:item.phase==='ready'?<div className="export-actions">
     <button data-export-play disabled={disabled||Boolean(missing)} onClick={()=>run('file.open',{takeId,role:'export',exportId:item.id})}>回听</button>
     <button data-export-analyze disabled={disabled||Boolean(missing)} onClick={()=>run('analysis.start',{takeId,role:'export',exportId:item.id})}>分析</button>
     <button data-export-save disabled={disabled||Boolean(missing)} onClick={()=>run('export.saveCopy',{exportId:item.id})}>另存副本</button>
     <button onClick={()=>run('export.openFolder',{exportId:item.id})}>打开目录</button>
    </div>:<button disabled={disabled||Boolean(missing)} onClick={()=>run('export.retry',{exportId:item.id})}>重试</button>}
   </div>
   {!active&&<button className="remove-export" data-remove-export disabled={disabled} onClick={()=>run('library.remove',{takeId,exportId:item.id})}>{missing?'清理失效项':'移除成品'}</button>}
   {active&&<progress max="1" value={item.fraction||undefined} aria-label="导出进度"/>}
   {item.error&&<details className="take-error"><summary>{userError(item.error)}</summary><code>{item.error}</code></details>}
   {job?.phase==='ready'&&job.summary&&<dl className="analysis-summary"><div><dt>成品 I · LUFS</dt><dd>{value(job.summary.integratedToCursor)}</dd></div><div><dt>LRA · LU</dt><dd>{value(job.summary.loudnessRange)}</dd></div><div><dt>MAX TP · dBTP</dt><dd>{value(job.summary.maxTruePeak)}</dd></div></dl>}
   {job&&!['ready','failed','cancelled'].includes(job.phase)&&<span>正在分析成品…</span>}
   {job?.error&&<details className="take-error"><summary>{userError(job.error)}</summary><code>{job.error}</code></details>}
  </div>
 })}</section>
}
