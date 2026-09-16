import {spectralFrame,type SpectrogramView} from './spectrogramView'
export type SpectrogramSettings={version:1;fftSize:number;channel:'stereo'|'left'|'right'|'mid'|'side';minFrequency:number;maxFrequency:number;minDecibels:number;maxDecibels:number;palette:'trace'|'heat'}
export const defaultSpectrogramSettings:SpectrogramSettings={version:1,fftSize:2048,channel:'stereo',minFrequency:20,maxFrequency:20000,minDecibels:-100,maxDecibels:0,palette:'trace'}
const plain=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v)
export function validateSpectrogramSettings(v:unknown):SpectrogramSettings {
  if(!plain(v)||Object.keys(v).sort().join(',')!==Object.keys(defaultSpectrogramSettings).sort().join(',')||v.version!==1||
    ![512,1024,2048,4096,8192,16384].includes(v.fftSize as number)||!['stereo','left','right','mid','side'].includes(v.channel as string)||
    !['trace','heat'].includes(v.palette as string)||![v.minFrequency,v.maxFrequency,v.minDecibels,v.maxDecibels].every(n=>typeof n==='number'&&Number.isFinite(n))||
    Number(v.minFrequency)<1||Number(v.maxFrequency)>48000||Number(v.maxFrequency)<=Number(v.minFrequency)||Number(v.minDecibels)<-180||Number(v.maxDecibels)>24||Number(v.maxDecibels)-Number(v.minDecibels)<12)throw Error('INVALID_SPECTROGRAM_SETTINGS')
  return {...v} as SpectrogramSettings
}
export function restoreSpectrogramSettings(v:unknown):SpectrogramSettings {try{return validateSpectrogramSettings(v)}catch{return {...defaultSpectrogramSettings}}}
export type SpectrogramSourceRef={kind:'live'|'take'|'file';sourceId:string;epochId:string;measurementEpoch:string}
export type SpectrogramQuery={source:SpectrogramSourceRef;range:{startFrame:string;endFrame:string;width:number;height:number}}
export type SpectrogramPacket={requestId:string;phase:'partial'|'ready'|'error';source:SpectrogramSourceRef;axisStartFrame?:string;axisEndFrame?:string;view?:SpectrogramView;error?:string}
export function validateSpectrogramQuery(v:unknown):SpectrogramQuery {
  if(!plain(v)||Object.keys(v).sort().join(',')!=='range,source'||!plain(v.source)||!plain(v.range))throw Error('INVALID_SPECTROGRAM_QUERY')
  const s=v.source,r=v.range
  if(Object.keys(s).sort().join(',')!=='epochId,kind,measurementEpoch,sourceId'||!['file','live','take'].includes(s.kind as string)||typeof s.sourceId!=='string'||!s.sourceId||s.sourceId.length>1024||s.sourceId.includes('\0')||
    Object.keys(r).sort().join(',')!=='endFrame,height,startFrame,width'||!Number.isInteger(r.width)||Number(r.width)<1||Number(r.width)>1024||!Number.isInteger(r.height)||Number(r.height)<1||Number(r.height)>512)throw Error('INVALID_SPECTROGRAM_QUERY')
  spectralFrame(s.epochId as string);spectralFrame(s.measurementEpoch as string)
  if(spectralFrame(r.endFrame as string)<=spectralFrame(r.startFrame as string))throw Error('INVALID_SPECTROGRAM_QUERY')
  return structuredClone(v) as SpectrogramQuery
}
