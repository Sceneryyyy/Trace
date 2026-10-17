import {memo,useEffect,useState} from 'react'
import {METER_NEAR_DB,METER_OVER_DB,OVER_HOLD_MS,meterFraction,meterZone} from './meterZones'
import {Timeline} from './Timeline'
import {SpectrogramPanel} from './SpectrogramPanel'
import {SpectrumPanel,SoundFieldPanel} from './AnalysisInstruments'
import {TimelineMenu,AnalysisFeedback} from './WorkbenchFeedback'
import {FileSourceBar,SelectionStats} from './FileControls'
import {TargetStrip} from './Targets'
import {zoomLabel} from './zoom'
import {timecode,timecodeNs} from './time'
import {useDerivedView,type DerivedView,type RecordWindow,type ViewInputs} from './viewModel'
import {metricReadout,type MetricReadout,type ReadoutAvailability} from './metricReadout'
import type {SpectrogramSettings} from '../spectrogramProtocol'
import type {InstrumentSettings} from '../instrumentTypes'
import type {DisplaySettings} from '../displaySettings'
import type {TargetSettings} from '../targetSettings'
import type {AnalysisJobView,Command,MeterSnapshot,Metric,NativeRecordSnapshot,PlaybackView} from '../shared'

// Instrument containers subscribe to the 30 Hz snapshot stream individually via
// useDerivedView, so App chrome no longer re-renders on every meter frame.

/** Non-colour state label (docs/71 §3.3): measuring and unavailable no longer look identical. */
function StateNote({reading}:{reading:MetricReadout}):React.JSX.Element|null{
 return reading.note?<small className={'metric-state'+(reading.fault?' is-fault':'')}>{reading.fault&&<span aria-hidden="true">⊘ </span>}{reading.note}</small>:null
}
function MetricNumber({metric,availability,large=false}:{metric?:Metric;availability:ReadoutAvailability;large?:boolean}):React.JSX.Element{
 const reading=metricReadout(metric,availability)
 return <span className={'metric-number '+(large?'large ':'')+(reading.ready?'ready':'muted')} title={reading.note||undefined}>{reading.value}<StateNote reading={reading}/></span>
}
function SummaryNumber({metric,availability,unit}:{metric?:Metric;availability:ReadoutAvailability;unit:string}):React.JSX.Element{
 const reading=metricReadout(metric,availability)
 return <strong>{reading.value}{!reading.note&&<> <small>{unit}</small></>}<StateNote reading={reading}/></strong>
}
/** Shows OVER while the sample peak is in the over zone and for OVER_HOLD_MS afterwards. Sample peak only; never labelled TP. */
function useOverHold(over:boolean):boolean{
 const [held,setHeld]=useState(false)
 useEffect(()=>{if(over){setHeld(true);return}const timer=setTimeout(()=>setHeld(false),OVER_HOLD_MS);return()=>clearTimeout(timer)},[over])
 return over||held
}
function OverFlag({over}:{over:boolean}):React.JSX.Element|null{
 return useOverHold(over)?<span className="over-flag" title={'样本峰值进入 '+METER_OVER_DB+' dBFS 以上的过载区'}>OVER</span>:null
}

