import { mkdir, readFile, writeFile, rename, appendFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { SessionTimeline, u64 } from './sessionTimeline'
import {validateExportRecord} from './exportTypes'
import type {ExportRecord} from './exportTypes'
import type {WavEncoding} from './mediaTypes'
import {recordingEncoding} from './recordSettings'
import type { TimelineRegion, RegionFormat } from './sessionTimeline'
import type { AnalysisRole, NativeRecordSnapshot, RecordSettings } from './shared'
export type SessionAsset={assetId:string;role:Exclude<AnalysisRole,'export'>;relativePath:string;sampleRate:number;channelCount:number;encoding:WavEncoding;frameCount:string;hash:string|null;clippedSamples?:string;regionId?:string;codec?:string;container?:string;decodedFrameCount?:string;state?:string}
export type CaptureRegion=TimelineRegion&{ordinal:number;nativeId:string;baseName:string;journalFile:string;encoding:WavEncoding;status:'preparing'|'recording'|'closed'|'interrupted'|'cancelled';error:string|null;estimatedFrames:string;clippedSamples:string}
export type SessionSegment={segmentId:string;assetId:string;regionId?:string;frameCount:string;captureStartFrame:string|null;timelineStartFrame:string;regionStartFrame?:string;captureEpochId?:string;assetStartFrame?:string;timelineStartNs?:string;gapBeforeNs?:string|null;overlapBeforeNs?:string|null;sampleRate?:number;takeId?:string}
export type SessionDocument={
 retention?:{phase:'pending'|'verifying'|'removing'|'removed'|'kept'|'error';error:string|null};exports?:ExportRecord[];schemaVersion:2;product:'Trace';sessionId:string;name:string;createdAt:string;status:string;deviceId:string;captureEpochId:string
 preset:RecordSettings;sourceFormat:RegionFormat;captureStartFrame:string|null;captureEndFrameExclusive:string|null;frames:string;durationNs:string;error:string|null
 regions:CaptureRegion[];assets:SessionAsset[];segments:SessionSegment[];takes:Array<Record<string,unknown>>;events:Array<Record<string,unknown>>;eventSequence:number;hasDiscontinuities:boolean
 inputMetrics?:NativeRecordSnapshot['meters'];viewParts?:Array<{regionId:string;startFrame:string;frameCount:string;sampleRate:number}>
}
const safeName=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<180&&basename(v)===v&&!v.includes('\0')
export function normalizeSession(value:unknown):SessionDocument {
 const d=value as SessionDocument&{schemaVersion:number}
 if(!d||d.product!=='Trace'||![1,2].includes(d.schemaVersion)||!safeName(d.name)||typeof d.sessionId!=='string'||!d.sessionId||d.sessionId.length>128||
  !Number.isFinite(Date.parse(d.createdAt))||!u64(d.frames)||!d.sourceFormat||!Number.isInteger(d.sourceFormat.sampleRate)||d.sourceFormat.sampleRate<8000||d.sourceFormat.sampleRate>96000||
  ![1,2].includes(d.sourceFormat.channelCount)||!Array.isArray(d.assets)||!Array.isArray(d.segments)||
  !['preparing','recording','reconnecting','finalizing','processing','ready','failed','recoverable','recovered'].includes(d.status))throw Error('INVALID_SESSION')
 if(new Set(d.assets.map(a=>a.assetId)).size!==d.assets.length)throw Error('DUPLICATE_ASSET')
 for(const a of d.assets)if(typeof a.assetId!=='string'||!['source','deliverable','recovered','session'].includes(a.role)||!/^audio\/[^/\\\0]+\.wav$/i.test(a.relativePath)||
  !u64(a.frameCount)||(a.clippedSamples!==undefined&&(!u64(a.clippedSamples)||BigInt(a.clippedSamples)>BigInt(a.frameCount)*BigInt(a.channelCount)))||!Number.isInteger(a.sampleRate)||a.sampleRate<8000||a.sampleRate>96000||![1,2].includes(a.channelCount)||!['pcm16','pcm24','float32'].includes(a.encoding))throw Error('INVALID_ASSET')
 for(const s of d.segments)if(typeof s.segmentId!=='string'||!d.assets.some(a=>a.assetId===s.assetId)||!u64(s.frameCount)||!u64(s.timelineStartFrame))throw Error('INVALID_SEGMENT')
 d.takes=Array.isArray(d.takes)?d.takes:[];d.events=Array.isArray(d.events)?d.events:[]
 d.eventSequence=Number.isSafeInteger(d.eventSequence)?d.eventSequence:d.events.length
 if(!Array.isArray(d.regions)){
  const oldClock=d.takes[0]?.clock as CaptureRegion['clock']|undefined
  d.regions=[{id:d.sessionId,nativeId:d.sessionId,ordinal:1,baseName:d.name,journalFile:'journal.jsonl',captureEpochId:d.captureEpochId||'legacy-unknown',
   format:{...d.sourceFormat},frames:d.frames,startFrame:d.captureStartFrame??null,endFrameExclusive:d.captureEndFrameExclusive??null,
   clock:oldClock||{domain:(d.captureEpochId||'').includes(':')?d.captureEpochId.split(':')[0]:'',startQpc100ns:null,endQpc100ns:null,startEstimated:false,endEstimated:false},
   encoding:d.assets.find(a=>a.role==='source')?.encoding||recordingEncoding(d.preset,d.sourceFormat.sampleRate),status:d.status==='ready'?'closed':'interrupted',error:d.error||null,estimatedFrames:'0',clippedSamples:'0'}]
  for(const a of d.assets)if(a.role==='source'||a.role==='recovered')a.regionId=d.sessionId
  for(const s of d.segments){s.regionId=d.sessionId;s.regionStartFrame=s.timelineStartFrame}
 }
 if(d.regions.length>10000)throw Error('TOO_MANY_REGIONS')
 for(let i=0;i<d.regions.length;i++){
  const r=d.regions[i]
  if(!u64(r.clippedSamples)||!u64(r.estimatedFrames)||r.ordinal!==i+1||!safeName(r.baseName)||!safeName(r.journalFile)||typeof r.nativeId!=='string'||!['preparing','recording','closed','interrupted','cancelled'].includes(r.status))throw Error('INVALID_REGION_MANIFEST')
 }
 if(d.exports!==undefined){if(!Array.isArray(d.exports)||d.exports.length>10000)throw Error('INVALID_EXPORT_RECORDS');for(const record of d.exports){validateExportRecord(record);if(!['ready','failed','cancelled'].includes(record.phase)){record.phase='failed';record.error='上次导出未完成，可以重试。'}}}
 if(d.retention){if(!['pending','verifying','removing','removed','kept','error'].includes(d.retention.phase)||(d.retention.error!==null&&typeof d.retention.error!=='string'))throw Error('INVALID_RETENTION_STATE');if(['verifying','removing'].includes(d.retention.phase))d.retention.phase='pending'}
 const timeline=new SessionTimeline(d.regions)
 d.schemaVersion=2;d.durationNs=timeline.durationNs;d.hasDiscontinuities=d.regions.length>1||Boolean(d.hasDiscontinuities)
 if(['preparing','recording','reconnecting','finalizing','processing'].includes(d.status))d.status='recoverable'
 return d
}
export class StoredSession {
 private writes:Promise<void>=Promise.resolve()
 constructor(readonly directory:string,readonly document:SessionDocument){}
 private synchronize():void{
  const d=this.document,timeline=new SessionTimeline(d.regions)
  d.durationNs=timeline.durationNs;d.frames=d.regions.reduce((n,r)=>n+BigInt(r.frames),0n).toString();d.hasDiscontinuities=d.regions.length>1||d.hasDiscontinuities
  d.captureStartFrame=d.regions[0]?.startFrame??null
  d.captureEndFrameExclusive=d.regions.length===1?d.regions[0].endFrameExclusive:null
  if(d.takes[0]){d.takes[0].regionIds=d.regions.map(r=>r.id);d.takes[0].durationNs=d.durationNs;if(d.regions.length>1){d.takes[0].actualEndFrameExclusive=null;delete d.takes[0].clock}}
  for(const a of d.assets){a.codec={pcm16:'pcm_s16le',pcm24:'pcm_s24le',float32:'pcm_f32le'}[a.encoding];a.container='wav';a.decodedFrameCount=a.frameCount;if(!['superseded','removed','removing'].includes(a.state||''))a.state=a.hash?'ready':'pending'}
  for(const s of d.segments){
   const r=d.regions.find(r=>r.id===s.regionId),a=d.assets.find(a=>a.assetId===s.assetId)
   if(!r||!a)continue
   const position=timeline.positions[r.ordinal-1],relative=s.regionStartFrame||'0'
   s.takeId=d.sessionId;s.sampleRate=a.sampleRate;s.captureEpochId=r.captureEpochId;s.assetStartFrame='0'
   s.timelineStartNs=timeline.frameToMediaNs(r.id,relative)
   s.gapBeforeNs=relative==='0'?position.gapBeforeNs:'0';s.overlapBeforeNs=relative==='0'?position.overlapBeforeNs:'0'
  }
 }
 save():Promise<void>{
  this.writes=this.writes.catch(()=>{}).then(async()=>{
   this.synchronize();await mkdir(this.directory,{recursive:true})
   const target=join(this.directory,'session.json')
   await writeFile(target+'.tmp',JSON.stringify(this.document,null,2)+'\n');await rename(target+'.tmp',target)
  })
  return this.writes
 }
 event(type:string,details:Record<string,unknown>={}):Promise<void>{
  const event={seq:++this.document.eventSequence,type,at:new Date().toISOString(),...details};this.document.events.push(event)
  this.writes=this.writes.catch(()=>{}).then(async()=>{await mkdir(this.directory,{recursive:true});await appendFile(join(this.directory,'events.jsonl'),JSON.stringify(event)+'\n')})
  return this.writes
 }
 async settled():Promise<void>{await this.writes}
}
export async function readSession(directory:string):Promise<StoredSession>{
 return new StoredSession(directory,normalizeSession(JSON.parse(await readFile(join(directory,'session.json'),'utf8'))))
}
