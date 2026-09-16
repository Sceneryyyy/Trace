import type {RecordingCapacity} from './storageCapacity'
import type {AssetFormat} from './assetFormat'
import type {DisplaySettings} from './displaySettings'
import type {ExportPreset,WavEncoding} from './mediaTypes'
import type {ExportView} from './exportTypes'
export type Metric = { value: number | null; unit: 'dBFS' | 'dBTP' | 'LUFS' | 'LU'; status: 'ready' | 'silence' | 'insufficient' | 'gap' | 'error' }
export type SourceFormat = { sampleRate: number; channelCount: number; containerBits: number; validBits: number; encoding: 'ieee-float' | 'pcm-int'; channelMask: number; blockAlign: number }
export type Device = { id: string; label: string; isDefault: boolean; supported: boolean; format: SourceFormat | null; error: string | null }
export type WavePoint = { frame: string; min: number[]; max: number[]; flags: number }
export type LoudnessPoint = { frame: string; m: Metric; s: Metric; i: Metric; flags: number }
export type NativeMeterSnapshot = {
  protocolVersion: 1; sourceKind: 'live' | 'take' | 'file'; sourceId: string; epochId: string; measurementEpoch: string
  active: boolean; error: string | null; format: SourceFormat; measurementConfigId: string
  positionFrame: string; measurementFrames: string; levelIndexFrame: string; loudnessIndexFrame: string
  continuity: 'complete' | 'estimated-silence' | 'gaps' | 'unknown'
  channels: { samplePeak: Metric; rms: Metric; truePeak: Metric }[]
  momentary: Metric; shortTerm: Metric; integratedToCursor: Metric; loudnessRange: Metric; maxTruePeak: Metric; lraProvisional: boolean
  waveform: WavePoint[]; loudnessHistory: LoudnessPoint[]
  diagnostics: Record<string, string | number | boolean>
}
import type {InstrumentSettings,InstrumentPacket} from './instrumentTypes'
import type {SpectrogramSettings,SpectrogramPacket} from './spectrogramProtocol'
export type MeterSnapshot = NativeMeterSnapshot & {instruments?:InstrumentPacket; eventSequence: number; stateRevision: number; recording?: NativeRecordSnapshot;recordingView?:RecordingView;timelineAvailableRange?:{startFrame:string;endFrame:string};timelineRate?:number;timelineWindow?:{startFrame:string;endFrame:string};playback?:NativePlaybackSnapshot;fileView?:FileView }
import type {WorkspaceState} from './workspace'
export type TraceState = {spectrogramSettings?:SpectrogramSettings;windowVisible?:boolean;instrumentSettings?:InstrumentSettings;workspace?:WorkspaceState;lastExportSaveCopy?:boolean;confirmExitWhileRecording?:boolean;recordDirectoryError?:string|null;lastExportPreset?:ExportPreset;recordingCapacity?:RecordingCapacity; monitoringRequested?:boolean; displaySettings?:DisplaySettings;exportJobs?:ExportView[];playback?:PlaybackView|null;revision: number; eventSequence?:number; analysisJobs?:AnalysisJobView[]; active: boolean; deviceId: string; windowSeconds: number; error: string | null; recordSettings?: RecordSettings; recordDirectory?: string; currentRecord?: {id:string;phase:string;durationNs?:string;regionCount?:number;retryError?:string|null}|null; recordings?:TakeSummary[] }
export type Command = 'spectrogram.configure' | 'spectrogram.query' | 'spectrogram.point' | 'spectrogram.cancel' | 'test.window' | 'instrument.configure' | 'workspace.configure' | 'cache.save' | 'export.openDeliveryFolder' | 'app.configure' | 'app.diagnostics' | 'app.copyDiagnostics' | 'library.storage' | 'library.clearCache' | 'library.pruneMissing' | 'library.rename' | 'export.configure' | 'export.describe' | 'record.capacity' | 'playback.clearSelection' | 'playback.retryAnalysis' | 'view.inspect' | 'view.live' | 'devices.select' | 'view.gain' | 'live.replay' | 'library.refresh' | 'library.remove' | 'app.info' | 'app.quit' | 'retention.retry' | 'view.settings' | 'export.start' | 'export.retry' | 'export.openFolder' | 'export.saveCopy' | 'file.open' | 'file.close' | 'playback.play' | 'playback.pause' | 'playback.seek' | 'playback.volume' | 'playback.selection' | 'playback.window' | 'playback.follow' | 'state.get' | 'devices.list' | 'live.start' | 'live.stop' | 'live.reset' | 'view.window' | 'record.configure' | 'record.chooseDirectory' | 'record.start' | 'record.stop' | 'record.openFolder' | 'record.recover' | 'analysis.start' | 'job.cancel' | 'metrics.query' | 'timeline.query'
export type Request = { protocolVersion: 1; requestId: string; expectedStateRevision: number; command: Command; payload: Record<string, unknown> }
export type Reply = { requestId: string; ok: boolean; state: TraceState; data?: unknown; error?: { code: string; message: string } }
export type TraceAPI = {
  onSpectrogram: (listener:(packet:SpectrogramPacket)=>void)=>()=>void
  request: (request: Request) => Promise<Reply>
  onState: (listener: (state: TraceState) => void) => () => void
  onSnapshot: (listener: (snapshot: MeterSnapshot) => void) => () => void
}
export type TraceHostAPI=Pick<TraceAPI,'request'|'onState'>
declare global { interface Window { trace: TraceAPI;traceHost:TraceHostAPI } }

