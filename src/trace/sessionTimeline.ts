export type RegionFormat={sampleRate:number;channelCount:number}
export type RegionClock={domain:string;startQpc100ns:string|null;endQpc100ns:string|null;startEstimated:boolean;endEstimated:boolean}
export type TimelineRegion={id:string;captureEpochId:string;format:RegionFormat;frames:string;startFrame:string|null;endFrameExclusive:string|null;clock:RegionClock}
export type RegionPosition={regionId:string;mediaStartNs:string;mediaEndNs:string;gapBeforeNs:string|null;overlapBeforeNs:string|null;gapQuality:'none'|'device'|'estimated'|'unknown'}
type Rational={n:bigint;d:bigint}
const billion=1000000000n
export function u64(value:unknown):value is string{return typeof value==='string'&&/^[0-9]{1,20}$/.test(value)&&BigInt(value)<=0xffffffffffffffffn}
function gcd(a:bigint,b:bigint):bigint{while(b){const next=a%b;a=b;b=next}return a}
function add(a:Rational,frames:bigint,rate:bigint):Rational{
 const common=gcd(a.d,rate),d=a.d/common*rate,n=a.n*(rate/common)+frames*(a.d/common),reduce=gcd(n,d)
 const result={n:n/reduce,d:d/reduce}
 if(result.d.toString(2).length>4096)throw Error('TIMELINE_RATE_COMPLEXITY')
 return result
}
function ns(value:Rational):bigint{return value.n*billion/value.d}
function validRegion(region:TimelineRegion):void{
 if(!region||typeof region.id!=='string'||!region.id||typeof region.captureEpochId!=='string'||!region.captureEpochId||
    !region.format||!Number.isInteger(region.format.sampleRate)||region.format.sampleRate<8000||region.format.sampleRate>96000||![1,2].includes(region.format.channelCount)||
    !u64(region.frames)||!region.clock||typeof region.clock.domain!=='string')throw Error('INVALID_REGION')
 for(const value of [region.startFrame,region.endFrameExclusive,region.clock.startQpc100ns,region.clock.endQpc100ns])if(value!==null&&!u64(value))throw Error('INVALID_REGION_POSITION')
 if((region.startFrame===null)!==(region.endFrameExclusive===null))throw Error('INCOMPLETE_REGION_BOUNDARY')
 if(region.startFrame!==null&&BigInt(region.endFrameExclusive!)-BigInt(region.startFrame)!==BigInt(region.frames))throw Error('REGION_FRAME_MISMATCH')
 if(region.clock.startQpc100ns!==null&&region.clock.endQpc100ns!==null&&BigInt(region.clock.endQpc100ns)<BigInt(region.clock.startQpc100ns))throw Error('INVALID_REGION_CLOCK')
 if(typeof region.clock.startEstimated!=='boolean'||typeof region.clock.endEstimated!=='boolean')throw Error('INVALID_CLOCK_QUALITY')
}
export class SessionTimeline {
 readonly positions:RegionPosition[]=[]
 readonly durationNs:string
 private prefixes:Rational[]=[]
 constructor(readonly regions:TimelineRegion[]){
  if(!Array.isArray(regions)||regions.length>10000)throw Error('INVALID_REGION_LIST')
  const ids=new Set<string>();let total:Rational={n:0n,d:1n}
  for(let i=0;i<regions.length;i++){
   const region=regions[i];validRegion(region);if(ids.has(region.id))throw Error('DUPLICATE_REGION');ids.add(region.id)
   this.prefixes.push(total)
   const begin=ns(total);total=add(total,BigInt(region.frames),BigInt(region.format.sampleRate))
   let gapBeforeNs:string|null='0',overlapBeforeNs:string|null='0',gapQuality:RegionPosition['gapQuality']='none'
   const previous=regions.slice(0,i).reverse().find(item=>BigInt(item.frames)>0n)
   if(previous){
    if(!region.clock.domain||region.clock.domain!==previous.clock.domain||region.clock.startQpc100ns===null||previous.clock.endQpc100ns===null){
     gapBeforeNs=null;overlapBeforeNs=null;gapQuality='unknown'
    }else{
     const difference=(BigInt(region.clock.startQpc100ns)-BigInt(previous.clock.endQpc100ns))*100n
     gapBeforeNs=(difference>0n?difference:0n).toString();overlapBeforeNs=(difference<0n?-difference:0n).toString()
     gapQuality=region.clock.startEstimated||previous.clock.endEstimated?'estimated':'device'
    }
   }
   this.positions.push({regionId:region.id,mediaStartNs:begin.toString(),mediaEndNs:ns(total).toString(),gapBeforeNs,overlapBeforeNs,gapQuality})
  }
  if(ns(total)>0xffffffffffffffffn)throw Error('TIMELINE_TOO_LONG')
  this.durationNs=ns(total).toString()
 }
 frameToMediaNs(regionId:string,relativeFrame:string):string{
  const index=this.regions.findIndex(region=>region.id===regionId)
  if(index<0||!u64(relativeFrame)||BigInt(relativeFrame)>BigInt(this.regions[index].frames))throw Error('REGION_POSITION_OUT_OF_RANGE')
  return ns(add(this.prefixes[index],BigInt(relativeFrame),BigInt(this.regions[index].format.sampleRate))).toString()
 }
 captureFrameToMediaNs(regionId:string,captureFrame:string):string{
  const region=this.regions.find(item=>item.id===regionId)
  if(!region||region.startFrame===null||!u64(captureFrame)||BigInt(captureFrame)<BigInt(region.startFrame))throw Error('UNKNOWN_CAPTURE_POSITION')
  return this.frameToMediaNs(regionId,(BigInt(captureFrame)-BigInt(region.startFrame)).toString())
 }
 mediaNsToRegion(positionNs:string):{regionId:string;relativeFrame:string}|null{
  if(!u64(positionNs)||BigInt(positionNs)>BigInt(this.durationNs))throw Error('SESSION_POSITION_OUT_OF_RANGE')
  if(!this.regions.length||this.durationNs==='0')return null
  const value=BigInt(positionNs)
  let index=this.regions.length-1
  if(value!==BigInt(this.durationNs)){
   let low=0,high=this.positions.length
   while(low<high){const middle=(low+high)>>1;if(BigInt(this.positions[middle].mediaEndNs)<=value)low=middle+1;else high=middle}
   index=low
  }else while(index>0&&BigInt(this.regions[index].frames)===0n)index--
  const prefix=this.prefixes[index],region=this.regions[index]
  // Greatest frame whose quantized nanosecond position is <= the query.
  const numerator=((value+1n)*prefix.d-prefix.n*billion)*BigInt(region.format.sampleRate)-1n
  const denominator=prefix.d*billion
  const frame=numerator<0n?0n:numerator/denominator
  return {regionId:region.id,relativeFrame:(frame>BigInt(region.frames)?BigInt(region.frames):frame).toString()}
 }
}

export function mediaDurationNs(parts:Array<{frames:string;sampleRate:number}>):string{
 let total:Rational={n:0n,d:1n}
 if(parts.length>10000)throw Error('TOO_MANY_MEDIA_PARTS')
 for(const part of parts){
  if(!u64(part.frames)||!Number.isInteger(part.sampleRate)||part.sampleRate<8000||part.sampleRate>96000)throw Error('INVALID_MEDIA_PART')
  total=add(total,BigInt(part.frames),BigInt(part.sampleRate))
 }
 const result=ns(total)
 if(result>0xffffffffffffffffn)throw Error('TIMELINE_TOO_LONG')
 return result.toString()
}
