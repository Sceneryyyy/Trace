import {useLayoutEffect,useMemo,useRef,useState} from 'react'
import {buildSurface,cameraMatrix,transform,pickSurface,type SurfaceOptions} from './spectralSurface'
import {SurfaceRenderer,type SurfaceScene} from './surfaceRenderer'
import type {SpectrogramView} from '../spectrogramView'
import type {SpectrogramStops} from '../instrumentThemes'
import './surface.css'
type Props={view?:SpectrogramView;context:string;dataStart?:string;dataEnd?:string;start:string;end:string;cursor:string;selection?:{startFrame:string;endFrame:string}|null;rate:number;timeOffset:number;options:SurfaceOptions;palette:'trace'|'heat';stops:SpectrogramStops;themeTokens:Readonly<Record<string,string>>;minDb:number;maxDb:number;minFrequency:number;maxFrequency:number;hidden:boolean;isVisible:()=>boolean;change:(options:SurfaceOptions)=>void;hover:(frame:string,frequency:number)=>void;failure:(message:string|null)=>void}
export function SurfaceCanvas(props:Props){
 const glCanvas=useRef<HTMLCanvasElement>(null),labels=useRef<HTMLCanvasElement>(null),renderer=useRef<SurfaceRenderer|null>(null),latest=useRef(props),drag=useRef<{x:number;y:number;options:SurfaceOptions}|null>(null),hoverAt=useRef(0)
 const [camera,setCamera]=useState(props.options),cameraRef=useRef(camera);latest.current=props;cameraRef.current=camera
 useLayoutEffect(()=>{if(!drag.current){setCamera(props.options);cameraRef.current=props.options}},[props.options])
 const mesh=useMemo(()=>{
  if(!props.view||!props.dataStart||!props.dataEnd||BigInt(props.end)<=BigInt(props.start))return null
  const span=Number(BigInt(props.end)-BigInt(props.start)),scale=Number(BigInt(props.dataEnd)-BigInt(props.dataStart))/span,shift=scale+2*Number(BigInt(props.dataStart)-BigInt(props.start))/span-1
  if(scale>10000||Math.abs(shift)>10000)return null
  const result=buildSurface(props.view,camera,props.minDb,props.maxDb)
  for(let i=0;i<result.vertices.length;i+=4)result.vertices[i]=result.vertices[i]*scale+shift
  return result
 },[props.view,props.start,props.end,props.dataStart,props.dataEnd,camera.height,camera.detail,props.minDb,props.maxDb])
 const meshRef=useRef(mesh);meshRef.current=mesh
 function draw(){
  const p=latest.current,r=renderer.current,canvas=glCanvas.current,overlay=labels.current;if(!r||!canvas||!overlay||!p.isVisible())return
  const a=BigInt(p.start),span=BigInt(p.end)-a,fraction=(frame:string)=>span>0n?Number(BigInt(frame)-a)/Number(span):0
  const tk=p.themeTokens
  const scene:SurfaceScene={mesh:meshRef.current,options:cameraRef.current,colours:{stops:p.stops,background:tk['surface-bg'],wire:tk['surface-wire'],cursor:tk['surface-cursor'],selection:tk['surface-selection']},cursor:span>0n?fraction(p.cursor):null,selection:p.selection?[fraction(p.selection.startFrame),fraction(p.selection.endFrame)]:null}
  try{r.draw(scene)}catch(error){p.failure(String(error));return}
  const rect=canvas.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return
  if(overlay.width!==canvas.width)overlay.width=canvas.width;if(overlay.height!==canvas.height)overlay.height=canvas.height
  const ctx=overlay.getContext('2d');if(!ctx)return;ctx.setTransform(canvas.width/rect.width,0,0,canvas.height/rect.height,0,0);ctx.clearRect(0,0,rect.width,rect.height)
  const matrix=cameraMatrix(cameraRef.current,rect.width/rect.height)
  const occupied:Array<{x:number;y:number;w:number;h:number}>=[]
  ctx.font='11px "JetBrains Mono",monospace';ctx.textBaseline='middle'
  const labelColour=tk['surface-label'],axisColour=tk['cursor']
  const label=(point:[number,number,number],text:string,color=labelColour,dx=0,dy=0,align:CanvasTextAlign='center')=>{
   const q=transform(matrix,point),x=(q[0]+1)*rect.width/2+dx,y=(1-q[1])*rect.height/2+dy,w=ctx.measureText(text).width,left=x-(align==='center'?w/2:align==='right'?w:0),box={x:left-3,y:y-7,w:w+6,h:14}
   if(box.x<3||box.x+box.w>rect.width-3||box.y<3||box.y+box.h>rect.height-3||occupied.some(b=>box.x<b.x+b.w&&box.x+box.w>b.x&&box.y<b.y+b.h&&box.y+box.h>b.y))return
   occupied.push(box);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(text,x,y)
  }
  label([0,-.09,1.15],'时间',axisColour,0,10);label([-1.16,0,0],'频率',axisColour,-8,0,'right')
  label([-1.08,cameraRef.current.height,1],p.maxDb.toFixed(0)+' dBFS',labelColour,-8,0,'right')
  const steps=rect.height<220?2:4
  for(const i of [0,steps,...Array.from({length:steps-1},(_,n)=>n+1)]){
   const ratio=i/steps,seconds=(Number(a)+Number(span)*ratio)/p.rate+p.timeOffset
   label([-1+2*ratio,-.05,1.06],seconds.toFixed(seconds<100?2:1)+'s',labelColour,0,10)
   const hz=p.minFrequency*Math.pow(p.maxFrequency/p.minFrequency,ratio);label([-1.08,0,1-2*ratio],hz>=1000?(hz/1000).toFixed(1)+'k':Math.round(hz)+' Hz',labelColour,-8,0,'right')
  }
  label([-1.08,cameraRef.current.height*.5,1],((p.minDb+p.maxDb)/2).toFixed(0)+' dBFS',labelColour,-8,0,'right')

  canvas.dataset.surfaceContext=p.view?p.context:'';canvas.dataset.surfaceVertices=String((meshRef.current?.vertices.length||0)/4);canvas.dataset.surfaceBuffers=JSON.stringify(r.resources)
 }
 const drawRef=useRef(draw);drawRef.current=draw
 useLayoutEffect(()=>{
  if(!glCanvas.current)return
  try{renderer.current=new SurfaceRenderer(glCanvas.current,message=>latest.current.failure(message),()=>{latest.current.failure(null);drawRef.current()})}catch(error){latest.current.failure(String(error))}
  const canvas=glCanvas.current,prevent=(event:WheelEvent)=>event.preventDefault();canvas.addEventListener('wheel',prevent,{passive:false})
  const observer=new ResizeObserver(()=>drawRef.current());observer.observe(canvas);drawRef.current()
  return()=>{observer.disconnect();canvas.removeEventListener('wheel',prevent);renderer.current?.dispose();renderer.current=null}
 },[])
 useLayoutEffect(()=>draw(),[mesh,camera,props.cursor,props.selection?.startFrame,props.selection?.endFrame,props.palette,props.stops,props.themeTokens,props.context,props.hidden])
 function move(e:React.PointerEvent<HTMLCanvasElement>){
  const d=drag.current
  if(d){let yaw=d.options.yaw-(e.clientX-d.x)*.3;while(yaw>180)yaw-=360;while(yaw< -180)yaw+=360;const next={...d.options,yaw,pitch:Math.max(10,Math.min(85,d.options.pitch-(e.clientY-d.y)*.25))};cameraRef.current=next;setCamera(next);return}
  if(Date.now()-hoverAt.current<60||!props.view)return;hoverAt.current=Date.now()
  const rect=e.currentTarget.getBoundingClientRect(),m=meshRef.current;if(!m)return
  const picked=pickSurface(m,cameraMatrix(cameraRef.current,rect.width/rect.height),(e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2)
  if(!picked)return
  const frame=BigInt(props.start)+BigInt(Math.round(Number(BigInt(props.end)-BigInt(props.start))*picked.time)),frequency=props.minFrequency*Math.pow(props.maxFrequency/props.minFrequency,picked.frequency)
  props.hover(String(frame),frequency)
 }
 return <div className="spectral-surface" data-hidden={props.hidden}>
  <canvas className="surface-gl" ref={glCanvas} aria-label="3D 声谱图：时间、频率和幅度" title="拖动旋转 · 滚轮缩放视角 · 下方刻度定位和选区" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,options:{...cameraRef.current}}}} onPointerMove={move} onPointerUp={e=>{if(!drag.current)return;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);props.change(cameraRef.current)}} onPointerCancel={()=>{drag.current=null;props.change(cameraRef.current)}} onWheel={e=>{e.preventDefault();e.stopPropagation();const next={...cameraRef.current,zoom:Math.max(.5,Math.min(2,cameraRef.current.zoom*Math.exp(-Math.max(-200,Math.min(200,e.deltaY))*.002)))};cameraRef.current=next;setCamera(next);props.change(next)}}/>
  <canvas className="surface-labels" ref={labels} aria-hidden="true"/>
  {!mesh?.indices.length&&<div className="surface-empty" role="status">该范围尚无完整时频数据</div>}
 </div>
}
