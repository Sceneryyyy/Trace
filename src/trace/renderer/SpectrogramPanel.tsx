import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {SurfaceCanvas} from './SurfaceCanvas'
import {SpectrogramLegend} from './SpectrogramLegend'
import {frequencyAt,frequencyRatio,frequencyTicks,frequencyLabel,zoomFrequencies} from '../spectrogramScale'
import {defaultSurface,surfacePresets,type SurfaceOptions} from '../surfaceOptions'
import {Timeline,useTimelinePreviewRange,type TimelineProps,type TimelineLayer} from './Timeline'
import {colorizeSpectrogram,spectrogramPacketMatches,spectrogramContextKey} from './spectrogramPresentation'
import {defaultSpectrogramSettings,spectrogramConfigKey,validateSpectrogramSettings,type SpectrogramSettings,type SpectrogramPacket,type SpectrogramQuery,type SpectrogramSourceRef} from '../spectrogramProtocol'
import type {Command,MeterSnapshot} from '../shared'
import './spectrogram.css'
import {useRendererTheme,spectrogramStops} from './themeRuntime'
async function query(command:Command,payload:Record<string,unknown>,id=crypto.randomUUID()):Promise<unknown>{
 const r=await window.trace.request({protocolVersion:1,requestId:id,expectedStateRevision:0,command,payload})
 if(!r.ok)throw Error(r.error?.message||'查询未完成');return r.data
}
function sourceRef(s:MeterSnapshot|null):SpectrogramSourceRef|undefined{
 return s?{kind:s.sourceKind,sourceId:s.sourceId,epochId:s.epochId,measurementEpoch:s.measurementEpoch,...(s.fileView?.analysisId?{analysisId:s.fileView.analysisId}:{})}:undefined
}
function monoIncompatible(s:MeterSnapshot|null,settings:SpectrogramSettings):boolean{
 return (s?.sourceKind==='take'?s.recording?.sourceFormat.channelCount:s?.format.channelCount)===1&&!['stereo','left'].includes(settings.channel)
}
export function SpectrogramPanel({settings,change,isVisible,...timeline}:TimelineProps&{settings:SpectrogramSettings;change:(s:SpectrogramSettings)=>void;isVisible:()=>boolean}){
 const [surfaceError,setSurfaceError]=useState<string|null>(null),[surfaceRetry,setSurfaceRetry]=useState(0)
 const box=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:512,height:180}),[packet,setPacket]=useState<SpectrogramPacket|null>(null),[failure,setFailure]=useState<{context:string;text:string}|null>(null),[readout,setReadout]=useState<{context:string;text:string}|null>(null),[retry,setRetry]=useState(0)
 const current=useRef({timeline,settings,isVisible,size});current.current={timeline,settings,isVisible,size}
 const refreshRef=useRef<()=>void>(()=>{}),effectContext=useRef(''),requestStarted=useRef({id:'',at:0})
 const active=useRef(''),signature=useRef(''),hoverGeneration=useRef(0),hoverTime=useRef(0)
 const snapshot=timeline.snapshot,axis=snapshot?.fileView||snapshot?.timelineWindow
 const selectionPreview=useTimelinePreviewRange(snapshot?.sourceId),surface=settings.surface||defaultSurface,wants3d=surface.mode==='3d',show3d=wants3d&&!surfaceError
 const changeSurface=(next:SurfaceOptions)=>{setReadout(null);change({...settings,surface:next})}
 const reference=sourceRef(snapshot),sourceKey=JSON.stringify(reference),phase=snapshot?.fileView?.analysisPhase||'',displayKey=spectrogramContextKey(reference,settings)
 const visiblePacket=spectrogramPacketMatches(packet,reference,settings)?packet:null,error=failure?.context===displayKey?failure.text:'',reading=readout?.context===displayKey?readout.text:''
 const mono=monoIncompatible(snapshot,settings)
 const fileRange=snapshot?.sourceKind==='file'?JSON.stringify([axis?.startFrame,axis?.endFrame]):''
 const configKey=spectrogramConfigKey(settings)
 useEffect(()=>{if(!box.current)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize({width:Math.max(1,Math.min(1024,Math.round(r.width-46))),height:Math.max(1,Math.min(512,Math.round(r.height-54)))})});observer.observe(box.current);return()=>observer.disconnect()},[])
 useEffect(()=>window.trace.onSpectrogram(next=>{
  const c=current.current,ref=sourceRef(c.timeline.snapshot)
  if(!c.isVisible()||next.requestId!==active.current||!spectrogramPacketMatches(next,ref,c.settings))return
  if(next.phase==='cancelled'){signature.current='';return}
  if(next.phase==='error'){setFailure({context:spectrogramContextKey(ref,c.settings),text:next.error||'声谱图暂不可用'});return}
  setPacket(next);setFailure(null)
 }),[])
 useEffect(()=>window.trace.onState(s=>{if(s.windowVisible===false){signature.current='';hoverGeneration.current++}}),[])
 useEffect(()=>{
  setPacket(p=>spectrogramPacketMatches(p,sourceRef(current.current.timeline.snapshot),current.current.settings)?p:null);setReadout(null);setFailure(null);signature.current=''
  const refresh=()=>{
   const c=current.current,s=c.timeline.snapshot,a=s?.fileView||s?.timelineWindow
   if(!c.isVisible()){signature.current='';return}
   if(!s||!a||BigInt(a.endFrame)<=BigInt(a.startFrame)||monoIncompatible(s,c.settings)||s.sourceKind==='take'&&s.recording?.phase!=='recording')return
   const payload:SpectrogramQuery={source:sourceRef(s)!,range:{startFrame:a.startFrame,endFrame:a.endFrame,...c.size}}
   const next=JSON.stringify(payload);if(next===signature.current)return;signature.current=next
   const id=crypto.randomUUID();active.current=id;requestStarted.current={id,at:performance.now()}
   void query('spectrogram.query',payload as unknown as Record<string,unknown>,id).catch(e=>{if(active.current===id){setFailure({context:spectrogramContextKey(payload.source,c.settings),text:String(e)})}})
  }
  refreshRef.current=refresh;effectContext.current=displayKey;refresh();const timer=setInterval(refresh,33)
  return()=>{clearInterval(timer);effectContext.current='';const id=active.current;active.current='';if(id)void query('spectrogram.cancel',{queryId:id}).catch(()=>{})}
 },[sourceKey,phase,fileRange,configKey,size.width,size.height,retry,mono])
 useLayoutEffect(()=>{if(snapshot?.sourceKind!=='file'&&effectContext.current===displayKey)refreshRef.current()},[axis?.startFrame,axis?.endFrame,displayKey])
 const view=visiblePacket?.view,theme=useRendererTheme()
 const image=useMemo(()=>{
  if(!view||show3d)return null
  const canvas=document.createElement('canvas');canvas.width=view.width;canvas.height=view.height
  const ctx=canvas.getContext('2d');if(!ctx)return null
  const bytes=new ImageData(colorizeSpectrogram(view,settings,theme.spectrogram),view.width,view.height)
  ctx.putImageData(bytes,0,0);return canvas
 },[view,settings.minDecibels,settings.maxDecibels,settings.palette,show3d,theme])
 const nyquist=(view?.sampleRate||snapshot?.format.sampleRate||48000)/2,lo=Math.min(settings.minFrequency,nyquist*.9),hi=Math.min(settings.maxFrequency,nyquist)
 const reset=()=>change({...settings,minFrequency:20,maxFrequency:Math.min(20000,nyquist),minDecibels:-100,maxDecibels:0})
 // Keep the layer referentially stable so Timeline does not rebuild its paint
 // pipeline on every snapshot frame; volatile inputs are read through a ref.
 const volatile=useRef({image,visiblePacket,displayKey,lo,hi,nyquist,mono,snapshot,settings,tokens:theme.tokens})
 volatile.current={image,visiblePacket,displayKey,lo,hi,nyquist,mono,snapshot,settings,tokens:theme.tokens}
 const changeRef=useRef(change);changeRef.current=change
 const layer=useMemo<TimelineLayer>(()=>({draw:(ctx,g)=>{
  const v=volatile.current
  ctx.save();ctx.beginPath();ctx.rect(g.left,g.top,g.right-g.left,g.bottom-g.top);ctx.clip()
  if(v.image&&v.visiblePacket?.axisStartFrame&&v.visiblePacket.axisEndFrame){ctx.imageSmoothingEnabled=false;const a=g.x(v.visiblePacket.axisStartFrame),b=g.x(v.visiblePacket.axisEndFrame);ctx.drawImage(v.image,a,g.top,b-a,g.bottom-g.top)}
  const painted=v.image?v.displayKey:'';if(ctx.canvas.dataset.spectrogramDrawnContext!==painted)ctx.canvas.dataset.spectrogramDrawnContext=painted
  if(v.image&&v.visiblePacket?.requestId===requestStarted.current.id){
   const key=v.visiblePacket.requestId+':'+v.visiblePacket.phase
   if(ctx.canvas.dataset.spectrogramPaintKey!==key){ctx.canvas.dataset.spectrogramPaintKey=key;ctx.canvas.dataset.spectrogramPaintMs=String(performance.now()-requestStarted.current.at)}
  }
  ctx.strokeStyle=v.tokens['spectro-grid'];ctx.lineWidth=1
  for(let n=0;n<=6;n++){const x=g.left+(g.right-g.left)*n/6;ctx.beginPath();ctx.moveTo(x,g.top);ctx.lineTo(x,g.bottom);ctx.stroke()}
  ctx.restore();ctx.font='10px "JetBrains Mono",monospace';ctx.fillStyle=v.tokens['spectro-axis'];ctx.textAlign='right'
  for(const f of frequencyTicks(v.lo,v.hi,g.bottom-g.top)){const y=g.bottom-frequencyRatio(f,v.lo,v.hi)*(g.bottom-g.top);ctx.fillText(frequencyLabel(f),g.left-5,y+3)}
  ctx.textAlign='left'
 },hover:(position,ratio)=>{
  const v=volatile.current
  if(!v.visiblePacket?.view||v.mono||Date.now()-hoverTime.current<60)return;hoverTime.current=Date.now();const generation=++hoverGeneration.current,id=active.current
  void query('spectrogram.point',{queryId:id,positionFrame:position,frequency:frequencyAt(ratio,v.lo,v.hi)}).then(raw=>{
   if(generation!==hoverGeneration.current||id!==active.current)return
   const p=raw as {frequency:number;frame:string;status:string;decibels:number|null},rate=v.snapshot?.timelineRate||v.snapshot?.format.sampleRate||48000
   const value=p.status==='ready'?p.decibels!.toFixed(1)+' dBFS':p.status==='silence'?'−∞ dBFS · 静音':p.status==='gap'?'数据缺口':p.status==='error'?'数据错误':'未覆盖'
   setReadout({context:v.displayKey,text:(Number(p.frame)/rate+(v.snapshot?.fileView?.timeOffsetSeconds||0)).toFixed(3)+' s · '+p.frequency.toFixed(1)+' Hz · '+value})
  }).catch(()=>{})
 },wheel:(ratio,delta)=>{
  const v=volatile.current
  changeRef.current({...v.settings,...zoomFrequencies(v.lo,v.hi,v.nyquist,ratio,delta)})
 }}),[])
 const status=mono?'此声道模式需要双声道':error?/UNAVAILABLE|OUTSIDE|NOT_READY/.test(error)?'此处音频暂不可用':'声谱图准备失败':!visiblePacket?'准备声谱图…':visiblePacket.phase==='partial'?'正在准备 '+Math.round((view?.progress||0)*100)+'%':''
 return <div className="spectrogram-instrument" data-surface-mode={show3d?'3d':'2d'} data-spectrogram-context={displayKey} data-spectrogram-phase={mono?'unavailable':error?'error':visiblePacket?.phase||'preparing'} data-spectrogram-request={visiblePacket?.requestId} onPointerLeave={()=>{hoverGeneration.current++;setReadout(null)}}>
  <div className="spectrogram-toolbar">   <label className="surface-time-window" title="与波形和响度历史共用时间范围">时间窗<input aria-label="声谱图时间窗" type="range" min="5" max="60" step=".1" value={Math.max(5,Math.min(60,axis?Number(BigInt(axis.endFrame)-BigInt(axis.startFrame))/(snapshot?.timelineRate||snapshot?.format.sampleRate||48000):timeline.seconds))} onChange={e=>timeline.onSeconds?.(Number(e.target.value))}/></label><div role="group" aria-label="声谱图维度"><button aria-pressed={!wants3d} onClick={()=>changeSurface({...surface,mode:'2d'})}>2D</button><button aria-pressed={wants3d} onClick={()=>changeSurface({...surface,mode:'3d'})}>3D</button></div>{error&&<button onClick={()=>setRetry(n=>n+1)} aria-label="重试声谱图">重试</button>}{mono&&<button onClick={()=>change({...settings,channel:'stereo'})}>使用单声道</button>}<button onClick={reset} title="复位频率和色阶范围">复位频率/色阶</button></div>
  {wants3d&&<div className="surface-controls">
   <label>视角<select aria-label="3D 视角" value={Object.entries(surfacePresets).find(([,preset])=>preset.yaw===surface.yaw&&preset.pitch===surface.pitch)?.[0]||'custom'} onChange={e=>{const preset=surfacePresets[e.target.value as keyof typeof surfacePresets];if(preset)changeSurface({...surface,...preset})}}><option value="custom" disabled>自定义</option>{(Object.keys(surfacePresets) as (keyof typeof surfacePresets)[]).map((key,i)=><option key={key} value={key}>{['正面','侧面','斜视','俯视'][i]}</option>)}</select></label>
   <button title="复位相机角度和缩放" onClick={()=>changeSurface({...surface,yaw:defaultSurface.yaw,pitch:defaultSurface.pitch,zoom:defaultSurface.zoom})}>复位相机</button>
   <details className="surface-options"><summary>视图选项</summary>   <label title="仅改变显示高度，不修改测量">高度<input aria-label="3D 显示高度" type="range" min=".25" max="2.5" step=".05" value={surface.height} onChange={e=>changeSurface({...surface,height:Number(e.target.value)})}/></label>
   <label>细节<select aria-label="3D 细节" value={surface.detail} onChange={e=>changeSurface({...surface,detail:Number(e.target.value) as SurfaceOptions['detail']})}><option value="64">低</option><option value="128">中</option><option value="256">高</option></select></label>
</details>

   {surfaceError&&<><span className="surface-failure" role="status">3D 暂不可用，已显示 2D</span><button title={surfaceError} onClick={()=>{setSurfaceError(null);setSurfaceRetry(n=>n+1)}}>重试 3D</button></>}
  </div>}
  <div className="spectrogram-body"><div className="spectrogram-plots" ref={box}>
  {wants3d&&<SurfaceCanvas key={surfaceRetry} view={mono?undefined:view} context={displayKey} dataStart={visiblePacket?.axisStartFrame} dataEnd={visiblePacket?.axisEndFrame} start={axis?.startFrame||'0'} end={axis?.endFrame||'0'} cursor={snapshot?.positionFrame||'0'} selection={selectionPreview||snapshot?.fileView?.selection} rate={snapshot?.timelineRate||snapshot?.format.sampleRate||48000} timeOffset={snapshot?.fileView?.timeOffsetSeconds||0} options={surface} palette={settings.palette} stops={spectrogramStops(theme,settings.palette)} themeTokens={theme.tokens} minDb={settings.minDecibels} maxDb={settings.maxDecibels} minFrequency={lo} maxFrequency={hi} hidden={!show3d} isVisible={isVisible} change={changeSurface} failure={setSurfaceError} hover={(frame,frequency)=>layer.hover?.(frame,frequencyRatio(frequency,lo,hi))}/>}
  <Timeline {...timeline} kind={show3d?'ruler':'spectrogram'} layer={show3d?undefined:layer} feedback={(!visiblePacket||mono)&&status?<div className="spectrogram-empty" role="status">{status}</div>:undefined}/>

  </div><SpectrogramLegend minDb={settings.minDecibels} maxDb={settings.maxDecibels} stops={spectrogramStops(theme,settings.palette)}/></div>
  <div className="spectrogram-readout" title="原始频点读数；图中色块显示所覆盖频点与时间窗的最大幅度。滚轮缩放频率，Ctrl + 滚轮缩放时间。">{error||mono?status:reading||status||('FFT '+settings.fftSize+' · 悬停查看频点')}<span>{view?.overviewLevel?'概览 ×'+2**view.overviewLevel+' · 频率分组 ×'+view.overviewBinStride+' · 悬停为原始频点 · ':''}斜纹：未覆盖 / 缺口</span></div>
 </div>
}
export function SpectrogramSettingsForm({value,apply}:{value:SpectrogramSettings;apply:(s:SpectrogramSettings)=>void}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('')
 return <div className="instrument-analysis-settings">
  <label>FFT 窗<select aria-label="声谱图 FFT 窗" value={draft.fftSize} onChange={e=>setDraft({...draft,fftSize:Number(e.target.value)})}>{[512,1024,2048,4096,8192,16384].map(n=><option key={n}>{n}</option>)}</select></label>
  <label>声道<select aria-label="声谱图声道" value={draft.channel} onChange={e=>setDraft({...draft,channel:e.target.value as SpectrogramSettings['channel']})}>{['stereo','left','right','mid','side'].map((v,i)=><option key={v} value={v}>{['声道能量','左','右','Mid','Side'][i]}</option>)}</select></label>
  {(['minFrequency','maxFrequency','minDecibels','maxDecibels'] as const).map((k,i)=><label key={k}>{['最低频率 · Hz','最高频率 · Hz','色阶下限 · dBFS','色阶上限 · dBFS'][i]}<input aria-label={k} type="number" value={draft[k]} onChange={e=>setDraft({...draft,[k]:Number(e.target.value)})}/></label>)}
  <label>配色<select value={draft.palette} onChange={e=>setDraft({...draft,palette:e.target.value as SpectrogramSettings['palette']})}><option value="trace">跟随主题</option><option value="heat">热度</option></select></label>
  <p className="small-note">FFT 窗越长，频率区分越细，瞬态时间范围也越宽。色阶与配色仅改变显示。</p>
  {error&&<p role="status">{error}</p>}<div className="layout-actions"><button onClick={()=>{try{apply(validateSpectrogramSettings(draft));setError('')}catch{setError('请检查频率和色阶范围。')}}}>应用</button><button onClick={()=>{setDraft({...defaultSpectrogramSettings});apply({...defaultSpectrogramSettings})}}>恢复默认</button></div>
 </div>
}
