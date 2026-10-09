import {spawn} from 'node:child_process'
import type {ChildProcessWithoutNullStreams} from 'node:child_process'
import {basename,isAbsolute} from 'node:path'
type Request={program:string;args:string[];testReadRate?:number}
let child:ReturnType<typeof spawn>|undefined,started=false,cancelled=false,stderrBytes=0,stdoutBytes=0
let forceKill:ReturnType<typeof setTimeout>|undefined
function send(value:unknown):void{if(process.connected)process.send?.(value as never,error=>{if(error)cancel()})}
function cancel():void{
 cancelled=true
 if(!child){process.exit(1);return}
 child.kill()
 // SIGTERM can be ignored on POSIX. Keep the supervisor alive until close so
 // cancellation/disconnect cannot leave an encoder writing in the background.
 if(!forceKill)forceKill=setTimeout(()=>child?.kill('SIGKILL'),2000)
}
process.on('disconnect',cancel)
process.on('message',(message:unknown)=>{
 const value=message as Request&{type?:string}
 if(value.type==='cancel'){cancel();return}
 if(started||cancelled)return
 started=true
 try{
  if(!isAbsolute(value.program)||!Array.isArray(value.args)||value.args.length>256||value.args.some(a=>typeof a!=='string'||a.includes('\0')))throw Error('INVALID_MEDIA_PROCESS')
  const args=[...value.args]
  const rate=value.testReadRate??0
  if(Number.isFinite(rate)&&rate>0&&rate<=1000&&basename(value.program).toLowerCase()==='ffmpeg.exe'&&args.some(a=>a==='libmp3lame'||a==='aac')){
   const index=args.indexOf('-i');if(index>=0)args.splice(index,0,'-readrate',String(value.testReadRate))
  }
  child=spawn(value.program,args,{windowsHide:true,stdio:['ignore','pipe','pipe']})
  send({type:'spawn',pid:child.pid,program:value.program,args})
  const pipes=child as ChildProcessWithoutNullStreams
  pipes.stdout.on('data',chunk=>{stdoutBytes+=chunk.length;if(stdoutBytes>4000000){send({type:'error',message:'MEDIA_PROCESS_OUTPUT_LIMIT'});cancel();return}send({type:'stdout',text:chunk.toString()})})
  pipes.stderr.on('data',chunk=>{if(stderrBytes<32000){stderrBytes+=chunk.length;send({type:'stderr',text:chunk.toString().slice(-16000)})}})
  child.on('error',error=>{send({type:'error',message:String(error)})})
  child.on('close',code=>{
   if(forceKill)clearTimeout(forceKill)
   const result=cancelled?1:code??1
   if(process.connected)process.send?.({type:'exit',code:result},()=>process.exit(result===0?0:1));else process.exit(result===0?0:1)
  })
 }catch(error){send({type:'error',message:String(error)});process.exitCode=1;process.disconnect?.()}
})
if(!process.connected)process.exit(1)
