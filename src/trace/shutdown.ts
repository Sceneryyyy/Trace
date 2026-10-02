/** Bound asynchronous shutdown, including the final diagnostic write. No native
 * work may be started by the timeout handler while existing work is draining. */
export function shutdownDeadline(value: string | undefined): number {
 const n=Number(value)
 return Number.isSafeInteger(n)&&n>=100&&n<=300000?n:60000
}
export async function finalizeShutdown(finish:Promise<unknown>,options:{
 deadlineMs:number;recordTimeout:()=>Promise<unknown>;reportError:(error:unknown)=>void;diagnosticMs?:number
}):Promise<'finished'|'timed-out'>{
 let timer:ReturnType<typeof setTimeout>|undefined
 const completed=finish.then(()=> 'finished' as const,error=>{options.reportError(error);return 'finished' as const})
 try{
  const result=await Promise.race([completed,new Promise<'timed-out'>(resolve=>{timer=setTimeout(()=>resolve('timed-out'),options.deadlineMs)})])
  if(result==='timed-out'){
   let diagnosticTimer:ReturnType<typeof setTimeout>|undefined
   try{await Promise.race([
    Promise.resolve().then(options.recordTimeout).catch(options.reportError),
    new Promise<void>(resolve=>{diagnosticTimer=setTimeout(resolve,options.diagnosticMs??250)})
   ])}finally{if(diagnosticTimer)clearTimeout(diagnosticTimer)}
  }
  return result
 }finally{if(timer)clearTimeout(timer)}
}
