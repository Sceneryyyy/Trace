import {recordingEncoding} from './recordSettings'
import type {RecordSettings} from './shared'
export type RecordingCapacity={directory?:string;freeBytes:string|null;reserveBytes:string;bytesPerSecond:number;estimatedSeconds:number|null}
export function recordingCapacity(freeBytes:bigint|null,settings:RecordSettings,sourceRate:number,channels:number):RecordingCapacity{
 const rate=sourceRate>0?sourceRate:48000,count=channels===1?1:2
 const bytes={pcm16:2,pcm24:3,float32:4}[recordingEncoding(settings,rate)]
 const outputRate=settings.sampleRate==='source'?rate:settings.sampleRate
 const conversion=Boolean(settings.format)||outputRate!==rate
 const output=settings.format?settings.bitrate*1000/8:outputRate*count*{pcm16:2,pcm24:3,float32:4}[settings.encoding]
 // Include source, conversion workspace, decoded playback cache and an analysis allowance.
 const bytesPerSecond=rate*count*bytes+(conversion?output+outputRate*count*8:0)+65536
 const reserve=512n*1024n*1024n
 const usable=freeBytes===null?null:freeBytes>reserve?freeBytes-reserve:0n
 return {freeBytes:freeBytes?.toString()??null,reserveBytes:reserve.toString(),bytesPerSecond,estimatedSeconds:usable===null?null:Math.floor(Number(usable)/bytesPerSecond)}
}
