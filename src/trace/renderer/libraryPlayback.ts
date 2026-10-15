import type {Command,TraceState} from '../shared'
import type {ExportSource} from '../exportTypes'
import {sameLibrarySource} from './libraryModel'

type Request=(command:Command,payload:Record<string,unknown>,valid:()=>boolean)=>Promise<unknown>
// One active operation plus one replaceable intent; opening a file never grants
// an old click permission to play a newer source. Guards also run inside App's queue.
export class LibraryPlayback {
 private epoch=0
 private pending?:{source:ExportSource;play:boolean;epoch:number}
 private work?:Promise<void>
 constructor(private read:()=>TraceState,private request:Request,private changed:(pending:boolean)=>void,private error:(error:unknown)=>void){}
 cancel():void{this.epoch++;this.pending=undefined}
 activate(source:ExportSource,play:boolean):Promise<void>{
  this.pending={source:{...source},play,epoch:++this.epoch}
  return this.start()
 }
 private start():Promise<void>{
  if(!this.work){this.changed(true);this.work=this.drain().finally(()=>{this.work=undefined;if(this.pending)return this.start();this.changed(false)})}
  return this.work
 }
 private async drain():Promise<void>{
  while(this.pending){
   const intent=this.pending;this.pending=undefined
   const valid=()=>intent.epoch===this.epoch&&!this.read().currentRecord
   if(!valid())continue
   try{
    if(!sameLibrarySource(this.read().playback,intent.source))await this.request('file.open',{...intent.source},valid)
    if(!valid())continue
    const file=this.read().playback
    if(!sameLibrarySource(file,intent.source)||!file)throw Error('STALE_PLAYBACK_SOURCE')
    const playing=file.outputReady&&!['ended','failed','paused'].includes(file.phase)
    if(intent.play)await this.request(playing?'playback.pause':'playback.play',{playbackId:file.id},()=>valid()&&sameLibrarySource(this.read().playback,intent.source)&&this.read().playback?.id===file.id)
   }catch(error){if(valid())this.error(error)}
  }
 }
}
