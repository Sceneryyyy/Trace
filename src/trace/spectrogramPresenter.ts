import {SpectrogramService,type SpectrogramNative} from './spectrogramService'
import type {SpectrogramSource} from './spectrogramSource'
import type {SpectrogramRange} from './spectrogramView'
import {spectrogramConfigKey,type SpectrogramQuery,type SpectrogramSettings,type SpectrogramPacket} from './spectrogramProtocol'
export type SpectrogramBinding={source:SpectrogramSource;range:SpectrogramRange;toNative:(frame:string)=>string;toAxis:(frame:string)=>string;valid:()=>boolean}
/** Raised only by the application resolver after a concrete source/visibility identity mismatch. */
export class SpectrogramContextChanged extends Error {constructor(){super('SPECTROGRAM_CONTEXT_CHANGED')}}
/** Owns presentation requests, separate from the meter snapshot stream and command reply cache. */
export class SpectrogramPresenter {
  private service:SpectrogramService
  private active?:{id:string;binding?:SpectrogramBinding;key?:string}
  private releasing?:Promise<void>
  private closed=false
  constructor(private native:SpectrogramNative,private resolve:(q:SpectrogramQuery,s:SpectrogramSettings)=>Promise<SpectrogramBinding>,private publish:(packet:SpectrogramPacket)=>void){this.service=new SpectrogramService(native)}
  get usage(){return this.service.usage}
  request(id:string,q:SpectrogramQuery,s:SpectrogramSettings):void {
    if(this.closed||this.releasing)throw Error('SPECTROGRAM_SOURCE_CHANGING')
    this.cancel();const active={id} as NonNullable<typeof this.active>;this.active=active
    void (async()=>{
      try{
        const binding=await this.resolve(q,s)
        if(this.active!==active||!binding.valid())return
        active.binding=binding
        const send=(view:import('./spectrogramView').SpectrogramView,phase:'partial'|'ready')=>{
          if(this.active!==active||!binding.valid())return
          active.key=view.key
          this.publish({configKey:spectrogramConfigKey(s),requestId:id,source:q.source,phase,view,axisStartFrame:binding.toAxis(view.startFrame),axisEndFrame:binding.toAxis(view.endFrame)})
        }
        const view=await this.service.query(binding.source,s,binding.range,v=>send(v,'partial'));send(view,'ready')
      }catch(error){if(this.active===active&&(!active.binding||active.binding.valid()))this.publish({configKey:spectrogramConfigKey(s),requestId:id,source:q.source,phase:error instanceof SpectrogramContextChanged?'cancelled':'error',error:String(error)})}
    })()
  }
  async point(id:string,frame:string,frequency:number){
    const active=this.active,b=active?.binding
    if(!active||active.id!==id||!active.key||!b||!b.valid())throw Error('STALE_SPECTROGRAM_SOURCE')
    const p=await this.service.point(active.key,b.toNative(frame),frequency)
    if(this.active!==active||!b.valid())throw Error('STALE_SPECTROGRAM_SOURCE')
    return {...p,nativeFrame:p.frame,frame:b.toAxis(p.frame),windowStart:b.toAxis(p.windowStart)}
  }
  cancel(id?:string):void {if(id&&this.active?.id!==id)return;this.active=undefined;this.service.cancel()}
  async release():Promise<void> {
    if(this.releasing)return this.releasing
    this.cancel()
    this.releasing=this.service.close().then(()=>{if(!this.closed)this.service=new SpectrogramService(this.native)}).finally(()=>{this.releasing=undefined})
    return this.releasing
  }
  async close():Promise<void>{this.closed=true;await this.release()}
}
