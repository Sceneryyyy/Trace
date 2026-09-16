import type {MeterSnapshot,TraceAPI,TraceHostAPI} from '../shared'
import type {SpectrogramPacket} from '../spectrogramProtocol'
export function createSnapshotTransport(host:TraceHostAPI,subscribe:(callback:(snapshot:MeterSnapshot)=>void)=>void,subscribeSpectrogram:(callback:(packet:SpectrogramPacket)=>void)=>void=()=>{}):TraceAPI{
 const spectral=new Map<symbol,(packet:SpectrogramPacket)=>void>()
 subscribeSpectrogram(packet=>{for(const fn of [...spectral.values()]){try{fn(packet)}catch(error){console.error('TRACE_SPECTROGRAM_LISTENER',error)}}})
 const listeners=new Map<symbol,(snapshot:MeterSnapshot)=>void>()
 let latest:MeterSnapshot|undefined
 subscribe(snapshot=>{latest=snapshot;for(const listener of [...listeners.values()]){try{listener(snapshot)}catch(error){console.error('TRACE_SNAPSHOT_LISTENER',error)}}})
 return {importFiles:files=>host.importFiles(files),onSpectrogram:listener=>{const id=Symbol();spectral.set(id,listener);return()=>{spectral.delete(id)}},request:request=>host.request(request),onState:listener=>host.onState(listener),onSnapshot:listener=>{const id=Symbol();listeners.set(id,listener);if(latest){try{listener(latest)}catch(error){console.error('TRACE_SNAPSHOT_LISTENER',error)}}return()=>{listeners.delete(id)}}}
}
export function installSnapshotTransport():void{
 const api=createSnapshotTransport(window.traceHost,callback=>{
  window.addEventListener('message',event=>{
   if(event.source!==window||event.data?.type!=='trace-meter-stream-v1')return
   const frame=event.data.snapshot as MeterSnapshot
   if(frame?.protocolVersion!==1||typeof frame.positionFrame!=='string')return
   callback(frame)
  })
 },callback=>{
  window.addEventListener('message',event=>{
   if(event.source!==window||event.data?.type!=='trace-spectrogram-stream-v1')return
   const packet=event.data.packet as SpectrogramPacket
   if(typeof packet?.requestId!=='string'||!['partial','ready','error','cancelled'].includes(packet.phase))return
   callback(packet)
  })
 })
 Object.defineProperty(window,'trace',{value:Object.freeze(api),writable:false,configurable:false})
}
