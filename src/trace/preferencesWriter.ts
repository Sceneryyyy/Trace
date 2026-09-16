import {mkdir,writeFile,rename,unlink} from 'node:fs/promises'
import {dirname} from 'node:path'
import {randomUUID} from 'node:crypto'
type Operations={mkdir:typeof mkdir;writeFile:typeof writeFile;rename:typeof rename;unlink:typeof unlink}
const operations:Operations={mkdir,writeFile,rename,unlink}
/** Serial, coalesced atomic preference writes. Transient locks never block the audio/control event loop. */
export class PreferencesWriter {
 private next:string|undefined
 private task:Promise<void>|undefined
 private error:Error|null=null
 private retries=0
 get stats(){return {pending:this.next!==undefined,writing:Boolean(this.task),retries:this.retries}}
 constructor(private target:string,private changed:(error:Error|null)=>void,private io:Operations=operations,private delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))){}
 save(json:string):void {if(Buffer.byteLength(json)>512*1024)throw Error('PREFERENCES_TOO_LARGE');this.next=json;this.start()}
 private start():void {
  if(this.task)return
  this.task=Promise.resolve().then(()=>this.pump()).finally(()=>{this.task=undefined;if(this.next!==undefined)this.start()})
 }
 private async pump():Promise<void>{
  while(this.next!==undefined){const data=this.next;this.next=undefined
   try{if(await this.write(data)){this.error=null;this.changed(null)}}
   catch(error){this.error=error instanceof Error?error:Error(String(error));this.changed(this.error)}
  }
 }
 private async write(data:string):Promise<boolean>{
  const temp=this.target+'.'+randomUUID()+'.tmp'
  try{
   await this.io.mkdir(dirname(this.target),{recursive:true});await this.io.writeFile(temp,data,{flag:'wx'})
   for(let attempt=0;;attempt++){
    if(this.next!==undefined)return false
    try{await this.io.rename(temp,this.target);return true}
    catch(error){if(attempt>=5||!['EPERM','EACCES','EBUSY'].includes((error as NodeJS.ErrnoException).code||''))throw error;this.retries++;await this.delay([20,50,100,200,400][attempt])}
   }
  }finally{await this.io.unlink(temp).catch(()=>{})}
 }
 async flush():Promise<void>{while(this.task||this.next!==undefined){this.start();await this.task}if(this.error)throw this.error}
}
