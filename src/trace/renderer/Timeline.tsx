import {wheelPixels,wheelValue,zoomRange,zoomLabel} from './zoom'
import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import type {DisplaySettings} from '../displaySettings'
import type {MeterSnapshot} from '../shared'
import {relativeFrame} from './time'
import {SelectionStats} from './FileControls'
type Props={
 selectionMode?:boolean;controls?:React.ReactNode;snapshot:MeterSnapshot|null;seconds:number;gain:number;target?:DisplaySettings
 onSeek?:(position:string,resume:boolean,source:MeterSnapshot|null)=>void
 onSelection?:(start:string,end:string,source:MeterSnapshot|null)=>void
 onWindow?:(start:string,end:string)=>void
 onGain?:(value:number)=>void
 onSeconds?:(value:number)=>void
}
type Drag={source:MeterSnapshot|null;start:bigint;end:bigint;mode:'seek'|'selection'|'start'|'end';anchor:bigint;position:bigint;resume:boolean;fixed:bigint}
export function Timeline({selectionMode=false,controls,snapshot,seconds,gain,target,onSeek,onSelection,onWindow,onGain,onSeconds}:Props):React.JSX.Element{
 const wave=useRef<HTMLCanvasElement>(null),loud=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null)
 const drag=useRef<Drag|null>(null),[preview,setPreview]=useState<Drag|null>(null)
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
 useEffect(()=>{
  function paint(canvas:HTMLCanvasElement,kind:'wave'|'loud'){
   const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1
   canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr)
   const ctx=canvas.getContext('2d');if(!ctx)return
   ctx.scale(dpr,dpr)
   const w=rect.width,h=rect.height,left=36,right=w-10,top=14,bottom=h-14
   const rate=snapshot?.timelineRate||snapshot?.format.sampleRate||48000
   const cursor=snapshot?.positionFrame||'0'
   const take=snapshot?.sourceKind==='take',ranged=Boolean(snapshot?.fileView||snapshot?.timelineWindow)
   const start=ranged?(snapshot?.fileView||snapshot?.timelineWindow)?.startFrame||'0':'0',finish=ranged?(snapshot?.fileView||snapshot?.timelineWindow)?.endFrame||'0':cursor
   const span=ranged?Math.max(1,relativeFrame(finish,start)):take?Math.max(rate,Number(cursor)):seconds*rate
   const x=(frame:string)=>left+(ranged?relativeFrame(frame,start):take?Number(frame):relativeFrame(frame,cursor)+span)/span*(right-left)
   ctx.strokeStyle='#303a34';ctx.lineWidth=1
   for(let i=0;i<=6;i++){const px=left+(right-left)*i/6;ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,bottom);ctx.stroke()}
   ctx.font='10px "JetBrains Mono", monospace';ctx.fillStyle='#a8b5ac'
   if(kind==='wave'){
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
    for(const db of [-60,-48,-36,-24,-12,0]){ctx.strokeStyle='#303a34';ctx.beginPath();ctx.moveTo(left,y(db));ctx.lineTo(right,y(db));ctx.stroke();ctx.fillStyle='#a8b5ac';ctx.fillText(String(db),5,y(db)+4)}
    if(target?.targetEnabled){const py=y(target.targetLufs);ctx.strokeStyle='#efb65b';ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(left,py);ctx.lineTo(right,py);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#efb65b';ctx.textAlign='right';ctx.fillText('目标 '+target.targetLufs.toFixed(1)+' LUFS',right-3,Math.max(top+9,py-5));ctx.textAlign='left'}
    for(const [key,color,dash] of [['m','#91e65c',[]],['s','#58d4da',[5,3]],['i','#efb65b',[2,3]]] as const){
     ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.setLineDash([...dash]);ctx.beginPath();let connected=false
     for(const point of snapshot?.loudnessHistory||[]){
      const metric=point[key],px=x(point.frame)
      if(metric.status!=='ready'||metric.value===null||px<left||px>right||point.flags&4){connected=false;if(px<left||px>right||metric.status!=='ready'||metric.value===null)continue}
      if(connected)ctx.lineTo(px,y(metric.value));else ctx.moveTo(px,y(metric.value));connected=true
     }ctx.stroke()
    }ctx.setLineDash([])
   }
   if(selected){
    const a=Math.max(left,Math.min(right,x(selected.startFrame))),b=Math.max(left,Math.min(right,x(selected.endFrame)))
    ctx.fillStyle='#58d4da1f';ctx.fillRect(a,top,Math.max(0,b-a),bottom-top)
    ctx.strokeStyle='#58d4da';ctx.lineWidth=1
    for(const p of [a,b]){ctx.beginPath();ctx.moveTo(p,top);ctx.lineTo(p,bottom);ctx.stroke();ctx.fillStyle='#58d4da';ctx.fillRect(p-2,top,4,9)}
   }
   ctx.strokeStyle='#efb65b';ctx.setLineDash([3,3])
   for(const gap of snapshot?.recordingView?.gapFrames||[]){const px=x(gap);ctx.beginPath();ctx.moveTo(px,top);ctx.lineTo(px,bottom);ctx.stroke()}
   ctx.setLineDash([]);ctx.strokeStyle='#58d4da';ctx.lineWidth=1
   const head=ranged?x(cursor):right
   if(head>=left&&head<=right){ctx.beginPath();ctx.moveTo(head,top);ctx.lineTo(head,bottom);ctx.stroke()}
  }
  function draw(){if(wave.current)paint(wave.current,'wave');if(loud.current)paint(loud.current,'loud')}
  draw();const observer=new ResizeObserver(draw);if(box.current)observer.observe(box.current);return()=>observer.disconnect()
 },[snapshot,seconds,gain,target,preview,selected?.startFrame,selected?.endFrame])
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
  event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId)
  const point=position(event),range=snapshot?.fileView?.selection
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
  const current=drag.current;if(!current)return
  let point=position(event)
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
 function wheel(event:React.WheelEvent<HTMLCanvasElement>){
  if(drag.current||event.altKey||event.metaKey||event.shiftKey||!event.deltaY)return
  const delta=wheelPixels(event.deltaY,event.deltaMode)
  if(!event.ctrlKey){
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
 return <div className={'timeline '+(interactive?'file-timeline':'')} ref={box}>
  {controls}
  <section className="wave-panel">
   <div className="panel-heading"><h2>波形</h2><span className="small-note" title="滚轮调整波形倍率；Ctrl + 滚轮调整时间窗">×{zoomLabel(gain,2)}</span></div>
   <canvas ref={wave} onWheel={wheel} title="滚轮：波形倍率 · Ctrl + 滚轮：时间窗" aria-label={file?'文件波形定位':'系统音频滚动波形，左右声道分开显示'} {...handlers}/>
   {!snapshot?.waveform.length&&<div className="empty-wave">{file?'准备波形…':'等待音频'}</div>}
  </section>
  <div className="time-ruler" data-select-range="true" aria-label={file?'时间刻度，拖动选择范围':'时间刻度'} title="点击定位；拖动刻度轴选择范围；图内 Shift + 拖动也可选择" {...handlers}>{ruler.map((label,i)=><span key={i}>{label}</span>)}</div>
  <section className="loudness-panel">
   <div className="panel-heading"><h2>响度历史 <small>LUFS</small></h2><div className="legend"><span className="legend-m">M</span><span className="legend-s">S</span><span className="legend-i">I</span></div></div>
   <canvas ref={loud} aria-label={file?'文件响度历史定位':'与波形共用时间轴的 M、S、I 响度历史'} {...handlers}/>
  </section>
  {file&&snapshot?.fileView&&<SelectionStats view={snapshot.fileView} rate={snapshot.format.sampleRate}/>}
 </div>
}
