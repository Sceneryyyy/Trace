import { contextBridge, ipcRenderer } from 'electron'
import type { TraceAPI, TraceState, MeterSnapshot } from './shared'
const api: TraceAPI = {
  request: request => ipcRenderer.invoke('trace:command', request),
  onState(listener) {
    const handler = (_event: Electron.IpcRendererEvent, state: TraceState): void => listener(state)
    ipcRenderer.on('trace:state', handler)
    return () => ipcRenderer.removeListener('trace:state', handler)
  },
  onSnapshot(listener) {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: MeterSnapshot): void => listener(snapshot)
    ipcRenderer.on('trace:snapshot', handler)
    return () => ipcRenderer.removeListener('trace:snapshot', handler)
  },
}
contextBridge.exposeInMainWorld('trace', api)
