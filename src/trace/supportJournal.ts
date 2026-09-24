import {mkdir,readFile,stat} from 'node:fs/promises'
import {writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {PreferencesWriter} from './preferencesWriter'

const kinds=['started','clean-exit','command-failed','recording','capture','jobs','renderer-react','renderer-script','renderer-promise','renderer-gone','renderer-reload','child-gone','file-worker-exit','file-worker-timeout','shutdown-timeout','startup-failed','main-uncaught','main-rejection','diagnostic-exported'] as const
export type SupportEventKind=typeof kinds[number]
export type SupportEvent={at:string;kind:SupportEventKind;count:number;detail?:number}
export type SupportStatus={previousInterrupted:boolean;loggingAvailable:boolean;lastFault:SupportEvent|null}
const iso=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
const event=(raw:unknown):SupportEvent|null=>{
 if(!raw||typeof raw!=='object')return null
 const v=raw as SupportEvent
 if(!iso(v.at)||!kinds.includes(v.kind)||!Number.isSafeInteger(v.count)||v.count<1)return null
 return {at:v.at,kind:v.kind,count:Math.min(v.count,1000000),...(Number.isSafeInteger(v.detail)?{detail:Math.max(-2147483648,Math.min(4294967295,v.detail!))}:{})}
}
async function boundedJSON(file:string,maximum=65536):Promise<unknown>{
 try{if((await stat(file)).size>maximum)return null;return JSON.parse(await readFile(file,'utf8'))}catch{return null}
}
/** Fixed-field journal: no exception strings, paths, media, identifiers or command arguments. */
export class SupportJournal {
 private events:SupportEvent[]=[]
 private clean=false
 private writer:PreferencesWriter
 private lastFault:SupportEvent|null=null
 private available=true
 private previousInterrupted=false
 private constructor(private directory:string,private changed:()=>void){
  this.writer=new PreferencesWriter(join(directory,'events.json'),error=>{const next=!error;if(this.available!==next){this.available=next;this.changed()}})
 }
 static async open(directory:string,changed:()=>void=()=>{}):Promise<SupportJournal>{
  const journal=new SupportJournal(directory,changed)
  try{await mkdir(directory,{recursive:true})}catch{journal.available=false}
  const old=await boundedJSON(join(directory,'events.json')) as {schemaVersion?:number;clean?:boolean;events?:unknown[]}|null
  if(old?.schemaVersion===1&&Array.isArray(old.events)){
   journal.events=old.events.slice(-128).map(event).filter((e):e is SupportEvent=>Boolean(e))
   journal.previousInterrupted=old.clean!==true
  }
  const fatal=event(await boundedJSON(join(directory,'fatal.json'),1024))
  const last=journal.events.at(-1)
  if(fatal&&(!last||fatal.at>last.at)){journal.events.push(fatal);journal.previousInterrupted=true}
  journal.lastFault=[...journal.events].reverse().find(e=>/failed|gone|uncaught|rejection|file-worker-exit|renderer-(react|script|promise)/.test(e.kind))||null
  journal.record('started');await journal.flush();return journal
 }
 get status():SupportStatus{return {previousInterrupted:this.previousInterrupted,loggingAvailable:this.available,lastFault:this.lastFault?{...this.lastFault}:null}}
 history():SupportEvent[]{return this.events.map(e=>({...e}))}
 record(kind:SupportEventKind,detail?:number):void{
  if(!kinds.includes(kind))return
  const next:SupportEvent={at:new Date().toISOString(),kind,count:1,...(Number.isSafeInteger(detail)?{detail}:{})},last=this.events.at(-1)
  // Coalesce repeated errors for one second; disk writes and memory remain bounded.
  if(last&&last.kind===kind&&last.detail===next.detail&&Date.parse(next.at)-Date.parse(last.at)<1000){last.count=Math.min(last.count+1,1000000);return}
  this.events.push(next);if(this.events.length>128)this.events.shift()
  if(/failed|gone|uncaught|rejection|file-worker-exit|renderer-(react|script|promise)/.test(kind))this.lastFault=next
  this.save();this.changed()
 }
 private save(){this.writer.save(JSON.stringify({schemaVersion:1,clean:this.clean,events:this.events}))}
 async flush(){try{await this.writer.flush()}catch{this.available=false}}
 async finish(){this.clean=true;this.record('clean-exit');await this.flush()}
 fatal(kind:'main-uncaught'|'main-rejection'|'startup-failed'):void{
  // Only the fatal path uses a bounded synchronous record before immediate termination.
  try{writeFileSync(join(this.directory,'fatal.json'),JSON.stringify({at:new Date().toISOString(),kind,count:1}))}catch{}
 }
}
