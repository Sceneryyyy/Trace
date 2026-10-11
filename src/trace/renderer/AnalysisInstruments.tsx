import {spectrumPixels} from '../spectrumDisplay'
import {canvasSurface} from './canvasSurface'
import {useEffect,useRef,useState} from 'react'
import {instrumentConfigKey,validateInstrumentSettings,type InstrumentSettings,type InstrumentPacket} from '../instrumentTypes'
import './analysis-instruments.css'
import {useRendererTheme} from './themeRuntime'
const db=(p:number)=>p>0?10*Math.log10(p):-Infinity
const reading=(p:number)=>Number.isFinite(db(p))?db(p).toFixed(1):'−∞'
function available(packet:InstrumentPacket|undefined,s:InstrumentSettings){return packet?.phase==='ready'&&packet.configKey===instrumentConfigKey(s)?packet.data:undefined}
function message(packet:InstrumentPacket|undefined,s:InstrumentSettings,field=false):string{
 if(packet?.phase==='error')return /STALE|RANGE_UNAVAILABLE/.test(packet.error||'')?'此处音频缓存已不可用':'仪器数据暂不可用'
 const d=available(packet,s);if(!d)return '等待分析'
 if(field&&d.channelCount===1)return '单声道来源'
 if(d.status==='gap')return '此处存在数据缺口'
 if(field&&d.field.correlation.status==='silence'&&d.field.balance.status==='silence')return '静音'
 if(!field&&d.channelCount===1&&!['stereo','left'].includes(s.channel))return '此声道模式需要双声道'
 if(!field&&d.status==='silence')return '当前静音'
 if(!field&&d.status==='insufficient')return '等待完整频谱窗口'
 return ''
}
export function SpectrumPanel({packet,settings,change}:{packet?:InstrumentPacket;settings:InstrumentSettings;change:(s:InstrumentSettings)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;settings:InstrumentSettings;axis:'frequency'|'level'}|null>(null),[hover,setHover]=useState('')
 const paintRef=useRef<()=>void>(()=>{}),hoverAt=useRef(0)
 const data=available(packet,settings),nyquist=(data?.sampleRate||48000)/2
 const lo=Math.min(settings.minFrequency,nyquist*.9),hi=Math.max(lo+1,Math.min(settings.maxFrequency,nyquist))
 const theme=useRendererTheme()
 useEffect(()=>{const element=canvas.current;if(!element)return;const prevent=(e:WheelEvent)=>e.preventDefault();element.addEventListener('wheel',prevent,{passive:false});return()=>element.removeEventListener('wheel',prevent)},[])
 // ResizeObserver is registered once; data changes only repaint through paintRef.
 useEffect(()=>{const observer=new ResizeObserver(()=>paintRef.current());if(box.current)observer.observe(box.current);return()=>observer.disconnect()},[])
 useEffect(()=>{
  const el=canvas.current;if(!el)return
  const tk=theme.tokens
  const paint=()=>{const surface=canvasSurface(el);if(!surface)return;const {rect:r,context:c}=surface
   const l=44,t=12,b=Math.max(t+1,r.height-29),right=r.width-12,w=Math.max(1,right-l),h=b-t
   const x=(f:number)=>l+Math.log(f/lo)/Math.log(hi/lo)*w,y=(v:number)=>b-(v-settings.minDecibels)/(settings.maxDecibels-settings.minDecibels)*h
   c.font='11px "JetBrains Mono",monospace';c.lineWidth=1
   for(const f of [20,50,100,200,500,1000,2000,5000,10000,20000,40000])if(f>=lo&&f<=hi){const p=x(f);c.strokeStyle=tk['grid'];c.beginPath();c.moveTo(p,t);c.lineTo(p,b);c.stroke();c.fillStyle=tk['axis-text'];c.textAlign='center';c.fillText(f>=1000?f/1000+'k':String(f),p,r.height-10)}
   const step=h<100?24:12
   for(let n=Math.ceil(settings.minDecibels/step)*step;n<=settings.maxDecibels;n+=step){const p=y(n);c.strokeStyle=tk['grid'];c.beginPath();c.moveTo(l,p);c.lineTo(right,p);c.stroke();c.fillStyle=tk['axis-text'];c.textAlign='right';c.fillText(String(n),l-6,p+4)}
   c.save();c.beginPath();c.rect(l,t,w,h);c.clip()
   if(data)for(const [values,enabled,color,dash] of [[data.peakHold,settings.showPeakHold,tk['curve-hold'],[3,3]],[data.current,settings.showCurrent,tk['curve-current'],[]],[data.average,settings.showAverage,tk['curve-average'],[6,3]]] as const){
    if(!enabled)continue;c.strokeStyle=color;c.lineWidth=1.25;c.setLineDash([...dash]);c.beginPath();let started=false
    for(const point of spectrumPixels(values,data.binHz,lo,hi,w,settings)){const py=y(Math.max(settings.minDecibels,point.decibels));if(started)c.lineTo(x(point.frequency),py);else c.moveTo(x(point.frequency),py);started=true}c.stroke()
   }c.restore()
  };paintRef.current=paint;paint()
 },[data,settings,lo,hi,theme])
 function reset(){change({...settings,minFrequency:20,maxFrequency:Math.min(20000,nyquist),minDecibels:-100,maxDecibels:6})}
 function wheel(e:React.WheelEvent){e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect(),delta=Math.max(-200,Math.min(200,e.deltaY)),factor=Math.exp(delta*.002)
  if(e.ctrlKey||e.clientX-rect.left<44){const span=Math.max(12,Math.min(204,(settings.maxDecibels-settings.minDecibels)*factor)),top=Math.min(24,settings.maxDecibels);change({...settings,maxDecibels:top,minDecibels:Math.max(-180,top-span)})}
  else{const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left-44)/Math.max(1,rect.width-56))),center=lo*Math.pow(hi/lo,ratio),span=Math.max(Math.log(1.1),Math.min(Math.log(nyquist),Math.log(hi/lo)*factor));let start=center/Math.exp(span*ratio),end=start*Math.exp(span);if(start<1){start=1;end=Math.exp(span)}if(end>nyquist){end=nyquist;start=end/Math.exp(span)}change({...settings,minFrequency:start,maxFrequency:end})}
 }
 function move(e:React.PointerEvent<HTMLCanvasElement>){const rect=e.currentTarget.getBoundingClientRect(),d=drag.current
  if(d){const dx=(e.clientX-d.x)/Math.max(1,rect.width-56),dy=(e.clientY-d.y)/Math.max(1,rect.height-41)
   if(d.axis==='frequency'){const width=Math.log(d.settings.maxFrequency/d.settings.minFrequency),factor=Math.exp(-dx*width);let a=d.settings.minFrequency*factor,b=d.settings.maxFrequency*factor;if(a<1){a=1;b=Math.exp(width)}if(b>nyquist){b=nyquist;a=b/Math.exp(width)}change({...settings,minFrequency:a,maxFrequency:b})}
   else{const span=d.settings.maxDecibels-d.settings.minDecibels,top=Math.max(-180+span,Math.min(24,d.settings.maxDecibels+dy*span));change({...settings,minDecibels:top-span,maxDecibels:top})}return
  }
  if(!data||!data.current.length)return;const ratio=Math.max(0,Math.min(1,(e.clientX-rect.left-44)/Math.max(1,rect.width-56))),f=lo*Math.pow(hi/lo,ratio),bin=Math.max(0,Math.min(data.current.length-1,Math.round(f/data.binHz)))
  if(bin<0)return
  const now=Date.now();if(now-hoverAt.current<60)return;hoverAt.current=now
  setHover((bin*data.binHz).toFixed(1)+' Hz · 当前 '+reading(data.current[bin])+' · 平均 '+reading(data.average[bin])+' dBFS · 原始频点')
 }
 return <div className="spectrum-instrument" ref={box} data-instrument-frame={data?.positionFrame}>
  <div className="analysis-legend"><button className="curve-current" aria-pressed={settings.showCurrent} onClick={()=>change({...settings,showCurrent:!settings.showCurrent})}>当前</button><button className="curve-average" aria-pressed={settings.showAverage} onClick={()=>change({...settings,showAverage:!settings.showAverage})}>平均</button><button className="curve-hold" aria-pressed={settings.showPeakHold} onClick={()=>change({...settings,showPeakHold:!settings.showPeakHold})}>保持</button><button title="复位频率与电平坐标" onClick={reset}>复位</button></div>
  <canvas ref={canvas} aria-label="频谱曲线：频率与幅度" title="滚轮缩放频率 · Ctrl＋滚轮缩放电平 · 拖动坐标轴平移 · 双击复位" onWheel={wheel} onDoubleClick={reset} onPointerMove={move} onPointerLeave={()=>{if(!drag.current)setHover('')}} onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();if(e.button!==0||e.clientX-r.left>44&&e.clientY-r.top<r.height-28)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,settings:{...settings,minFrequency:lo,maxFrequency:hi},axis:e.clientX-r.left<44?'level':'frequency'}}} onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null}}/>
  {message(packet,settings)&&<div className="instrument-empty" role="status">{message(packet,settings)}</div>}
  <div className="analysis-readout">{hover||('FFT '+settings.fftSize+' · Δf '+((data?.sampleRate||48000)/settings.fftSize).toFixed(2)+' Hz · 窗 '+(settings.fftSize/(data?.sampleRate||48000)*1000).toFixed(1)+' ms · '+(settings.smoothing?'1/'+settings.smoothing+' 倍频程':'原始')+' · 倾斜 '+settings.tilt+' dB/oct · 平均 '+settings.averageMs+' ms · 保持 '+settings.holdMs+' ms')}{data&&(data.partialAverage||data.partialHold)&&<span title="开始处可用音频不足完整平均或保持窗口，当前使用已到达的完整 FFT 窗。"> · 暂估</span>}</div>
 </div>
}
export function SoundFieldPanel({packet,settings,change}:{packet?:InstrumentPacket;settings:InstrumentSettings;change:(s:InstrumentSettings)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null),data=available(packet,settings),error=message(packet,settings,true)
 const paintRef=useRef<()=>void>(()=>{}),theme=useRendererTheme()
 useEffect(()=>{const observer=new ResizeObserver(()=>paintRef.current());if(box.current)observer.observe(box.current);return()=>observer.disconnect()},[])
 useEffect(()=>{const el=canvas.current;if(!el)return;const tk=theme.tokens;const paint=()=>{const surface=canvasSurface(el);if(!surface)return;const {rect:r,context:c}=surface
  const polar=settings.fieldMode!=='lissajous',radius=Math.max(10,Math.min(r.width*.42,polar?r.height*.76:r.height*.42)),cx=r.width/2,cy=polar?r.height-18:r.height/2
  c.strokeStyle=tk['field-grid'];c.lineWidth=1;c.beginPath()
  if(polar){c.arc(cx,cy,radius,Math.PI,2*Math.PI);c.moveTo(cx-radius,cy);c.lineTo(cx+radius,cy);for(const a of [-Math.PI/4,0,Math.PI/4]){c.moveTo(cx,cy);c.lineTo(cx+Math.sin(a)*radius,cy-Math.cos(a)*radius)}}
  else{c.moveTo(cx,cy-radius);c.lineTo(cx+radius,cy);c.lineTo(cx,cy+radius);c.lineTo(cx-radius,cy);c.closePath();c.moveTo(cx,cy-radius);c.lineTo(cx,cy+radius);c.moveTo(cx-radius,cy);c.lineTo(cx+radius,cy)}c.stroke()
  c.font='11px "JetBrains Mono",monospace';c.fillStyle=tk['axis-text'];c.fillText('L',cx-radius,Math.min(r.height-3,cy+14));c.fillText('R',cx+radius-9,Math.min(r.height-3,cy+14))
  if(!data||error)return
  if(settings.fieldMode==='polarLevel'){const values=settings.polarDetection==='peak'?data.field.polarPeak:settings.polarDetection==='envelope'?data.field.polarEnvelope:data.field.polarRms
   for(let i=0;i<values.length;i++){const a=(i-90)*Math.PI/180,v=Math.min(1,values[i]*settings.fieldGain);c.strokeStyle=Math.abs(i-90)>45?tk['field-out']:tk['field-in'];c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.sin(a)*v*radius,cy-Math.cos(a)*v*radius);c.stroke()}
  }else for(let i=0;i<data.field.points.length;i+=4){let x=data.field.points[i]*settings.fieldGain,y=data.field.points[i+1]*settings.fieldGain;const age=data.field.points[i+2];if(polar){x*=y<0?-1:1;y=Math.abs(y)}c.globalAlpha=Math.max(.12,1-age/(settings.fieldMs/1000));c.fillStyle=data.field.points[i+3]?tk['danger']:tk['field-point'];c.fillRect(cx+Math.max(-1,Math.min(1,x))*radius,cy-Math.max(-1,Math.min(1,y))*radius,1.5,1.5)}c.globalAlpha=1
 };paintRef.current=paint;paint()},[data,settings,error,theme])
 const correlation=data?.field.correlation,balance=data?.field.balance,value=(v:typeof correlation)=>v?.status==='ready'&&v.value!==null?v.value.toFixed(2):'—'
 return <div className="soundfield-instrument" ref={box} data-instrument-frame={data?.positionFrame}>
  <canvas ref={canvas} aria-label="立体声声场示波图"/>
  {error&&<div className="instrument-empty" role="status">{error}</div>}
  <div className="field-readings"><div><span>相关度</span><strong className={correlation?.status==='ready'&&correlation.value!<0?'attention-mark':undefined} style={{color:correlation?.status==='ready'&&correlation.value!<0?'var(--attention)':undefined}} title="持续负相关可能在合并单声道时相消，短暂低于零不一定是问题">{value(correlation)}</strong><div className="correlation-scale" role="meter" aria-label="左右声道相关度" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={correlation?.status==='ready'?correlation.value??undefined:undefined}>{correlation?.status==='ready'&&<span className="correlation-cursor" style={{transform:'translateX('+((correlation.value!+1)*50)+'%)'}}><i/></span>}</div></div><div><span>功率平衡</span><strong>{value(balance)}</strong><small>−1 左 · 0 居中 · +1 右</small></div></div>
  <div className="field-modes" role="group" aria-label="声场显示模式"><small title="示波显示倍率，不改变相关度和平衡读数">×{settings.fieldGain}</small>{data?.field.partial&&<span title="可用音频尚不足完整声场时间窗">暂估</span>}{(['lissajous','polarSample','polarLevel'] as const).map((v,i)=><button key={v} aria-pressed={settings.fieldMode===v} onClick={()=>change({...settings,fieldMode:v})}>{['示波','极坐标','能量'][i]}</button>)}</div>
 </div>
}
export function AnalysisSettings({value,apply,kind}:{value:InstrumentSettings;apply:(s:InstrumentSettings)=>void;kind:'spectrum'|'soundfield'}){
 const [draft,setDraft]=useState(value),[error,setError]=useState('')
 return <div className="instrument-analysis-settings">
  {kind==='spectrum'?<>
   <label>FFT 窗<select aria-label="FFT 窗大小" value={draft.fftSize} onChange={e=>setDraft({...draft,fftSize:Number(e.target.value)})}>{[512,1024,2048,4096,8192,16384].map(n=><option key={n}>{n}</option>)}</select></label>
   <label>频率平滑<select aria-label="频率平滑" value={draft.smoothing} onChange={e=>setDraft({...draft,smoothing:Number(e.target.value) as InstrumentSettings['smoothing']})}>{[0,3,6,12,24].map(n=><option key={n} value={n}>{n?'1/'+n+' 倍频程':'关闭'}</option>)}</select></label>
   <label>显示倾斜 · dB/oct<input aria-label="频谱倾斜" type="number" min="-6" max="6" step=".5" value={draft.tilt} onChange={e=>setDraft({...draft,tilt:Number(e.target.value)})}/></label>
   <label>声道<select aria-label="频谱声道" value={draft.channel} onChange={e=>setDraft({...draft,channel:e.target.value as InstrumentSettings['channel']})}>{['stereo','left','right','mid','side'].map((v,i)=><option key={v} value={v}>{['声道能量（默认）','左','右','Mid','Side'][i]}</option>)}</select></label>
   <label>平均 · ms<input aria-label="频谱平均时间" type="number" min="0" max="2000" step="50" value={draft.averageMs} onChange={e=>setDraft({...draft,averageMs:Number(e.target.value)})}/></label>
   <label>保持 · ms<input aria-label="频谱保持时间" type="number" min="0" max="2000" step="50" value={draft.holdMs} onChange={e=>setDraft({...draft,holdMs:Number(e.target.value)})}/></label>
   {(['showCurrent','showAverage','showPeakHold'] as const).map((key,i)=><label key={key}>{['当前曲线','平均曲线','峰值保持'][i]}<input type="checkbox" checked={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.checked})}/></label>)}
  </>:<>
   <label>显示倍率<input aria-label="声场显示倍率" type="number" min="1" max="8" step="1" value={draft.fieldGain} onChange={e=>setDraft({...draft,fieldGain:Number(e.target.value)})}/></label>
   <label>时间窗 · ms<input aria-label="声场时间窗" type="number" min="50" max="1000" step="50" value={draft.fieldMs} onChange={e=>setDraft({...draft,fieldMs:Number(e.target.value)})}/></label>
   <label>能量检测<select aria-label="极坐标能量检测" value={draft.polarDetection} onChange={e=>setDraft({...draft,polarDetection:e.target.value as InstrumentSettings['polarDetection']})}><option value="rms">RMS</option><option value="peak">Peak</option><option value="envelope">包络</option></select></label>
  </>}
  <button onClick={()=>{try{apply(validateInstrumentSettings(draft));setError('已应用')}catch{setError('请检查数值范围')}}}>应用仪器设置</button><span role="status">{error}</span>
 </div>
}
