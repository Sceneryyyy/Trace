import type {MeterSnapshot,TraceAPI,TraceHostAPI} from '../shared'
export function createSnapshotTransport(host:TraceHostAPI,subscribe:(callback:(snapshot:MeterSnapshot)=>void)=>void):TraceAPI{
 const listeners=new Map<symbol,(snapshot:MeterSnapshot)=>void>()
 let latest:MeterSnapshot|undefined
 subscribe(snapshot=>{latest=snapshot;for(const listener of [...listeners.values()]){try{listener(snapshot)}catch(error){console.error('TRACE_SNAPSHOT_LISTENER',error)}}})
 return {request:request=>host.request(request),onState:listener=>host.onState(listener),onSnapshot:listener=>{const id=Symbol();listeners.set(id,listener);if(latest){try{listener(latest)}catch(error){console.error('TRACE_SNAPSHOT_LISTENER',error)}}return()=>{listeners.delete(id)}}}
}
export function installSnapshotTransport():void{
 const api=createSnapshotTransport(window.traceHost,callback=>{
  window.addEventListener('message',event=>{
   if(event.source!==window||event.data?.type!=='trace-meter-stream-v1')return
   const frame=event.data.snapshot as MeterSnapshot
   if(frame?.protocolVersion!==1||typeof frame.positionFrame!=='string')return
   callback(frame)
  })
 })
 Object.defineProperty(window,'trace',{value:Object.freeze(api),writable:false,configurable:false})
}
