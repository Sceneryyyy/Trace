import {open} from 'node:fs/promises'

/** A WAV header outranks periodic PCM that may resemble MPEG-TS packets.
 * Read only the container signature; FFmpeg still validates every chunk,
 * stream and sample. Never select a demuxer from the filename extension.
 */
export async function wavInputOptions(file:string):Promise<string[]>{
 const handle=await open(file,'r')
 try{
  const header=Buffer.alloc(16),{bytesRead}=await handle.read(header,0,header.length,0)
  if(bytesRead<16||header.toString('ascii',8,12)!=='WAVE')return []
  const magic=header.toString('ascii',0,4)
  if(magic==='RIFF'||magic==='RIFX'||(magic==='RF64'||magic==='BW64')&&header.toString('ascii',12,16)==='ds64')return ['-f','wav']
  return []
 }finally{await handle.close()}
}
