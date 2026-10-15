import type {ExportSource} from '../exportTypes'
import type {ImportView} from '../importService'
import type {PlaybackView,TakeSummary} from '../shared'
import {assetFormatLabel} from '../assetFormat'
import {userError} from '../userErrors'

export type LibraryCategory='recordings'|'imports'
export type LibrarySort='newest'|'oldest'|'name'|'duration'
export type LibraryFilter={query:string;status:string;from:string;to:string;sort:LibrarySort}
export const libraryPageSize=50
export function libraryDuration(ns:bigint):string{
 if(ns<=0n)return '—'
 const seconds=ns/1000000000n,hours=seconds/3600n,minutes=seconds/60n%60n,tail=String(seconds%60n).padStart(2,'0')
 return hours>0n?hours+':'+String(minutes).padStart(2,'0')+':'+tail:minutes+':'+tail
}
export function preferredSource(take:TakeSummary):ExportSource|undefined{
 const output=take.exports?.find(e=>e.id===take.preferredExportId&&e.phase==='ready'&&(!e.availability||e.availability==='present'))
 if(output)return {takeId:take.id,role:'export',exportId:output.id}
 const role=(['deliverable','session','recovered','source'] as const).find(role=>take.roles?.includes(role)&&!take.missingRoles?.includes(role))
 if(!role)return undefined
 const region=(take.regionCount||0)>1&&['source','recovered'].includes(role)?take.analysisRegions?.find(r=>r.role===role):undefined
 return {takeId:take.id,role,...(region?{regionId:region.id}:{})}
}
export const importProcessing=(item:ImportView)=>Boolean(item.phase&&['queued','hashing','decoding','verifying'].includes(item.phase))
export function sameLibrarySource(file:PlaybackView|null|undefined,source:ExportSource):boolean{
 return Boolean(file&&!file.temporary&&file.takeId===source.takeId&&file.role===source.role&&file.regionId===source.regionId&&file.exportId===source.exportId)
}
export type LibraryRow={id:string;kind:LibraryCategory;name:string;createdAt:string;durationNs:bigint;format:string;status:string;attention:boolean;processing:boolean;ready:boolean;source?:ExportSource;take?:TakeSummary;asset?:ImportView}
const nanos=(frames:string|undefined,rate:number|undefined)=>frames&&rate&&rate>0?BigInt(frames)*1000000000n/BigInt(rate):0n
export function recordingRow(take:TakeSummary):LibraryRow{
 const processing=take.status==='processing'||take.status==='recording'||Boolean(take.exports?.some(e=>!['ready','failed','cancelled'].includes(e.phase)))
 const attention=['failed','recoverable','unreadable'].includes(take.status)||Boolean(take.availability&&take.availability!=='present')||Boolean(take.exports?.some(e=>e.phase==='failed'||e.delivery?.phase==='failed'))
 const status=take.status==='unreadable'?'记录无法读取':take.status==='recoverable'?'可恢复':take.status==='failed'?'未完整完成':take.status==='recovered'?'已恢复':take.hasDiscontinuities?'音频有中断':processing?'正在处理':take.status==='ready'?'已保存':'正在录音'
 const source=preferredSource(take)
 return {id:take.id,kind:'recordings',name:take.name,createdAt:take.createdAt,durationNs:take.durationNs?BigInt(take.durationNs):nanos(take.frames,take.sampleRate),format:take.encoding==='mp3'?'MP3':take.encoding==='aac'?'AAC':take.encoding==='float32'?'WAV 32f':take.encoding==='pcm24'?'WAV 24-bit':'WAV 16-bit',status,attention,processing,ready:Boolean(source&&['ready','recovered','failed'].includes(take.status)),source,take}
}
export function importedRow(asset:ImportView,recording=false):LibraryRow{
 const processing=importProcessing(asset),ready=asset.status==='ready'&&!processing
 const status=processing?asset.phase==='queued'?(recording?'等待录音结束':'等待准备'):asset.phase==='hashing'?'读取文件':asset.phase==='decoding'?'准备音频':'核对结果':asset.status==='ready'?'已准备':asset.status==='changed'?'原文件已变化':asset.status==='missing'?'原文件缺失':asset.phase==='cancelled'?'已取消':asset.status==='failed'?'准备失败':'需要准备'
 return {id:asset.id,kind:'imports',name:asset.name,createdAt:asset.createdAt,durationNs:nanos(asset.frames,asset.format?.sampleRate),format:assetFormatLabel(asset.format)||asset.sourceName,status,attention:['failed','changed','missing'].includes(asset.status)||asset.phase==='cancelled',processing,ready,source:{takeId:asset.id,role:'source'},asset}
}
const day=(at:string)=>{const d=new Date(at);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'})
export function filterLibrary(rows:LibraryRow[],filter:LibraryFilter):LibraryRow[]{
 const query=filter.query.trim().toLocaleLowerCase()
 return rows.filter(row=>{
  const date=day(row.createdAt)
  return (row.name+' '+(row.asset?.sourceName||'')).toLocaleLowerCase().includes(query)&&(!filter.from||date>=filter.from)&&(!filter.to||date<=filter.to)&&
   (filter.status==='all'||filter.status==='ready'&&row.ready||filter.status==='processing'&&row.processing||filter.status==='attention'&&row.attention)
 }).sort((a,b)=>{
  const order=filter.sort==='name'?collator.compare(a.name,b.name):filter.sort==='duration'?(a.durationNs>b.durationNs?-1:a.durationNs<b.durationNs?1:0):filter.sort==='oldest'?Date.parse(a.createdAt)-Date.parse(b.createdAt):Date.parse(b.createdAt)-Date.parse(a.createdAt)
  return order||a.id.localeCompare(b.id)
 })
}
export function rowWarning(row:LibraryRow):string{
 const t=row.take
 if(!t)return row.asset?.error?userError(row.asset.error):''
 return [t.availability&&t.availability!=='present'?'部分文件'+(t.availability==='missing'?'已移除或移动':'暂不可访问'):'',t.clippedSamples&&BigInt(t.clippedSamples)>0n?'保存文件发生削波':'',t.hasDiscontinuities||t.continuity==='gaps'?'音频有中断':t.continuity==='estimated-silence'?'包含估计静音':t.continuity==='unknown'?'采集完整性未知':'',t.status==='unreadable'?'记录文件损坏或不兼容，音频仍保留':t.status==='failed'?'录音未完整完成：'+userError(t.error):''].filter(Boolean).join(' · ')
}
