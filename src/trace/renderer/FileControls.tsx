import type {Command,PlaybackView,FileView,Metric} from '../shared'
import {FileFormat} from './WorkbenchFeedback'
import {timecode} from './time'
type Props={live?:boolean;file:PlaybackView;busy:boolean;run:(command:Command,payload?:Record<string,unknown>)=>void}
function TimelineActionIcon({kind}:{kind:'reset'|'follow'|'loop'}):React.JSX.Element{
 return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {kind==='reset'?<><path d="M4 5v14M20 5v14M7 12h10"/><path d="m10 9-3 3 3 3m4-6 3 3-3 3"/></>:
   kind==='follow'?<><path d="M9 20V9H5l6-6 6 6h-4v11"/><path d="M16 15h5m-3-3 3 3-3 3"/></>:
   <><path d="M9 7h6a5 5 0 0 1 0 10H5v-6"/><path d="m2 14 3-3 3 3"/></>}
 </svg>
}
export function TransportIcon({kind}:{kind:'start'|'end'|'play'|'pause'|'record'|'stop'}):React.JSX.Element{
 return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {kind==='start'?<><path d="M5 5v14"/><path d="m18 5-11 7 11 7Z"/></>:
   kind==='end'?<><path d="M19 5v14"/><path d="m6 5 11 7-11 7Z"/></>:
   kind==='play'?<path d="m8 5 11 7-11 7Z"/>:
   kind==='pause'?<><path d="M8 5v14M16 5v14" strokeWidth="3"/></>:
   kind==='record'?<circle cx="12" cy="12" r="6"/>:
   <rect x="6" y="6" width="12" height="12" rx=".7" fill="currentColor"/>}
 </svg>
}
export function FileSourceBar({file,busy,run,live}:Props):React.JSX.Element{
 const offset=file.timeOffsetSeconds||0,total=BigInt(file.totalFrames)
 const ready=!busy&&!file.error&&file.phase!=='preparing'
 const selection=file.selection
 return <section className="sourcebar file-sourcebar" aria-label="统一时间轴与选区">
  <div className="file-title" title={file.label}><b>{file.label}</b><span>{live?'跟随最新':file.phase==='playing'||file.phase==='buffering'?'播放中':'查看历史'} · {timecode(String(Math.round((Number(file.positionFrame)/file.sampleRate+offset)*1000)),1000)}</span><FileFormat file={file}/></div>
   <div className="timeline-actions" role="group" aria-label="时间轴控制">
   <button className="full-length-button" aria-label="波形复位" title="波形复位：恢复完整时间范围" disabled={!ready||!total} onClick={()=>run('playback.window',{playbackId:file.id,startFrame:'0',endFrame:file.totalFrames,pixelWidth:900})}><TimelineActionIcon kind="reset"/></button>
   <button className="follow-button" aria-label="跟随游标" title="跟随游标：画面随播放位置滚动" aria-pressed={file.follow} disabled={!ready||live} onClick={()=>run('playback.follow',{playbackId:file.id,enabled:!file.follow})}><TimelineActionIcon kind="follow"/></button>
   <button className="loop-button" aria-label="循环" aria-pressed={file.loop} title={selection?'循环：重复播放选区':'循环：先在时间轴上拖动建立选区'} disabled={!ready||!selection} onClick={()=>selection&&run('playback.selection',{playbackId:file.id,...selection,loop:!file.loop})}><TimelineActionIcon kind="loop"/></button>
  </div>
 </section>
}
export function SelectionStats({view,rate}:{view:FileView;rate:number}):React.JSX.Element|null{
 if(!view.selection)return null
 const job=view.selectionAnalysis
 const metric=(m?:Metric)=>m?.status==='ready'&&m.value!==null?m.value.toFixed(1).replace('-','−'):m?.status==='silence'?'−∞':'—'
 const length=BigInt(view.selection.endFrame)-BigInt(view.selection.startFrame)
 return <section className="selection-statistics" aria-label="选区独立统计">
  <header><b>选区独立统计</b><small>{timecode(length.toString(),rate)}</small></header>
  {job?.phase==='ready'&&job.summary?<dl>
   <div><dt>I · LUFS</dt><dd>{metric(job.summary.integratedToCursor)}</dd></div>
   <div><dt>LRA{length<BigInt(rate)*60n?' 暂估':''} · LU</dt><dd>{metric(job.summary.loudnessRange)}</dd></div>
   <div><dt>MAX TP · dBTP</dt><dd>{metric(job.summary.maxTruePeak)}</dd></div>
  </dl>:<p>{job?.phase==='failed'?'选区分析失败：'+job.error:job?.phase==='cancelled'?'选区分析已取消':'选区分析中…'}</p>}
 </section>
}
