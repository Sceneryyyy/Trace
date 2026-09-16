import type {WavEncoding} from './mediaTypes'
export type ReplaySaveIdentity={sourceId:string;epochId:string;measurementEpoch:string;originFrame:string;captureStartFrame:string;frames:string;sampleRate:number;channelCount:number}
export type ReplaySaveRequest=ReplaySaveIdentity&{basePath:string;journalPath:string;encoding:WavEncoding;startFrame:string;endFrame:string}
export type ReplaySaveResult={sampleRate:number;channelCount:number;encoding:WavEncoding;frames:string;clippedSamples:string;segments:Array<{file:string;frames:string;bytes:string;clippedSamples:string}>}
export type MemoryOrigin={kind:'memory';sourceId:string;epochId:string;measurementEpoch:string;cacheOriginFrame:string;captureStartFrame:string;sourceFrames:string;startFrame:string;endFrame:string}
