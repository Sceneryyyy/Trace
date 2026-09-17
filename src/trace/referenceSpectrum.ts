import {nativeFilePath} from './nativeFilePath'
import {instrumentConfigKey,type InstrumentSettings,type InstrumentPacket,type InstrumentRequest} from './instrumentTypes'
import type {MeterSnapshot} from './shared'
import type {ReferenceService,ReferencePeer} from './referenceService'
import type {ReferencePacket,ReferenceSlot,ReferenceSpectrum} from './referenceTypes'
type Request={version:number;settings:InstrumentSettings;positions:{a:string|null;b:string|null};a:ReferencePeer;b:ReferencePeer;active:'a'|'b'|null;packet?:InstrumentPacket;generation:number;signature:string}
export class ReferenceSpectrumService {
 private next?:Request
 private work?:Promise<void>
 private generation=0
 private sequence=0
 private releasing=0
 private last=''
 constructor(private references:ReferenceService,private query:(r:InstrumentRequest,s:InstrumentSettings)=>Promise<InstrumentPacket>,private send:(packet:ReferencePacket)=>void){}
 get busy(){return Boolean(this.work)}
 request(snapshot:Pick<MeterSnapshot,'sourceId'|'instruments'>,settings:InstrumentSettings):void{
  if(this.releasing)return
  const a=this.references.peer('a'),b=this.references.peer('b'),active=this.references.activeSlot;if(!a||!b||!active||(active==='a'?a:b).playbackId!==snapshot.sourceId)return
  const positions=this.references.positions(),version=this.references.version,signature=JSON.stringify({version,positions,config:instrumentConfigKey(settings)})
  if(signature===this.last)return;this.last=signature
  this.next={version,settings:{...settings},positions,a,b,active:this.references.activeSlot,packet:snapshot.instruments,generation:this.generation,signature};this.pump()
 }
 private pump(){if(this.work||!this.next)return;this.work=(async()=>{while(this.next){const request=this.next;this.next=undefined;const valid=()=>request.generation===this.generation&&request.version===this.references.version
  if(!valid())continue;const configKey=instrumentConfigKey(request.settings)
  if(request.positions.a===null||request.positions.b===null){this.send({version:request.version,sequence:++this.sequence,phase:'unavailable',configKey,error:'REFERENCE_POSITION_OUTSIDE_RANGE'});continue}
  try{
   const one=async(slot:ReferenceSlot,p:ReferencePeer):Promise<ReferenceSpectrum>=>{
    const position=request.positions[slot]!,whole=p.range.startFrame==='0'&&p.range.endFrame===p.source.frames
    let packet=request.active===slot&&whole&&request.packet?.configKey===configKey&&request.packet.data?.positionFrame===position?request.packet:undefined
    if(!packet){const origin=BigInt(p.source.decodeRange?.startFrame||'0');packet=await this.query({kind:'file',identity:'reference:'+p.id,sources:p.source.sources.map(nativeFilePath),sampleRate:p.source.sampleRate,positionFrame:String(BigInt(position)-BigInt(p.range.startFrame)),startFrame:String(origin+BigInt(p.range.startFrame)),endFrame:String(origin+BigInt(p.range.endFrame))},request.settings)}
    if(packet.phase!=='ready'||!packet.data)throw Error(packet.error||'REFERENCE_SPECTRUM_UNAVAILABLE')
    const d=packet.data;return {slot,label:p.source.label,positionFrame:position,sampleRate:d.sampleRate,fftSize:d.fftSize,binHz:d.binHz,averageWindows:d.averageWindows,partial:d.partialAverage,status:d.status,powers:d.average}
   }
   const a=await one('a',request.a);if(!valid())continue;const b=await one('b',request.b);if(valid())this.send({version:request.version,sequence:++this.sequence,phase:'ready',configKey,a,b})
  }catch(error){if(valid())this.send({version:request.version,sequence:++this.sequence,phase:'error',configKey,error:String(error)})}
 }})().finally(()=>{this.work=undefined;this.pump()})}
 async cancel(){this.releasing++;this.generation++;this.next=undefined;this.last='';try{await this.work}finally{this.releasing--}}
}
