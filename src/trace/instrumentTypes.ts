export type InstrumentSettings={version:2;smoothing:0|3|6|12|24;tilt:number;fftSize:number;averageMs:number;holdMs:number;fieldMs:number;channel:'stereo'|'left'|'right'|'mid'|'side';showCurrent:boolean;showAverage:boolean;showPeakHold:boolean;minFrequency:number;maxFrequency:number;minDecibels:number;maxDecibels:number;fieldGain:number;fieldMode:'lissajous'|'polarSample'|'polarLevel';polarDetection:'rms'|'peak'|'envelope'}
export const defaultInstrumentSettings:InstrumentSettings={version:2,smoothing:0,tilt:0,fftSize:2048,averageMs:300,holdMs:1000,fieldMs:300,channel:'stereo',showCurrent:true,showAverage:true,showPeakHold:true,minFrequency:20,maxFrequency:20000,minDecibels:-100,maxDecibels:6,fieldGain:4,fieldMode:'lissajous',polarDetection:'rms'}
export function validateInstrumentSettings(v:unknown):InstrumentSettings{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_INSTRUMENT_SETTINGS')
 const s=v as InstrumentSettings
 if(Object.keys(s).sort().join(',')!==Object.keys(defaultInstrumentSettings).sort().join(',')||s.version!==2||![0,3,6,12,24].includes(s.smoothing)||!Number.isFinite(s.tilt)||Math.abs(s.tilt)>6||![512,1024,2048,4096,8192,16384].includes(s.fftSize)||
  ![s.averageMs,s.holdMs].every(v=>Number.isInteger(v)&&v>=0&&v<=2000)||!Number.isInteger(s.fieldMs)||s.fieldMs<50||s.fieldMs>1000||
  (!Number.isFinite(s.fieldGain)||s.fieldGain<1||s.fieldGain>8)||!['stereo','left','right','mid','side'].includes(s.channel)||!['lissajous','polarSample','polarLevel'].includes(s.fieldMode)||!['rms','peak','envelope'].includes(s.polarDetection)||
  ![s.showCurrent,s.showAverage,s.showPeakHold].every(v=>typeof v==='boolean')||
  ![s.minFrequency,s.maxFrequency,s.minDecibels,s.maxDecibels].every(Number.isFinite)||s.minFrequency<1||s.maxFrequency>48000||s.maxFrequency<=s.minFrequency||s.minDecibels< -180||s.maxDecibels>24||s.maxDecibels-s.minDecibels<12)throw Error('INVALID_INSTRUMENT_SETTINGS')
 return {...s}
}
export function restoreInstrumentSettings(v:unknown):InstrumentSettings{try{
 if(v&&typeof v==='object'&&!Array.isArray(v)&&(v as {version?:number}).version===1){
  const old=v as Record<string,unknown>,keys=Object.keys(defaultInstrumentSettings).filter(k=>!['smoothing','tilt'].includes(k)).sort().join(',');if(Object.keys(old).sort().join(',')!==keys)throw Error('INVALID_INSTRUMENT_SETTINGS')
  return validateInstrumentSettings({...old,version:2,smoothing:0,tilt:0})
 }
 return validateInstrumentSettings(v)}catch{return {...defaultInstrumentSettings}}}
export function analysisOptions(s:InstrumentSettings){return {fftSize:s.fftSize,averageMs:s.averageMs,holdMs:s.holdMs,fieldMs:s.fieldMs,channel:s.channel}}
export function instrumentConfigKey(s:InstrumentSettings):string{return 'trace-spectrum-v1:'+JSON.stringify(analysisOptions(s))}
type NumberMetric={value:number|null;status:'ready'|'silence'|'insufficient'|'gap'|'error'}
export type NativeInstrumentResult={status:NumberMetric['status'];sampleRate:number;channelCount:number;positionFrame:string;windowStart:string;fftSize:number;hop:number;binHz:number;averageWindows:number;holdWindows:number;partialAverage:boolean;partialHold:boolean;current:Float64Array;average:Float64Array;peakHold:Float64Array;elapsedMs:number;field:{correlation:NumberMetric;balance:NumberMetric;firstFrame:string;endFrame:string;partial:boolean;points:Float32Array;polarRms:Float64Array;polarPeak:Float64Array;polarEnvelope:Float64Array}}
export type InstrumentPacket={configKey:string;phase:'ready'|'error';data?:NativeInstrumentResult;error?:string}
export type InstrumentRequest=Record<string,unknown>&{kind:'live'|'take'|'replay'|'file';sampleRate:number;positionFrame:string}
export type InstrumentNative={instrumentAnalyze:(request:InstrumentRequest&{config:ReturnType<typeof analysisOptions>})=>Promise<NativeInstrumentResult>}
