export type WavEncoding='pcm16'|'pcm24'|'float32'
export type ExportPreset=
 {format:'wav';sampleRate:44100|48000|88200|96000;encoding:WavEncoding}|
 {format:'mp3';sampleRate:44100|48000;bitrate:128|192|256|320}|
 {format:'aac';container:'m4a'|'adts';sampleRate:44100|48000;bitrate:128|192|256}
export function validateExportPreset(value:unknown):ExportPreset{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_EXPORT_PRESET')
 const v=value as Record<string,unknown>,keys=Object.keys(v).sort().join(',')
 if(v.format==='wav'){
  if(keys!=='encoding,format,sampleRate'||![44100,48000,88200,96000].includes(v.sampleRate as number)||!['pcm16','pcm24','float32'].includes(v.encoding as string))throw Error('INVALID_WAV_EXPORT_PRESET')
 }else if(v.format==='mp3'){
  if(keys!=='bitrate,format,sampleRate'||![44100,48000].includes(v.sampleRate as number)||![128,192,256,320].includes(v.bitrate as number))throw Error('INVALID_MP3_EXPORT_PRESET')
 }else if(v.format==='aac'){
  if(keys!=='bitrate,container,format,sampleRate'||!['m4a','adts'].includes(v.container as string)||![44100,48000].includes(v.sampleRate as number)||![128,192,256].includes(v.bitrate as number))throw Error('INVALID_AAC_EXPORT_PRESET')
 }else throw Error('INVALID_EXPORT_FORMAT')
 return {...v} as ExportPreset
}
export type MediaTools={ffmpeg:string;ffprobe:string;nativePath:string;ffmpegSha256:string;ffprobeSha256:string}
export type MediaInput={sources:string[];sampleRate:number;channelCount:number;frames:string;origin?:string;range?:{startFrame:string;endFrame:string}}
export type MediaProgress={phase:'hashing'|'normalizing'|'encoding'|'decoding'|'verifying';fraction:number}
export type MediaFile={path:string;frames:string;sha256:string;clippedSamples?:string}
export type DecodeRecipe={version:1;startFrame:string;frames:string;physicalFrames:string;encoderDelayFrames:string;endPaddingFrames:string;containerTrimmed:boolean}
export type EncodedMedia={
 files:MediaFile[];decoded:MediaFile[];preset:ExportPreset;sampleRate:number;channelCount:number;frames:string;sourceSha256:string[];encoderSha256:string
 codec:string;container:string;actualBitrate?:number;decodeRecipe:DecodeRecipe
}
