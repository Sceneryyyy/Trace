import { open, readFile, lstat, realpath } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { analysisCacheKeyVersion, analysisSchemaVersion, measurementConfigId, pageRecords, pageHeaderBytes } from './analysisTypes'
import type { AnalysisManifest, AnalysisStream, HistoricalMetrics, FileWavePoint, FileLoudnessPoint } from './analysisTypes'
import type { Metric } from './shared'

const corrupt = (message:string):never => {throw Error('CORRUPT_CACHE: '+message)}
const u64 = (v:unknown):v is string => typeof v==='string'&&/^[0-9]{1,20}$/.test(v)&&BigInt(v)<=0xffffffffffffffffn
const hex = (v:unknown):v is string => typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)
const ceil = (a:bigint,b:bigint):bigint => (a+b-1n)/b
const statuses:Metric['status'][]=['ready','silence','insufficient','gap','error']
const empty=(unit:Metric['unit']):Metric=>({value:null,status:'insufficient',unit})
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c>>>1)^(0xedb88320&-(c&1));return c>>>0})
export function crc32(bytes:Uint8Array):number {
  let crc=0xffffffff
  for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8)
  return (crc^0xffffffff)>>>0
}
function metric(buffer:Buffer,offset:number,unit:Metric['unit']):Metric {
  const value=buffer.readDoubleLE(offset),status=buffer.readUInt32LE(offset+8)
  if(status>=statuses.length||!Number.isFinite(value)||buffer.readUInt32LE(offset+12)!==0)corrupt('metric value/status')
  if(status!==0&&value!==0)corrupt('non-ready numeric value')
  return {value:status===0?value:null,status:statuses[status],unit}
}
function validMetric(value:unknown,unit:Metric['unit']):boolean {
  if(!value||typeof value!=='object')return false
  const v=value as Metric
  return v.unit===unit&&statuses.includes(v.status)&&(v.status==='ready'?typeof v.value==='number'&&Number.isFinite(v.value):v.value===null)
}
export function validateManifest(value:unknown,key?:string):AnalysisManifest {
  const m=value as AnalysisManifest
  if(!m||m.cacheKeyVersion!==analysisCacheKeyVersion||m.status!=='ready'||m.schemaVersion!==analysisSchemaVersion||m.measurementConfigId!==measurementConfigId||
     !hex(m.cacheKey)||(key!==undefined&&m.cacheKey!==key)||!hex(m.engineSha256)||
     !Array.isArray(m.sourceSha256)||!m.sourceSha256.length||m.sourceSha256.length>10000||!m.sourceSha256.every(hex)||
     !u64(m.frames)||!Number.isInteger(m.sampleRate)||m.sampleRate<8000||m.sampleRate>96000||![1,2].includes(m.channelCount)||
     !Array.isArray(m.streams)||m.streams.length!==8)corrupt('manifest identity/format')
  if(m.mediaIdentity!==undefined&&!hex(m.mediaIdentity))corrupt('media identity')
  if(m.sourceRange&&(!u64(m.sourceRange.startFrame)||!u64(m.sourceRange.endFrame)||Object.keys(m.sourceRange).sort().join(',')!=='endFrame,startFrame'||BigInt(m.sourceRange.endFrame)<=BigInt(m.sourceRange.startFrame)||BigInt(m.sourceRange.endFrame)-BigInt(m.sourceRange.startFrame)!==BigInt(m.frames)))corrupt('selection range')
  const levels=ceil(BigInt(m.frames)*100n,BigInt(m.sampleRate)),loudness=levels
  const expected=[{file:'levels.bin',kind:1,recordBytes:128,stride:1,records:levels},
    {file:'loudness.bin',kind:2,recordBytes:96,stride:1,records:loudness},
    ...Array.from({length:6},(_,i)=>({file:'wave-'+i+'.bin',kind:3,recordBytes:40,stride:10**(i+1),records:ceil(levels,BigInt(10**(i+1)))}))]
  for(let i=0;i<expected.length;i++){
    const actual=m.streams[i],e=expected[i]
    if(!actual||actual.file!==e.file||actual.kind!==e.kind||actual.recordBytes!==e.recordBytes||actual.stride!==e.stride||
       !u64(actual.records)||BigInt(actual.records)!==e.records||!u64(actual.pages)||BigInt(actual.pages)!==ceil(e.records,BigInt(pageRecords)))corrupt('stream layout')
    if(BigInt(actual.pages)*BigInt(pageHeaderBytes+pageRecords*actual.recordBytes)>BigInt(Number.MAX_SAFE_INTEGER))corrupt('file offset range')
  }
  const s=m.summary
  if(!s||s.levelIndexFrame!==m.frames||s.loudnessIndexFrame!==m.frames||s.channels?.length!==m.channelCount||
    !s.channels.every(c=>validMetric(c.samplePeak,'dBFS')&&validMetric(c.rms,'dBFS')&&validMetric(c.truePeak,'dBTP'))||
    !validMetric(s.momentary,'LUFS')||!validMetric(s.shortTerm,'LUFS')||!validMetric(s.integratedToCursor,'LUFS')||
    !validMetric(s.loudnessRange,'LU')||!validMetric(s.maxTruePeak,'dBTP'))corrupt('summary')
  return m
}
export class AnalysisCache {
  private pages=new Map<string,Promise<Buffer>>()
  readonly io={pagesRead:0,bytesRead:0}
  private constructor(readonly directory:string,readonly manifest:AnalysisManifest){}
  static async open(directory:string,key?:string):Promise<AnalysisCache>{
    const directoryInfo=await lstat(directory)
    if(!directoryInfo.isDirectory()||directoryInfo.isSymbolicLink())corrupt('cache directory')
    const base=await realpath(directory)
    const text=await readFile(join(base,'manifest.json'),'utf8')
    let value:unknown
    try{value=JSON.parse(text)}catch{corrupt('manifest JSON')}
    const manifest=validateManifest(value,key)
    for(const stream of manifest.streams){
      const path=join(base,stream.file),details=await lstat(path)
      if(!details.isFile()||details.isSymbolicLink())corrupt('stream file')
      if(!(await realpath(path)).toLowerCase().startsWith((base+sep).toLowerCase()))corrupt('stream path')
      if(details.size!==Number(BigInt(stream.pages))* (pageHeaderBytes+pageRecords*stream.recordBytes))corrupt('stream length')
    }
    return new AnalysisCache(base,manifest)
  }
  private async page(stream:AnalysisStream,index:bigint):Promise<Buffer>{
    if(index<0n||index>=BigInt(stream.pages))corrupt('page index')
    const key=stream.file+':'+index
    const cached=this.pages.get(key)
    if(cached){this.pages.delete(key);this.pages.set(key,cached);return cached}
    const pending=(async()=>{
      const size=pageHeaderBytes+pageRecords*stream.recordBytes,buffer=Buffer.alloc(size)
      const handle=await open(join(this.directory,stream.file),'r')
      try{let offset=0;while(offset<size){const {bytesRead}=await handle.read(buffer,offset,size-offset,Number(index)*size+offset);if(!bytesRead)corrupt('short page');offset+=bytesRead}}finally{await handle.close()}
      this.io.pagesRead++;this.io.bytesRead+=size
      const expectedCount=Number(BigInt(stream.records)-index*BigInt(pageRecords)<BigInt(pageRecords)?BigInt(stream.records)-index*BigInt(pageRecords):BigInt(pageRecords))
      if(buffer.toString('ascii',0,8)!=='TRPAGE01'||buffer.readUInt32LE(8)!==1||buffer.readUInt32LE(12)!==stream.kind||
         buffer.readUInt32LE(16)!==stream.recordBytes||buffer.readUInt32LE(20)!==expectedCount||buffer.readUInt32LE(24)!==stream.stride)corrupt('page header')
      const expected=buffer.readUInt32LE(28);buffer.writeUInt32LE(0,28);const actual=crc32(buffer);buffer.writeUInt32LE(expected,28)
      if(actual!==expected)corrupt('page checksum')
      for(let i=0;i<expectedCount;i++){
        const record=index*BigInt(pageRecords)+BigInt(i)
        const expectedFrame=this.indexFrame(stream,record)
        if(buffer.readBigUInt64LE(pageHeaderBytes+i*stream.recordBytes)!==expectedFrame)corrupt('record frame')
      }
      if(buffer.readBigUInt64LE(32)!==this.indexFrame(stream,index*BigInt(pageRecords))||
         buffer.readBigUInt64LE(40)!==this.indexFrame(stream,index*BigInt(pageRecords)+BigInt(expectedCount-1)))corrupt('page time bounds')
      return buffer
    })()
    this.pages.set(key,pending)
    while(this.pages.size>8)this.pages.delete(this.pages.keys().next().value as string)
    try{return await pending}catch(error){this.pages.delete(key);throw error}
  }
  private indexFrame(stream:AnalysisStream,index:bigint):bigint {
    const end=(index+1n)*BigInt(stream.stride)*BigInt(this.manifest.sampleRate)/100n,total=BigInt(this.manifest.frames)
    return end>total?total:end
  }
  private async record(stream:AnalysisStream,index:bigint):Promise<Buffer>{
    if(index<0n||index>=BigInt(stream.records))corrupt('record index')
    const page=await this.page(stream,index/BigInt(pageRecords)),offset=pageHeaderBytes+Number(index%BigInt(pageRecords))*stream.recordBytes
    return page.subarray(offset,offset+stream.recordBytes)
  }
  private position(value:string):bigint{
    if(!u64(value))throw Error('INVALID_FILE_POSITION')
    const position=BigInt(value)
    if(position>BigInt(this.manifest.frames))throw Error('FILE_POSITION_OUT_OF_RANGE')
    return position
  }
  private previousIndex(stream:AnalysisStream,position:bigint):bigint {
    if(!BigInt(stream.records))return -1n
    if(position===BigInt(this.manifest.frames))return BigInt(stream.records)-1n
    // Find the last floor(k * rate * stride / 100) no later than the cursor.
    return (((position+1n)*100n-1n)/(BigInt(this.manifest.sampleRate)*BigInt(stream.stride)))-1n
  }
  async metrics(positionFrame:string):Promise<HistoricalMetrics>{
    const position=this.position(positionFrame),m=this.manifest
    const result:HistoricalMetrics={positionFrame,levelIndexFrame:'0',loudnessIndexFrame:'0',
      channels:Array.from({length:m.channelCount},()=>({samplePeak:empty('dBFS'),rms:empty('dBFS'),truePeak:empty('dBTP')})),
      momentary:empty('LUFS'),shortTerm:empty('LUFS'),integratedToCursor:empty('LUFS'),loudnessRange:empty('LU'),maxTruePeak:empty('dBTP'),
      wholeFileIntegrated:m.summary.integratedToCursor,wholeFileLoudnessRange:m.summary.loudnessRange,wholeFileMaxTruePeak:m.summary.maxTruePeak}
    const li=this.previousIndex(m.streams[0],position),hi=this.previousIndex(m.streams[1],position)
    if(li>=0n){
      const row=await this.record(m.streams[0],li);result.levelIndexFrame=row.readBigUInt64LE(0).toString()
      if(row.readUInt32LE(12)!==m.channelCount)corrupt('level channels')
      for(let c=0;c<m.channelCount;c++)result.channels[c]={samplePeak:metric(row,32+c*48,'dBFS'),rms:metric(row,48+c*48,'dBFS'),truePeak:metric(row,64+c*48,'dBTP')}
    }
    if(hi>=0n){
      const row=await this.record(m.streams[1],hi);result.loudnessIndexFrame=row.readBigUInt64LE(0).toString()
      result.momentary=metric(row,16,'LUFS');result.shortTerm=metric(row,32,'LUFS');result.integratedToCursor=metric(row,48,'LUFS')
      result.loudnessRange=metric(row,64,'LU');result.maxTruePeak=metric(row,80,'dBTP')
    }
    return result
  }
  async waveform(startFrame:string,endFrame:string,width:number):Promise<FileWavePoint[]>{
    const start=this.position(startFrame),end=this.position(endFrame)
    if(end<start||!Number.isInteger(width)||width<1||width>2400)throw Error('INVALID_TIMELINE_RANGE')
    if(end===start)return []
    const m=this.manifest,rate=BigInt(m.sampleRate)
    let stream=m.streams[0]
    for(const candidate of m.streams.filter(s=>s.kind===3)){
      const count=ceil((end-start)*100n,rate*BigInt(stream.stride))
      if(count<=BigInt(width*4))break
      stream=candidate
    }
    const begin=start*100n/(rate*BigInt(stream.stride))
    const stopRaw=ceil(end*100n,rate*BigInt(stream.stride)),stop=stopRaw>BigInt(stream.records)?BigInt(stream.records):stopRaw
    const count=stop-begin,columns=count<BigInt(width)?count:BigInt(width),result:FileWavePoint[]=[]
    let i=begin
    for(let column=0n;column<columns;column++){
      const until=begin+(column+1n)*count/columns
      let point:FileWavePoint|undefined
      while(i<until){
        const row=await this.record(stream,i)
        const cellStart=stream.kind===1?i*rate/100n:row.readBigUInt64LE(8)
        const cellEnd=row.readBigUInt64LE(0),flags=row.readUInt32LE(stream.kind===1?8:32)
        const low=Array.from({length:m.channelCount},(_,c)=>row.readFloatLE(16+c*8))
        const high=Array.from({length:m.channelCount},(_,c)=>row.readFloatLE(20+c*8))
        if(low.some((v,c)=>!Number.isFinite(v)||!Number.isFinite(high[c])||v>high[c]))corrupt('wave extrema')
        if(!point)point={startFrame:cellStart.toString(),frame:cellEnd.toString(),min:low,max:high,flags}
        else{point.frame=cellEnd.toString();point.flags|=flags;for(let c=0;c<m.channelCount;c++){point.min[c]=Math.min(point.min[c],low[c]);point.max[c]=Math.max(point.max[c],high[c])}}
        i++
      }
      if(point)result.push(point)
    }
    return result
  }
  async loudness(startFrame:string,endFrame:string,maximum=600):Promise<FileLoudnessPoint[]>{
    const start=this.position(startFrame),end=this.position(endFrame)
    if(end<start||!Number.isInteger(maximum)||maximum<1||maximum>2400)throw Error('INVALID_TIMELINE_RANGE')
    if(end===start)return []
    const stream=this.manifest.streams[1]
    let begin=this.previousIndex(stream,start)
    if(begin<0n)begin=0n
    const last=this.previousIndex(stream,end),result:FileLoudnessPoint[]=[]
    if(last<begin)return result
    const step=ceil(last-begin+1n,BigInt(maximum))
    for(let index=begin;index<=last;index+=step){
      const row=await this.record(stream,index)
      result.push({frame:row.readBigUInt64LE(0).toString(),m:metric(row,16,'LUFS'),s:metric(row,32,'LUFS'),i:metric(row,48,'LUFS'),flags:row.readUInt32LE(8)})
    }
    if(result.length&&result[result.length-1].frame!==this.indexFrame(stream,last).toString()){
      const row=await this.record(stream,last)
      const point={frame:row.readBigUInt64LE(0).toString(),m:metric(row,16,'LUFS'),s:metric(row,32,'LUFS'),i:metric(row,48,'LUFS'),flags:row.readUInt32LE(8)}
      if(result.length===maximum)result[result.length-1]=point;else result.push(point)
    }
    return result
  }
  async *reportRows():AsyncGenerator<import('./reportTypes').ReportRow>{
    const levels=this.manifest.streams[0],loudness=this.manifest.streams[1]
    let nextLoud=0n,loudIndex=-1n,loudnessFrame='0',start='0',loudnessFlags=0
    let m=empty('LUFS'),s=empty('LUFS'),i=empty('LUFS'),lra=empty('LU'),tp=empty('dBTP')
    for(let index=0n;index<BigInt(levels.records);index++){
      const row=await this.record(levels,index),frame=row.readBigUInt64LE(0),flags=row.readUInt32LE(8)
      if(row.readUInt32LE(12)!==this.manifest.channelCount)corrupt('level channels')
      let updated=false
      while(nextLoud<BigInt(loudness.records)&&this.indexFrame(loudness,nextLoud)<=frame){
        const value=await this.record(loudness,nextLoud);loudIndex=nextLoud++;loudnessFrame=value.readBigUInt64LE(0).toString()
        loudnessFlags=value.readUInt32LE(8);m=metric(value,16,'LUFS');s=metric(value,32,'LUFS');i=metric(value,48,'LUFS');lra=metric(value,64,'LU');tp=metric(value,80,'dBTP');updated=true
      }
      yield {startFrame:start,endFrame:frame.toString(),flags,loudnessFlags,channels:Array.from({length:this.manifest.channelCount},(_,c)=>({samplePeak:metric(row,32+c*48,'dBFS'),rms:metric(row,48+c*48,'dBFS'),truePeak:metric(row,64+c*48,'dBTP')})),momentary:{...m},shortTerm:{...s},integrated:{...i},lra:{...lra},maxTruePeak:{...tp},loudnessFrame,loudnessUpdated:updated}
      start=frame.toString()
    }
    if(loudIndex!==BigInt(loudness.records)-1n)corrupt('report loudness coverage')
  }
  async validateAll():Promise<void>{
    for(const stream of this.manifest.streams)for(let i=0n;i<BigInt(stream.pages);i++)await this.page(stream,i)
  }
}
