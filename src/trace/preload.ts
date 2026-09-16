import { contextBridge, ipcRenderer } from 'electron'
import type { TraceHostAPI, TraceState, MeterSnapshot } from './shared'
const api: TraceHostAPI = {
 request: request => ipcRenderer.invoke('trace:command', request),
 onState(listener) {
  const handler=(_event:Electron.IpcRendererEvent,state:TraceState):void=>listener(state)
  ipcRenderer.on('trace:state',handler)
  return ()=>ipcRenderer.removeListener('trace:state',handler)
 }
}
// A single snapshot stream. Never expose the IPC event or an arbitrary IPC channel.
ipcRenderer.on('trace:snapshot',(_event:Electron.IpcRendererEvent,snapshot:MeterSnapshot)=>{
 const data=snapshot.instruments?.data
 const views=data?[data.current,data.average,data.peakHold,data.field.points,data.field.polarRms,data.field.polarPeak,data.field.polarEnvelope]:[]
 const buffers=[...new Set(views.map(view=>view.buffer as ArrayBuffer))]
 window.postMessage({type:'trace-meter-stream-v1',snapshot},'*',buffers)
})
contextBridge.exposeInMainWorld('traceHost',api)
