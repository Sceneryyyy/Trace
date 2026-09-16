import type {ExportOwner,ExportRepository} from './exportRepository'
import type {ImportService} from './importService'
import type {AnalysisSource} from './analysisService'
import type {ExportSource} from './exportTypes'
export class AssetRepository implements ExportRepository {
 private exports?: (id:string,exportId:string)=>Promise<AnalysisSource>
 constructor(private recordings:ExportRepository,private imports:ImportService){}
 setExportResolver(resolve:(id:string,exportId:string)=>Promise<AnalysisSource>):void{this.exports=resolve}
 session(id:string):ExportOwner {if(this.imports.has(id)){if(this.recordings.sessions().some(a=>a.document.sessionId===id))throw Error('ASSET_ID_COLLISION');return this.imports.session(id)}return this.recordings.session(id)}
 sessions():ExportOwner[]{const all=[...this.recordings.sessions(),...this.imports.sessions()];if(new Set(all.map(a=>a.document.sessionId)).size!==all.length)throw Error('ASSET_ID_COLLISION');return all}
 async analysisSource(id:string,role:ExportSource['role'],regionId?:string,exportId?:string):Promise<AnalysisSource>{
  this.session(id)
  if(role==='export'){if(!exportId||regionId||!this.exports)throw Error('INVALID_EXPORT_SOURCE');return this.exports(id,exportId)}
  if(this.imports.has(id)){if(role!=='source'||regionId||exportId)throw Error('INVALID_IMPORTED_SOURCE');return this.imports.analysisSource(id)}
  return this.recordings.analysisSource(id,role,regionId,exportId)
 }
}
