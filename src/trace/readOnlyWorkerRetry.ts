// Repeating a hash read is safe; this helper must not wrap writers or decoders.
export async function retryHashWorker<T>(read:()=>Promise<T>,signal?:AbortSignal,diagnostic:(message:string)=>void=message=>console.warn(message)):Promise<T>{
 try{return await read()}catch(error){
  const message=error instanceof Error?error.message:String(error)
  if(signal?.aborted||!/^FILE_WORKER_EXIT 3221225477:/.test(message))throw error
  diagnostic('TRACE_HASH_WORKER_RETRY: '+message)
  return read()
 }
}
