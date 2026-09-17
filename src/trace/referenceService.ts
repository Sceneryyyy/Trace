import {randomUUID} from 'node:crypto'
import type {AnalysisService,AnalysisSource} from './analysisService'
import type {ExportSource} from './exportTypes'
import type {PlaybackView} from './shared'
import {referenceDelta,referenceOffset,referencePosition,referenceRange,type ReferenceRange} from './referenceMath'
import type {ReferencePeerView,ReferenceSlot,ReferenceView} from './referenceTypes'
export type ReferencePeer={id:string;source:AnalysisSource;ref:ExportSource;range:ReferenceRange;analysisId:string;positionFrame:string;gain:number;window:{startFrame:string;endFrame:string};selection:ReferenceRange|null;loop:boolean;follow:boolean;playbackId?:string}
const same=(source:AnalysisSource,view:PlaybackView)=>source.takeId===view.takeId&&source.role===view.role&&source.regionId===view.regionId&&source.exportId===view.exportId
export class ReferenceService {
 private peers:Partial<Record<ReferenceSlot,ReferencePeer>>={}
 private active:ReferenceSlot|null=null
 private revision=0
 private token=0
 private aToken=0
 private pendingA?:AnalysisSource
 private requested?:{ref:ExportSource;token:number}
 private loadingRef?:ExportSource
 private loading?:Promise<void>
 private pendingLabel:string|null=null
 private error:string|null=null
 private lastReference?:{ref:ExportSource;label:string}
 private paused=false
 private closing=false
 private offsetNs='0'
 private linked=true
 stopQueries:()=>Promise<void>=async()=>{}
 constructor(private analyses:AnalysisService,private resolve:(source:ExportSource)=>Promise<AnalysisSource>,private changed:()=>void){}
 get version(){return this.revision}
 get activeSlot(){return this.active}
 usesTake(id:string):boolean{const needs=(s:ExportSource|AnalysisSource|undefined)=>Boolean(s&&s.takeId===id&&s.role!=='export'&&s.role!=='deliverable');return needs(this.peers.a?.source)||needs(this.peers.b?.source)||needs(this.pendingA)||needs(this.requested?.ref)||needs(this.loadingRef)}
 peer(slot:ReferenceSlot):ReferencePeer|undefined{return this.peers[slot]}
 private publish(){this.revision++;this.changed()}
 private drop(slot:ReferenceSlot){const p=this.peers[slot];if(p)this.analyses.release(p.analysisId,true);delete this.peers[slot];if(this.active===slot)this.active=null}
 private create(source:AnalysisSource,view?:PlaybackView):ReferencePeer{
  const range=referenceRange(view?.selection||undefined,source.frames),selection=view?.selection||null
  const reuse=selection?view?.selectionAnalysis?.id:view?.analysisId
  const analysisId=reuse||this.analyses.start(selection?{...source,range,frames:String(BigInt(range.endFrame)-BigInt(range.startFrame)),label:source.label+' · 比较范围'}:source)
  this.analyses.retain(analysisId)
  return {id:randomUUID(),source:structuredClone(source),ref:{takeId:source.takeId,role:source.role,...(source.regionId?{regionId:source.regionId}:{}),...(source.exportId?{exportId:source.exportId}:{})},range,analysisId,positionFrame:view?.positionFrame||'0',gain:view?.gain??1,window:{startFrame:view?.startFrame||'0',endFrame:view?.endFrame||source.frames},selection,loop:view?.loop||false,follow:view?.follow||false,playbackId:view?.id}
 }
 async bindPrimary(source:AnalysisSource,view:PlaybackView):Promise<void>{
  if(this.closing||view.temporary)return
  const token=++this.aToken;this.pendingA=source;await this.stopQueries();if(token!==this.aToken||this.closing)return;this.pendingA=undefined;const next=this.create(source,view);this.drop('a');this.peers.a=next;this.active='a';this.error=null;this.publish()
 }
 setReference(ref:ExportSource,label:string):void{
  if(this.closing)throw Error('APP_CLOSING');this.lastReference={ref:{...ref},label};this.requested={ref:{...ref},token:++this.token};this.pendingLabel=label;this.error=null;this.publish();this.pump()
 }
 private pump(){
  if(this.loading||this.paused||this.closing||!this.requested)return
  this.loading=(async()=>{while(this.requested&&!this.paused&&!this.closing){const request=this.requested;this.requested=undefined;this.loadingRef=request.ref
   try{await this.stopQueries();if(request.token!==this.token)continue;this.drop('b');this.publish();const source=await this.resolve(request.ref)
    if(request.token!==this.token||this.paused||this.closing)continue
    this.peers.b=this.create(source);this.pendingLabel=null;this.error=null;this.publish()
   }catch(error){if(request.token===this.token&&!this.paused&&!this.closing){this.pendingLabel=null;this.error=String(error);this.publish()}}
   finally{this.loadingRef=undefined}
  }})().finally(()=>{this.loading=undefined;this.changed();this.pump()})
 }
 setRecordingBusy(value:boolean):void{
  if(this.paused===value)return;this.paused=value
  if(value&&this.loadingRef){this.requested={ref:{...(this.requested?.ref||this.loadingRef)},token:++this.token};this.publish()}
  if(value)void this.stopQueries();else this.pump()
 }
 observe(view:PlaybackView|null):void{
  if(!view||view.temporary){if(!this.peers.b&&!this.requested&&!this.loadingRef)this.drop('a');if(this.active!==null){this.active=null;this.changed()}return}
  const p=this.active?this.peers[this.active]:undefined;if(!p||!same(p.source,view)||p.playbackId!==view.id){if(this.active!==null){this.active=null;this.changed()}return}
  p.positionFrame=view.positionFrame;p.gain=view.gain;p.window={startFrame:view.startFrame,endFrame:view.endFrame};p.loop=view.loop;p.follow=view.follow
 }
 async range(slot:ReferenceSlot,value:ReferenceRange|undefined,reuseId?:string):Promise<void>{
  const p=this.peers[slot];if(!p)throw Error('REFERENCE_SOURCE_MISSING');const range=referenceRange(value,p.source.frames)
  if(range.startFrame===p.range.startFrame&&range.endFrame===p.range.endFrame)return
  await this.stopQueries();if(this.peers[slot]!==p||this.closing)throw Error('STALE_REFERENCE_SOURCE');const selection=range.startFrame==='0'&&range.endFrame===p.source.frames?null:range
  const id=reuseId||this.analyses.start(selection?{...p.source,range,frames:String(BigInt(range.endFrame)-BigInt(range.startFrame)),label:p.source.label+' · 比较范围'}:p.source)
  this.analyses.retain(id);this.analyses.release(p.analysisId,true);p.analysisId=id;p.range=range;p.selection=selection;this.error=null;this.publish()
 }
 configure(offsetNs:string,linked:boolean):void{referenceOffset(offsetNs);if(typeof linked!=='boolean')throw Error('INVALID_REFERENCE_CONFIG');this.offsetNs=String(BigInt(offsetNs));this.linked=linked;this.publish()}
 positions():{a:string|null;b:string|null}{
  const a=this.peers.a,b=this.peers.b;if(!a||!b)return {a:a?.positionFrame||null,b:b?.positionFrame||null}
  const inside=(p:ReferencePeer)=>BigInt(p.positionFrame)>=BigInt(p.range.startFrame)&&BigInt(p.positionFrame)<=BigInt(p.range.endFrame)?p.positionFrame:null
  if(!this.linked||!this.active)return {a:inside(a),b:inside(b)}
  return this.active==='a'?{a:inside(a),b:referencePosition(a.positionFrame,a.source.sampleRate,b.source.sampleRate,this.offsetNs,b.range)}:{a:referencePosition(b.positionFrame,b.source.sampleRate,a.source.sampleRate,String(-BigInt(this.offsetNs)),a.range),b:inside(b)}
 }
 activation(slot:ReferenceSlot,view:PlaybackView|null,atStart=false){
  this.observe(view);const p=this.peers[slot];if(!p)throw Error('REFERENCE_SOURCE_MISSING');const positions=this.positions(),position=atStart?p.range.startFrame:positions[slot];if(position===null||!atStart&&this.linked&&this.active&&positions[this.active]===null)throw Error('REFERENCE_POSITION_OUTSIDE_RANGE')
  return {source:structuredClone(p.source),ref:{...p.ref},positionFrame:position,range:{...p.range},selection:p.selection?{...p.selection}:null,window:{...p.window},gain:p.gain,loop:p.loop,follow:p.follow,resume:!atStart&&Boolean(view?.outputReady),version:this.version}
 }
 activated(slot:ReferenceSlot,view:PlaybackView){const p=this.peers[slot];if(!p||!same(p.source,view))throw Error('STALE_REFERENCE_SOURCE');p.playbackId=view.id;this.active=slot;this.observe(view);this.publish()}
 async clearReference(){this.lastReference=undefined;const inactive=this.active===null;++this.token;this.requested=undefined;this.pendingLabel=null;await this.stopQueries();this.drop('b');if(inactive)this.drop('a');this.error=null;this.publish()}
 async forgetTake(id:string,exportId?:string):Promise<void>{
  const matches=(r:ExportSource)=>r.takeId===id&&(!exportId||r.exportId===exportId)
  let cancelledPending=false
  if(this.requested&&matches(this.requested.ref)){++this.token;this.requested=undefined;this.pendingLabel=null;cancelledPending=true}
  if(this.pendingA&&matches(this.pendingA)){++this.aToken;this.pendingA=undefined}
  if(this.loadingRef&&matches(this.loadingRef)){++this.token;if(this.requested)this.requested.token=this.token;else{this.pendingLabel=null;cancelledPending=true}await this.loading}
  const slots=(['a','b'] as const).filter(s=>this.peers[s]&&matches(this.peers[s]!.ref));if(!slots.length){if(cancelledPending){this.error='REFERENCE_SOURCE_UNAVAILABLE';this.publish()}return}
  this.revision++;await this.stopQueries();for(const s of slots)this.drop(s);this.error='REFERENCE_SOURCE_UNAVAILABLE';this.publish()
 }
 async retry():Promise<void>{
  await this.stopQueries();this.error=null
  if(!this.peers.b&&this.lastReference){this.setReference(this.lastReference.ref,this.lastReference.label);return}
  const jobs=this.analyses.snapshots();for(const p of Object.values(this.peers)){if(!p||!['failed','cancelled'].includes(jobs.find(j=>j.id===p.analysisId)?.phase||''))continue;const selection=p.range.startFrame!=='0'||p.range.endFrame!==p.source.frames,id=this.analyses.start(selection?{...p.source,range:p.range,frames:String(BigInt(p.range.endFrame)-BigInt(p.range.startFrame)),label:p.source.label+' · 比较范围'}:p.source);this.analyses.retain(id);this.analyses.release(p.analysisId,true);p.analysisId=id}this.publish()
 }
 view():ReferenceView{
  const jobs=this.analyses.snapshots(),peer=(p?:ReferencePeer):ReferencePeerView|null=>p?{id:p.id,source:{...p.ref},label:p.source.label,format:p.source.assetFormat,sampleRate:p.source.sampleRate,channelCount:p.source.channelCount,frames:p.source.frames,range:{...p.range},positionFrame:p.positionFrame,gain:p.gain,analysis:jobs.find(j=>j.id===p.analysisId)}:null
  const a=peer(this.peers.a),b=peer(this.peers.b),ia=a?.analysis?.phase==='ready'?this.analyses.identity(a.analysis.id):undefined,ib=b?.analysis?.phase==='ready'?this.analyses.identity(b.analysis.id):undefined
  const compatible=Boolean(ia&&ib&&ia.engineSha256===ib.engineSha256&&ia.measurementConfigId===ib.measurementConfigId)
  const am=compatible?a?.analysis?.summary:undefined,bm=compatible?b?.analysis?.summary:undefined,durations={a:a?Number(BigInt(a.range.endFrame)-BigInt(a.range.startFrame))/a.sampleRate:0,b:b?Number(BigInt(b.range.endFrame)-BigInt(b.range.startFrame))/b.sampleRate:0}
  return {version:this.version,active:this.active,a,b,pending:this.pendingLabel,error:this.error||a?.analysis?.error||b?.analysis?.error||null,offsetNs:this.offsetNs,linked:this.linked,compatible,deltas:a&&b?{integrated:referenceDelta('integrated',am?.integratedToCursor,bm?.integratedToCursor,durations),truePeak:referenceDelta('truePeak',am?.maxTruePeak,bm?.maxTruePeak,durations),lra:referenceDelta('lra',am?.loudnessRange,bm?.loudnessRange,durations)}:null}
 }
 async shutdown(){this.closing=true;++this.token;++this.aToken;this.requested=undefined;await this.loading;await this.stopQueries();this.drop('a');this.drop('b')}
}