function LoudnessBar({metric,label,availability}:{metric?:Metric;label:string;availability:ReadoutAvailability}):React.JSX.Element{
 const reading=metricReadout(metric,availability),scale=reading.ready?Math.max(0,Math.min(1,((metric!.value??-60)+60)/60)):0
 return <div className="loudness-column"><div className="loudness-bar-track" role="meter" aria-label={label+' 响度柱表'} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={reading.ready?Math.max(-60,Math.min(0,metric!.value??-60)):undefined} aria-valuetext={reading.note||reading.value+' LUFS'}><i style={{transform:'scaleY('+scale+')'}}/></div><div className="loudness-bar-scale"><span>0</span><span>−20</span><span>−40</span><span>−60</span></div></div>
}
function LevelPanel({snapshot,availability,channelCount,readout='both'}:{snapshot:MeterSnapshot|null;availability:ReadoutAvailability;channelCount?:number;readout?:'both'|'peak'|'rms'}):React.JSX.Element{
 const channels=snapshot?.channels.length||channelCount||2
 const scale=(metric?:Metric):number=>metric?.status==='ready'&&metric.value!==null?Math.max(0,Math.min(1,(metric.value+60)/60)):0
 return <section className="level-panel panel">
  <div className="panel-heading"><h2>电平</h2><span className="small-note">dBFS</span></div>
  <div className="level-plot">
   <div className="db-scale">{[0,-6,-12,-18,-24,-30,-36,-42,-48,-54,-60].map(n=><span key={n}>{n}</span>)}</div>
   <div className="channel-bars">{Array.from({length:channels},(_,c)=>{
    const levels=snapshot?.channels[c],meter=readout==='rms'?levels?.rms:levels?.samplePeak,reading=metricReadout(meter,availability)
    const clip=levels?.samplePeak.status==='ready'&&(levels.samplePeak.value??-Infinity)>=0
    const over=levels?.samplePeak.status==='ready'&&meterZone(levels.samplePeak.value)==='over'
    return <div className="channel" key={c}>
     <div className={'clip-indicator '+(clip?'clipped':'')} title={clip?'样本峰值达到或超过 0 dBFS':'未检测到样本削波'}/>
     <div className="meter-track" data-over={over||undefined} role="meter" aria-label={(channels===1?'单声道':c===0?'左声道':'右声道')+(readout==='rms'?' RMS':'样本峰值')} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={reading.ready?Math.max(-60,Math.min(0,meter!.value!)):undefined} aria-valuetext={reading.note||reading.value+' dBFS'}>
      <div className="peak-fill" style={{clipPath:'inset('+((1-scale(levels?.samplePeak))*100)+'% 0 0)'}}/>
      <div className="rms-fill" style={{transform:'scaleY('+scale(levels?.rms)+')'}}/>
      {[METER_NEAR_DB,METER_OVER_DB].map(db=><i key={db} className="meter-mark" style={{bottom:meterFraction(db)*100+'%'}} aria-hidden="true"/>)}
      <OverFlag over={Boolean(over)}/>
     </div>
     <b>{channels===1?'MONO':c===0?'L':'R'}</b>
    </div>
   })}</div>
  </div>
  <div className="channel-readings">
   {['Peak','RMS','TP'].map((name,i)=><div className="level-reading" key={name}><span>{name}{name==='TP'&&<small className="level-unit"> dBTP</small>}</span>{Array.from({length:channels},(_,c)=>{const m=snapshot?.channels[c]?.[(['samplePeak','rms','truePeak'] as const)[i]],over=i===0&&m?.status==='ready'&&meterZone(m.value)==='over',reading=metricReadout(m,availability)
    return <strong key={c} className={over?'is-over':reading.fault?'is-fault':undefined}>{reading.note||reading.value}</strong>})}</div>)}
  </div>
 </section>
}

interface TimeSpanCallbacks{
 file:PlaybackView|null|undefined
 isRecording:boolean
 changeWindow:(payload:Record<string,unknown>)=>void
 changeDisplay:(key:'gain'|'seconds',value:number)=>void
 setRecordWindow:(window:RecordWindow)=>void
}
interface TimeSpanContext extends TimeSpanCallbacks{
 view:DerivedView
}
function applyTimeSpan(value:number,ctx:TimeSpanContext):void{
 const {file,view,isRecording,changeWindow,changeDisplay,setRecordWindow}=ctx
 if(file){
  const total=BigInt(file.totalFrames),span=BigInt(Math.round(value*file.sampleRate)),length=span>total?total:span
  let start=BigInt(file.positionFrame)-length/2n;if(start<0n)start=0n;if(start+length>total)start=total-length
  changeWindow({playbackId:file.id,startFrame:start.toString(),endFrame:(start+length).toString(),pixelWidth:900})
 }else{changeDisplay('seconds',value);if(isRecording)setRecordWindow({mode:'follow',start:'0',end:view.recEnd.toString()})}
}

