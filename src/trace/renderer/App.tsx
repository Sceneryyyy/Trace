import {SpectrogramPanel,SpectrogramSettingsForm} from './SpectrogramPanel'
import {defaultSpectrogramSettings} from '../spectrogramProtocol'
import {SpectrumPanel,SoundFieldPanel,AnalysisSettings} from './AnalysisInstruments'
import {defaultInstrumentSettings,type InstrumentSettings} from '../instrumentTypes'
import {OperationNotice,useOperationNotice} from './OperationNotice'
import {RecordingLibrary,preferredSource} from './RecordingLibrary'
import {AnalysisFeedback,TimelineMenu} from './WorkbenchFeedback'
import {panRange} from './zoom'
import {HistoryPresentation} from './historyPresentation'
import {zoomLabel} from './zoom'
import { useEffect, useRef, useState } from 'react'
import { timecode, timecodeNs } from './time'
import {Timeline,TimelinePreviewProvider} from './Timeline'
import {InstrumentWorkspace,WorkspaceToolbar,useWorkspace} from './InstrumentWorkspace'
import {FileSourceBar,TransportIcon,SelectionStats} from './FileControls'
import {ExportDialog} from './ExportPanel'
import {RecordSettingsForm} from './RecordSettingsForm'
import {recordingLabel} from '../recordSettings'
import {defaultDisplaySettings} from '../displaySettings'
import {defaultTargetSettings} from '../targetSettings'
import {TargetSettingsForm,TargetStrip} from './Targets'
import {ReportPanel} from './ReportPanel'
import {ReferencePanel} from './ReferencePanel'
import {DisplaySettingsForm} from './DisplaySettingsForm'
import {userError} from '../userErrors'
import type {ExportDescription,ExportSource} from '../exportTypes'
import type { Command, Device, Metric, MeterSnapshot, TraceState, PlaybackView, RecordSettings } from '../shared'

