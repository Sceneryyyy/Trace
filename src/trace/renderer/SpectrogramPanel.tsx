import {useEffect,useMemo,useRef,useState} from 'react'
import {Timeline,type TimelineProps,type TimelineLayer} from './Timeline'
import {defaultSpectrogramSettings,validateSpectrogramSettings,type SpectrogramSettings,type SpectrogramPacket,type SpectrogramQuery} from '../spectrogramProtocol'
import type {Command} from '../shared'
import './spectrogram.css'
async function query(command:Command,payload:Record<string,unknown>,id=crypto.randomUUID()):Promise<unknown>{
 const r=await window.trace.request({protocolVersion:1,requestId:id,expectedStateRevision:0,command,payload})
 if(!r.ok)throw Error(r.error?.message||'查询未完成');return r.data
}
function rgb(t:number,palette:SpectrogramSettings['palette']):number[]{
 const colors=palette==='heat'?[[14,20,33],[51,62,132],[170,63,101],[244,141,60],[253,233,156]]:[[14,21,28],[34,65,83],[45,143,149],[145,230,92],[246,225,125]]
 const n=Math.max(0,Math.min(1,t))*(colors.length-1),i=Math.min(colors.length-2,Math.floor(n)),f=n-i
 return colors[i].map((v,c)=>Math.round(v*(1-f)+colors[i+1][c]*f))
}
export function SpectrogramPanel({settings,change,isVisible,...timeline}:TimelineProps&{settings:SpectrogramSettings;change:(s:SpectrogramSettings)=>void;isVisible:()=>boolean}){
 const box=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:512,height:180}),[packet,setPacket]=useState<SpectrogramPacket|null>(null),[error,setError]=useState(''),[reading,setReading]=useState('')
 const current=useRef({timeline,settings,isVisible,size});current.current={timeline,settings,isVisible,size}
 const active=useRef(''),signature=useRef(''),hoverGeneration=useRef(0),hoverTime=useRef(0)
 const snapshot=timeline.snapshot,axis=snapshot?.fileView||snapshot?.timelineWindow
 const sourceKey=JSON.stringify([snapshot?.sourceKind,snapshot?.sourceId,snapshot?.epochId,snapshot?.measurementEpoch,snapshot?.fileView?.analysisId,snapshot?.fileView?.analysisPhase])
 const fileRange=snapshot?.sourceKind==='file'?JSON.stringify([axis?.startFrame,axis?.endFrame]):''
 const configKey=JSON.stringify([settings.fftSize,settings.channel,settings.minFrequency,settings.maxFrequency])
 useEffect(()=>{if(!box.current)return;const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize({width:Math.max(1,Math.min(1024,Math.round(r.width-46))),height:Math.max(1,Math.min(512,Math.round(r.height-90)))})});observer.observe(box.current);return()=>observer.disconnect()},[])
 useEffect(()=>window.trace.onSpectrogram(next=>{if(next.requestId!==active.current)return;if(next.phase==='error'){setError(next.error||'声谱图暂不可用');return}setPacket(next);setError('')}),[])
 useEffect(()=>{
  setPacket(null);setReading('');setError('');signature.current=''
  const refresh=()=>{
   const c=current.current,s=c.timeline.snapshot,a=s?.fileView||s?.timelineWindow
   if(!c.isVisible()||!s||!a||BigInt(a.endFrame)<=BigInt(a.startFrame))return
   const payload:SpectrogramQuery={source:{kind:s.sourceKind,sourceId:s.sourceId,epochId:s.epochId,measurementEpoch:s.measurementEpoch},range:{startFrame:a.startFrame,endFrame:a.endFrame,...c.size}}
   const next=JSON.stringify(payload);if(next===signature.current)return;signature.current=next
   const id=crypto.randomUUID();active.current=id
   void query('spectrogram.query',payload as unknown as Record<string,unknown>,id).catch(e=>{if(active.current===id){signature.current='';setError(String(e))}})
  }
  refresh();const timer=setInterval(refresh,500)
  return()=>{clearInterval(timer);const id=active.current;active.current='';if(id)void query('spectrogram.cancel',{queryId:id}).catch(()=>{})}
 },[sourceKey,fileRange,configKey,size.width,size.height])
 const view=packet?.view
 const image=useMemo(()=>{
  if(!view)return null
  const canvas=document.createElement('canvas');canvas.width=view.width;canvas.height=view.height
  const ctx=canvas.getContext('2d');if(!ctx)return null
  const bytes=ctx.createImageData(view.width,view.height)
  for(let y=0;y<view.height;y++)for(let x=0;x<view.width;x++){
   const index=((view.height-1-y)*view.width+x)*4,flags=view.status[x]
   let color=rgb((view.decibels[y*view.width+x]-settings.minDecibels)/(settings.maxDecibels-settings.minDecibels),settings.palette)
   if(!(flags&2))color=(x+y)%8<2?flags&12?[142,110,56]:[56,66,74]:[21,27,32]
   else if(view.coverage[x]<.999&&(x+y)%8<2)color=flags&12?[177,133,61]:[86,101,108]
   bytes.data.set([...color,255],index)
  }
  ctx.putImageData(bytes,0,0);return canvas
 },[view,settings.minDecibels,settings.maxDecibels,settings.palette])
 const nyquist=(view?.sampleRate||snapshot?.format.sampleRate||48000)/2,lo=Math.min(settings.minFrequency,nyquist*.9),hi=Math.min(settings.maxFrequency,nyquist)
 const reset=()=>change({...settings,minFrequency:20,maxFrequency:Math.min(20000,nyquist),minDecibels:-100,maxDecibels:0})
 const layer:TimelineLayer={draw:(ctx,g)=>{
   ctx.save();ctx.beginPath();ctx.rect(g.left,g.top,g.right-g.left,g.bottom-g.top);ctx.clip()
   if(image&&packet?.axisStartFrame&&packet.axisEndFrame){ctx.imageSmoothingEnabled=false;const a=g.x(packet.axisStartFrame),b=g.x(packet.axisEndFrame);ctx.drawImage(image,a,g.top,b-a,g.bottom-g.top)}
   ctx.strokeStyle='#43536366';ctx.lineWidth=1
   for(let n=0;n<=6;n++){const x=g.left+(g.right-g.left)*n/6;ctx.beginPath();ctx.moveTo(x,g.top);ctx.lineTo(x,g.bottom);ctx.stroke()}
   ctx.restore();ctx.font='10px "JetBrains Mono",monospace';ctx.fillStyle='#bdcbd7';ctx.textAlign='right'
   for(const f of [20,100,500,2000,10000,20000,40000])if(f>=lo&&f<=hi){const y=g.bottom-Math.log(f/lo)/Math.log(hi/lo)*(g.bottom-g.top);ctx.fillText(f>=1000?f/1000+'k':String(f),g.left-5,y+3)}
   ctx.textAlign='left'
  },hover:(position,ratio)=>{
   if(!packet?.view||Date.now()-hoverTime.current<60)return;hoverTime.current=Date.now();const generation=++hoverGeneration.current,id=active.current
   void query('spectrogram.point',{queryId:id,positionFrame:position,frequency:lo*Math.pow(hi/lo,ratio)}).then(raw=>{
    if(generation!==hoverGeneration.current||id!==active.current)return
    const p=raw as {frequency:number;frame:string;status:string;decibels:number|null},rate=snapshot?.timelineRate||snapshot?.format.sampleRate||48000
    const value=p.status==='ready'?p.decibels!.toFixed(1)+' dBFS':p.status==='silence'?'−∞ dBFS · 静音':p.status==='gap'?'数据缺口':p.status==='error'?'数据错误':'未覆盖'
    setReading((Number(p.frame)/rate+(snapshot?.fileView?.timeOffsetSeconds||0)).toFixed(3)+' s · '+p.frequency.toFixed(1)+' Hz · '+value)
   }).catch(()=>{})
  },wheel:(ratio,delta)=>{
   const center=lo*Math.pow(hi/lo,ratio),span=Math.max(Math.log(1.1),Math.min(Math.log(nyquist),Math.log(hi/lo)*Math.exp(Math.max(-200,Math.min(200,delta))*.002)))
   let a=center/Math.exp(span*ratio),b=a*Math.exp(span);if(a<1){a=1;b=Math.exp(span)}if(b>nyquist){b=nyquist;a=b/Math.exp(span)}change({...settings,minFrequency:a,maxFrequency:b})
  }}
 const status=error?/UNAVAILABLE|OUTSIDE|NOT_READY/.test(error)?'此处音频暂不可用':'声谱图准备失败':!packet?'准备声谱图…':packet.phase==='partial'?'正在准备 '+Math.round((view?.progress||0)*100)+'%':''
 return <div className="spectrogram-instrument" ref={box} data-spectrogram-phase={error?'error':packet?.phase||'preparing'} data-spectrogram-request={packet?.requestId} onPointerLeave={()=>{hoverGeneration.current++;setReading('')}}>
  <div className="spectrogram-toolbar"><span className={'spectral-colors '+settings.palette}/><span>{settings.minDecibels} → {settings.maxDecibels} dBFS</span><button onClick={reset} title="复位频率和色阶范围">复位</button></div>
  <Timeline {...timeline} kind="spectrogram" layer={layer} feedback={!packet&&status?<div className="spectrogram-empty" role="status">{status}</div>:undefined}/>
  <div className="spectrogram-readout" title="原始频点读数；图中色块显示所覆盖频点与时间窗的最大幅度。滚轮缩放频率，Ctrl + 滚轮缩放时间。">{reading||status||('FFT '+settings.fftSize+' · 悬停查看频点')}<span>斜纹：未覆盖 / 缺口</span></div>
 </div>
}
export function SpectrogramSettingsForm({value,apply}:{value:SpectrogramSettings;apply:(s:SpectrogramSettings)=>void}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('')
 return <div className="instrument-analysis-settings">
  <label>FFT 窗<select aria-label="声谱图 FFT 窗" value={draft.fftSize} onChange={e=>setDraft({...draft,fftSize:Number(e.target.value)})}>{[512,1024,2048,4096,8192,16384].map(n=><option key={n}>{n}</option>)}</select></label>
  <label>声道<select aria-label="声谱图声道" value={draft.channel} onChange={e=>setDraft({...draft,channel:e.target.value as SpectrogramSettings['channel']})}>{['stereo','left','right','mid','side'].map((v,i)=><option key={v} value={v}>{['声道能量','左','右','Mid','Side'][i]}</option>)}</select></label>
  {(['minFrequency','maxFrequency','minDecibels','maxDecibels'] as const).map((k,i)=><label key={k}>{['最低频率 · Hz','最高频率 · Hz','色阶下限 · dBFS','色阶上限 · dBFS'][i]}<input aria-label={k} type="number" value={draft[k]} onChange={e=>setDraft({...draft,[k]:Number(e.target.value)})}/></label>)}
  <label>配色<select value={draft.palette} onChange={e=>setDraft({...draft,palette:e.target.value as SpectrogramSettings['palette']})}><option value="trace">Trace</option><option value="heat">热度</option></select></label>
  <p className="small-note">FFT 窗越长，频率区分越细，瞬态时间范围也越宽。色阶与配色仅改变显示。</p>
  {error&&<p role="status">{error}</p>}<div className="layout-actions"><button onClick={()=>{try{apply(validateSpectrogramSettings(draft));setError('')}catch{setError('请检查频率和色阶范围。')}}}>应用</button><button onClick={()=>{setDraft({...defaultSpectrogramSettings});apply({...defaultSpectrogramSettings})}}>恢复默认</button></div>
 </div>
}