interface TimelineInstrumentProps extends TimeSpanCallbacks{
 inputs:ViewInputs
 kind:'waveform'|'history'|'spectrogram'
 settings:SpectrogramSettings
 change:(settings:SpectrogramSettings)=>void
 isVisible:()=>boolean
 traces:('m'|'s'|'i')[]
 job?:AnalysisJobView
 busy:boolean
 gain:number
 selectionMode:boolean
 onSelectionMode:(value:boolean)=>void
 target:DisplaySettings
 targets:TargetSettings
 inspectAt:(source:MeterSnapshot|null,positionFrame:string,selectionEndFrame?:string)=>void
 run:(name:Command,payload?:Record<string,unknown>)=>void
}
export const TimelineInstrument=memo(function TimelineInstrument(props:TimelineInstrumentProps){
 const {inputs,kind,settings,change,isVisible,traces,file,job,busy,isRecording,gain,selectionMode,onSelectionMode,target,targets,inspectAt,changeWindow,changeDisplay,setRecordWindow,run}=props
 const view=useDerivedView(inputs)
 const seconds=inputs.seconds,displaySnapshot=view.displaySnapshot,recBounds=view.recBounds
 const setTimeSpan=(value:number)=>applyTimeSpan(value,{file,view,isRecording,changeWindow,changeDisplay,setRecordWindow})
 const controls=kind==='waveform'?<div className="timeline-controls"><div className="timeline-modes" role="group" aria-label="时间轴定位方式" title="拖动图形定位；拖动刻度轴或 Shift 拖动选择范围"><button aria-pressed={!selectionMode} onClick={()=>onSelectionMode(false)}>定位</button><button aria-pressed={selectionMode} onClick={()=>onSelectionMode(true)}>选区</button></div>{isRecording&&!file&&view.view?.inspectableRange&&BigInt(view.view.inspectableRange.startFrame)-BigInt(recBounds.startFrame)>1000000000n&&<span className="record-overview-note" title="亮色范围可精确回看；暗色部分在结束录音后打开文件查看。">暗色区域为概览</span>}<div className="timeline-zoom-controls" role="group" aria-label="波形显示设置">
   <label className="zoom-control" title="Ctrl + 滚轮">时间窗<input aria-label="波形时间窗" type="range" min="5" max="60" step=".1" value={file?Math.max(5,Math.min(60,Number(BigInt(file.endFrame)-BigInt(file.startFrame))/file.sampleRate)):seconds} onChange={e=>setTimeSpan(Number(e.target.value))}/><output>{zoomLabel(file?Number(BigInt(file.endFrame)-BigInt(file.startFrame))/file.sampleRate:seconds)} s</output></label>
   <label className="zoom-control" title="波形区域滚轮">波形<input aria-label="波形显示倍率" type="range" min="1" max="4" step=".01" value={gain} onChange={e=>changeDisplay('gain',Number(e.target.value))}/><output>×{zoomLabel(gain,2)}</output></label>
  </div></div>:undefined
 const timelineProps={
  kind,traces,selectionMode,controls,snapshot:displaySnapshot,seconds,gain,target,targets,
  onSeek:(position:string,_resume:boolean,source:MeterSnapshot|null)=>inspectAt(source,position),
  onSelection:(startFrame:string,endFrame:string,source:MeterSnapshot|null)=>inspectAt(source,startFrame,endFrame),
  onWindow:(startFrame:string,endFrame:string)=>{if(file)changeWindow({playbackId:file.id,startFrame,endFrame,pixelWidth:900});else if(isRecording)setTimeSpan(Math.max(5,Math.min(60,Number(BigInt(endFrame)-BigInt(startFrame))/1e9)))},
  onGain:(value:number)=>changeDisplay('gain',value),
  onSeconds:setTimeSpan,
  feedback:file?<AnalysisFeedback compact file={file} job={job} busy={busy||isRecording} retry={()=>run('playback.retryAnalysis',{playbackId:file.id})}/>:undefined,
 }
 return <TimelineMenu hasSelection={Boolean(file?.selection)} clear={()=>file&&run('playback.clearSelection',{playbackId:file.id})}>
  {kind==='spectrogram'?<SpectrogramPanel settings={settings} change={change} isVisible={isVisible} {...timelineProps} kind="spectrogram"/>:<Timeline {...timelineProps}/>}
 </TimelineMenu>
})

