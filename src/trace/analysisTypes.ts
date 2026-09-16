import type { Metric, NativeRecordSnapshot } from './shared'
export const analysisCacheKeyVersion = 3
export const analysisSchemaVersion = 1
export const measurementConfigId = 'trace-meter-v4-ebur128-1.2.6-lra10hz-tpaligned'
export const pageRecords = 1024
export const pageHeaderBytes = 64
export type AnalysisStream = {file:string;kind:1|2|3;recordBytes:number;stride:number;records:string;pages:string}
export type FileAnalysisResult = {
  schemaVersion:1;measurementConfigId:string;sampleRate:number;channelCount:number;frames:string
  streams:AnalysisStream[];summary:NativeRecordSnapshot['meters']
}
export type AnalysisManifest = FileAnalysisResult & {
  cacheKeyVersion:3;mediaIdentity?:string;sourceRange?:{startFrame:string;endFrame:string};cacheKey:string;engineSha256:string;sourceSha256:string[];createdAt:string;status:'ready'
}
export type HistoricalMetrics = NativeRecordSnapshot['meters'] & {positionFrame:string;wholeFileIntegrated:Metric;wholeFileLoudnessRange:Metric;wholeFileMaxTruePeak:Metric}
export type FileWavePoint = {startFrame:string;frame:string;min:number[];max:number[];flags:number}
export type FileLoudnessPoint = {frame:string;m:Metric;s:Metric;i:Metric;flags:number}
export type AnalysisProgress = {phase:'hashing'|'analyzing'|'verifying'|'ready';frames:string;totalFrames:string;rssBytes?:number;heapUsedBytes?:number}
