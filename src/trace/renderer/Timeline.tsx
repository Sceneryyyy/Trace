import {canvasSurface} from './canvasSurface'
import {wheelPixels,wheelValue,zoomRange,zoomLabel,panRange} from './zoom'
import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {DisplaySettings} from '../displaySettings'
import type {TargetSettings} from '../targetSettings'
import type {MeterSnapshot} from '../shared'
import {relativeFrame} from './time'
import {SelectionStats} from './FileControls'
export type TimelineLayer={draw:(ctx:CanvasRenderingContext2D,g:{left:number;right:number;top:number;bottom:number;x:(frame:string)=>number})=>void;hover?:(frame:string,vertical:number)=>void;wheel?:(vertical:number,delta:number)=>void}
export type TimelineProps={
 layer?:TimelineLayer;
 kind?:'both'|'waveform'|'history'|'spectrogram'|'ruler';traces?:('m'|'s'|'i')[];
 feedback?:React.ReactNode;selectionMode?:boolean;controls?:React.ReactNode;snapshot:MeterSnapshot|null;seconds:number;gain:number;target?:DisplaySettings;targets?:TargetSettings
 onSeek?:(position:string,resume:boolean,source:MeterSnapshot|null)=>void
 onSelection?:(start:string,end:string,source:MeterSnapshot|null)=>void
 onWindow?:(start:string,end:string)=>void
 onGain?:(value:number)=>void
 onSeconds?:(value:number)=>void
}
type Drag={source:MeterSnapshot|null;start:bigint;end:bigint;mode:'seek'|'selection'|'start'|'end';anchor:bigint;position:bigint;resume:boolean;fixed:bigint}
const TimelinePreview=createContext<{preview:Drag|null;setPreview:React.Dispatch<React.SetStateAction<Drag|null>>}|null>(null)
export function useTimelinePreviewRange(sourceId?:string):{startFrame:string;endFrame:string}|undefined{
 const p=useContext(TimelinePreview)?.preview
 if(!p||p.mode==='seek'||p.source?.sourceId!==sourceId)return
 return {startFrame:(p.mode==='start'?p.position:p.mode==='end'?p.fixed:p.position<p.anchor?p.position:p.anchor).toString(),endFrame:(p.mode==='end'?p.position:p.mode==='start'?p.fixed:p.position>p.anchor?p.position:p.anchor).toString()}
}
export function TimelinePreviewProvider({children}:{children:React.ReactNode}){const [preview,setPreview]=useState<Drag|null>(null);return <TimelinePreview.Provider value={{preview,setPreview}}>{children}</TimelinePreview.Provider>}
export function Timeline({layer,kind='both',traces=['m','s','i'],feedback,selectionMode=false,controls,snapshot,seconds,gain,target,targets,onSeek,onSelection,onWindow,onGain,onSeconds}:TimelineProps):React.JSX.Element{
 const wave=useRef<HTMLCanvasElement>(null),loud=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null)
 const shared=useContext(TimelinePreview),[ownPreview,ownSetPreview]=useState<Drag|null>(null)
 const drag=useRef<Drag|null>(null),preview=shared?.preview??ownPreview,setPreview=shared?.setPreview??ownSetPreview
 const file=snapshot?.sourceKind==='file',take=snapshot?.sourceKind==='take',interactive=Boolean(snapshot)
 const axis=snapshot?.fileView||snapshot?.timelineWindow
 const start=BigInt(axis?.startFrame||'0'),end=BigInt(axis?.endFrame||'0')
 const wheelGain=useRef(gain),wheelSeconds=useRef(seconds),wheelWindow=useRef({sourceId:snapshot?.sourceId,start:start.toString(),end:end.toString()})
 useLayoutEffect(()=>{wheelGain.current=gain},[gain])
 useLayoutEffect(()=>{wheelSeconds.current=seconds},[seconds])
 useLayoutEffect(()=>{wheelWindow.current={sourceId:snapshot?.sourceId,start:start.toString(),end:end.toString()}},[start,end,snapshot?.sourceId])
 const selected=preview&&preview.mode!=='seek'
  ?{startFrame:(preview.mode==='start'?preview.position:preview.mode==='end'?preview.fixed:preview.position<preview.anchor?preview.position:preview.anchor).toString(),
    endFrame:(preview.mode==='end'?preview.position:preview.mode==='start'?preview.fixed:preview.position>preview.anchor?preview.position:preview.anchor).toString()}
  :snapshot?.fileView?.selection
 useLayoutEffect(()=>{
  function paint(canvas:HTMLCanvasElement,kind:'wave'|'loud'|'spectral'){
   const surface=canvasSurface(canvas);if(!surface)return
   const {rect,context:ctx}=surface
   const w=rect.width,h=rect.height,left=36,right=w-10,top=14,bottom=h-14
   let targetMarkers=0
   const rate=snapshot?.timelineRate||snapshot?.format.sampleRate||48000
   const cursor=snapshot?.positionFrame||'0'
   const take=snapshot?.sourceKind==='take',ranged=Boolean(snapshot?.fileView||snapshot?.timelineWindow)
   const start=ranged?(snapshot?.fileView||snapshot?.timelineWindow)?.startFrame||'0':'0',finish=ranged?(snapshot?.fileView||snapshot?.timelineWindow)?.endFrame||'0':cursor
   const span=ranged?Math.max(1,relativeFrame(finish,start)):take?Math.max(rate,Number(cursor)):seconds*rate
   const x=(frame:string)=>left+(ranged?relativeFrame(frame,start):take?Number(frame):relativeFrame(frame,cursor)+span)/span*(right-left)
   ctx.strokeStyle='#303a34';ctx.lineWidth=1
   for(let i=0;i<=6;i++){const px=left+(right-left)*i/6;ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,bottom);ctx.stroke()}
   ctx.font='10px "JetBrains Mono", monospace';ctx.fillStyle='#a8b5ac'
   if(kind==='spectral'){layer?.draw(ctx,{left,right,top,bottom,x})}else if(kind==='wave'){
    const channels=snapshot?.format.channelCount||2
    for(let c=0;c<channels;c++){
     const center=top+(bottom-top)*(c+.5)/channels,scale=(bottom-top)/channels*.42
     ctx.strokeStyle='#39443d';ctx.beginPath();ctx.moveTo(left,center);ctx.lineTo(right,center);ctx.stroke()
     ctx.fillText(channels===1?'M':c===0?'L':'R',9,center+4)
     ctx.save();ctx.beginPath();ctx.rect(left,top+(bottom-top)*c/channels,right-left,(bottom-top)/channels);ctx.clip()
     ctx.lineWidth=1.2
     for(const point of snapshot?.waveform||[]){
      const px=x(point.frame);if(px<left||px>right)continue
      ctx.strokeStyle=point.flags&4?'#efb65b':c===0?'#91e65c':'#70bc4d'
      const a=center-(point.max[c]??0)*scale*gain,b=center-(point.min[c]??0)*scale*gain
      ctx.beginPath();ctx.moveTo(px,a);ctx.lineTo(px,Math.max(a+.75,b));ctx.stroke()
     }ctx.restore()
    }
   }else{
    const y=(v:number)=>bottom-(Math.max(-60,Math.min(0,v))+60)/60*(bottom-top)
    for(const db of (bottom-top<80?[-60,-30,0]:[-60,-48,-36,-24,-12,0])){ctx.strokeStyle='#303a34';ctx.beginPath();ctx.moveTo(left,y(db));ctx.lineTo(right,y(db));ctx.stroke();ctx.fillStyle='#a8b5ac';ctx.fillText(String(db),5,y(db)+4)}
    const goal=targets?(targets.enabled?targets.integrated:null):target?.targetEnabled?{target:target.targetLufs,tolerance:0}:null
    if(goal){const high=y(goal.target+goal.tolerance),low=y(goal.target-goal.tolerance);ctx.fillStyle='#efb65b14';ctx.fillRect(left,high,right-left,Math.max(1,low-high));const py=y(goal.target);ctx.strokeStyle='#efb65b';ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(right,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#efb65b';ctx.textAlign='right';ctx.fillText('I '+goal.target.toFixed(1)+' LUFS ±'+goal.tolerance+' LU',right-3,Math.max(top+9,py-5));ctx.textAlign='left'}
    for(const [key,color,dash] of [['m','#91e65c',[]],['s','#58d4da',[5,3]],['i','#efb65b',[2,3]]] as const){
     if(!traces.includes(key))continue
     ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([...dash]);ctx.beginPath();let connected=false
     for(const point of snapshot?.loudnessHistory||[]){
      const metric=point[key],px=x(point.frame)
      if(metric.status!=='ready'||metric.value===null||px<left||px>right||point.flags&4){connected=false;if(px<left||px>right||metric.status!=='ready'||metric.value===null)continue}
      if(connected)ctx.lineTo(px,y(metric.value));else ctx.moveTo(px,y(metric.value));connected=true
     }ctx.stroke()
     const limit=targets?.enabled?(key==='m'?targets.momentaryMax:key==='s'?targets.shortTermMax:null):null
     const bounds=targets?.enabled&&key==='i'?targets.integrated:null
     if(limit!==null||bounds){ctx.setLineDash([]);ctx.strokeStyle='#ff7e83';ctx.lineWidth=1.25;let previous=-Infinity
      for(const point of snapshot?.loudnessHistory||[]){const metric=point[key],px=x(point.frame);if(metric.status!=='ready'||metric.value===null||point.flags&4||px<left||px>right||px-previous<7)continue
       if(limit!==null?metric.value>limit:bounds&&(metric.value<bounds.target-bounds.tolerance||metric.value>bounds.target+bounds.tolerance)){const py=y(metric.value);ctx.beginPath();ctx.moveTo(px-2,py-2);ctx.lineTo(px+2,py+2);ctx.moveTo(px+2,py-2);ctx.lineTo(px-2,py+2);ctx.stroke();previous=px;targetMarkers++}}
     }
    }ctx.setLineDash([])
    canvas.dataset.targetMarkers=String(targetMarkers)
   }
   if(selected){
    const a=Math.max(left,Math.min(right,x(selected.startFrame))),b=Math.max(left,Math.min(right,x(selected.endFrame)))
    ctx.fillStyle='#58d4da1f';ctx.fillRect(a,top,Math.max(0,b-a),bottom-top)
    ctx.strokeStyle='#58d4da';ctx.lineWidth=1
    for(const p of [a,b]){ctx.beginPath();ctx.moveTo(p,top);ctx.lineTo(p,bottom);ctx.stroke();ctx.fillStyle='#58d4da';ctx.fillRect(p-2,top,4,9)}
   }
   const available=snapshot?.timelineAvailableRange
    if(available&&!file){
     const a=Math.max(left,Math.min(right,x(available.startFrame))),b=Math.max(left,Math.min(right,x(available.endFrame)))
     ctx.fillStyle='rgba(9,13,11,.58)';ctx.fillRect(left,top,a-left,bottom-top);ctx.fillRect(b,top,right-b,bottom-top)
     ctx.strokeStyle='#687166';ctx.setLineDash([2,3]);for(const p of [a,b])if(p>left&&p<right){ctx.beginPath();ctx.moveTo(p,top);ctx.lineTo(p,bottom);ctx.stroke()}
    }
    ctx.strokeStyle='#efb65b';ctx.setLineDash([3,3])
   for(const gap of snapshot?.recordingView?.gapFrames||[]){const px=x(gap);ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,bottom);ctx.stroke()}
   ctx.setLineDash([]);ctx.strokeStyle='#58d4da';ctx.lineWidth=1
   const head=ranged?x(cursor):right
   if(head>=left&&head<=right){ctx.beginPath();ctx.moveTo(head,top);ctx.lineTo(head,bottom);ctx.stroke()}
  }
  function draw(){if(wave.current)paint(wave.current,kind==='spectrogram'?'spectral':'wave');if(loud.current)paint(loud.current,'loud')}
  draw();const observer=new ResizeObserver(draw);if(box.current)observer.observe(box.current);return()=>observer.disconnect()
 },[snapshot,seconds,gain,target,targets,preview,selected?.startFrame,selected?.endFrame,traces,kind,layer])
 useEffect(()=>{if(!drag.current)setPreview(null)},[snapshot?.sourceId])
 useEffect(()=>{
  const target=wave.current,prevent=(event:WheelEvent)=>event.preventDefault()
  target?.addEventListener('wheel',prevent,{passive:false})
  return()=>target?.removeEventListener('wheel',prevent)
 },[])
 function position(event:React.PointerEvent<HTMLElement>|React.WheelEvent<HTMLElement>):bigint{
  const rect=event.currentTarget.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left-36)/Math.max(1,rect.width-46)))
  const a=drag.current?.start??start,b=drag.current?.end??end
   return a+BigInt(Math.round(Number(b-a)*ratio))
 }
 function down(event:React.PointerEvent<HTMLElement>){
  if(!interactive||end<=start||event.button!==0)return
  const point=position(event),range=snapshot?.fileView?.selection,available=snapshot?.timelineAvailableRange
   if(available&&(BigInt(available.endFrame)<=BigInt(available.startFrame)||point<BigInt(available.startFrame)||point>BigInt(available.endFrame)))return
   event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId)
  let mode:Drag['mode']=(event.shiftKey||selectionMode||event.currentTarget.dataset.selectRange==='true')?'selection':'seek',fixed=point
  if(file&&!event.shiftKey&&!selectionMode&&event.currentTarget.dataset.selectRange!=='true'&&range){
   const tolerance=BigInt(Math.ceil(Number(end-start)*7/Math.max(1,event.currentTarget.getBoundingClientRect().width-46)))
   const a=BigInt(range.startFrame),b=BigInt(range.endFrame),distance=(v:bigint)=>point>v?point-v:v-point
   if(distance(a)<=tolerance){mode='start';fixed=b}else if(distance(b)<=tolerance){mode='end';fixed=a}
  }
  drag.current={source:snapshot,start,end,mode,anchor:point,position:point,resume:false,fixed};if(mode!=='seek')setPreview({...drag.current})
  if(mode==='seek')onSeek?.(point.toString(),false,drag.current?.source||snapshot)
   else if(snapshot?.playback?.playing)onSeek?.(snapshot.positionFrame,false,snapshot)
 }
 function move(event:React.PointerEvent<HTMLElement>){
  const current=drag.current
   if(!current){
    const rect=event.currentTarget.getBoundingClientRect();layer?.hover?.(position(event).toString(),Math.max(0,Math.min(1,(rect.bottom-event.clientY-14)/Math.max(1,rect.height-28))))
    const available=snapshot?.timelineAvailableRange,p=position(event),blocked=available&&(p<BigInt(available.startFrame)||p>BigInt(available.endFrame))
    const element=event.currentTarget;if(!element.dataset.defaultTitle)element.dataset.defaultTitle=element.title
    element.title=blocked?(take?'此处仅为概览，结束录音后打开文件可查看完整历史':'此处已超出可回看的实时缓存'):element.dataset.defaultTitle||'';element.style.cursor=blocked?'not-allowed':'crosshair';return
   }
   let point=position(event)
   const available=current.source?.timelineAvailableRange
   if(available)point=point<BigInt(available.startFrame)?BigInt(available.startFrame):point>BigInt(available.endFrame)?BigInt(available.endFrame):point
  if(current.mode==='start'&&point>=current.fixed)point=current.fixed-1n
  if(current.mode==='end'&&point<=current.fixed)point=current.fixed+1n
  current.position=point;if(current.mode!=='seek')setPreview({...current})
  if(current.mode==='seek')onSeek?.(point.toString(),false,drag.current?.source||snapshot)
 }
 function up(event:React.PointerEvent<HTMLElement>){
  const current=drag.current;if(!current)return
  move(event);drag.current=null;setPreview(null);event.currentTarget.releasePointerCapture(event.pointerId)
  if(current.mode==='seek')onSeek?.(current.position.toString(),false,current.source)
  else{
   const a=current.mode==='start'?current.position:current.mode==='end'?current.fixed:current.position<current.anchor?current.position:current.anchor
   const b=current.mode==='end'?current.position:current.mode==='start'?current.fixed:current.position>current.anchor?current.position:current.anchor
   if(b>a)onSelection?.(a.toString(),b.toString(),current.source)
    else onSeek?.(a.toString(),false,current.source)
  }
 }
 function wheel(event:React.WheelEvent<HTMLElement>){
  if(drag.current||event.altKey||event.metaKey||(!event.deltaY&&!event.deltaX))return
   const delta=wheelPixels(event.deltaY||event.deltaX,event.deltaMode)
   if(event.shiftKey){
    if(!file||end<=start)return
    const pending=wheelWindow.current.sourceId===snapshot?.sourceId?wheelWindow.current:null
    const a=BigInt(pending?.start||start),b=BigInt(pending?.end||end)
    const next=panRange(a,b,BigInt(snapshot!.fileView!.totalFrames),delta/500)
    if(next.start===a.toString()&&next.end===b.toString())return
    wheelWindow.current={sourceId:snapshot?.sourceId||'',...next};onWindow?.(next.start,next.end);return
   }
  if(!event.ctrlKey&&kind!=='ruler'){
   if(layer?.wheel){const r=event.currentTarget.getBoundingClientRect();layer.wheel(Math.max(0,Math.min(1,(r.bottom-event.clientY-14)/Math.max(1,r.height-28))),delta);return}
   const next=wheelValue(wheelGain.current,delta,1,4,true);if(next===wheelGain.current)return;wheelGain.current=next;onGain?.(next);return
  }
  if(!file&&!take){
   const next=wheelValue(wheelSeconds.current,delta,5,60);if(next===wheelSeconds.current)return;wheelSeconds.current=next;onSeconds?.(next);return
  }
  if(end<=start)return
  const pending=wheelWindow.current.sourceId===snapshot?.sourceId?wheelWindow.current:null
  const a=BigInt(pending?.start||start),b=BigInt(pending?.end||end)
  const rect=event.currentTarget.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,(event.clientX-rect.left-36)/Math.max(1,rect.width-46)))
  const total=BigInt(file?snapshot!.fileView!.totalFrames:snapshot?.recordingView?.durationNs||'0')
  const next=zoomRange(a,b,total,snapshot?.timelineRate||snapshot?.format.sampleRate||48000,a+BigInt(Math.round(Number(b-a)*ratio)),delta)
  if(next.start===a.toString()&&next.end===b.toString())return
  wheelWindow.current={sourceId:snapshot?.sourceId||'',...next};onWindow?.(next.start,next.end)
 }
 const handlers={onPointerDown:down,onPointerMove:move,onPointerUp:up,onPointerCancel:()=>{const current=drag.current;drag.current=null;setPreview(null);if(current?.mode==='seek')onSeek?.(current.position.toString(),false,current.source)}}
 const ruler=Array.from({length:7},(_,i)=>{
  if(interactive)return (Number(start+(end-start)*BigInt(i)/6n)/(snapshot?.timelineRate||snapshot?.format.sampleRate||48000)+(snapshot?.fileView?.timeOffsetSeconds||0)).toFixed(2)+'s'
  if(snapshot?.sourceKind==='take')return (Math.max(1,Number(snapshot.positionFrame)/(snapshot.timelineRate||snapshot.format.sampleRate||48000))*i/6).toFixed(1)+'s'
  return i===6?'现在':'−'+zoomLabel(seconds*(6-i)/6)+'s'
 })
 return <div className={'timeline '+(interactive?'file-timeline':'')+(kind==='ruler'?' surface-ruler':'')} ref={box} data-inspectable-start={snapshot?.timelineAvailableRange?.startFrame} data-inspectable-end={snapshot?.timelineAvailableRange?.endFrame}>
   {controls}
  {kind!=='history'&&kind!=='ruler'&&<section className="wave-panel">
   <div className="panel-heading"><h2>{kind==='spectrogram'?'声谱图':'波形'}</h2><span className="small-note" title="滚轮调整波形倍率；Ctrl + 滚轮调整时间窗">×{zoomLabel(gain,2)}</span></div>
   <canvas ref={wave} onWheel={wheel} title={kind==='spectrogram'?'滚轮：频率范围 · Ctrl + 滚轮：时间窗 · Shift + 滚轮：平移 · 拖动定位或选区':'滚轮：波形倍率 · Ctrl + 滚轮：时间窗 · Shift + 滚轮：平移 · 右键：选区操作'} aria-label={kind==='spectrogram'?'声谱图：共轴时间与频率定位':file?'文件波形定位':'系统音频滚动波形，左右声道分开显示'} {...handlers}/>
   {feedback}
    {kind!=='spectrogram'&&!feedback&&!snapshot?.waveform.length&&<div className="empty-wave">{file?'准备波形…':'等待音频'}</div>}
  </section>}
  {kind!=='history'&&<div className="time-ruler" onWheel={kind==='ruler'?wheel:undefined} data-select-range="true" aria-label={file?'时间刻度，拖动选择范围':'时间刻度'} title="点击定位；拖动刻度轴选择范围；图内 Shift + 拖动也可选择" {...handlers}>{ruler.map((label,i)=><span key={i}>{label}</span>)}</div>}
  {(kind==='both'||kind==='history')&&<section className="loudness-panel">
   <div className="panel-heading"><h2>响度历史 <small>LUFS</small></h2><div className="legend">{targets?.enabled&&<span title="× 标出可见曲线中超出目标的点；I 为截至此处的累计值，完整事件见报告。">× 超出目标</span>}<span className="legend-m">M</span><span className="legend-s">S</span><span className="legend-i">I</span></div></div>
   <canvas ref={loud} aria-label={file?'文件响度历史定位':'与波形共用时间轴的 M、S、I 响度历史'} {...handlers}/>
  {kind==='history'&&feedback}
  </section>}
  {kind==='history'&&<div className="time-ruler" data-select-range="true" aria-label="响度历史时间刻度" {...handlers}>{ruler.map((label,i)=><span key={i}>{label}</span>)}</div>}
  {kind==='both'&&file&&snapshot?.fileView&&<SelectionStats view={snapshot.fileView} rate={snapshot.format.sampleRate}/>}
 </div>
}