export const LoudnessInstrument=memo(function LoudnessInstrument({inputs,history,file,isRecording,multiRegion}:{inputs:ViewInputs;history:boolean;file:PlaybackView|null|undefined;isRecording:boolean;multiRegion:boolean}){
 const view=useDerivedView(inputs)
 const numberMetrics=view.numberMetrics,displaySnapshot=view.displaySnapshot,availability=view.numberAvailability
 return <aside className="loudness-values panel">
  <div className="panel-heading"><h2>响度</h2><span className="small-note">LUFS</span></div>
  <div className="loudness-readings">
  <section className="integrated-card" title={history?'监测起点至当前历史位置的累计响度':file?'文件起点至当前游标的累计响度':isRecording?'本次录音的累计响度':'本轮监测的累计响度'}><div className="metric-label">INTEGRATED <span>{file?'截至游标 I':isRecording?(multiRegion?'当前段 I':'本次录音 I'):'本轮 I'}</span></div><LoudnessBar label="I" metric={numberMetrics?.integratedToCursor} availability={availability}/><MetricNumber metric={numberMetrics?.integratedToCursor} availability={availability} large /></section>
  <div className="instant-metrics"><section><div className="metric-label">M <span>400 ms</span></div><LoudnessBar label="M" metric={numberMetrics?.momentary} availability={availability}/><MetricNumber metric={numberMetrics?.momentary} availability={availability} /></section><section><div className="metric-label">S <span>3 s</span></div><LoudnessBar label="S" metric={numberMetrics?.shortTerm} availability={availability}/><MetricNumber metric={numberMetrics?.shortTerm} availability={availability} /></section></div>
  </div><div className="loudness-summary">
  <div className="summary-metric" title={file&&!history?'文件整段响度范围':'截至当前位置的响度范围'}><div><b>LRA {displaySnapshot?.lraProvisional&&numberMetrics?.loudnessRange.status==='ready'&&<small className="provisional-tag" title="时长不足 60 秒，LRA 暂估">暂估</small>}</b></div><SummaryNumber metric={numberMetrics?.loudnessRange} availability={availability} unit="LU"/></div>
  <div className="summary-metric" title={history?'监测起点至当前历史位置的最大真峰值':file?'文件整段最大真峰值':isRecording?'本次录音最大真峰值':'本轮最大真峰值'}><div><b>MAX TP</b></div><SummaryNumber metric={numberMetrics?.maxTruePeak} availability={availability} unit="dBTP"/></div>
  {file&&!history&&<div className="summary-metric"><div><b>整段 I</b></div><SummaryNumber metric={displaySnapshot?.fileView?.wholeFileIntegrated} availability={availability} unit="LUFS"/></div>}
  </div>
 </aside>
})

export const LevelsInstrument=memo(function LevelsInstrument({inputs,readout}:{inputs:ViewInputs;readout:'both'|'peak'|'rms'}){
 const view=useDerivedView(inputs)
 return <LevelPanel snapshot={view.numberMetrics} availability={view.numberAvailability} channelCount={view.displaySnapshot?.format.channelCount||view.format?.channelCount||view.file?.channelCount} readout={readout}/>
})

export const SpectrumInstrument=memo(function SpectrumInstrument({inputs,settings,change}:{inputs:ViewInputs;settings:InstrumentSettings;change:(settings:InstrumentSettings)=>void}){
 const view=useDerivedView(inputs)
 return <SpectrumPanel packet={view.displaySnapshot?.instruments} settings={settings} change={change}/>
})

export const SoundFieldInstrument=memo(function SoundFieldInstrument({inputs,settings,change}:{inputs:ViewInputs;settings:InstrumentSettings;change:(settings:InstrumentSettings)=>void}){
 const view=useDerivedView(inputs)
 return <SoundFieldPanel packet={view.displaySnapshot?.instruments} settings={settings} change={change}/>
})