const initial: TraceState = { revision: 0, active: false, deviceId: '', windowSeconds: 30, error: null }
const empty: Metric = { value: null, status: 'insufficient', unit: 'LUFS' }
function value(metric?: Metric): string {
  if (!metric || metric.status === 'insufficient') return '—'
  if (metric.status === 'silence') return '−∞'
  if (metric.status !== 'ready' || metric.value === null) return '—'
  return metric.value.toFixed(1).replace('-', '−')
}
function Icon({ name }: { name: 'stop' | 'play' | 'reset' }): React.JSX.Element {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    {name === 'stop' ? <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /> :
      name === 'play' ? <path d="M7 4L20 12L7 20Z" fill="currentColor" /> :
        <><path d="M5 9A8 8 0 1 1 4 14M5 9V3M5 9H11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>}
  </svg>
}
function MetricNumber({ metric, large = false }: { metric?: Metric; large?: boolean }): React.JSX.Element {
  const current = metric ?? empty
  return <span className={'metric-number ' + (large ? 'large ' : '') + (current.status === 'ready' ? 'ready' : 'muted')} title={current.status === 'insufficient' ? '测量中，尚未形成完整时间窗' : current.status === 'error' ? '音频数据不可用' : undefined}>{value(current)}</span>
}

function LoudnessBar({metric,label}:{metric?:Metric;label:string}):React.JSX.Element{
 return <div className="loudness-column"><div className="loudness-bar-track" role="meter" aria-label={label+' 响度柱表'} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={metric?.status==='ready'?Math.max(-60,Math.min(0,metric.value??-60)):undefined} aria-valuetext={value(metric)+' LUFS'}><i style={{height:(metric?.status==='ready'?Math.max(0,Math.min(100,((metric.value??-60)+60)/60*100)):0)+'%'}}/></div><div className="loudness-bar-scale"><span>0</span><span>−20</span><span>−40</span><span>−60</span></div></div>
}
function LevelPanel({ snapshot,readout='both' }: { snapshot: MeterSnapshot | null;readout?:'both'|'peak'|'rms' }): React.JSX.Element {
  const channels = snapshot?.channels.length || 2
  const scale = (metric?: Metric): number => metric?.status === 'ready' && metric.value !== null ? Math.max(0, Math.min(1, (metric.value + 60) / 60)) : 0
  return <section className="level-panel panel">
    <div className="panel-heading"><h2>电平</h2><span className="small-note">dBFS</span></div>
    <div className="level-plot">
      <div className="db-scale">{[0, -6, -12, -18, -24, -30, -36, -42, -48, -54, -60].map(n => <span key={n}>{n}</span>)}</div>
      <div className="channel-bars">{Array.from({ length: channels }, (_, c) => {
        const levels = snapshot?.channels[c],meter=readout==='rms'?levels?.rms:levels?.samplePeak
        const clip = levels?.samplePeak.status === 'ready' && (levels.samplePeak.value ?? -Infinity) >= 0
        return <div className="channel" key={c}>
          <div className={'clip-indicator ' + (clip ? 'clipped' : '')} title={clip ? '样本峰值达到或超过 0 dBFS' : '未检测到样本削波'} />
          <div className="meter-track" role="meter" aria-label={(channels === 1 ? '单声道' : c === 0 ? '左声道' : '右声道') + (readout==='rms'?' RMS':'样本峰值')} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={meter?.status === 'ready' ? Math.max(-60, Math.min(0, meter.value!)) : undefined} aria-valuetext={value(meter)+' dBFS'}>
            <div className="peak-fill" style={{ clipPath: 'inset(' + ((1-scale(levels?.samplePeak))*100) + '% 0 0)' }} />
            <div className="rms-fill" style={{ transform: 'scaleY(' + scale(levels?.rms) + ')' }} />
          </div>
          <b>{channels === 1 ? 'MONO' : c === 0 ? 'L' : 'R'}</b>
        </div>
      })}</div>
    </div>
    <div className="channel-readings">
      {['Peak', 'RMS', 'TP'].map((name, i) => <div className="level-reading" key={name}><span>{name}{name==='TP'&&<small className="level-unit"> dBTP</small>}</span>{Array.from({ length: channels }, (_, c) => <strong key={c}>{value(snapshot?.channels[c]?.[(['samplePeak', 'rms', 'truePeak'] as const)[i]])}</strong>)}</div>)}
    </div>
  </section>
}
export default function App(): React.JSX.Element {
  const [state, setState] = useState<TraceState>(initial)
  const current = useRef(initial)
  const {notice,trackExport,trackSavedRecord,dismiss:dismissNotice}=useOperationNotice(state)
  const [libraryAttention,setLibraryAttention]=useState(false),[copied,setCopied]=useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [snapshot, setSnapshot] = useState<MeterSnapshot | null>(null)
  const [presentation]=useState(()=>new HistoryPresentation())
  const [busy, setBusy] = useState(false),busyRef=useRef(false)
  const [message, setMessage] = useState('')
  const [displayDraft,setDisplayDraft]=useState<{gain?:number;seconds?:number}>({})
  const [windowDraft,setWindowDraft]=useState<{id:string;startFrame:string;endFrame:string}|null>(null)
  const gain=displayDraft.gain??state.displaySettings?.waveGain??4,seconds=displayDraft.seconds??state.windowSeconds
  const [selectionMode,setSelectionMode]=useState(false)
  const refreshingLibrary=useRef(false)
  const [modal,setModal]=useState<'settings'|'files'|'export'|'display'|'targets'|'reports'|null>(null)
  useEffect(()=>{if(modal==='settings')void command('record.capacity').catch(()=>{})},[modal,state.recordDirectory,state.deviceId])
  const [exportSource,setExportSource]=useState<ExportSource|null>(null)
  const [exportDescription,setExportDescription]=useState<ExportDescription|null>(null),[exportInfoError,setExportInfoError]=useState('')
  useEffect(()=>{
    if(modal!=='export'||!exportSource)return
    let active=true;setExportDescription(null);setExportInfoError('')
    const {range,...source}=exportSource;void range
    command('export.describe',source).then(result=>{if(active)setExportDescription(result as ExportDescription)}).catch(error=>{if(active)setExportInfoError(userError(error))})
    return()=>{active=false}
  },[modal,exportSource])
  const openExport=(source:ExportSource)=>{setExportSource({takeId:source.takeId,role:source.role,...(source.regionId?{regionId:source.regionId}:{}),...(source.exportId?{exportId:source.exportId}:{}),...(source.range?{range:source.range}:{})});setModal('export')}
  const [draft,setDraft]=useState<RecordSettings>({encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'})
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  function accept(next: TraceState): void { if (next.revision > current.current.revision || (next.revision === current.current.revision && (next.eventSequence||0)>=(current.current.eventSequence||0))) { const wasHidden=current.current.windowVisible===false;current.current = next; presentation.reconcile(next);if(next.windowVisible!==false){setState(next);if(wasHidden&&presentation.snapshot)setSnapshot({...presentation.snapshot})} } }
  function command(name: Command, payload: Record<string, unknown> = {}): Promise<unknown> {
    const independent=['imports.refresh','imports.cancel','report.get','report.cancel','preferences.retry','library.storage','export.describe','app.diagnostics'].includes(name)
    const execute=async()=>{
      const foreground=!independent&&!['playback.seek','view.inspect','library.refresh','workspace.configure','instrument.configure','spectrogram.configure'].includes(name)
      if(foreground){busyRef.current=true;setBusy(true)}
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const reply = await window.trace.request({ protocolVersion: 1, requestId: crypto.randomUUID(), expectedStateRevision: current.current.revision, command: name, payload })
          accept(reply.state)
          if (!reply.ok) {
            if (reply.error?.code === 'STALE_REQUEST' && attempt === 0) continue
            throw Error(reply.error?.message || '操作未完成')
          }
          if(!independent&&name!=='library.refresh')setMessage('')
          return reply.data
        }
      } catch (error) { if(!independent)setMessage(String(error)); throw error }
      finally { if(foreground){busyRef.current=false;setBusy(false)} }
    }
    const task=independent?execute():queue.current.catch(()=>undefined).then(execute)
    if(!independent)queue.current = task
    return task
  }
  const workspace=useWorkspace(state.workspace,next=>command('workspace.configure',{workspace:next}))
  useEffect(() => {
    const unstate = window.trace.onState(accept)
    const unsnapshot = window.trace.onSnapshot(next => {if(presentation.accept(next,current.current)&&current.current.windowVisible!==false)setSnapshot(next)})
    command('state.get').then(() => command('devices.list')).then(result => setDevices(result as Device[])).catch(() => {})
    const visible=()=>{if(!document.hidden&&current.current.windowVisible!==false){setState(current.current);if(presentation.snapshot)setSnapshot({...presentation.snapshot})}}
    document.addEventListener('visibilitychange',visible)
    return () => {document.removeEventListener('visibilitychange',visible); unstate(); unsnapshot(); latest.current.clear(); presentation.cancel() }
  }, [])
  useEffect(()=>{if(modal){const id=setTimeout(()=>document.querySelector<HTMLElement>('.trace-modal button')?.focus(),0);return()=>clearTimeout(id)}},[modal])
  const run = (name: Command, payload?: Record<string, unknown>): void => {
    if(name==='playback.window'&&payload){changeWindow(payload);return}
    if(['reference.activate','file.open','file.close','view.live','playback.seek','playback.follow'].includes(name)){latest.current.delete('window');setWindowDraft(null)}
    if(['reference.activate','file.open','file.close','view.live','record.start','playback.retryAnalysis','playback.clearSelection'].includes(name)){latest.current.delete('inspect');latest.current.delete('seek');presentation.cancel()}
     if(name==='view.live')setRecordWindow({mode:'follow',start:'0',end:'0'})
     command(name, payload).then(()=>{if(name==='file.open')setModal(null)}).catch(() => {})
  }
  useEffect(()=>{
    if(modal!=='files')return
    const refresh=()=>{void command('imports.refresh').catch(()=>{});if(!current.current.currentRecord&&!refreshingLibrary.current){refreshingLibrary.current=true;void command('library.refresh').catch(()=>{}).finally(()=>{refreshingLibrary.current=false})}}
    refresh();const timer=setInterval(refresh,5000);window.addEventListener('focus',refresh)
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[modal])
  const latest=useRef(new Map<string,{name:Command;payload:Record<string,unknown>}>())
  const draining=useRef(new Set<string>())
  function queueLatest(key:string,name:Command,payload:Record<string,unknown>):void{
    latest.current.set(key,{name,payload})
    if(draining.current.has(key))return
    draining.current.add(key)
    void (async()=>{try{while(latest.current.has(key)){
      const cursorRequest=key==='seek'||key==='inspect'
      if(cursorRequest){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(!latest.current.has(key))break}
      const value=latest.current.get(key)!;latest.current.delete(key)
      let succeeded=true;await command(value.name,value.payload).catch(()=>{succeeded=false})
      // Wait outside the command queue: controls can still stop, record or change sources.
      if(cursorRequest&&succeeded)await presentation.waitFor(current.current.playback)
     }}finally{
      draining.current.delete(key)
      if(key==='gain'||key==='seconds')setDisplayDraft(previous=>{const next={...previous};delete next[key];return next})
      if(key==='window')setWindowDraft(null)
    }})()
  }
  function changeDisplay(key:'gain'|'seconds',value:number):void{
    setDisplayDraft(previous=>({...previous,[key]:value}))
    queueLatest(key,key==='gain'?'view.gain':'view.window',key==='gain'?{gain:value}:{seconds:value})
  }
  function changeWindow(payload:Record<string,unknown>):void{
    setWindowDraft({id:payload.playbackId as string,startFrame:payload.startFrame as string,endFrame:payload.endFrame as string})
    queueLatest('window','playback.window',payload)
  }
  async function saveCache():Promise<void>{
    latest.current.delete('inspect');latest.current.delete('seek');presentation.cancel()
    try{
      if(!current.current.playback)await command('live.replay')
      const file=current.current.playback;if(!file?.temporary)return
      const result=await command('cache.save',{playbackId:file.id,useSelection:Boolean(file.selection)}) as {takeId?:string}|null
      if(result?.takeId)trackSavedRecord(result.takeId)
    }catch{}
  }
  function togglePlayback():void{
    const s=current.current,f=s.playback
    if(s.currentRecord)return
    if(!f&&Number(presentation.snapshot?.diagnostics.replayFrames||0)<=0)return
    if(f)run(f.outputReady?'playback.pause':'playback.play',{playbackId:f.id})
    else void command('live.replay').then(()=>command('playback.play',{playbackId:current.current.playback!.id})).catch(()=>{})
  }
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement
      if(document.querySelector('[role="dialog"]'))return
      if(event.code!=='Escape'&&(target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName)))return
      const file=current.current.playback
      if(busyRef.current&&event.code!=='Escape')return
      if(event.ctrlKey&&!event.altKey&&!event.metaKey&&event.code==='KeyD'){
        event.preventDefault();if(file?.selection)run('playback.clearSelection',{playbackId:file.id});return
      }
      if(event.ctrlKey||event.altKey||event.metaKey||event.repeat)return
      if(event.code==='Space'&&!current.current.currentRecord){event.preventDefault();togglePlayback();return}
      if(file&&(event.code==='PageUp'||event.code==='PageDown')){
        event.preventDefault();const next=panRange(BigInt(file.startFrame),BigInt(file.endFrame),BigInt(file.totalFrames),event.code==='PageUp'?-1:1)
        changeWindow({playbackId:file.id,startFrame:next.start,endFrame:next.end,pixelWidth:900});return
      }
      if(event.code==='KeyR'&&!current.current.currentRecord&&Boolean(current.current.deviceId)){event.preventDefault();run('record.start')}
      else if(event.code==='Escape'&&current.current.currentRecord){event.preventDefault();run('record.stop')}
      if(file&&!current.current.currentRecord){
        if(event.code==='Space'){event.preventDefault();run(file.phase==='playing'||file.phase==='buffering'?'playback.pause':'playback.play',{playbackId:file.id})}
        else if(event.code==='Home'||event.code==='End'){event.preventDefault();run('playback.seek',{playbackId:file.id,positionFrame:event.code==='End'?file.totalFrames:'0',resume:false})}
        else if(event.code==='Escape'){event.preventDefault();run('playback.pause',{playbackId:file.id})}
      }
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[])

  const file=state.playback&&windowDraft?.id===state.playback.id?{...state.playback,startFrame:windowDraft.startFrame,endFrame:windowDraft.endFrame,follow:false}:state.playback
  const [recordWindow,setRecordWindow]=useState<{mode:'all'|'follow'|'manual';start:string;end:string}>({mode:'all',start:'0',end:'0'})
  useEffect(()=>setRecordWindow({mode:'all',start:'0',end:'0'}),[state.currentRecord?.id])
  const selected = devices.find(d => d.id === state.deviceId)
  const liveSnapshot=snapshot?.sourceKind!=='file'&&snapshot?.sourceId===state.deviceId?snapshot:null
  const format = state.active&&liveSnapshot?.format.sampleRate?liveSnapshot.format:selected?.format||liveSnapshot?.format
  const record=snapshot?.recording
  const recordBusy=Boolean(state.currentRecord&&record?.id&&record.sourceFormat.sampleRate>0)
  const isRecording=Boolean(state.currentRecord)||recordBusy
  const finalizing=record?.phase==='finalizing'||state.currentRecord?.phase==='finalizing'
  const reconnecting=state.currentRecord?.phase==='reconnecting',multiRegion=(state.currentRecord?.regionCount||0)>1
  const view=snapshot?.recordingView
  const rawDisplaySnapshot:MeterSnapshot|null=file?(snapshot?.sourceKind==='file'&&snapshot.sourceId===file.id?{...snapshot,positionFrame:snapshot.positionFrame,fileView:snapshot.fileView?{...snapshot.fileView,startFrame:file.startFrame,endFrame:file.endFrame,selection:file.selection,selectionAnalysis:file.selectionAnalysis,playingIntent:file.phase==='playing'||file.phase==='buffering'}:undefined}:null):snapshot?.sourceKind==='file'||snapshot?.sourceId!==state.deviceId?null:isRecording&&view&&snapshot?{...snapshot,...(recordBusy&&record?record.meters:{}),sourceKind:'take',sourceId:state.currentRecord?.id||record?.id||'',positionFrame:view.durationNs,timelineRate:1000000000,format:{...snapshot.format,channelCount:view.channelCount},waveform:view.waveform,loudnessHistory:view.loudnessHistory,lraProvisional:!record||BigInt(record.writtenFrames)<BigInt(record.sourceFormat.sampleRate)*60n,continuity:multiRegion?'gaps':snapshot.continuity}:snapshot
  const recEnd=BigInt(view?.durationNs||'0'),recSpan=BigInt(Math.round(seconds*1000000000))
  const recBounds=recordWindow.mode==='all'?{startFrame:'0',endFrame:recEnd.toString()}:recordWindow.mode==='follow'?{startFrame:(recEnd>recSpan?recEnd-recSpan:0n).toString(),endFrame:recEnd.toString()}:{startFrame:recordWindow.start,endFrame:recordWindow.end}
  const liveEnd=BigInt(rawDisplaySnapshot?.positionFrame||'0'),liveSpan=BigInt(Math.round(seconds*(rawDisplaySnapshot?.format.sampleRate||48000)))
   const displaySnapshot=rawDisplaySnapshot?.sourceKind==='take'?{...rawDisplaySnapshot,timelineAvailableRange:view?.inspectableRange,timelineWindow:recBounds,positionFrame:rawDisplaySnapshot.positionFrame}:rawDisplaySnapshot?.sourceKind==='live'?{...rawDisplaySnapshot,timelineAvailableRange:typeof rawDisplaySnapshot.diagnostics.replayStartFrame==='string'&&typeof rawDisplaySnapshot.diagnostics.replayEndFrame==='string'?{startFrame:rawDisplaySnapshot.diagnostics.replayStartFrame,endFrame:rawDisplaySnapshot.diagnostics.replayEndFrame}:undefined,timelineWindow:{startFrame:(liveEnd>liveSpan?liveEnd-liveSpan:0n).toString(),endFrame:liveEnd.toString()}}:rawDisplaySnapshot
  const sourceError = state.error || displaySnapshot?.error
  const snapshotFailure=state.error?.startsWith('RECORD_SNAPSHOT_FAILED:')
  const continuity = sourceError?'':displaySnapshot?.continuity==='gaps'?'音频有中断':''
  const history=Boolean(file?.temporary),replaySeconds=Number(liveSnapshot?.diagnostics.replayFrames||0)/(format?.sampleRate||48000)
  const numberMetrics = file?.error?.startsWith('FILE_SNAPSHOT_FAILED:')||(file?file.analysisPhase!=='ready'||displaySnapshot?.error:sourceError||reconnecting) ? null : displaySnapshot
  const timelineRate=displaySnapshot?.timelineRate||displaySnapshot?.format.sampleRate||48000
   const workbenchFile:PlaybackView=file?{...file,positionFrame:displaySnapshot?.positionFrame||file.positionFrame}:{
     id:'live',takeId:'',role:'source',label:isRecording?'本次录音':'系统声音',phase:'paused',error:null,
     positionFrame:displaySnapshot?.positionFrame||'0',totalFrames:displaySnapshot?.positionFrame||'0',sampleRate:timelineRate,channelCount:format?.channelCount||2,
     generation:'0',analysisId:'',analysisPhase:'ready',gain:1,loop:false,follow:true,selection:null,startFrame:displaySnapshot?.timelineWindow?.startFrame||'0',endFrame:displaySnapshot?.timelineWindow?.endFrame||'0'}
   function inspectAt(source:MeterSnapshot|null,positionFrame:string,selectionEndFrame?:string):void{
     if(!source)return
     if(source.sourceKind==='file'){
       if(selectionEndFrame)run('playback.selection',{playbackId:source.sourceId,startFrame:positionFrame,endFrame:selectionEndFrame,loop:current.current.playback?.loop||false})
       else{latest.current.delete('window');setWindowDraft(null);queueLatest('seek','playback.seek',{playbackId:source.sourceId,positionFrame,resume:false})}
     }else{
       const axis=source.timelineWindow;if(!axis)return
       queueLatest('inspect','view.inspect',{sourceKind:source.sourceKind,sourceId:source.sourceId,epochId:source.epochId,measurementEpoch:source.measurementEpoch,positionFrame,...axis,...(selectionEndFrame?{selectionEndFrame}:{})})
     }
   }
   function setTimeSpan(value:number):void{
     if(file){
       const total=BigInt(file.totalFrames),span=BigInt(Math.round(value*file.sampleRate)),length=span>total?total:span
       let start=BigInt(file.positionFrame)-length/2n;if(start<0n)start=0n;if(start+length>total)start=total-length
       changeWindow({playbackId:file.id,startFrame:start.toString(),endFrame:(start+length).toString(),pixelWidth:900})
     }else{changeDisplay('seconds',value);if(isRecording)setRecordWindow({mode:'follow',start:'0',end:recEnd.toString()})}
   }
   const workbenchRun=(name:Command,payload?:Record<string,unknown>)=>{
     if(file){run(name,payload);return}
     if(name==='playback.selection'&&payload)inspectAt(displaySnapshot,payload.startFrame as string,payload.endFrame as string)
     if(name==='playback.window'&&payload){
       if(isRecording&&payload.startFrame==='0'&&payload.endFrame===workbenchFile.totalFrames)setRecordWindow({mode:'all',start:'0',end:'0'})
       else if(payload.endFrame===workbenchFile.totalFrames)setTimeSpan(Math.max(5,Math.min(60,Number(BigInt(payload.endFrame as string)-BigInt(payload.startFrame as string))/timelineRate)))
       else if(displaySnapshot)inspectAt({...displaySnapshot,timelineWindow:{startFrame:payload.startFrame as string,endFrame:payload.endFrame as string}},payload.endFrame as string)
     }
   }
   const targets=state.targetSettings||defaultTargetSettings
   const wholeSummary=file&&!file.temporary&&file.analysisPhase==='ready'?state.analysisJobs?.find(j=>j.id===file.analysisId&&j.phase==='ready')?.summary:null
   const targetSummary=file&&!file.temporary?wholeSummary:numberMetrics
   const targetScope=file&&!file.temporary?'整段':file?'截至游标':isRecording?(multiRegion?'当前段':'本次录音'):'本轮'
   const targetDuration=file&&!file.temporary?Number(file.totalFrames)/file.sampleRate:displaySnapshot?.lraProvisional?0:Number(displaySnapshot?.positionFrame||0)/timelineRate
   const spectrogramSettings=state.spectrogramSettings||defaultSpectrogramSettings
   const configureSpectrogram=(settings:import('../spectrogramProtocol').SpectrogramSettings)=>queueLatest('spectrogramSettings','spectrogram.configure',{settings})
   const instrumentSettings=state.instrumentSettings||defaultInstrumentSettings
   const configureInstruments=(settings:InstrumentSettings)=>queueLatest('instrumentSettings','instrument.configure',{settings})
   const timelineInstrument=(kind:'waveform'|'history'|'spectrogram')=>{const Component=kind==='spectrogram'?SpectrogramPanel:Timeline;return <TimelineMenu hasSelection={Boolean(file?.selection)} clear={()=>file&&run('playback.clearSelection',{playbackId:file.id})}>
       <Component settings={spectrogramSettings} change={configureSpectrogram} isVisible={()=>current.current.windowVisible!==false} kind={kind} traces={workspace.value.layout.options.historyTraces} feedback={file?<AnalysisFeedback file={file} job={state.analysisJobs?.find(j=>j.id===file.analysisId)} busy={busy||isRecording} retry={()=>run('playback.retryAnalysis',{playbackId:file.id})}/>:undefined} onGain={value=>changeDisplay('gain',value)} onSeconds={setTimeSpan} selectionMode={selectionMode}
        controls={kind==='waveform'?<div className="timeline-controls"><div className="timeline-modes" role="group" aria-label="时间轴定位方式" title="拖动图形定位；拖动刻度轴或 Shift 拖动选择范围"><button aria-pressed={!selectionMode} onClick={()=>setSelectionMode(false)}>定位</button><button aria-pressed={selectionMode} onClick={()=>setSelectionMode(true)}>选区</button></div>{isRecording&&!file&&view?.inspectableRange&&BigInt(view.inspectableRange.startFrame)-BigInt(recBounds.startFrame)>1000000000n&&<span className="record-overview-note" title="亮色范围可精确回看；暗色部分在结束录音后打开文件查看。">暗色区域为概览</span>}<div className="timeline-zoom-controls" role="group" aria-label="波形显示设置">
      <label className="zoom-control" title="Ctrl + 滚轮">时间窗<input aria-label="波形时间窗" type="range" min="5" max="60" step=".1" value={file?Math.max(5,Math.min(60,Number(BigInt(file.endFrame)-BigInt(file.startFrame))/file.sampleRate)):seconds} onChange={e=>setTimeSpan(Number(e.target.value))}/><output>{zoomLabel(file?Number(BigInt(file.endFrame)-BigInt(file.startFrame))/file.sampleRate:seconds)} s</output></label>
      <label className="zoom-control" title="波形区域滚轮">波形<input aria-label="波形显示倍率" type="range" min="1" max="4" step=".01" value={gain} onChange={e=>changeDisplay('gain',Number(e.target.value))}/><output>×{zoomLabel(gain,2)}</output></label>
        </div></div>:undefined}
        snapshot={displaySnapshot} seconds={seconds} gain={gain} target={state.displaySettings||defaultDisplaySettings} targets={targets}
        onSeek={(position,_resume,source)=>inspectAt(source,position)}
        onSelection={(startFrame,endFrame,source)=>inspectAt(source,startFrame,endFrame)}
        onWindow={(startFrame,endFrame)=>{if(file)changeWindow({playbackId:file.id,startFrame,endFrame,pixelWidth:900});else if(isRecording)setTimeSpan(Math.max(5,Math.min(60,Number(BigInt(endFrame)-BigInt(startFrame))/1e9)))}}/>
      </TimelineMenu>}
   const loudnessInstrument=<aside className="loudness-values panel">
        <div className="panel-heading"><h2>响度</h2><span className="small-note">LUFS</span></div>
        <div className="loudness-readings">
        <section className="integrated-card" title={history?'监测起点至当前历史位置的累计响度':file?'文件起点至当前游标的累计响度':isRecording?'本次录音的累计响度':'本轮监测的累计响度'}><div className="metric-label">INTEGRATED <span>{file?'截至游标 I':isRecording?(multiRegion?'当前段 I':'本次录音 I'):'本轮 I'}</span></div><LoudnessBar label="I" metric={numberMetrics?.integratedToCursor}/><MetricNumber metric={numberMetrics?.integratedToCursor} large /></section>
        <div className="instant-metrics"><section><div className="metric-label">M <span>400 ms</span></div><LoudnessBar label="M" metric={numberMetrics?.momentary}/><MetricNumber metric={numberMetrics?.momentary} /></section><section><div className="metric-label">S <span>3 s</span></div><LoudnessBar label="S" metric={numberMetrics?.shortTerm}/><MetricNumber metric={numberMetrics?.shortTerm} /></section></div>
        </div><div className="loudness-summary">
        <div className="summary-metric" title={file&&!history?'文件整段响度范围':'截至当前位置的响度范围'}><div><b>LRA {displaySnapshot?.lraProvisional&&numberMetrics?.loudnessRange.status==='ready'&&<small className="provisional-tag" title="时长不足 60 秒，LRA 暂估">暂估</small>}</b></div><strong>{value(numberMetrics?.loudnessRange)} <small>LU</small></strong></div>
        <div className="summary-metric" title={history?'监测起点至当前历史位置的最大真峰值':file?'文件整段最大真峰值':isRecording?'本次录音最大真峰值':'本轮最大真峰值'}><div><b>MAX TP</b></div><strong>{value(numberMetrics?.maxTruePeak)} <small>dBTP</small></strong></div>
        {file&&!history&&<div className="summary-metric"><div><b>整段 I</b></div><strong>{value(displaySnapshot?.fileView?.wholeFileIntegrated)} <small>LUFS</small></strong></div>}
        </div>
      </aside>
   return <main className="trace-app" onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}}} onDrop={e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();const files=Array.from(e.dataTransfer.files);void window.trace.importFiles(files).then(result=>{setMessage(result.errors.map(e=>e.name+'：'+userError(e.message)).join('；'));setModal('files')}).catch(error=>setMessage(userError(error)))}}>
    <header className="topbar">
      <div className="brand"><svg viewBox="0 0 32 32" width="31" height="31" fill="none" aria-hidden="true"><path d="M2 16H7L11 5L16 27L21 10L24 16H30" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /></svg><span>TRACE</span><small>Audio Recorder &amp; Analyzer</small></div>
      <div className="top-status"><span className={'live-badge '+(isRecording?'is-rec':state.active?'is-live':'')}><i />{isRecording?'REC':state.active?'采集中':'待机'}</span><span className="preview-badge">开发预览</span><button className="header-settings" aria-label="测量目标" aria-pressed={targets.enabled} onClick={()=>setModal('targets')}>目标</button><button className="header-settings" aria-label="显示与帮助" onClick={()=>setModal('display')}>显示与帮助</button></div>
    </header>
    {    <section className="sourcebar" aria-label="声音来源与录音设置">
      <label className="source-select">系统播放设备<select aria-label="系统播放设备" title={selected?.label} value={state.deviceId} disabled={busy||isRecording||Boolean(file?.outputReady)} onChange={e => run('devices.select', { deviceId: e.target.value })}>
        {!state.deviceId && <option value="">选择播放设备</option>}
        {devices.map(d => <option key={d.id} value={d.id} disabled={!d.supported}>{d.label}{d.isDefault ? ' · 默认' : ''}{!d.supported ? ' · 不支持' : ''}</option>)}
      </select></label>
      <button className="icon-button" aria-label="刷新设备" title="刷新设备列表" disabled={busy} onClick={() => command('devices.list').then(result => setDevices(result as Device[])).catch(() => {})}><Icon name="reset" /></button>
      <div className="format-summary">{format ? <><b>{format.sampleRate / 1000} <span>kHz</span></b><span>{format.channelCount === 1 ? '单声道' : '双声道'}</span><span>{format.encoding === 'ieee-float' ? 'Float ' : 'PCM '}{format.containerBits}</span></> : <span>等待设备格式</span>}</div>
      <button className="save-settings" disabled={busy||isRecording} onClick={()=>{setDraft(state.recordSettings||draft);setModal('settings')}}>{recordingLabel(state.recordSettings)}</button>
      <div className="sourcebar-spacer" />
    </section>}

    <div className="workbench-heading"><FileSourceBar file={workbenchFile} busy={busy} run={workbenchRun} live={!file}/><WorkspaceToolbar value={workspace.value} change={workspace.change} error={workspace.error} retry={workspace.retry}/></div>
    <TargetStrip settings={targets} summary={targetSummary} current={numberMetrics} scope={targetScope} duration={targetDuration} configure={()=>setModal('targets')}/>
    <div className="workspace modular-workspace" data-history-position={file?displaySnapshot?.positionFrame:undefined} data-history-generation={file?displaySnapshot?.playback?.generation:undefined}>
      <TimelinePreviewProvider><InstrumentWorkspace value={workspace.value} change={workspace.change} settingsContent={{spectrogram:<SpectrogramSettingsForm value={spectrogramSettings} apply={configureSpectrogram}/>,spectrum:<AnalysisSettings kind="spectrum" value={instrumentSettings} apply={configureInstruments}/>,soundfield:<AnalysisSettings kind="soundfield" value={instrumentSettings} apply={configureInstruments}/>}} contents={{comparison:<ReferencePanel value={state.reference} settings={instrumentSettings} recording={isRecording} file={file} request={command} choose={()=>setModal('files')}/>,spectrogram:timelineInstrument('spectrogram'),spectrum:<SpectrumPanel packet={displaySnapshot?.instruments} settings={instrumentSettings} change={configureInstruments}/>,soundfield:<SoundFieldPanel packet={displaySnapshot?.instruments} settings={instrumentSettings} change={configureInstruments}/>,levels:<LevelPanel snapshot={numberMetrics} readout={workspace.value.layout.options.levelReadout}/>,waveform:timelineInstrument('waveform'),history:timelineInstrument('history'),loudness:loudnessInstrument}}/></TimelinePreviewProvider>
    </div>
    {file&&workspace.value.layout.hidden.includes('comparison')&&displaySnapshot?.fileView&&<div className="workspace-selection"><SelectionStats view={displaySnapshot.fileView} rate={displaySnapshot.format.sampleRate}/></div>}
    {state.preferencesError&&<div className="error-banner" role="status"><strong>设置未保存</strong><span>设置文件暂时被占用或无法写入；已保留上次保存的配置。</span><button onClick={()=>void command('preferences.retry').catch(()=>{})}>重试保存</button></div>}
    {(sourceError || file?.error || message) && <div className="error-banner" role="alert"><strong>需要处理</strong><span>{file?.error?(file.error.startsWith('FILE_SNAPSHOT_FAILED:')?userError(file.error):'回听输出不可用；历史数据仍可查看。'):snapshotFailure ? '录音数据更新失败，已停止本次录音并保留已写入的文件。请重新连接后重试。' : sourceError ? '声音来源暂不可用，请重试或选择其他设备。' : userError(message)}</span>{file&&!file.temporary&&(file.error?.startsWith('FILE_SNAPSHOT_FAILED:')||['failed','cancelled'].includes(file.analysisPhase))&&<button disabled={busy||isRecording} onClick={()=>run('playback.retryAnalysis',{playbackId:file.id})}>重新分析</button>}<button disabled={busy} onClick={()=>{setLibraryAttention(true);setModal('files')}}>查看文件</button><button disabled={busy} onClick={()=>command('app.copyDiagnostics').then(()=>setCopied(true)).catch(()=>{})}>{copied?'已复制诊断':'复制诊断'}</button>{file?.error&&!file.error.startsWith('FILE_SNAPSHOT_FAILED:')&&<button disabled={busy||isRecording} onClick={()=>run('playback.play',{playbackId:file.id})}>重试回听</button>}{sourceError && state.deviceId && !isRecording && !file?.outputReady && <button onClick={() => run('live.start', { deviceId: state.deviceId })} disabled={busy}>重新连接</button>}</div>}
    <footer className="transport">
      <div className="transport-buttons" role="group" aria-label="走带控制">
        <button className="transport-icon file-home" aria-label="起点" title="起点（Home）：定位到当前文件或缓存开头" disabled={busy||!file} onClick={()=>file&&run('playback.seek',{playbackId:file.id,positionFrame:'0',resume:false})}><TransportIcon kind="start"/></button>
        <button className="transport-icon file-end" aria-label="终点" title="终点（End）：定位到当前文件或缓存末尾" disabled={busy||!file} onClick={()=>file&&run('playback.seek',{playbackId:file.id,positionFrame:file.totalFrames,resume:false})}><TransportIcon kind="end"/></button>
        <button className="transport-icon play-button" aria-label={file?.outputReady?'暂停':'播放'} aria-pressed={Boolean(file?.outputReady)} title={file?.outputReady?'暂停（Space）':file?'播放（Space）':'播放历史缓存'} disabled={busy||isRecording||(!file&&replaySeconds<=0)} onClick={togglePlayback}><TransportIcon kind={file?.outputReady?'pause':'play'}/></button>
        <button className={'transport-icon record-button '+(isRecording?'is-recording':'')} aria-label={finalizing?'正在完成录音':isRecording?'结束录音':'录音'} aria-pressed={isRecording} aria-busy={finalizing} title={finalizing?'正在完成录音':isRecording?'结束录音（Escape）':'录音（R）'} disabled={busy||(!isRecording&&!state.deviceId)||finalizing} onClick={()=>run(isRecording?'record.stop':'record.start')}><TransportIcon kind={isRecording?'stop':'record'}/></button>
      </div>
      <button className="return-live live-follow" aria-pressed={!file} disabled={busy||!state.deviceId} onClick={()=>run('view.live')} title="实时：回到最新采集位置">实时</button>
      <button className="monitor-button" disabled={busy||!state.deviceId||isRecording||Boolean(file?.outputReady)} onClick={()=>state.monitoringRequested?run('live.stop'):run('live.start',{deviceId:state.deviceId})}>{state.monitoringRequested?'停止监测':'开始监测'}</button>
      <div className="transport-divider"/>
      <div className="elapsed"><span>{isRecording?'录音时长':'游标位置'}</span><strong>{isRecording&&view?timecodeNs(view.durationNs):timecode(String(Math.round((Number(displaySnapshot?.positionFrame||'0')/(displaySnapshot?.timelineRate||displaySnapshot?.format.sampleRate||format?.sampleRate||48000)+(file?.timeOffsetSeconds||0))*1000)),1000)}</strong></div>
      <div className="transport-spacer"/>
      <label className="monitor-gain">音量<input aria-label="文件回听音量" type="range" min="0" max="1" step=".01" value={file?.gain??1} disabled={!file||busy} onChange={e=>file&&run('playback.volume',{playbackId:file.id,gain:Number(e.target.value)})}/><span>{Math.round((file?.gain??1)*100)}%</span></label>
      <button className="file-export-button" disabled={busy||isRecording||(!file&&replaySeconds<=0)} title={file&&!file.temporary?'导出当前文件或选区':'将'+(file?.selection?'选区':'最近缓存')+'按录音设置保存为独立文件'} onClick={()=>file&&!file.temporary?openExport({takeId:file.takeId,role:file.role,regionId:file.regionId,exportId:file.exportId,...(file.selection?{range:file.selection}:{})}):void saveCache()}>{file&&!file.temporary?'导出':'保存缓存'}</button>
      <button className="report-button" title="测量报告与超限事件" onClick={()=>setModal('reports')}>报告</button>
      <button data-open-files className="files-button" onClick={()=>{setLibraryAttention(false);setModal('files')}}>音频文件 {(state.recordings?.length||0)+(state.imports?.length||0)}</button>
      <button className="reset-button" disabled={busy||!state.active||isRecording||Boolean(file)} onClick={()=>run('live.reset')} title="重新开始本轮响度统计"><Icon name="reset"/></button>
    </footer>

    {continuity&&<div className="statusbar"><span className={'status-dot ' + (sourceError ? 'error' : displaySnapshot?.continuity === 'gaps' ? 'warning' : '')} /><span>{continuity}</span></div>}

    {notice&&!modal&&<OperationNotice notice={notice} busy={busy||isRecording} close={dismissNotice} open={()=>{
      if(notice.setup){setDraft(state.recordSettings||draft);setModal('settings');dismissNotice();return}
      if(!notice.ready){setLibraryAttention(Boolean(notice.recovery||notice.failed));setModal('files');dismissNotice();return}
      const take=state.recordings?.find(t=>t.id===notice.takeId),source=notice.exportId?{takeId:notice.takeId!,role:'export' as const,exportId:notice.exportId}:take?preferredSource(take):undefined
      if(source)run('file.open',{...source});dismissNotice()
    }} folder={()=>notice.exportId?run(state.exportJobs?.find(j=>j.id===notice.exportId)?.delivery?.phase==='ready'?'export.openDeliveryFolder':'export.openFolder',{exportId:notice.exportId}):run('record.openFolder',{takeId:notice.takeId})} retry={()=>run(state.exportJobs?.find(j=>j.id===notice.exportId)?.phase==='ready'?'export.saveCopy':'export.retry',{exportId:notice.exportId})}/>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if(e.target===e.currentTarget&&!busy)setModal(null) }}>
      <section className={'trace-modal '+(modal==='files'?'file-library':modal==='reports'?'report-modal':'')} role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={e => {
        if(e.key==='Escape'&&!busy)setModal(null)
        if(e.key==='Tab'){const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')).filter(node=>node.getClientRects().length>0);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
      }}>
        <header><h2 id="modal-title">{modal==='settings'?'录音保存设置':modal==='export'?'导出音频':modal==='display'?'显示与帮助':modal==='targets'?'测量目标':modal==='reports'?'测量报告':'音频文件'}</h2><button aria-label="关闭对话框" onClick={()=>setModal(null)}>×</button></header>
        {modal==='reports'?<ReportPanel file={file} targets={targets} jobs={state.reportJobs||[]} recording={isRecording} request={command} onNavigate={()=>{presentation.cancel();setModal(null)}}/>:modal==='targets'?<TargetSettingsForm value={targets} apply={settings=>command('targets.configure',{settings}).then(()=>setModal(null))}/>:modal==='display'?<DisplaySettingsForm confirmExit={state.confirmExitWhileRecording!==false} copyDiagnostics={()=>command('app.copyDiagnostics')} value={{...(state.displaySettings||defaultDisplaySettings),waveGain:gain}} busy={busy} apply={(value,confirmExitWhileRecording)=>command('view.settings',value).then(()=>command('app.configure',{confirmExitWhileRecording})).then(()=>setModal(null)).catch(()=>{})}/>:modal==='settings'?<RecordSettingsForm value={draft} change={setDraft} busy={busy||isRecording} directoryBusy={Boolean(state.exportJobs?.some(j=>!['ready','failed','cancelled'].includes(j.phase)))} sourceRate={format?.sampleRate} sourceChannels={format?.channelCount} capacity={state.recordingCapacity?.directory===state.recordDirectory?state.recordingCapacity:undefined} directory={state.recordDirectory} chooseDirectory={()=>run('record.chooseDirectory')} apply={()=>command('record.configure',draft).then(()=>setModal(null)).catch(()=>{})}/>:modal==='export'&&exportSource?exportDescription?<ExportDialog source={exportSource} description={exportDescription} saved={state.lastExportPreset} saveCopyDefault={state.lastExportSaveCopy===true} remember={preset=>queueLatest('exportPrefs','export.configure',{...preset})} busy={busy} submit={(preset,selection,saveCopy)=>command('export.start',{...exportSource,range:selection?exportSource.range:undefined,preset,saveCopy}).then(data=>{const result=data as {jobId?:string}|null;if(result?.jobId){trackExport(result.jobId);setModal(null)}}).catch(()=>{})}/>:<div className="settings-content" role="status">{exportInfoError||'正在读取文件信息…'}{exportInfoError&&<button onClick={()=>setExportSource({...exportSource})}>重试</button>}</div>:<RecordingLibrary initialStatus={libraryAttention?'attention':'all'} state={state} busy={busy} run={run} request={command} onExport={openExport}/>}

      </section>
    </div>}
  </main>
}
