import {HistoryPresentation} from './historyPresentation'
import {zoomLabel} from './zoom'
import { useEffect, useRef, useState } from 'react'
import { timecode, timecodeNs } from './time'
import {Timeline} from './Timeline'
import {FileSourceBar,TransportIcon} from './FileControls'
import {ExportDialog,ExportItems} from './ExportPanel'
import {RecordSettingsForm} from './RecordSettingsForm'
import {recordingLabel} from '../recordSettings'
import {defaultDisplaySettings} from '../displaySettings'
import {DisplaySettingsForm} from './DisplaySettingsForm'
import {userError} from '../userErrors'
import type {ExportSource} from '../exportTypes'
import type { Command, Device, Metric, MeterSnapshot, TraceState, PlaybackView, RecordSettings, TakeSummary, AnalysisJobView } from '../shared'

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

function LevelPanel({ snapshot }: { snapshot: MeterSnapshot | null }): React.JSX.Element {
  const channels = snapshot?.channels.length || 2
  const scale = (metric?: Metric): number => metric?.status === 'ready' && metric.value !== null ? Math.max(0, Math.min(1, (metric.value + 60) / 60)) : 0
  return <section className="level-panel panel">
    <div className="panel-heading"><h2>电平</h2><span className="small-note">dBFS</span></div>
    <div className="level-plot">
      <div className="db-scale">{[0, -6, -12, -18, -24, -30, -36, -42, -48, -54, -60].map(n => <span key={n}>{n}</span>)}</div>
      <div className="channel-bars">{Array.from({ length: channels }, (_, c) => {
        const levels = snapshot?.channels[c]
        const clip = levels?.samplePeak.status === 'ready' && (levels.samplePeak.value ?? -Infinity) >= 0
        return <div className="channel" key={c}>
          <div className={'clip-indicator ' + (clip ? 'clipped' : '')} title={clip ? '样本峰值达到或超过 0 dBFS' : '未检测到样本削波'} />
          <div className="meter-track" role="meter" aria-label={(channels === 1 ? '单声道' : c === 0 ? '左声道' : '右声道') + '样本峰值'} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={levels?.samplePeak.status === 'ready' ? Math.max(-60, Math.min(0, levels.samplePeak.value!)) : undefined}>
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
function FileAnalysis({take,jobs,disabled,run,onExport}:{onExport:(source:ExportSource)=>void;take:TakeSummary;jobs:AnalysisJobView[];disabled:boolean;run:(name:Command,payload:Record<string,unknown>)=>void}):React.JSX.Element|null {
  const [selected,setSelected]=useState<Record<string,string>>({})
  if(!['ready','recovered','failed'].includes(take.status)||!take.roles?.length)return null
  return <div className="file-analysis">
    {take.roles.map(role=>{
      const choices=take.analysisRegions?.filter(region=>region.role===role)||[]
      const target=(take.regionCount||0)>1&&choices.length?(choices.find(region=>region.id===selected[role])||choices[0]):undefined
      const job=jobs.find(item=>item.takeId===take.id&&item.role===role&&item.regionId===target?.id&&!item.selectionRange)
      const unavailable=take.missingRoles?.includes(role)
      const running=Boolean(job&&!['ready','failed','cancelled'].includes(job.phase))
      const label={source:'原始文件',deliverable:'成品文件',recovered:'恢复文件',session:'会话视图',export:'导出文件'}[role]
      const percent=job&&BigInt(job.totalFrames)>0n?Math.min(100,Number(BigInt(job.frames)*100n/BigInt(job.totalFrames))):0
      const status=unavailable?'文件不可用':!job?'可查看分析':job.phase==='ready'?'分析完成':job.phase==='queued'?'等待分析':job.phase==='hashing'?'读取文件':
        job.phase==='analyzing'?'正在分析 '+percent+'%':job.phase==='verifying'?'核对结果':job.phase==='cancelled'?'已取消':'分析失败'
      return <section key={role} className="analysis-item" data-analysis-role={role}>
        <div className="analysis-line"><span>{label} · {status}</span><button data-file-open={role} disabled={disabled||unavailable} onClick={()=>run('file.open',{takeId:take.id,role,...(target?{regionId:target.id}:{})})}>查看</button><button data-export-source={role} disabled={disabled||unavailable} onClick={()=>onExport({takeId:take.id,role,...(target?{regionId:target.id}:{})})}>导出</button>{running?<button data-analysis-cancel={job!.id} onClick={()=>run('job.cancel',{jobId:job!.id})}>取消</button>:
          <button data-analysis-start={role} disabled={disabled||unavailable} onClick={()=>run('analysis.start',{takeId:take.id,role,...(target?{regionId:target.id}:{})})}>{job?.phase==='ready'?'重新检查':'分析文件'}</button>}</div>
        {target&&<select aria-label={label+'连续段'} value={target.id} onChange={event=>setSelected({...selected,[role]:event.target.value})}>{choices.map(region=><option key={region.id} value={region.id}>第 {region.ordinal} 段 · {region.sampleRate/1000} kHz · {region.channelCount===1?'单声道':'双声道'}</option>)}</select>}
        {running&&<progress max="100" value={job?.phase==='analyzing'?percent:undefined} aria-label={label+'分析进度'}/>}
        {job?.phase==='ready'&&job.summary&&<dl className="analysis-summary">
          <div><dt>整段 I</dt><dd>{value(job.summary.integratedToCursor)} <small>LUFS</small></dd></div>
          <div><dt>LRA {BigInt(job.totalFrames)<BigInt(job.sampleRate)*60n?'· 暂估':''}</dt><dd>{value(job.summary.loudnessRange)} <small>LU</small></dd></div>
          <div><dt>MAX TP</dt><dd>{value(job.summary.maxTruePeak)} <small>dBTP</small></dd></div>
        </dl>}
        {job?.error&&<small className="take-error">{job.error}</small>}
      </section>
    })}
  </div>
}
export default function App(): React.JSX.Element {
  const [state, setState] = useState<TraceState>(initial)
  const current = useRef(initial)
  const [devices, setDevices] = useState<Device[]>([])
  const [snapshot, setSnapshot] = useState<MeterSnapshot | null>(null)
  const [presentation]=useState(()=>new HistoryPresentation())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [displayDraft,setDisplayDraft]=useState<{gain?:number;seconds?:number}>({})
  const [windowDraft,setWindowDraft]=useState<{id:string;startFrame:string;endFrame:string}|null>(null)
  const gain=displayDraft.gain??state.displaySettings?.waveGain??4,seconds=displayDraft.seconds??state.windowSeconds
  const [selectionMode,setSelectionMode]=useState(false)
  const refreshingLibrary=useRef(false)
  const [fileQuery,setFileQuery]=useState(''),[fileLimit,setFileLimit]=useState(50)
  const [modal,setModal]=useState<'settings'|'files'|'export'|'display'|null>(null)
  const [exportSource,setExportSource]=useState<ExportSource|null>(null)
  const openExport=(source:ExportSource)=>{setExportSource({takeId:source.takeId,role:source.role,...(source.regionId?{regionId:source.regionId}:{}),...(source.exportId?{exportId:source.exportId}:{}),...(source.range?{range:source.range}:{})});setModal('export')}
  const [draft,setDraft]=useState<RecordSettings>({encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'})
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  function accept(next: TraceState): void { if (next.revision > current.current.revision || (next.revision === current.current.revision && (next.eventSequence||0)>=(current.current.eventSequence||0))) { current.current = next; presentation.reconcile(next); setState(next) } }
  function command(name: Command, payload: Record<string, unknown> = {}): Promise<unknown> {
    const task = queue.current.catch(() => undefined).then(async () => {
      const foreground=name!=='playback.seek'&&name!=='view.inspect'
      if(foreground)setBusy(true)
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const reply = await window.trace.request({ protocolVersion: 1, requestId: crypto.randomUUID(), expectedStateRevision: current.current.revision, command: name, payload })
          accept(reply.state)
          if (!reply.ok) {
            if (reply.error?.code === 'STALE_REQUEST' && attempt === 0) continue
            throw Error(reply.error?.message || '操作未完成')
          }
          setMessage('')
          return reply.data
        }
      } catch (error) { setMessage(String(error)); throw error }
      finally { if(foreground)setBusy(false) }
    })
    queue.current = task
    return task
  }
  useEffect(() => {
    const unstate = window.trace.onState(accept)
    const unsnapshot = window.trace.onSnapshot(next => {if(presentation.accept(next,current.current))setSnapshot(next)})
    command('state.get').then(() => command('devices.list')).then(result => setDevices(result as Device[])).catch(() => {})
    return () => { unstate(); unsnapshot(); latest.current.clear(); presentation.cancel() }
  }, [])
  useEffect(()=>{if(modal){const id=setTimeout(()=>document.querySelector<HTMLElement>('.trace-modal button')?.focus(),0);return()=>clearTimeout(id)}},[modal])
  const run = (name: Command, payload?: Record<string, unknown>): void => {
    if(name==='playback.window'&&payload){changeWindow(payload);return}
    if(['file.open','file.close','view.live','playback.seek','playback.follow'].includes(name)){latest.current.delete('window');setWindowDraft(null)}
    if(['file.open','file.close','view.live','record.start'].includes(name)){latest.current.delete('inspect');latest.current.delete('seek');presentation.cancel()}
     if(name==='view.live')setRecordWindow({mode:'follow',start:'0',end:'0'})
     command(name, payload).then(()=>{if(name==='file.open')setModal(null)}).catch(() => {})
  }
  useEffect(()=>{
    if(modal!=='files')return
    const refresh=()=>{if(!current.current.currentRecord&&!refreshingLibrary.current){refreshingLibrary.current=true;void command('library.refresh').catch(()=>{}).finally(()=>{refreshingLibrary.current=false})}}
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
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement
      if(document.querySelector('[role="dialog"]'))return
      if(event.code!=='Escape'&&(target?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target?.tagName)))return
      const file=current.current.playback
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
  const format = file?(snapshot?.sourceKind==='file'&&snapshot.sourceId===file.id?snapshot.format:undefined):state.active&&liveSnapshot?.format.sampleRate?liveSnapshot.format:selected?.format||liveSnapshot?.format
  const record=snapshot?.recording
  const recordBusy=Boolean(record&&['preparing','armed','recording','finalizing'].includes(record.phase))
  const isRecording=Boolean(state.currentRecord)||recordBusy
  const finalizing=record?.phase==='finalizing'||state.currentRecord?.phase==='finalizing'
  const reconnecting=state.currentRecord?.phase==='reconnecting',multiRegion=(state.currentRecord?.regionCount||0)>1
  const view=snapshot?.recordingView
  const rawDisplaySnapshot:MeterSnapshot|null=file?(snapshot?.sourceKind==='file'&&snapshot.sourceId===file.id?{...snapshot,positionFrame:snapshot.positionFrame,fileView:snapshot.fileView?{...snapshot.fileView,startFrame:file.startFrame,endFrame:file.endFrame,selection:file.selection,selectionAnalysis:file.selectionAnalysis,playingIntent:file.phase==='playing'||file.phase==='buffering'}:undefined}:null):snapshot?.sourceKind==='file'||snapshot?.sourceId!==state.deviceId?null:isRecording&&view&&snapshot?{...snapshot,...(recordBusy&&record?record.meters:{}),sourceKind:'take',sourceId:state.currentRecord?.id||record?.id||'',positionFrame:view.durationNs,timelineRate:1000000000,format:{...snapshot.format,channelCount:view.channelCount},waveform:view.waveform,loudnessHistory:view.loudnessHistory,lraProvisional:!record||BigInt(record.writtenFrames)<BigInt(record.sourceFormat.sampleRate)*60n,continuity:multiRegion?'gaps':snapshot.continuity}:snapshot
  const recEnd=BigInt(view?.durationNs||'0'),recSpan=BigInt(Math.round(seconds*1000000000))
  const recBounds=recordWindow.mode==='all'?{startFrame:'0',endFrame:recEnd.toString()}:recordWindow.mode==='follow'?{startFrame:(recEnd>recSpan?recEnd-recSpan:0n).toString(),endFrame:recEnd.toString()}:{startFrame:recordWindow.start,endFrame:recordWindow.end}
  const liveEnd=BigInt(rawDisplaySnapshot?.positionFrame||'0'),liveSpan=BigInt(Math.round(seconds*(rawDisplaySnapshot?.format.sampleRate||48000)))
   const displaySnapshot=rawDisplaySnapshot?.sourceKind==='take'?{...rawDisplaySnapshot,timelineWindow:recBounds,positionFrame:rawDisplaySnapshot.positionFrame}:rawDisplaySnapshot?.sourceKind==='live'?{...rawDisplaySnapshot,timelineWindow:{startFrame:(liveEnd>liveSpan?liveEnd-liveSpan:0n).toString(),endFrame:liveEnd.toString()}}:rawDisplaySnapshot
  const sourceError = state.error || displaySnapshot?.error
  const snapshotFailure=state.error?.startsWith('RECORD_SNAPSHOT_FAILED:')
  const continuity = sourceError?'':displaySnapshot?.continuity==='gaps'?'音频有中断':file&&displaySnapshot?.fileView?.analysisPhase!=='ready'?'分析中…':''
  const history=Boolean(file?.temporary),replaySeconds=Number(liveSnapshot?.diagnostics.replayFrames||0)/(format?.sampleRate||48000)
  const visibleTakes=(state.recordings||[]).filter(t=>t.name.toLocaleLowerCase().includes(fileQuery.trim().toLocaleLowerCase()))
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
   return <main className="trace-app">
    <header className="topbar">
      <div className="brand"><svg viewBox="0 0 32 32" width="31" height="31" fill="none" aria-hidden="true"><path d="M2 16H7L11 5L16 27L21 10L24 16H30" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" /></svg><span>TRACE</span><small>Audio Recorder &amp; Analyzer</small></div>
      <div className="top-status"><span className={'live-badge '+(isRecording?'is-rec':state.active?'is-live':'')}><i />{isRecording?'REC':state.active?'采集中':'待机'}</span><span className="preview-badge">开发预览</span><button className="header-settings" aria-label="显示与帮助" onClick={()=>setModal('display')}>显示与帮助</button></div>
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

    <FileSourceBar file={workbenchFile} busy={busy} run={workbenchRun} live={!file}/>
    <div className="workspace" data-history-position={file?displaySnapshot?.positionFrame:undefined} data-history-generation={file?displaySnapshot?.playback?.generation:undefined}>
      <LevelPanel snapshot={numberMetrics} />
      <Timeline onGain={value=>changeDisplay('gain',value)} onSeconds={setTimeSpan} selectionMode={selectionMode}
        controls={<div className="timeline-controls"><div className="timeline-modes" role="group" aria-label="时间轴定位方式" title="拖动图形定位；拖动刻度轴或 Shift 拖动选择范围"><button aria-pressed={!selectionMode} onClick={()=>setSelectionMode(false)}>定位</button><button aria-pressed={selectionMode} onClick={()=>setSelectionMode(true)}>选区</button></div>{isRecording&&!file&&<span className="record-overview-note" title="全长概览 · 精确历史保留最近 60 s">全长概览 · 精确历史保留最近 60 s</span>}<div className="timeline-zoom-controls" role="group" aria-label="波形显示设置">
      <label className="zoom-control" title="Ctrl + 滚轮">时间窗<input aria-label="波形时间窗" type="range" min="5" max="60" step=".1" value={file?Math.max(5,Math.min(60,Number(BigInt(file.endFrame)-BigInt(file.startFrame))/file.sampleRate)):seconds} onChange={e=>setTimeSpan(Number(e.target.value))}/><output>{zoomLabel(file?Number(BigInt(file.endFrame)-BigInt(file.startFrame))/file.sampleRate:seconds)} s</output></label>
      <label className="zoom-control" title="波形区域滚轮">波形<input aria-label="波形显示倍率" type="range" min="1" max="4" step=".01" value={gain} onChange={e=>changeDisplay('gain',Number(e.target.value))}/><output>×{zoomLabel(gain,2)}</output></label>
        </div></div>}
        snapshot={displaySnapshot} seconds={seconds} gain={gain} target={state.displaySettings||defaultDisplaySettings}
        onSeek={(position,_resume,source)=>inspectAt(source,position)}
        onSelection={(startFrame,endFrame,source)=>inspectAt(source,startFrame,endFrame)}
        onWindow={(startFrame,endFrame)=>{if(file)changeWindow({playbackId:file.id,startFrame,endFrame,pixelWidth:900});else if(isRecording)setTimeSpan(Math.max(5,Math.min(60,Number(BigInt(endFrame)-BigInt(startFrame))/1e9)))}}/>

      <aside className="loudness-values panel">
        <div className="panel-heading"><h2>响度</h2><span className="small-note">LUFS</span></div>
        <section className="integrated-card" title={history?'监测起点至当前历史位置的累计响度':file?'文件起点至当前游标的累计响度':isRecording?'本次录音的累计响度':'本轮监测的累计响度'}><div className="metric-label">INTEGRATED <span>{file?'截至游标 I':isRecording?(multiRegion?'当前段 I':'本次录音 I'):'本轮 I'}</span></div><MetricNumber metric={numberMetrics?.integratedToCursor} large /></section>
        <div className="instant-metrics"><section><div className="metric-label">M <span>400 ms</span></div><MetricNumber metric={numberMetrics?.momentary} /></section><section><div className="metric-label">S <span>3 s</span></div><MetricNumber metric={numberMetrics?.shortTerm} /></section></div>
        <div className="summary-metric" title={file&&!history?'文件整段响度范围':'截至当前位置的响度范围'}><div><b>LRA {displaySnapshot?.lraProvisional&&numberMetrics?.loudnessRange.status==='ready'&&<small className="provisional-tag" title="时长不足 60 秒，LRA 暂估">暂估</small>}</b></div><strong>{value(numberMetrics?.loudnessRange)} <small>LU</small></strong></div>
        <div className="summary-metric" title={history?'监测起点至当前历史位置的最大真峰值':file?'文件整段最大真峰值':isRecording?'本次录音最大真峰值':'本轮最大真峰值'}><div><b>MAX TP</b></div><strong>{value(numberMetrics?.maxTruePeak)} <small>dBTP</small></strong></div>
        {file&&!history&&<div className="summary-metric"><div><b>整段 I</b></div><strong>{value(displaySnapshot?.fileView?.wholeFileIntegrated)} <small>LUFS</small></strong></div>}
      </aside>
    </div>
    {(sourceError || file?.error || message) && <div className="error-banner" role="alert"><strong>需要处理</strong><span>{file?.error?(file.error.startsWith('FILE_SNAPSHOT_FAILED:')?userError(file.error):'回听输出不可用；历史数据仍可查看。'):snapshotFailure ? '录音数据更新失败，已停止本次录音并保留已写入的文件。请重新连接后重试。' : sourceError ? '声音来源暂不可用，请重试或选择其他设备。' : userError(message)}</span>{state.deviceId && !isRecording && !file && <button onClick={() => run('live.start', { deviceId: state.deviceId })} disabled={busy}>重新连接</button>}</div>}
    <footer className="transport">
      <div className="transport-buttons" role="group" aria-label="走带控制">
        <button className="transport-icon file-home" aria-label="起点" title="起点（Home）：定位到当前文件或缓存开头" disabled={busy||!file} onClick={()=>file&&run('playback.seek',{playbackId:file.id,positionFrame:'0',resume:false})}><TransportIcon kind="start"/></button>
        <button className="transport-icon file-end" aria-label="终点" title="终点（End）：定位到当前文件或缓存末尾" disabled={busy||!file} onClick={()=>file&&run('playback.seek',{playbackId:file.id,positionFrame:file.totalFrames,resume:false})}><TransportIcon kind="end"/></button>
        <button className="transport-icon play-button" aria-label={file?.outputReady?'暂停':'播放'} aria-pressed={Boolean(file?.outputReady)} title={file?.outputReady?'暂停（Space）':file?'播放（Space）':'播放历史缓存'} disabled={busy||isRecording||(!file&&replaySeconds<=0)} onClick={()=>{if(file)run(file.outputReady?'playback.pause':'playback.play',{playbackId:file.id});else void command('live.replay').then(()=>command('playback.play',{playbackId:current.current.playback!.id})).catch(()=>{})}}><TransportIcon kind={file?.outputReady?'pause':'play'}/></button>
        <button className={'transport-icon record-button '+(isRecording?'is-recording':'')} aria-label={finalizing?'正在完成录音':isRecording?'结束录音':'录音'} aria-pressed={isRecording} aria-busy={finalizing} title={finalizing?'正在完成录音':isRecording?'结束录音（Escape）':'录音（R）'} disabled={busy||(!isRecording&&!state.deviceId)||finalizing} onClick={()=>run(isRecording?'record.stop':'record.start')}><TransportIcon kind={isRecording?'stop':'record'}/></button>
      </div>
      <button className="return-live live-follow" aria-pressed={!file} disabled={busy||!state.deviceId} onClick={()=>run('view.live')} title="实时：回到最新采集位置">实时</button>
      <button className="monitor-button" disabled={busy||!state.deviceId||isRecording||Boolean(file?.outputReady)} onClick={()=>state.monitoringRequested?run('live.stop'):run('live.start',{deviceId:state.deviceId})}>{state.monitoringRequested?'停止监测':'开始监测'}</button>
      <div className="transport-divider"/>
      <div className="elapsed"><span>{isRecording?'录音时长':'游标位置'}</span><strong>{isRecording&&view?timecodeNs(view.durationNs):timecode(String(Math.round((Number(displaySnapshot?.positionFrame||'0')/(displaySnapshot?.timelineRate||format?.sampleRate||48000)+(file?.timeOffsetSeconds||0))*1000)),1000)}</strong></div>
      <div className="transport-spacer"/>
      <label className="monitor-gain">音量<input aria-label="文件回听音量" type="range" min="0" max="1" step=".01" value={file?.gain??1} disabled={!file||busy} onChange={e=>file&&run('playback.volume',{playbackId:file.id,gain:Number(e.target.value)})}/><span>{Math.round((file?.gain??1)*100)}%</span></label>
      <button className="file-export-button" disabled={!file||Boolean(file.temporary)||busy||isRecording} onClick={()=>file&&openExport({takeId:file.takeId,role:file.role,regionId:file.regionId,exportId:file.exportId,...(file.selection?{range:file.selection}:{})})}>导出</button>
      <button data-open-files className="files-button" onClick={()=>setModal('files')}>录音文件 {state.recordings?.length||0}</button>
      <button className="reset-button" disabled={busy||!state.active||isRecording||Boolean(file)} onClick={()=>run('live.reset')} title="重新开始本轮响度统计"><Icon name="reset"/></button>
    </footer>

    {continuity&&<div className="statusbar"><span className={'status-dot ' + (sourceError ? 'error' : displaySnapshot?.continuity === 'gaps' ? 'warning' : '')} /><span>{continuity}</span></div>}

    {modal && <div className="modal-backdrop" onMouseDown={e => { if(e.target===e.currentTarget&&!busy)setModal(null) }}>
      <section className={'trace-modal '+(modal==='files'?'file-library':'')} role="dialog" aria-modal="true" aria-labelledby="modal-title" onKeyDown={e => {
        if(e.key==='Escape'&&!busy)setModal(null)
        if(e.key==='Tab'){const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input,select'));const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
      }}>
        <header><h2 id="modal-title">{modal==='settings'?'录音保存设置':modal==='export'?'导出音频':modal==='display'?'显示与帮助':'录音文件'}</h2><button aria-label="关闭对话框" onClick={()=>setModal(null)}>×</button></header>
        {modal==='display'?<DisplaySettingsForm value={{...(state.displaySettings||defaultDisplaySettings),waveGain:gain}} busy={busy} apply={value=>command('view.settings',value).then(()=>setModal(null)).catch(()=>{})}/>:modal==='settings'?<RecordSettingsForm value={draft} change={setDraft} busy={busy||isRecording} directoryBusy={Boolean(state.exportJobs?.some(j=>!['ready','failed','cancelled'].includes(j.phase)))} sourceRate={format?.sampleRate} directory={state.recordDirectory} chooseDirectory={()=>run('record.chooseDirectory')} apply={()=>command('record.configure',draft).then(()=>setModal(null)).catch(()=>{})}/>:modal==='export'&&exportSource?<ExportDialog source={exportSource} busy={busy} submit={(preset,selection)=>command('export.start',{...exportSource,range:selection?exportSource.range:undefined,preset}).then(()=>setModal('files')).catch(()=>{})}/>:<div className="recording-list"><div className="library-toolbar"><input aria-label="搜索录音文件" placeholder="搜索录音名称" value={fileQuery} onChange={e=>{setFileQuery(e.target.value);setFileLimit(50)}}/><button disabled={busy||isRecording} onClick={()=>run('library.refresh')}>刷新文件状态</button><span>{visibleTakes.length} 项</span></div>
          {!state.recordings?.length&&<p className="empty-recordings">暂无录音。点击“录音”开始保存系统声音。</p>}
          {Boolean(state.recordings?.length)&&!visibleTakes.length&&<p className="empty-recordings">没有匹配的录音。</p>}
          {visibleTakes.slice(0,fileLimit).map(take=><article key={take.id} className="take-row" data-take-id={take.id}>
            <div><strong>{take.name}</strong><span>{take.durationNs?timecodeNs(take.durationNs):timecode(take.frames,take.sampleRate)} · {take.mixedSampleRate?'多采样率':take.sampleRate/1000+' kHz'} · {take.encoding==='mp3'?'MP3 · '+take.bitrate+' kbps':take.encoding==='aac'?'AAC '+take.container?.toUpperCase()+' · '+take.bitrate+' kbps':take.encoding==='float32'?'32-bit float':take.encoding==='pcm24'?'24-bit':'16-bit'} · {take.segmentCount} 段</span>
            <small className={take.status==='failed'?'take-error':''}>{take.status==='recovered'?'已恢复：'+take.error:take.status==='ready'?(take.hasDiscontinuities?'已保存 · 含设备中断':'已保存'):take.status==='processing'?'正在生成文件':take.status==='recoverable'?'可恢复的未完成录音':take.status==='failed'?'录音未完整完成：'+userError(take.error):'正在录音'}</small>{take.clippedSamples&&BigInt(take.clippedSamples)>0n&&<small className="take-error">保存文件发生削波：{take.clippedSamples} 个采样值超出整数范围</small>}{take.sourceClippedSamples&&BigInt(take.sourceClippedSamples)>0n&&take.sourceClippedSamples!==take.clippedSamples&&<small className="take-error">源 WAV 发生削波：{take.sourceClippedSamples} 个采样值；派生文件无法还原已削去的部分</small>}{take.retention&&take.retention.phase!=='kept'&&<small className={take.retention.phase==='error'?'take-error':''}>{take.retention.phase==='removed'?'独立成品已核验，原始 WAV 已按设置整理':take.retention.phase==='error'?'原始文件整理未完成：'+userError(take.retention.error):'正在核验独立成品，原始文件仍保留'}</small>}{take.retention?.phase==='error'&&<button onClick={()=>run('retention.retry',{takeId:take.id})}>重试整理</button>}{take.availability&&take.availability!=='present'&&<small className="take-error">{take.availability==='missing'?'磁盘文件已移除或移动':'暂时无法访问文件'} · {take.missingFiles||0} 个文件不可用</small>}<FileAnalysis take={take} jobs={state.analysisJobs||[]} disabled={busy||isRecording} run={run} onExport={openExport}/><ExportItems items={take.exports||[]} takeId={take.id} jobs={state.analysisJobs||[]} disabled={busy||isRecording} run={run}/></div>
            {take.status==='recoverable'&&<button disabled={busy} onClick={()=>run('record.recover',{takeId:take.id})}>恢复</button>}<div className="take-actions"><button onClick={()=>run('record.openFolder',{takeId:take.id})}>打开目录</button><button data-remove-take disabled={busy||isRecording||!['ready','failed','recovered','recoverable'].includes(take.status)} onClick={()=>run('library.remove',{takeId:take.id})}>移除录音</button></div>
          </article>)}
          {visibleTakes.length>fileLimit&&<button onClick={()=>setFileLimit(fileLimit+50)}>显示更多录音</button>}
        </div>}
      </section>
    </div>}
  </main>
}
