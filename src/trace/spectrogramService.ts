import {SpectrogramProjectionCache} from './spectrogramProjection'
import {SpectrogramStore,type TileRequest} from './spectrogramStore'
import {validateSpectrogramTile,type SpectrogramTile} from './spectrogramTile'
import {SpectrogramRaster,spectralFrame,validateSpectrogramRange,type SpectrogramRange,type SpectrogramView} from './spectrogramView'
import {firstWindowEnd,sourceKey,spectralConfig,type SpectrogramSource,type SpectrogramConfig} from './spectrogramSource'
import type {InstrumentRequest} from './instrumentTypes'

export type SpectrogramNative={spectrogramTile(request:InstrumentRequest&{firstFrame:string;columns:number;config:ReturnType<typeof spectralConfig>}):Promise<SpectrogramTile>}
export type SpectrogramPoint={key:string;frame:string;windowStart:string;bin:number;frequency:number;decibels:number|null;status:'ready'|'silence'|'unavailable'|'gap'|'error'}
type Context={projections:SpectrogramProjectionCache;key:string;source:SpectrogramSource;config:SpectrogramConfig;store:SpectrogramStore}
type ViewJob={generation:number;source:SpectrogramSource;config:SpectrogramConfig;range:SpectrogramRange;changed?:((v:SpectrogramView)=>void);resolve:(v:SpectrogramView)=>void;reject:(error:unknown)=>void}
const cancelled=()=>Error('SPECTROGRAM_CANCELLED')

