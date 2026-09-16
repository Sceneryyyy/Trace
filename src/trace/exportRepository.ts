import type {ExportRecord,ExportSource} from './exportTypes'
import type {AnalysisSource} from './analysisService'
/** Owned output metadata, independent of capture clocks or external source ownership. */
export interface ExportOwner {
 readonly directory:string
 readonly document:{sessionId:string;name:string;exports?:ExportRecord[]}
 save():Promise<void>
 event(type:string,details?:Record<string,unknown>):Promise<void>
}
export interface ExportRepository {
 session(id:string):ExportOwner
 sessions():ExportOwner[]
 analysisSource(id:string,role:ExportSource['role'],regionId?:string,exportId?:string):Promise<AnalysisSource>
}
