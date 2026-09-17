import type {SupportEventKind} from './supportJournal'
let sink:((kind:SupportEventKind,detail?:number)=>void)|undefined
export function setSupportEventSink(value:typeof sink){sink=value}
export function supportEvent(kind:SupportEventKind,detail?:number):void{try{sink?.(kind,detail)}catch{/* Diagnostics must not replace the operation's own error handling. */}}
