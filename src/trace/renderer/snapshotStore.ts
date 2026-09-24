import {useRef,useSyncExternalStore} from 'react'
import type {MeterSnapshot} from '../shared'

// 30 Hz meter snapshots live outside React state: publishing notifies subscribers
// directly, and components re-render only for the slice they selected.
let current:MeterSnapshot|null=null
const listeners=new Set<()=>void>()

export function publishSnapshot(next:MeterSnapshot|null):void{
 current=next
 for(const listener of [...listeners])listener()
}
export function getSnapshot():MeterSnapshot|null{return current}
function subscribe(listener:()=>void):()=>void{
 listeners.add(listener)
 return()=>{listeners.delete(listener)}
}
/** Subscribe to the raw snapshot stream; re-renders on every published frame. */
export function useMeterSnapshot():MeterSnapshot|null{
 return useSyncExternalStore(subscribe,getSnapshot,()=>null)
}
/**
 * Subscribe to a derived slice of the snapshot. The selector re-runs on every
 * published frame (and on every render, so it may close over current props),
 * but the component re-renders only when `equal` reports a change.
 */
export function useSnapshotSelector<T>(selector:(snapshot:MeterSnapshot|null)=>T,equal:(a:T,b:T)=>boolean=Object.is):T{
 const cache=useRef<{input:MeterSnapshot|null;output:T}|null>(null)
 const get=():T=>{
  const input=getSnapshot()
  const output=selector(input)
  if(cache.current&&cache.current.input===input&&equal(cache.current.output,output))return cache.current.output
  cache.current={input,output}
  return output
 }
 return useSyncExternalStore(subscribe,get,()=>get())
}
export function shallowEqual(a:unknown,b:unknown):boolean{
 if(Object.is(a,b))return true
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false
 const ka=Object.keys(a),kb=Object.keys(b)
 if(ka.length!==kb.length)return false
 return ka.every(k=>Object.is((a as Record<string,unknown>)[k],(b as Record<string,unknown>)[k]))
}
