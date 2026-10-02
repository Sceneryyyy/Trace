import type {CaptureRegion,SessionDocument} from './sessionStore'
import type {SourceContinuity} from './analysisService'
export type CaptureIntegrityDocument={regions:CaptureRegion[];hasDiscontinuities?:boolean;status?:string;origin?:SessionDocument['origin']}
/** File readability is distinct from the quality of the original capture. */
export function sourceContinuity(d:CaptureIntegrityDocument,regionId?:string):SourceContinuity{
 const regions=regionId?d.regions.filter(r=>r.id===regionId):d.regions
 const covered=regions.filter(r=>r.status!=='cancelled'&&BigInt(r.frames||'0')>0n)
 if(regionId&&!regions.length)return 'unknown'
 if(covered.some(r=>r.status==='interrupted'||r.error||BigInt(r.captureQuality?.gapFrames||'0')>0n))return 'gaps'
 if(!regionId&&(covered.length>1||d.hasDiscontinuities))return 'gaps'
 if(covered.some(r=>r.captureQuality?.unknown||d.origin?.kind==='memory'&&!r.captureQuality))return 'unknown'
 if(covered.some(r=>BigInt(r.estimatedFrames||'0')>0n||r.clock.startEstimated||r.clock.endEstimated))return 'estimated-silence'
 return 'complete'
}
