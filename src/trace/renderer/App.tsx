import {SpectrogramSettingsForm} from './SpectrogramPanel'
import {defaultSpectrogramSettings} from '../spectrogramProtocol'
import {AnalysisSettings} from './AnalysisInstruments'
import {defaultInstrumentSettings,type InstrumentSettings} from '../instrumentTypes'
import {OperationNotice,useOperationNotice} from './OperationNotice'
import {RecordingLibrary,preferredSource} from './RecordingLibrary'
import {panRange} from './zoom'
import {HistoryPresentation} from './historyPresentation'
import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {TimelinePreviewProvider} from './Timeline'
import {InstrumentWorkspace,WorkspaceToolbar,useWorkspace} from './InstrumentWorkspace'
import {TransportIcon} from './FileControls'
import {ExportDialog} from './ExportPanel'
import {RecordSettingsForm} from './RecordSettingsForm'
import {recordingLabel} from '../recordSettings'
import {defaultDisplaySettings} from '../displaySettings'
import {defaultTargetSettings} from '../targetSettings'
import {TargetSettingsForm} from './Targets'
import {ReportPanel} from './ReportPanel'
import {ReferencePanel} from './ReferencePanel'
import {DisplaySettingsForm} from './DisplaySettingsForm'
import {applyTheme} from './themeRuntime'
import {defaultThemeId} from '../instrumentThemes'
import {BrandLockup} from './BrandLockup'
import {publishSnapshot} from './snapshotStore'
import {useChromeFlags,type RecordWindow,type ViewInputs,type WindowDraft} from './viewModel'
import {ContinuityBar,LevelsInstrument,LoudnessInstrument,SelectionStatsRow,SoundFieldInstrument,SpectrumInstrument,TargetStripContainer,TimelineInstrument,TransportElapsed,WorkbenchSourceBar,WorkspaceFrame} from './LiveInstruments'
import {userError} from '../userErrors'
import type {ExportDescription,ExportSource} from '../exportTypes'
import type {Command,Device,MeterSnapshot,TraceState,RecordSettings} from '../shared'

