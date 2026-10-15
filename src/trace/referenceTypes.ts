import type {AssetFormat} from './assetFormat'
import type {ExportSource} from './exportTypes'
import type {AnalysisJobView,Metric} from './shared'
import type {ReferenceDelta,ReferenceRange} from './referenceMath'
export type ReferenceSlot='a'|'b'
export type ReferencePeerView={id:string;source:ExportSource;label:string;format?:AssetFormat;sampleRate:number;channelCount:number;frames:string;range:ReferenceRange;positionFrame:string;gain:number;analysis?:AnalysisJobView}
export type ReferenceView={match?:import('./referenceMatch').LoudnessMatch;version:number;active:ReferenceSlot|null;a:ReferencePeerView|null;b:ReferencePeerView|null;pending:string|null;error:string|null;offsetNs:string;linked:boolean;compatible:boolean;deltas:{integrated:ReferenceDelta;truePeak:ReferenceDelta;lra:ReferenceDelta}|null}
export type ReferenceSpectrum={slot:ReferenceSlot;label:string;positionFrame:string;sampleRate:number;fftSize:number;binHz:number;averageWindows:number;partial:boolean;status:Metric['status'];powers:Float64Array}
export type ReferencePacket={version:number;sequence:number;phase:'ready'|'error'|'unavailable';configKey:string;a?:ReferenceSpectrum;b?:ReferenceSpectrum;error?:string}
