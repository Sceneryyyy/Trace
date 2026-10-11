import {validateInstrumentResult} from './instrumentValidation'
import {performance} from 'node:perf_hooks'
import {PerformanceWindow} from './performance'
import {analysisOptions,instrumentConfigKey,type InstrumentNative,type InstrumentSettings,type InstrumentRequest,type InstrumentPacket} from './instrumentTypes'
/** Bounded computation and two cached query results; never owns audio transport. */
export class InstrumentService{
 private jobs=new Set<Promise<unknown>>()
 private cache=new Map<string,InstrumentPacket>()
 private closing=false
 readonly timings=new PerformanceWindow()
 private hits=0
 constructor(private native:InstrumentNative){}
 get pending(){return this.jobs.size}
 get usage(){return {pending:this.pending,cached:this.cache.size,hits:this.hits,timings:this.timings.snapshot()}}
 async query(request:InstrumentRequest,settings:InstrumentSettings):Promise<InstrumentPacket>{
  const configKey=instrumentConfigKey(settings),key=configKey+JSON.stringify(request),cached=this.cache.get(key)
  if(cached){this.hits++;return cached}
  if(this.closing||this.pending>=2)return {configKey,phase:'error',error:this.closing?'INSTRUMENT_CLOSED':'INSTRUMENT_QUEUE_FULL'}
  const started=performance.now(),job=Promise.resolve().then(()=>this.native.instrumentAnalyze({...request,config:analysisOptions(settings)}));this.jobs.add(job)
  try{const packet:InstrumentPacket={configKey,phase:'ready',data:validateInstrumentResult(await job,request,settings)};this.cache.set(key,packet);while(this.cache.size>2)this.cache.delete(this.cache.keys().next().value!);return packet}
  catch(e){return {configKey,phase:'error',error:String(e)}}
  finally{this.timings.observe(performance.now()-started);this.jobs.delete(job)}
 }
 async shutdown(){this.closing=true;await Promise.allSettled([...this.jobs]);this.cache.clear()}
}
