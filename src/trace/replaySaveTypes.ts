import type {WavEncoding} from './mediaTypes'
import type {SourceContinuity} from './analysisService'
import {u64} from './sessionTimeline'
/** Quality counts refer only to the returned frozen/saved frame range. */
export type ReplayQuality={version:1;estimatedFrames:string;gapFrames:string;unknown:boolean}
export function validateReplayQuality(value:unknown,frames:string):ReplayQuality{
 const q=value as ReplayQuality
 if(!q||q.version!==1||!u64(q.estimatedFrames)||!u64(q.gapFrames)||typeof q.unknown!=='boolean'||BigInt(q.estimatedFrames)>BigInt(frames)||BigInt(q.gapFrames)>BigInt(frames))throw Error('INVALID_REPLAY_QUALITY')
 return {...q}
}
export function replayQualityContinuity(quality?:ReplayQuality):SourceContinuity{
 if(!quality)return 'unknown'
 if(BigInt(quality.gapFrames)>0n)return 'gaps'
 if(quality.unknown)return 'unknown'
 return BigInt(quality.estimatedFrames)>0n?'estimated-silence':'complete'
}
export type ReplaySaveIdentity={sourceId:string;epochId:string;measurementEpoch:string;originFrame:string;captureStartFrame:string;frames:string;sampleRate:number;channelCount:number}
export type ReplaySaveRequest=ReplaySaveIdentity&{basePath:string;journalPath:string;encoding:WavEncoding;startFrame:string;endFrame:string}
export type ReplaySaveResult={quality?:ReplayQuality;sampleRate:number;channelCount:number;encoding:WavEncoding;frames:string;clippedSamples:string;segments:Array<{file:string;frames:string;bytes:string;clippedSamples:string}>}
export type MemoryOrigin={kind:'memory';sourceId:string;epochId:string;measurementEpoch:string;cacheOriginFrame:string;captureStartFrame:string;sourceFrames:string;startFrame:string;endFrame:string}