/** One active view plus one replaceable request; at most one source/cache is retained. */
export class SpectrogramService {
  private context?:Context
  private next?:ViewJob
  private work?:Promise<void>
  private generation=0
  private closed=false
  constructor(private native:SpectrogramNative){}
  get usage(){return {views:(this.work?1:0)+(this.next?1:0),...(this.context?.store.usage||{bytes:0,tiles:0,pending:0}),projectionBytes:this.context?.projections.bytes||0}}
  query(source:SpectrogramSource,config:SpectrogramConfig,range:SpectrogramRange,changed?:((v:SpectrogramView)=>void)):Promise<SpectrogramView> {
    if(this.closed)return Promise.reject(Error('SPECTROGRAM_CLOSED'))
    try{sourceKey(source,config);validateSpectrogramRange(range,source.request.sampleRate)}catch(error){return Promise.reject(error)}
    const generation=++this.generation
    this.next?.reject(cancelled())
    const result=new Promise<SpectrogramView>((resolve,reject)=>{this.next={generation,source:structuredClone(source),config:{...config},range:{...range},changed,resolve,reject}})
    this.startPump()
    return result
  }
  private startPump():void {
    if(this.work||this.closed)return
    this.work=this.pump().finally(()=>{this.work=undefined;if(this.next)this.startPump()})
  }
  private async pump():Promise<void> {
    while(this.next&&!this.closed) {
      const job=this.next;this.next=undefined
      try{job.resolve(await this.render(job))}catch(error){job.reject(error)}
    }
  }
  private current(generation:number):void {if(this.closed||generation!==this.generation)throw cancelled()}
  private async bind(job:ViewJob):Promise<Context> {
    const key=sourceKey(job.source,job.config)
    if(this.context?.key!==key) {
      await this.context?.store.close();this.context?.projections.clear();this.context=undefined;this.current(job.generation)
      const source=job.source,config=job.config
      const store=new SpectrogramStore(async request=>{
        const hop=Math.min(config.fftSize/4,Math.floor(source.request.sampleRate/50))
        const tile=validateSpectrogramTile(await this.native.spectrogramTile({...source.request,...request,positionFrame:String(BigInt(request.firstFrame)+BigInt((request.columns-1)*hop)),config:spectralConfig(config)}))
        if(tile.fftSize!==config.fftSize||tile.sampleRate!==source.request.sampleRate||tile.channels!==source.channelCount)throw Error('STALE_SPECTROGRAM_TILE')
        return tile
      },source.cacheRoot,source.request.kind==='file'?48*1024*1024:96*1024*1024)
      this.context={key,source,config,store,projections:new SpectrogramProjectionCache()}
    }
    this.context.source=job.source
    return this.context
  }
  private request(c:Context,index:bigint):TileRequest {
    const first=firstWindowEnd(c.source,c.config),hop=BigInt(Math.min(c.config.fftSize/4,Math.floor(c.source.request.sampleRate/50)))
    const block=index/64n*64n,end=spectralFrame(c.source.availableEnd),at=first+block*hop
    if(at>end)throw Error('SPECTROGRAM_RANGE_UNAVAILABLE')
    return {key:c.key,firstFrame:String(at),columns:Number((end-at)/hop+1n<64n?(end-at)/hop+1n:64n)}
  }
  private async render(job:ViewJob):Promise<SpectrogramView> {
    this.current(job.generation)
    const c=await this.bind(job);this.current(job.generation)
    const source=job.source,start=spectralFrame(job.range.startFrame),end=spectralFrame(job.range.endFrame)
    const availableStart=spectralFrame(source.availableStart),availableEnd=spectralFrame(source.availableEnd)
    c.store.retainRange(c.key,availableStart.toString(),availableEnd.toString())
    const totalBudget=(source.request.kind==='file'?64:112)*1024*1024
    const raster=new SpectrogramRaster(job.range,c.key,job.generation,source.request.sampleRate,job.config.fftSize,c.projections,totalBudget-c.store.budgetBytes)
    const first=firstWindowEnd(source,job.config),hop=BigInt(raster.view.hop)
    const coveredStart=start>availableStart+BigInt(job.config.fftSize)?start:availableStart+BigInt(job.config.fftSize)
    const a=coveredStart>first?(coveredStart-first)/hop:0n,b=(end<availableEnd?end:availableEnd)
    if(b<first||end<=availableStart)return raster.snapshot(1,true)
    const last=(b-first)/hop,firstBlock=a/64n,lastBlock=last/64n,total=lastBlock-firstBlock+1n
    let completed=0n,lastPublication=Date.now(),announced=false
    // Newest data first so initial LIVE views become useful before older tiles finish.
    for(let block=lastBlock;block>=firstBlock;block--) {
      this.current(job.generation)
      const request=this.request(c,block*64n)
      if(BigInt(request.firstFrame)+BigInt((request.columns-1)*raster.view.hop)<availableStart)continue
      const tile=await c.store.get(request);this.current(job.generation)
      raster.setProjectionBudget(totalBudget-c.store.usage.bytes)
      raster.add(tile,availableStart,availableEnd);completed++
      const coldNext=block>firstBlock&&!c.store.hasMemory(this.request(c,(block-1n)*64n))
      if(job.changed&&(Date.now()-lastPublication>=160||!announced&&coldNext)) {job.changed(raster.snapshot(Number(completed)/Number(total),false));lastPublication=Date.now();announced=true}
      // Cached tiles must not monopolize the main event loop during a large viewport rebuild.
      await new Promise<void>(resolve=>setImmediate(resolve))
    }
    this.current(job.generation)
    return raster.snapshot(1,true)
  }
  async point(key:string,frame:string,frequency:number):Promise<SpectrogramPoint> {
    const c=this.context;if(this.closed||!c||c.key!==key)throw Error('STALE_SPECTROGRAM_SOURCE')
    const source=c.source,generation=this.generation,position=spectralFrame(frame),first=firstWindowEnd(source,c.config)
    if(!Number.isFinite(frequency)||frequency<0||frequency>source.request.sampleRate/2)throw Error('INVALID_SPECTROGRAM_FREQUENCY')
    const bin=Math.round(frequency*c.config.fftSize/source.request.sampleRate),hop=BigInt(Math.min(c.config.fftSize/4,Math.floor(source.request.sampleRate/50)))
    const result=(at:bigint,status:SpectrogramPoint['status'],db:number|null=null):SpectrogramPoint=>({key,frame:String(at),windowStart:String(at>=BigInt(c.config.fftSize)?at-BigInt(c.config.fftSize):0n),bin,frequency:bin*source.request.sampleRate/c.config.fftSize,decibels:db,status})
    if(position<first||position>spectralFrame(source.availableEnd))return result(position,'unavailable')
    const index=(position-first)/hop,at=first+index*hop
    if(at-BigInt(c.config.fftSize)<spectralFrame(source.availableStart))return result(at,'unavailable')
    const tile=await c.store.get(this.request(c,index));this.current(generation)
    if(this.context!==c)throw Error('STALE_SPECTROGRAM_SOURCE')
    const col=Number((at-BigInt(tile.firstFrame))/hop),state=tile.status[col]
    if(state!==1)return result(at,(['unavailable','ready','gap','error'] as const)[state])
    const db=tile.decibels[col*tile.bins+bin]
    return result(at,db===-Infinity?'silence':'ready',db===-Infinity?null:db)
  }
  cancel():void {++this.generation;this.next?.reject(cancelled());this.next=undefined}
  async close():Promise<void> {this.closed=true;this.cancel();await this.work;await this.context?.store.close();this.context?.projections.clear();this.context=undefined}
}
