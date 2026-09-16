import {useEffect,useRef,useState} from 'react'
import {assetFormatLabel} from '../assetFormat'
import {userError} from '../userErrors'
import type {AnalysisJobView,PlaybackView} from '../shared'

export function AnalysisFeedback({file,job,retry,busy}:{file:PlaybackView;job?:AnalysisJobView;retry:()=>void;busy:boolean}):React.JSX.Element|null{
 if(file.temporary||file.analysisPhase==='ready'&&!file.error?.startsWith('FILE_SNAPSHOT_FAILED:'))return null
 const phase=file.error?.startsWith('FILE_SNAPSHOT_FAILED:')?'failed':file.analysisPhase
 const label=phase==='cancelled'?'分析已取消':phase==='failed'?'分析未完成':phase==='queued'?'等待分析':phase==='hashing'?'正在读取文件':phase==='verifying'?'正在核对分析结果':'正在分析'
 const running=!['cancelled','failed'].includes(phase)
 const percent=job&&BigInt(job.totalFrames)>0n?Math.min(100,Number(BigInt(job.frames)*100n/BigInt(job.totalFrames))):0
 return <div className="analysis-feedback" role="status"><strong>{label}</strong>
  {running?<progress aria-label={label} max="100" value={phase==='analyzing'?percent:undefined}/>:<button disabled={busy} onClick={retry}>{phase==='cancelled'?'继续分析':'重新分析'}</button>}
  {phase==='failed'&&<small>{userError(file.analysisError||file.error)}</small>}
 </div>
}

export function FileFormat({file}:{file:PlaybackView}):React.JSX.Element|null{
 const label=file.temporary?'固定缓存 · '+file.sampleRate/1000+' kHz':assetFormatLabel(file.assetFormat)
 return label?<span className="asset-format" title={label}>{label}</span>:null
}

export function TimelineMenu({hasSelection,clear,children}:{hasSelection:boolean;clear:()=>void;children:React.ReactNode}):React.JSX.Element{
 const [point,setPoint]=useState<{x:number;y:number}|null>(null),menu=useRef<HTMLDivElement>(null),origin=useRef<HTMLElement|null>(null)
 const dismiss=(restore=false)=>{setPoint(null);if(restore)origin.current?.focus()}
 useEffect(()=>{
  if(!point)return
  menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node))dismiss()}
  const blur=()=>dismiss()
  window.addEventListener('pointerdown',outside);window.addEventListener('blur',blur);window.addEventListener('resize',blur)
  return()=>{window.removeEventListener('pointerdown',outside);window.removeEventListener('blur',blur);window.removeEventListener('resize',blur)}
 },[point])
 return <div className="timeline-menu-host" onContextMenu={event=>{if(!(event.target as HTMLElement).closest('canvas,.time-ruler'))return;event.preventDefault();origin.current=document.activeElement as HTMLElement;setPoint({x:Math.max(4,Math.min(event.clientX,innerWidth-220)),y:Math.max(4,Math.min(event.clientY,innerHeight-100))})}}>
  {children}
  {point&&<div className="timeline-menu" ref={menu} role="menu" aria-label="时间轴操作" style={{left:point.x,top:point.y}} onKeyDown={event=>{if(event.key==='Escape'||event.key==='Tab'){event.preventDefault();dismiss(true)}}}>
   <button role="menuitem" disabled={!hasSelection} onClick={()=>{clear();dismiss(true)}}>清除选区 <kbd>Ctrl+D</kbd></button>
   <button role="menuitem" onClick={()=>dismiss(true)}>关闭菜单</button>
  </div>}
 </div>
}
