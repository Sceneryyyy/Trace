import {isAbsolute,relative,sep} from 'node:path'
import {validateTakeName} from './naming'
import type {AssetFormat} from './assetFormat'
import {validateExportPreset} from './mediaTypes'
import type {ExportPreset,DecodeRecipe} from './mediaTypes'
export type ExportDescription={label:string;frames:string;sampleRate:number;assetFormat?:AssetFormat}
export type ExportPhase='queued'|'hashing'|'normalizing'|'encoding'|'decoding'|'verifying'|'ready'|'failed'|'cancelled'
export type ExportSourceRole='source'|'deliverable'|'recovered'|'session'|'export'
export type ExportSource={takeId:string;role:ExportSourceRole;regionId?:string;exportId?:string;range?:{startFrame:string;endFrame:string}}
export type StoredMediaFile={file:string;frames:string;sha256:string;clippedSamples?:string}
export type ExportResult={
 version:1;directory:string;codec:string;container:string;sampleRate:number;channelCount:number;frames:string;actualBitrate?:number
 files:StoredMediaFile[];decoded:StoredMediaFile[];recipe:DecodeRecipe;mediaIdentity:string;encoderSha256:string;sourceSha256:string[]
}
export type ExportDelivery={phase:'pending'|'copying'|'ready'|'failed';directory:string;name:string;targetPath?:string;multiple?:boolean;error:string|null}
export type ExportRecord={
 delivery?:ExportDelivery;
 version:1;id:string;createdAt:string;source:ExportSource;preset:ExportPreset;automatic:boolean;phase:ExportPhase;fraction:number;error:string|null;result?:ExportResult
}
export type ExportView=Pick<ExportRecord,'id'|'createdAt'|'preset'|'automatic'|'phase'|'fraction'|'error'>&{
 delivery?:ExportDelivery;availability?:'present'|'missing'|'unavailable';takeId:string;label:string;range?:{startFrame:string;endFrame:string};frames?:string;sampleRate?:number;channelCount?:number;actualBitrate?:number
}
const u64=(v:unknown):v is string=>typeof v==='string'&&/^[0-9]{1,20}$/.test(v)&&BigInt(v)<=0xffffffffffffffffn
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v)
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
export function validateExportRecord(value:unknown):ExportRecord{
 const v=value as ExportRecord
 if(!v||v.version!==1||!id(v.id)||!Number.isFinite(Date.parse(v.createdAt))||!v.source||typeof v.source.takeId!=='string'||
  !['source','deliverable','recovered','session','export'].includes(v.source.role)||typeof v.automatic!=='boolean'||!Number.isFinite(v.fraction)||v.fraction<0||v.fraction>1||(v.error!==null&&typeof v.error!=='string')||
  !['queued','hashing','normalizing','encoding','decoding','verifying','ready','failed','cancelled'].includes(v.phase))throw Error('INVALID_EXPORT_RECORD')
 validateExportPreset(v.preset)
 if(v.delivery){const d=v.delivery
  if(!['pending','copying','ready','failed'].includes(d.phase)||typeof d.directory!=='string'||!isAbsolute(d.directory)||d.directory.includes('\0')||d.directory.length>32767||(d.error!==null&&typeof d.error!=='string'))throw Error('INVALID_EXPORT_DELIVERY')
  validateTakeName(d.name)
  if(d.targetPath!==undefined){if(typeof d.targetPath!=='string'||!isAbsolute(d.targetPath)||d.targetPath.includes('\0')||(relative(d.directory,d.targetPath)==='..'||relative(d.directory,d.targetPath).startsWith('..'+sep))||isAbsolute(relative(d.directory,d.targetPath)))throw Error('INVALID_EXPORT_DELIVERY')}
  if(d.multiple!==undefined&&typeof d.multiple!=='boolean')throw Error('INVALID_EXPORT_DELIVERY')
 }
 if(v.source.range&&(!u64(v.source.range.startFrame)||!u64(v.source.range.endFrame)||BigInt(v.source.range.endFrame)<=BigInt(v.source.range.startFrame)))throw Error('INVALID_EXPORT_RANGE')
 if(v.source.role==='export'&&!id(v.source.exportId))throw Error('INVALID_EXPORT_SOURCE')
 if(v.result){
  const r=v.result
  if(r.version!==1||r.directory!=='exports/'+v.id||!['wav','mp3','m4a','adts'].includes(r.container)||!['pcm_s16le','pcm_s24le','pcm_f32le','mp3','aac'].includes(r.codec)||
   ![44100,48000,88200,96000].includes(r.sampleRate)||![1,2].includes(r.channelCount)||!u64(r.frames)||!hash(r.mediaIdentity)||!hash(r.encoderSha256)||
   !Array.isArray(r.sourceSha256)||!r.sourceSha256.every(hash)||!Array.isArray(r.files)||!r.files.length||r.files.length>10000||!Array.isArray(r.decoded)||!r.decoded.length||r.decoded.length>10000)throw Error('INVALID_EXPORT_RESULT')
  for(const f of [...r.files,...r.decoded])if(!/^(media-[0-9]+|decoded-(?:[a-f0-9]{8}-)?[0-9]+)\.(wav|mp3|m4a|aac)$/.test(f.file)||!u64(f.frames)||!hash(f.sha256))throw Error('INVALID_EXPORT_FILE')
  const p=r.recipe
  if(!p||p.version!==1||![p.startFrame,p.frames,p.physicalFrames,p.encoderDelayFrames,p.endPaddingFrames].every(u64)||p.frames!==r.frames||
   BigInt(p.startFrame)+BigInt(p.frames)+BigInt(p.endPaddingFrames)!==BigInt(p.physicalFrames)||typeof p.containerTrimmed!=='boolean'||
   r.decoded.reduce((n,f)=>n+BigInt(f.frames),0n)!==BigInt(p.physicalFrames)||r.files.reduce((n,f)=>n+BigInt(f.frames),0n)!==BigInt(r.frames))throw Error('INVALID_DECODE_RECIPE')
 }
 if(v.phase==='ready'&&!v.result)throw Error('EXPORT_RESULT_MISSING')
 return v
}

export function exportView(record:ExportRecord,takeId:string,label:string):ExportView{return {delivery:record.delivery,id:record.id,takeId,label,preset:record.preset,createdAt:record.createdAt,automatic:record.automatic,phase:record.phase,fraction:record.fraction,error:record.error,range:record.source.range,frames:record.result?.frames,sampleRate:record.result?.sampleRate,channelCount:record.result?.channelCount,actualBitrate:record.result?.actualBitrate}}
