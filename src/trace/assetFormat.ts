import type {WavEncoding} from './mediaTypes'

/** File metadata, never the float PCM representation used by the playback engine. */
export type AssetFormat={format:'wav'|'mp3'|'aac';sampleRate:number;channelCount:number;encoding?:WavEncoding;container?:string;bitrate?:number}
export function assetFormatLabel(value?:AssetFormat):string{
 if(!value)return ''
 const kind=value.format==='aac'?'AAC '+(value.container||'').toUpperCase():value.format.toUpperCase()
 const precision=value.encoding==='float32'?'32-bit float':value.encoding==='pcm24'?'24-bit PCM':value.encoding==='pcm16'?'16-bit PCM':value.bitrate?value.bitrate+' kbps':''
 return [kind.trim(),value.sampleRate/1000+' kHz',value.channelCount===1?'单声道':'双声道',precision].filter(Boolean).join(' · ')
}
