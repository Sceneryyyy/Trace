import {mkdir,open,unlink,rmdir} from 'node:fs/promises'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import type {SupportEvent,SupportStatus} from './supportJournal'
import {feedbackEmail,feedbackTemplate} from './supportContent'
export {feedbackMailto} from './supportContent'
/** Exports only an already-projected report. Exclusive new directory; never replace user files. */
export async function exportSupportReport(parent:string,report:unknown):Promise<string>{
 const json=JSON.stringify(report,null,2)
 if(Buffer.byteLength(json)>512*1024)throw Error('DIAGNOSTICS_TOO_LARGE')
 const directory=join(parent,'Trace-diagnostics-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8))
 await mkdir(directory)
 const created:string[]=[]
 try{
  for(const [name,body]of [['diagnostics.json',json],['feedback.txt','反馈邮箱：'+feedbackEmail+'\n\n'+feedbackTemplate]]){
   const file=join(directory,name),handle=await open(file,'wx');created.push(file)
   try{await handle.writeFile(body,'utf8')}finally{await handle.close()}
  }
  return directory
 }catch(error){for(const file of created)await unlink(file).catch(()=>{});await rmdir(directory).catch(()=>{});throw error}
}
export type SupportReport={schemaVersion:1;product:string;version:string;buildId:string;capturedAt:string;
 runtime:{platform:string;osRelease:string;arch:string;electron:string;chrome:string;node:string;memoryGiB:number;gpu:Record<string,string>};
 status:SupportStatus;events:SupportEvent[];snapshot:unknown}
