import {replaceMetadata,readMetadata} from './metadataFile'
import {createHash} from 'node:crypto'
import {mkdir,lstat} from 'node:fs/promises'
import {join} from 'node:path'
export type ReviewMarker={id:string;startFrame:string;endFrame:string|null;label:string;comment:string;createdAt:string}
export type MarkerIdentity={sourceSha256:string[];mediaIdentity?:string;decodeRange?:{startFrame:string;endFrame:string};frames:string;sampleRate:number;channelCount:number}
export function markerKey(identity:MarkerIdentity):string{
 if(!Array.isArray(identity.sourceSha256)||!identity.sourceSha256.length||identity.sourceSha256.length>10000||identity.sourceSha256.some(h=>!/^[a-f0-9]{64}$/.test(h))||!Number.isInteger(identity.sampleRate)||identity.sampleRate<8000||identity.sampleRate>96000||![1,2].includes(identity.channelCount)||!/^\d{1,20}$/.test(identity.frames)||BigInt(identity.frames)>0xffffffffffffffffn)throw Error('INVALID_MARKER_SOURCE')
 if(identity.mediaIdentity!==undefined&&!/^[a-f0-9]{64}$/.test(identity.mediaIdentity)||identity.decodeRange&&(!/^[0-9]{1,20}$/.test(identity.decodeRange.startFrame)||!/^[0-9]{1,20}$/.test(identity.decodeRange.endFrame)||BigInt(identity.decodeRange.endFrame)>0xffffffffffffffffn||BigInt(identity.decodeRange.endFrame)<=BigInt(identity.decodeRange.startFrame)))throw Error('INVALID_MARKER_SOURCE')
 return createHash('sha256').update(JSON.stringify({version:1,sourceSha256:identity.sourceSha256,mediaIdentity:identity.mediaIdentity,decodeRange:identity.decodeRange?{startFrame:identity.decodeRange.startFrame,endFrame:identity.decodeRange.endFrame}:undefined,frames:identity.frames,sampleRate:identity.sampleRate,channelCount:identity.channelCount})).digest('hex')
}
export function validateMarker(value:ReviewMarker,frames:string):ReviewMarker{
 const frame=(v:string)=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=BigInt(frames)
 if(!value||Object.keys(value).sort().join(',')!=='comment,createdAt,endFrame,id,label,startFrame'||!/^[-a-f0-9]{36}$/.test(value.id)||!frame(value.startFrame)||value.endFrame!==null&&(!frame(value.endFrame)||BigInt(value.endFrame)<=BigInt(value.startFrame))||typeof value.label!=='string'||!value.label.trim()||value.label.length>80||typeof value.comment!=='string'||value.comment.length>500||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value.label+value.comment)||typeof value.createdAt!=='string'||value.createdAt.length>64||!Number.isFinite(Date.parse(value.createdAt)))throw Error('INVALID_REVIEW_MARKER')
 return {...value,label:value.label.trim()}
}
/** Durable metadata outside rebuildable caches; serialized atomic replacements. */
export class MarkerStore {
 private tail:Promise<unknown>=Promise.resolve()
 constructor(private root:string){}
 async list(identity:MarkerIdentity):Promise<ReviewMarker[]>{
  await this.tail.catch(()=>{});return this.read(identity)
 }
 private async read(identity:MarkerIdentity):Promise<ReviewMarker[]>{
  const key=markerKey(identity);await mkdir(this.root,{recursive:true});if((await lstat(this.root)).isSymbolicLink())throw Error('LINKED_MARKER_STORE')
  const file=join(this.root,key+'.json')
  try{const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw Error('INVALID_MARKER_STORE');const v=JSON.parse(await readMetadata(file,1024*1024,'INVALID_MARKER_STORE'));if(v.version!==1||v.key!==key||!Array.isArray(v.markers)||v.markers.length>512)throw Error('INVALID_MARKER_STORE');return v.markers.map((m:ReviewMarker)=>validateMarker(m,identity.frames))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e}
 }
 save(identity:MarkerIdentity,marker:ReviewMarker|undefined,removeId?:string):Promise<ReviewMarker[]>{
  const task=this.tail.catch(()=>{}).then(async()=>{
   const key=markerKey(identity),current=await this.read(identity),next=current.filter(m=>m.id!==(marker?.id||removeId));if(marker)next.push(validateMarker(marker,identity.frames));if(next.length>512)throw Error('MARKER_LIMIT')
   next.sort((a,b)=>BigInt(a.startFrame)<BigInt(b.startFrame)?-1:BigInt(a.startFrame)>BigInt(b.startFrame)?1:a.id.localeCompare(b.id))
   await replaceMetadata(join(this.root,key+'.json'),JSON.stringify({version:1,key,identity,markers:next})+'\n',1024*1024,'MARKER_STORE_TOO_LARGE')
   return next
  });this.tail=task;return task
 }
 async close(){await this.tail.catch(()=>{})}
}
