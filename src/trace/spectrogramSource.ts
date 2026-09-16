import {createHash} from 'node:crypto'
import {join,isAbsolute} from 'node:path'
import type {InstrumentRequest,InstrumentSettings} from './instrumentTypes'
import {spectralFrame} from './spectrogramView'
import {nativeFilePath} from './nativeFilePath'
import type {AnalysisSource} from './analysisService'
import type {ReplayInfo} from './playbackService'
import type {NativeMeterSnapshot,NativeRecordSnapshot} from './shared'

export type SpectrogramConfig=Pick<InstrumentSettings,'fftSize'|'channel'>
/** Internal descriptor: paths are resolved by the main process, never supplied by renderer IPC. */
export type SpectrogramSource={
  identity:string; request:InstrumentRequest; channelCount:number
  gridOrigin:string; availableStart:string; availableEnd:string; cacheRoot?:string
}
export function spectralConfig(c:SpectrogramConfig) {
  if(!c||![512,1024,2048,4096,8192,16384].includes(c.fftSize)||!['stereo','left','right','mid','side'].includes(c.channel))throw Error('INVALID_SPECTROGRAM_CONFIG')
  return {fftSize:c.fftSize,channel:c.channel,averageMs:0,holdMs:0,fieldMs:50}
}
export function sourceKey(s:SpectrogramSource,c:SpectrogramConfig):string {
  spectralConfig(c)
  const {kind,sampleRate}=s.request
  if(!['file','live','take','replay'].includes(kind)||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000||
    ![1,2].includes(s.channelCount)||!s.identity||s.identity.length>65536||spectralFrame(s.availableEnd)<spectralFrame(s.availableStart)||
    s.cacheRoot!==undefined&&(kind!=='file'||!isAbsolute(s.cacheRoot)))throw Error('INVALID_SPECTROGRAM_SOURCE')
  spectralFrame(s.gridOrigin)
  const {positionFrame,...request}=s.request
  return createHash('sha256').update(JSON.stringify({version:'trace-spectrogram-v1',identity:s.identity,request,channels:s.channelCount,gridOrigin:s.gridOrigin,config:spectralConfig(c)})).digest('hex')
}
export function firstWindowEnd(s:SpectrogramSource,c:SpectrogramConfig):bigint {
  const n=BigInt(c.fftSize),hop=BigInt(Math.min(c.fftSize/4,Math.floor(s.request.sampleRate/50))),origin=spectralFrame(s.gridOrigin)
  return s.request.kind==='replay'?n+(hop-origin%hop)%hop:origin+n
}
export function fileSpectrogramSource(source:AnalysisSource,contentIdentity=source.mediaIdentity):SpectrogramSource {
  // A verified analysis/content key is mandatory for raw WAV sources as well as decoded assets.
  if(!contentIdentity)throw Error('SPECTROGRAM_SOURCE_IDENTITY_REQUIRED')
  if(!isAbsolute(source.cacheRoot)||!Array.isArray(source.sources)||source.sources.length<1||source.sources.length>2048||source.sources.some(p=>typeof p!=='string'||!isAbsolute(p)||p.includes('\0')))throw Error('INVALID_SPECTROGRAM_SOURCE')
  return {identity:contentIdentity,channelCount:source.channelCount,gridOrigin:'0',availableStart:'0',availableEnd:source.frames,
    cacheRoot:join(source.cacheRoot,'spectrogram'),request:{kind:'file',identity:contentIdentity,sources:source.sources.map(nativeFilePath),sampleRate:source.sampleRate,positionFrame:'0',...source.decodeRange}}
}
export function replaySpectrogramSource(info:ReplayInfo):SpectrogramSource {
  return {identity:JSON.stringify([info.sourceId,info.epochId,info.measurementEpoch,info.originFrame,info.frames]),channelCount:info.channelCount,
    gridOrigin:info.originFrame,availableStart:'0',availableEnd:info.frames,request:{kind:'replay',...info,positionFrame:'0'}}
}
export function liveSpectrogramSource(snapshot:NativeMeterSnapshot):SpectrogramSource {
  if(snapshot.error||typeof snapshot.diagnostics.replayStartFrame!=='string'||typeof snapshot.diagnostics.replayEndFrame!=='string')throw Error('SPECTROGRAM_SOURCE_UNAVAILABLE')
  const origin=spectralFrame(snapshot.positionFrame)-spectralFrame(snapshot.measurementFrames)
  if(origin<0n)throw Error('INVALID_SPECTROGRAM_ORIGIN')
  return {identity:JSON.stringify([snapshot.sourceId,snapshot.epochId,snapshot.measurementEpoch]),channelCount:snapshot.format.channelCount,
    gridOrigin:String(origin),availableStart:snapshot.diagnostics.replayStartFrame,availableEnd:snapshot.diagnostics.replayEndFrame,
    request:{kind:'live',sourceId:snapshot.sourceId,epochId:snapshot.epochId,measurementEpoch:snapshot.measurementEpoch,sampleRate:snapshot.format.sampleRate,positionFrame:'0'}}
}
export function takeSpectrogramSource(snapshot:NativeRecordSnapshot):SpectrogramSource {
  if(snapshot.error||snapshot.replayStartFrame===undefined||snapshot.replayEndFrame===undefined)throw Error('SPECTROGRAM_SOURCE_UNAVAILABLE')
  return {identity:snapshot.id,channelCount:snapshot.sourceFormat.channelCount,gridOrigin:'0',availableStart:snapshot.replayStartFrame,availableEnd:snapshot.replayEndFrame,
    request:{kind:'take',sourceId:snapshot.id,epochId:'0',measurementEpoch:'0',sampleRate:snapshot.sourceFormat.sampleRate,positionFrame:'0'}}
}
