import {open} from 'node:fs/promises'

export type MP3Declaration={packets?:number;bytes?:number;offset:number}
/** Read only the first MPEG frame, skipping ID3 by its bounded size field.
 * Duration estimates alone cannot establish completeness of an external MP3.
 */
export async function mp3Declaration(file:string):Promise<MP3Declaration|null>{
 const handle=await open(file,'r')
 try{
  const header=Buffer.alloc(10),first=await handle.read(header,0,10,0)
  let offset=0
  if(first.bytesRead===10&&header.toString('ascii',0,3)==='ID3'){
   if(header[3]<2||header[3]>4||header.subarray(6,10).some(n=>n>127))throw Error('INVALID_MP3_ID3_HEADER')
   offset=10+header[6]*2097152+header[7]*16384+header[8]*128+header[9]+(header[3]===4&&(header[5]&16)?10:0)
  }
  const buffer=Buffer.alloc(4096),{bytesRead}=await handle.read(buffer,0,buffer.length,offset)
  if(bytesRead<4)return null
  const h=buffer.readUInt32BE(0),version=(h>>>19)&3,layer=(h>>>17)&3,bitrate=(h>>>12)&15,frequency=(h>>>10)&3
  if((h>>>21)!==2047||version===1||layer!==1||bitrate===0||bitrate===15||frequency===3)return null
  const mono=((h>>>6)&3)===3,side=version===3?(mono?17:32):(mono?9:17)
  const xing=4+((h&65536)?0:2)+side,tag=buffer.toString('ascii',xing,xing+4)
  let packets:number|undefined,bytes:number|undefined
  if((tag==='Xing'||tag==='Info')&&bytesRead>=xing+8){
   const flags=buffer.readUInt32BE(xing+4);let position=xing+8
   if(flags&1){if(bytesRead<position+4)throw Error('INVALID_MP3_LENGTH_HEADER');packets=buffer.readUInt32BE(position);position+=4}
   if(flags&2){if(bytesRead<position+4)throw Error('INVALID_MP3_LENGTH_HEADER');bytes=buffer.readUInt32BE(position)}
  }else if(bytesRead>=54&&buffer.toString('ascii',36,40)==='VBRI'&&buffer.readUInt16BE(40)===1){
   bytes=buffer.readUInt32BE(46);packets=buffer.readUInt32BE(50)
  }else return null
  if(packets===0||bytes===0)throw Error('INVALID_MP3_LENGTH_HEADER')
  return packets===undefined&&bytes===undefined?null:{packets,bytes,offset}
 }finally{await handle.close()}
}