export type WavRecordSettings = {format?:undefined;encoding:WavEncoding;sampleRate:'source'|44100|48000|88200|96000;namePrefix:string}
export type RecordSettings = (WavRecordSettings | (Exclude<ExportPreset,{format:'wav'}>&{namePrefix:string}))&{keepOriginal?:boolean}
export type NativeRecordSnapshot = {
  replayStartFrame?:string;replayEndFrame?:string;
  phase: 'idle' | 'preparing' | 'armed' | 'recording' | 'finalizing' | 'complete' | 'failed'
  id: string; error: string | null; sourceFormat: SourceFormat; encoding: WavEncoding
  startFrame: string | null; endFrameExclusive: string | null; startQpc100ns?:string|null;endQpc100ns?:string|null;startQpcEstimated?:boolean;endQpcEstimated?:boolean;acceptedFrames: string; writtenFrames: string
  estimatedFrames: string; clippedSamples: string; queueDepth: number; queueHighWater: number
  meters: Pick<NativeMeterSnapshot,'channels'|'momentary'|'shortTerm'|'integratedToCursor'|'loudnessRange'|'maxTruePeak'|'levelIndexFrame'|'loudnessIndexFrame'>
  segments: Array<{file: string;frames:string;bytes:string;clippedSamples?:string}>
  waveform: WavePoint[]; loudnessHistory: LoudnessPoint[]
}
export type TakeSummary = {availability?:'present'|'missing'|'unavailable';missingFiles?:number;missingRoles?:string[];retention?:{phase:string;error:string|null};preferredExportId?:string;bitrate?:number;container?:string;exports?:ExportView[];id:string;name:string;createdAt:string;status:string;frames:string;sampleRate:number;encoding:string;segmentCount:number;error:string|null;durationNs?:string;clippedSamples?:string;sourceClippedSamples?:string;mixedSampleRate?:boolean;regionCount?:number;hasDiscontinuities?:boolean;analysisRegions?:Array<{id:string;role:AnalysisRole;ordinal:number;sampleRate:number;channelCount:number;frames:string}>;roles?:AnalysisRole[]}

export type AnalysisRole='source'|'deliverable'|'recovered'|'session'|'export'
export type AnalysisJobView={selectionRange?:{startFrame:string;endFrame:string};exportId?:string;id:string;takeId:string;role:AnalysisRole;regionId?:string;label:string;phase:'queued'|'hashing'|'analyzing'|'verifying'|'ready'|'failed'|'cancelled';frames:string;totalFrames:string;error:string|null;sampleRate:number;channelCount:number;cacheKey?:string;summary?:NativeRecordSnapshot['meters']}

export type RecordingView={inspectableRange?:{startFrame:string;endFrame:string};durationNs:string;waveform:WavePoint[];loudnessHistory:LoudnessPoint[];gapFrames:string[];channelCount:number}

export type NativePlaybackSnapshot={
 id:string;deviceId:string;phase:string;error:string|null;format:SourceFormat;generation:string;positionFrame:string;totalFrames:string
 presentedStreamFrames:string;submittedFrames:string;clockPosition:string;clockFrequency:string;clockQpc100ns:string
 loopStart:string;loopEnd:string;loops:string;outputRate:number;outputChannels:number;bufferFrames:number;paddingFrames:number;queueDepth:number;queueHighWater:number
 playing:boolean;loop:boolean;clockAccurate:boolean;rawModeApplied:boolean
}
export type PlaybackView={
 assetFormat?:AssetFormat;analysisError?:string|null;
 timeOffsetSeconds?:number;outputReady?:boolean;temporary?:boolean;
 id:string;takeId:string;role:AnalysisRole;regionId?:string;exportId?:string;label:string;phase:string;error:string|null;positionFrame:string;totalFrames:string
 sampleRate:number;channelCount:number;generation:string;analysisId:string;analysisPhase:string;selectionAnalysis?:AnalysisJobView;gain:number;loop:boolean;follow:boolean
 selection:{startFrame:string;endFrame:string}|null;startFrame:string;endFrame:string
}
export type FileView={
 analysisError?:string|null;
 timeOffsetSeconds?:number;outputReady?:boolean;temporary?:boolean;
 totalFrames:string;startFrame:string;endFrame:string;selection:{startFrame:string;endFrame:string}|null
 analysisId:string;analysisPhase:string;playingIntent:boolean;selectionAnalysis?:AnalysisJobView;wholeFileIntegrated:Metric
}