export const TargetStripContainer=memo(function TargetStripContainer({inputs,settings,wholeSummary,file,isRecording,multiRegion,configure}:{inputs:ViewInputs;settings:TargetSettings;wholeSummary:NativeRecordSnapshot['meters']|null;file:PlaybackView|null|undefined;isRecording:boolean;multiRegion:boolean;configure:()=>void}){
 const view=useDerivedView(inputs)
 const targetSummary=file&&!file.temporary?wholeSummary:view.numberMetrics
 const targetScope=file&&!file.temporary?'整段':file?'截至游标':isRecording?(multiRegion?'当前段':'本次录音'):'本轮'
 const targetDuration=file&&!file.temporary?Number(file.totalFrames)/file.sampleRate:view.displaySnapshot?.lraProvisional?0:Number(view.displaySnapshot?.positionFrame||0)/view.timelineRate
 return <TargetStrip settings={settings} summary={targetSummary} current={view.numberMetrics} scope={targetScope} duration={targetDuration} configure={configure}/>
})

export const WorkbenchSourceBar=memo(function WorkbenchSourceBar({inputs,file,busy,run,inspectAt,changeWindow,changeDisplay,setRecordWindow,isRecording}:TimeSpanCallbacks&{inputs:ViewInputs;busy:boolean;run:(name:Command,payload?:Record<string,unknown>)=>void;inspectAt:(source:MeterSnapshot|null,positionFrame:string,selectionEndFrame?:string)=>void}){
 const view=useDerivedView(inputs)
 const workbenchFile=view.workbenchFile,displaySnapshot=view.displaySnapshot
 const workbenchRun=(name:Command,payload?:Record<string,unknown>)=>{
  if(file){run(name,payload);return}
  if(name==='playback.selection'&&payload)inspectAt(displaySnapshot,payload.startFrame as string,payload.endFrame as string)
  if(name==='playback.window'&&payload){
   if(isRecording&&payload.startFrame==='0'&&payload.endFrame===workbenchFile.totalFrames)setRecordWindow({mode:'all',start:'0',end:'0'})
   else if(payload.endFrame===workbenchFile.totalFrames)applyTimeSpan(Math.max(5,Math.min(60,Number(BigInt(payload.endFrame as string)-BigInt(payload.startFrame as string))/view.timelineRate)),{file,view,isRecording,changeWindow,changeDisplay,setRecordWindow})
   else if(displaySnapshot)inspectAt({...displaySnapshot,timelineWindow:{startFrame:payload.startFrame as string,endFrame:payload.endFrame as string}},payload.endFrame as string)
  }
 }
 return <FileSourceBar file={workbenchFile} busy={busy} run={workbenchRun} live={!file}/>
})

export const TransportElapsed=memo(function TransportElapsed({inputs,isRecording,file}:{inputs:ViewInputs;isRecording:boolean;file:PlaybackView|null|undefined}){
 const view=useDerivedView(inputs)
 return <div className="elapsed"><span>{isRecording?'录音时长':'游标位置'}</span><strong>{isRecording&&view.view?timecodeNs(view.view.durationNs):timecode(String(Math.round((Number(view.displaySnapshot?.positionFrame||'0')/(view.displaySnapshot?.timelineRate||view.displaySnapshot?.format.sampleRate||view.format?.sampleRate||48000)+(file?.timeOffsetSeconds||0))*1000)),1000)}</strong></div>
})

export const ContinuityBar=memo(function ContinuityBar({inputs}:{inputs:ViewInputs}){
 const view=useDerivedView(inputs)
 if(!view.continuity)return null
 return <div className="statusbar"><span className={'status-dot '+(view.sourceError?'error':'warning')}/><span>{view.continuity}</span></div>
})

export const SelectionStatsRow=memo(function SelectionStatsRow({inputs,file,hidden}:{inputs:ViewInputs;file:PlaybackView|null|undefined;hidden:boolean}){
 const view=useDerivedView(inputs)
 if(!file||!hidden||!view.displaySnapshot?.fileView)return null
 return <div className="workspace-selection"><SelectionStats view={view.displaySnapshot.fileView} rate={view.displaySnapshot.format.sampleRate}/></div>
})

/** Workspace wrapper owning the per-frame data attributes; children stay referentially stable between App renders. */
export const WorkspaceFrame=memo(function WorkspaceFrame({inputs,file,children}:{inputs:ViewInputs;file:PlaybackView|null|undefined;children:React.ReactNode}){
 const view=useDerivedView(inputs)
 return <div className="workspace modular-workspace" data-history-position={file?view.displaySnapshot?.positionFrame:undefined} data-history-generation={file?view.displaySnapshot?.playback?.generation:undefined}>{children}</div>
})
