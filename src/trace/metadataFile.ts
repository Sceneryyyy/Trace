import {constants} from 'node:fs'
import {open,lstat,rename,unlink} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
/** Bounded regular-file reads; verify the opened object and never follow a known link. */
export async function readRegularFile(file:string,maximum:number,error:string):Promise<Buffer>{
 const before=await lstat(file)
 if(!before.isFile()||before.isSymbolicLink()||before.size>maximum)throw Error(error)
 const handle=await open(file,constants.O_RDONLY|(process.platform==='win32'?0:constants.O_NOFOLLOW))
 try{
  const stat=await handle.stat()
  if(!stat.isFile()||stat.dev!==before.dev||stat.ino!==before.ino||stat.size!==before.size||stat.size>maximum)throw Error(error)
  const bytes=Buffer.alloc(stat.size+1);let count=0
  while(count<bytes.length){const next=await handle.read(bytes,count,bytes.length-count,count);if(!next.bytesRead)break;count+=next.bytesRead}
  if(count!==stat.size)throw Error(error)
  return bytes.subarray(0,count)
 }finally{await handle.close()}
}
export async function readMetadata(file:string,maximum:number,error:string):Promise<string>{return (await readRegularFile(file,maximum,error)).toString('utf8')}
/** Only the uniquely created temporary file is ever replaced or cleaned up. */
export async function replaceMetadata(file:string,data:string,maximum:number,error:string):Promise<void>{
 if(Buffer.byteLength(data)>maximum)throw Error(error)
 const temporary=file+'.'+randomUUID()+'.tmp';let owned=false
 try{
  const handle=await open(temporary,'wx');owned=true
  try{await handle.writeFile(data);await handle.sync()}finally{await handle.close()}
  await rename(temporary,file)
 }finally{if(owned)await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e})}
}
export async function appendMetadata(file:string,data:string):Promise<void>{
 const before=await lstat(file).catch(error=>{if(error.code!=='ENOENT')throw error;return undefined})
 if(before&&(!before.isFile()||before.isSymbolicLink()))throw Error('INVALID_EVENT_FILE')
 const flags=constants.O_WRONLY|constants.O_APPEND|(before?0:constants.O_CREAT|constants.O_EXCL)|(process.platform==='win32'?0:constants.O_NOFOLLOW)
 const handle=await open(file,flags)
 try{const stat=await handle.stat();if(!stat.isFile()||before&&(stat.dev!==before.dev||stat.ino!==before.ino))throw Error('INVALID_EVENT_FILE');await handle.appendFile(data)}finally{await handle.close()}
}
