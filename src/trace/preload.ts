import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { TraceHostAPI, TraceState, MeterSnapshot } from './shared'
const api: TraceHostAPI = {
 importFiles:async files=>{if(!Array.isArray(files)||!files.length||files.length>4)throw Error('INVALID_IMPORT_FILES');const paths=files.map(file=>webUtils.getPathForFile(file));if(paths.some(path=>!path))throw Error('IMPORT_REQUIRES_DISK_FILE');return ipcRenderer.invoke('trace:import-files',paths)},
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
ipcRenderer.on('trace:spectrogram',(_event:Electron.IpcRendererEvent,packet:import('./spectrogramProtocol').SpectrogramPacket)=>{
 const v=packet.view,arrays=v?[v.decibels,v.status,v.coverage,v.rowFirstBin,v.rowLastBin]:[]
 window.postMessage({type:'trace-spectrogram-stream-v1',packet},'*',[...new Set(arrays.map(a=>a.buffer as ArrayBuffer))])
})
contextBridge.exposeInMainWorld('traceHost',api)