const initial: TraceState = { revision: 0, active: false, deviceId: '', windowSeconds: 30, error: null }
function Icon({ name }: { name: 'stop' | 'play' | 'reset' }): React.JSX.Element {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
    {name === 'stop' ? <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /> :
      name === 'play' ? <path d="M7 4L20 12L7 20Z" fill="currentColor" /> :
        <><path d="M5 9A8 8 0 1 1 4 14M5 9V3M5 9H11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>}
  </svg>
}
export default function App(): React.JSX.Element {
  const [state, setState] = useState<TraceState>(initial)
  const current = useRef(initial)
  const {notice,trackExport,trackSavedRecord,dismiss:dismissNotice}=useOperationNotice(state)
  const [dismissedRecovery,setDismissedRecovery]=useState(false)
  const [libraryAttention,setLibraryAttention]=useState(false),[copied,setCopied]=useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [presentation]=useState(()=>new HistoryPresentation())
  const [busy, setBusy] = useState(false),busyRef=useRef(false)
  const [message, setMessage] = useState('')
  const [displayDraft,setDisplayDraft]=useState<{gain?:number;seconds?:number}>({})
  const [windowDraft,setWindowDraft]=useState<WindowDraft|null>(null)
  const gain=displayDraft.gain??state.displaySettings?.waveGain??4,seconds=displayDraft.seconds??state.windowSeconds
  const [selectionMode,setSelectionMode]=useState(false)
  const refreshingLibrary=useRef(false)
  const [modal,setModal]=useState<'settings'|'files'|'export'|'display'|'targets'|'reports'|null>(null)
  // The display dialog previews themes locally; closing it without applying falls back to the saved theme.
  // Until the first state arrives the startup theme from the URL stays in effect (no default-theme flash).
  useEffect(()=>{if(modal!=='display'&&state.instrumentTheme)applyTheme(state.instrumentTheme)},[state.instrumentTheme,modal])
  const [exportSource,setExportSource]=useState<ExportSource|null>(null)
  const [exportDescription,setExportDescription]=useState<ExportDescription|null>(null),[exportInfoError,setExportInfoError]=useState('')
  const [draft,setDraft]=useState<RecordSettings>({encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'})
  const [recordWindow,setRecordWindow]=useState<RecordWindow>({mode:'all',start:'0',end:'0'})
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const latest=useRef(new Map<string,{name:Command;payload:Record<string,unknown>}>())
  const draining=useRef(new Set<string>())

  const accept=useCallback((next: TraceState): void => {
    if (next.revision > current.current.revision || (next.revision === current.current.revision && (next.eventSequence||0)>=(current.current.eventSequence||0))) {
      const wasHidden=current.current.windowVisible===false
      current.current = next; presentation.reconcile(next)
      if(next.windowVisible!==false){setState(next);if(wasHidden&&presentation.snapshot)publishSnapshot({...presentation.snapshot})}
    }
  },[presentation])
  const command=useCallback((name: Command, payload: Record<string, unknown> = {}): Promise<unknown> => {
    const independent=['app.exportDiagnostics','app.feedback','app.rendererFault','app.reloadUI','imports.refresh','imports.cancel','report.get','report.cancel','preferences.retry','library.storage','export.describe','app.diagnostics'].includes(name)
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
  },[accept])
  useEffect(()=>{if(modal==='settings')void command('record.capacity').catch(()=>{})},[modal,state.recordDirectory,state.deviceId,command])
  useEffect(()=>{
    if(modal!=='export'||!exportSource)return
    let active=true;setExportDescription(null);setExportInfoError('')
    const {range,...source}=exportSource;void range
    command('export.describe',source).then(result=>{if(active)setExportDescription(result as ExportDescription)}).catch(error=>{if(active)setExportInfoError(userError(error))})
    return()=>{active=false}
  },[modal,exportSource,command])
  const openExport=useCallback((source:ExportSource)=>{setExportSource({takeId:source.takeId,role:source.role,...(source.regionId?{regionId:source.regionId}:{}),...(source.exportId?{exportId:source.exportId}:{}),...(source.range?{range:source.range}:{})});setModal('export')},[])
  const workspace=useWorkspace(state.workspace,next=>command('workspace.configure',{workspace:next}))
  useEffect(() => {
    const unstate = window.trace.onState(accept)
    const unsnapshot = window.trace.onSnapshot(next => {if(presentation.accept(next,current.current)&&current.current.windowVisible!==false)publishSnapshot(next)})
    command('state.get').then(() => command('devices.list')).then(result => setDevices(result as Device[])).catch(() => {})
    const visible=()=>{if(!document.hidden&&current.current.windowVisible!==false){setState(current.current);if(presentation.snapshot)publishSnapshot({...presentation.snapshot})}}
    document.addEventListener('visibilitychange',visible)
    return () => {document.removeEventListener('visibilitychange',visible); unstate(); unsnapshot(); latest.current.clear(); presentation.cancel() }
  }, [accept,command,presentation])
  useEffect(()=>{
    if(!modal)return
    const trigger=document.activeElement as HTMLElement|null
    const id=setTimeout(()=>{
      const dialog=document.querySelector('.trace-modal')
      const target=dialog?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled):not([aria-label^="关闭"])')||dialog?.querySelector<HTMLElement>('button:not(:disabled)')
      target?.focus()
    },0)
    return()=>{clearTimeout(id);if(trigger?.isConnected)trigger.focus()}
  },[modal])
  const queueLatest=useCallback((key:string,name:Command,payload:Record<string,unknown>):void=>{
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
  },[command,presentation])
  const changeDisplay=useCallback((key:'gain'|'seconds',value:number):void=>{
    setDisplayDraft(previous=>({...previous,[key]:value}))
    queueLatest(key,key==='gain'?'view.gain':'view.window',key==='gain'?{gain:value}:{seconds:value})
  },[queueLatest])
  const changeWindow=useCallback((payload:Record<string,unknown>):void=>{
    setWindowDraft({id:payload.playbackId as string,startFrame:payload.startFrame as string,endFrame:payload.endFrame as string})
    queueLatest('window','playback.window',payload)
  },[queueLatest])
  const run = useCallback((name: Command, payload?: Record<string, unknown>): void => {
    if(name==='playback.window'&&payload){changeWindow(payload);return}
    if(['reference.activate','file.open','file.close','view.live','playback.seek','playback.follow'].includes(name)){latest.current.delete('window');setWindowDraft(null)}
    if(['reference.activate','file.open','file.close','view.live','record.start','playback.retryAnalysis','playback.clearSelection'].includes(name)){latest.current.delete('inspect');latest.current.delete('seek');presentation.cancel()}
     if(name==='view.live')setRecordWindow({mode:'follow',start:'0',end:'0'})
     command(name, payload).then(()=>{if(name==='file.open')setModal(null)}).catch(() => {})
  },[changeWindow,command,presentation])
  useEffect(()=>{
    if(modal!=='files')return
    const refresh=()=>{void command('imports.refresh').catch(()=>{});if(!current.current.currentRecord&&!refreshingLibrary.current){refreshingLibrary.current=true;void command('library.refresh').catch(()=>{}).finally(()=>{refreshingLibrary.current=false})}}
    refresh();const timer=setInterval(refresh,5000);window.addEventListener('focus',refresh)
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[modal,command])
  async function saveCache():Promise<void>{
    latest.current.delete('inspect');latest.current.delete('seek');presentation.cancel()
    try{
      if(!current.current.playback)await command('live.replay')
      const file=current.current.playback;if(!file?.temporary)return
      const result=await command('cache.save',{playbackId:file.id,useSelection:Boolean(file.selection)}) as {takeId?:string}|null
      if(result?.takeId)trackSavedRecord(result.takeId)
    }catch{}
  }
  const togglePlayback=useCallback(():void=>{
    const s=current.current,f=s.playback
    if(s.currentRecord)return
    if(!f&&Number(presentation.snapshot?.diagnostics.replayFrames||0)<=0)return
    if(f)run(f.outputReady?'playback.pause':'playback.play',{playbackId:f.id})
    else void command('live.replay').then(()=>command('playback.play',{playbackId:current.current.playback!.id})).catch(()=>{})
  },[command,presentation,run])
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
        if(event.code==='Home'||event.code==='End'){event.preventDefault();run('playback.seek',{playbackId:file.id,positionFrame:event.code==='End'?file.totalFrames:'0',resume:false})}
        else if(event.code==='Escape'){event.preventDefault();run('playback.pause',{playbackId:file.id})}
      }
    }
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[run,togglePlayback,changeWindow])

  const file=state.playback&&windowDraft?.id===state.playback.id?{...state.playback,startFrame:windowDraft.startFrame,endFrame:windowDraft.endFrame,follow:false}:state.playback
  useEffect(()=>setRecordWindow({mode:'all',start:'0',end:'0'}),[state.currentRecord?.id])
  const selected = devices.find(d => d.id === state.deviceId)
  const viewInputs=useMemo<ViewInputs>(()=>({state,devices,windowDraft,recordWindow,seconds}),[state,devices,windowDraft,recordWindow,seconds])
  const chrome=useChromeFlags(viewInputs)
  const isRecording=Boolean(state.currentRecord)||chrome.recordBusy
  const finalizing=chrome.finalizing
  const format=chrome.format
  const sourceError=chrome.error||null
  const snapshotFailure=state.error?.startsWith('RECORD_SNAPSHOT_FAILED:')
  const multiRegion=(state.currentRecord?.regionCount||0)>1
  const history=Boolean(file?.temporary)
  const isVisible=useCallback(()=>current.current.windowVisible!==false,[])
  const inspectAt=useCallback((source:MeterSnapshot|null,positionFrame:string,selectionEndFrame?:string):void=>{
    if(!source)return
    if(source.sourceKind==='file'){
      if(selectionEndFrame)run('playback.selection',{playbackId:source.sourceId,startFrame:positionFrame,endFrame:selectionEndFrame,loop:current.current.playback?.loop||false})
      else{latest.current.delete('window');setWindowDraft(null);queueLatest('seek','playback.seek',{playbackId:source.sourceId,positionFrame,resume:false})}
    }else{
      const axis=source.timelineWindow;if(!axis)return
      queueLatest('inspect','view.inspect',{sourceKind:source.sourceKind,sourceId:source.sourceId,epochId:source.epochId,measurementEpoch:source.measurementEpoch,positionFrame,...axis,...(selectionEndFrame?{selectionEndFrame}:{})})
    }
  },[queueLatest,run])
  const targets=state.targetSettings||defaultTargetSettings
  const displaySettings=state.displaySettings||defaultDisplaySettings
  const wholeSummary=file&&!file.temporary&&file.analysisPhase==='ready'?state.analysisJobs?.find(j=>j.id===file.analysisId&&j.phase==='ready')?.summary??null:null
  const spectrogramSettings=state.spectrogramSettings||defaultSpectrogramSettings
  const configureSpectrogram=useCallback((settings:import('../spectrogramProtocol').SpectrogramSettings)=>queueLatest('spectrogramSettings','spectrogram.configure',{settings}),[queueLatest])
  const instrumentSettings=state.instrumentSettings||defaultInstrumentSettings
  const configureInstruments=useCallback((settings:InstrumentSettings)=>queueLatest('instrumentSettings','instrument.configure',{settings}),[queueLatest])
  const openTargets=useCallback(()=>setModal('targets'),[])
  const openDisplay=useCallback(()=>setModal('display'),[])
  const openFiles=useCallback(()=>setModal('files'),[])
  const timelineJob=file?state.analysisJobs?.find(j=>j.id===file.analysisId):undefined
  const contents=useMemo(()=>({
    comparison:<ReferencePanel value={state.reference} settings={instrumentSettings} recording={isRecording} file={file} request={command} choose={openFiles}/>,
    spectrogram:<TimelineInstrument inputs={viewInputs} kind="spectrogram" settings={spectrogramSettings} change={configureSpectrogram} isVisible={isVisible} traces={workspace.value.layout.options.historyTraces} file={file} job={timelineJob} busy={busy} isRecording={isRecording} gain={gain} selectionMode={selectionMode} onSelectionMode={setSelectionMode} target={displaySettings} targets={targets} inspectAt={inspectAt} changeWindow={changeWindow} changeDisplay={changeDisplay} setRecordWindow={setRecordWindow} run={run}/>,
    spectrum:<SpectrumInstrument inputs={viewInputs} settings={instrumentSettings} change={configureInstruments}/>,
    soundfield:<SoundFieldInstrument inputs={viewInputs} settings={instrumentSettings} change={configureInstruments}/>,
    levels:<LevelsInstrument inputs={viewInputs} readout={workspace.value.layout.options.levelReadout}/>,
    waveform:<TimelineInstrument inputs={viewInputs} kind="waveform" settings={spectrogramSettings} change={configureSpectrogram} isVisible={isVisible} traces={workspace.value.layout.options.historyTraces} file={file} job={timelineJob} busy={busy} isRecording={isRecording} gain={gain} selectionMode={selectionMode} onSelectionMode={setSelectionMode} target={displaySettings} targets={targets} inspectAt={inspectAt} changeWindow={changeWindow} changeDisplay={changeDisplay} setRecordWindow={setRecordWindow} run={run}/>,
    history:<TimelineInstrument inputs={viewInputs} kind="history" settings={spectrogramSettings} change={configureSpectrogram} isVisible={isVisible} traces={workspace.value.layout.options.historyTraces} file={file} job={timelineJob} busy={busy} isRecording={isRecording} gain={gain} selectionMode={selectionMode} onSelectionMode={setSelectionMode} target={displaySettings} targets={targets} inspectAt={inspectAt} changeWindow={changeWindow} changeDisplay={changeDisplay} setRecordWindow={setRecordWindow} run={run}/>,
    loudness:<LoudnessInstrument inputs={viewInputs} history={history} file={file} isRecording={isRecording} multiRegion={multiRegion}/>
  }),[viewInputs,state.reference,instrumentSettings,isRecording,file,command,openFiles,spectrogramSettings,configureSpectrogram,isVisible,workspace.value.layout.options.historyTraces,workspace.value.layout.options.levelReadout,timelineJob,busy,gain,selectionMode,displaySettings,targets,inspectAt,changeWindow,changeDisplay,run,history,multiRegion,configureInstruments])
  const settingsContent=useMemo(()=>({
    spectrogram:<SpectrogramSettingsForm value={spectrogramSettings} apply={configureSpectrogram}/>,
    spectrum:<AnalysisSettings kind="spectrum" value={instrumentSettings} apply={configureInstruments}/>,
    soundfield:<AnalysisSettings kind="soundfield" value={instrumentSettings} apply={configureInstruments}/>
  }),[spectrogramSettings,configureSpectrogram,instrumentSettings,configureInstruments])
  return <main className="trace-app" onDragOver={e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}}} onDrop={e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();const files=Array.from(e.dataTransfer.files);void window.trace.importFiles(files).then(result=>{setMessage(result.errors.map(e=>e.name+'：'+userError(e.message)).join('；'));setModal('files')}).catch(error=>setMessage(userError(error)))}}>
    <header className="topbar">
      <BrandLockup/>
      <div className="top-status"><span className={'live-badge '+(isRecording?'is-rec':state.active?'is-live':'')}><i />{isRecording?'REC':state.active?'采集中':'待机'}</span><span className="preview-badge">开发预览</span><button className="header-settings" aria-label="测量目标" aria-pressed={targets.enabled} onClick={openTargets}>目标</button><button className="header-settings" aria-label="显示与帮助" onClick={openDisplay}>显示与帮助</button></div>
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

    {state.support?.previousInterrupted&&!dismissedRecovery&&<div className="error-banner" role="status"><strong>上次未正常退出</strong><span>请检查录音与恢复状态；可在帮助中导出诊断。</span><button onClick={()=>{setLibraryAttention(true);setModal('files');setDismissedRecovery(true)}}>查看音频文件</button><button onClick={()=>setDismissedRecovery(true)}>关闭提示</button></div>}
    <div className="workbench-heading"><WorkbenchSourceBar inputs={viewInputs} file={file} busy={busy} run={run} inspectAt={inspectAt} changeWindow={changeWindow} changeDisplay={changeDisplay} setRecordWindow={setRecordWindow} isRecording={isRecording}/><WorkspaceToolbar value={workspace.value} change={workspace.change} error={workspace.error} retry={workspace.retry}/></div>
    {!workspace.value.locked&&<div className="layout-edit-hint" role="status"><span>拖动标题移动仪器 · 拖动分隔线调整大小</span><span>也可在仪器设置中选择“移动仪器”</span></div>}
    <TargetStripContainer inputs={viewInputs} settings={targets} wholeSummary={wholeSummary} file={file} isRecording={isRecording} multiRegion={multiRegion} configure={openTargets}/>
    <WorkspaceFrame inputs={viewInputs} file={file}>
      <TimelinePreviewProvider><InstrumentWorkspace value={workspace.value} change={workspace.change} settingsContent={settingsContent} contents={contents}/></TimelinePreviewProvider>
    </WorkspaceFrame>
    <SelectionStatsRow inputs={viewInputs} file={file} hidden={workspace.value.layout.hidden.includes('comparison')}/>
    {state.preferencesError&&<div className="error-banner" role="status"><strong>设置未保存</strong><span>设置文件暂时被占用或无法写入；已保留上次保存的配置。</span><button onClick={()=>void command('preferences.retry').catch(()=>{})}>重试保存</button></div>}
    {(sourceError || file?.error || message) && <div className="error-banner" role="alert"><strong>需要处理</strong><span>{file?.error?(file.error.startsWith('FILE_SNAPSHOT_FAILED:')?userError(file.error):'回听输出不可用；历史数据仍可查看。'):snapshotFailure ? '录音数据更新失败，已停止本次录音并保留已写入的文件。请重新连接后重试。' : sourceError ? '声音来源暂不可用，请重试或选择其他设备。' : userError(message)}</span>{file&&!file.temporary&&(file.error?.startsWith('FILE_SNAPSHOT_FAILED:')||['failed','cancelled'].includes(file.analysisPhase))&&<button disabled={busy||isRecording} onClick={()=>run('playback.retryAnalysis',{playbackId:file.id})}>重新分析</button>}<button disabled={busy} onClick={()=>{setLibraryAttention(true);setModal('files')}}>查看文件</button><button disabled={busy} onClick={()=>command('app.copyDiagnostics').then(()=>setCopied(true)).catch(()=>{})}>{copied?'已复制诊断':'复制诊断'}</button>{file?.error&&!file.error.startsWith('FILE_SNAPSHOT_FAILED:')&&<button disabled={busy||isRecording} onClick={()=>run('playback.play',{playbackId:file.id})}>重试回听</button>}{sourceError && state.deviceId && !isRecording && !file?.outputReady && <button onClick={() => run('live.start', { deviceId: state.deviceId })} disabled={busy}>重新连接</button>}</div>}
    <footer className="transport">
      <div className="transport-buttons" role="group" aria-label="走带控制">
        <button className="transport-icon file-home" aria-label="起点" title="起点（Home）：定位到当前文件或缓存开头" disabled={busy||!file} onClick={()=>file&&run('playback.seek',{playbackId:file.id,positionFrame:'0',resume:false})}><TransportIcon kind="start"/></button>
        <button className="transport-icon file-end" aria-label="终点" title="终点（End）：定位到当前文件或缓存末尾" disabled={busy||!file} onClick={()=>file&&run('playback.seek',{playbackId:file.id,positionFrame:file.totalFrames,resume:false})}><TransportIcon kind="end"/></button>
        <button className="transport-icon play-button" aria-label={file?.outputReady?'暂停':'播放'} aria-pressed={Boolean(file?.outputReady)} title={file?.outputReady?'暂停（Space）':file?'播放（Space）':'播放历史缓存'} disabled={busy||isRecording||(!file&&!chrome.replayAvailable)} onClick={togglePlayback}><TransportIcon kind={file?.outputReady?'pause':'play'}/></button>
        <button className={'transport-icon record-button '+(isRecording?'is-recording':'')} aria-label={finalizing?'正在完成录音':isRecording?'结束录音':'录音'} aria-pressed={isRecording} aria-busy={finalizing} title={finalizing?'正在完成录音':isRecording?'结束录音（Escape）':'录音（R）'} disabled={busy||(!isRecording&&!state.deviceId)||finalizing} onClick={()=>run(isRecording?'record.stop':'record.start')}><TransportIcon kind={isRecording?'stop':'record'}/></button>
      </div>
      <button className="return-live live-follow" aria-pressed={!file} disabled={busy||!state.deviceId} onClick={()=>run('view.live')} title="实时：回到最新采集位置">实时</button>
      <button className="monitor-button" disabled={busy||!state.deviceId||isRecording||Boolean(file?.outputReady)} onClick={()=>state.monitoringRequested?run('live.stop'):run('live.start',{deviceId:state.deviceId})}>{state.monitoringRequested?'停止监测':'开始监测'}</button>
      <div className="transport-divider"/>
      <TransportElapsed inputs={viewInputs} isRecording={isRecording} file={file}/>
      <div className="transport-spacer"/>
      <label className="monitor-gain">音量<input aria-label="文件回听音量" type="range" min="0" max="1" step=".01" value={file?.gain??1} disabled={!file||busy} onChange={e=>file&&run('playback.volume',{playbackId:file.id,gain:Number(e.target.value)})}/><span>{Math.round((file?.gain??1)*100)}%</span></label>
      <button className="file-export-button" disabled={busy||isRecording||(!file&&!chrome.replayAvailable)} title={file&&!file.temporary?'导出当前文件或选区':'将'+(file?.selection?'选区':'最近缓存')+'按录音设置保存为独立文件'} onClick={()=>file&&!file.temporary?openExport({takeId:file.takeId,role:file.role,regionId:file.regionId,exportId:file.exportId,...(file.selection?{range:file.selection}:{})}):void saveCache()}>{file&&!file.temporary?'导出':'保存缓存'}</button>
      <button className="report-button" title="测量报告与超限事件" onClick={()=>setModal('reports')}>报告</button>
      <button data-open-files className="files-button" onClick={()=>{setLibraryAttention(false);setModal('files')}}>音频文件 {(state.recordings?.length||0)+(state.imports?.length||0)}</button>
      <button className="reset-button" disabled={busy||!state.active||isRecording||Boolean(file)} onClick={()=>run('live.reset')} title="重新开始本轮响度统计"><Icon name="reset"/></button>
    </footer>

    <ContinuityBar inputs={viewInputs}/>

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
        {modal==='reports'?<ReportPanel file={file} targets={targets} jobs={state.reportJobs||[]} recording={isRecording} request={command} onNavigate={()=>{presentation.cancel();setModal(null)}}/>:modal==='targets'?<TargetSettingsForm value={targets} apply={settings=>command('targets.configure',{settings}).then(()=>setModal(null))}/>:modal==='display'?<DisplaySettingsForm support={state.support} confirmExit={state.confirmExitWhileRecording!==false} theme={state.instrumentTheme||defaultThemeId} request={command} value={{...displaySettings,waveGain:gain}} busy={busy} apply={(value,confirmExitWhileRecording,theme)=>command('view.settings',value).then(()=>command('view.theme',{theme})).then(()=>command('app.configure',{confirmExitWhileRecording})).then(()=>setModal(null)).catch(()=>{})}/>:modal==='settings'?<RecordSettingsForm value={draft} change={setDraft} busy={busy||isRecording} directoryBusy={Boolean(state.exportJobs?.some(j=>!['ready','failed','cancelled'].includes(j.phase)))} sourceRate={format?.sampleRate} sourceChannels={format?.channelCount} capacity={state.recordingCapacity?.directory===state.recordDirectory?state.recordingCapacity:undefined} directory={state.recordDirectory} chooseDirectory={()=>run('record.chooseDirectory')} apply={()=>command('record.configure',draft).then(()=>setModal(null)).catch(()=>{})}/>:modal==='export'&&exportSource?exportDescription?<ExportDialog source={exportSource} description={exportDescription} saved={state.lastExportPreset} saveCopyDefault={state.lastExportSaveCopy===true} remember={preset=>queueLatest('exportPrefs','export.configure',{...preset})} busy={busy} submit={(preset,selection,saveCopy)=>command('export.start',{...exportSource,range:selection?exportSource.range:undefined,preset,saveCopy}).then(data=>{const result=data as {jobId?:string}|null;if(result?.jobId){trackExport(result.jobId);setModal(null)}}).catch(()=>{})}/>:<div className="settings-content" role="status">{exportInfoError||'正在读取文件信息…'}{exportInfoError&&<button onClick={()=>setExportSource({...exportSource})}>重试</button>}</div>:<RecordingLibrary initialStatus={libraryAttention?'attention':'all'} state={state} busy={busy} run={run} request={command} onExport={openExport}/>}

      </section>
    </div>}
  </main>
}
