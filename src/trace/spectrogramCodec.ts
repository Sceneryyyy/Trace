import {createHash} from 'node:crypto'
import {validateSpectrogramTile,type SpectrogramTile} from './spectrogramTile'
const headerBytes=128,magic=Buffer.from([84,82,83,80,86,49,0,0])
function identity(key:string){if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_SPECTROGRAM_KEY');return Buffer.from(key,'hex')}
const checksum=(header:Buffer,payload:Buffer)=>createHash('sha256').update(header).update(payload).digest()
export function encodeSpectrogramTile(value:SpectrogramTile,key:string):Buffer{
 const t=validateSpectrogramTile(value),id=identity(key),maskBytes=Math.ceil(t.columns/4)*4
 if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw Error('UNSUPPORTED_SPECTROGRAM_ENDIAN')
 const result=Buffer.alloc(headerBytes+maskBytes+t.decibels.byteLength)
 magic.copy(result);result.writeUInt32LE(1,8);result.writeUInt32LE(headerBytes,12)
 for(const [offset,value] of [[16,t.fftSize],[20,t.columns],[24,t.bins],[28,t.hop],[32,t.sampleRate],[36,t.channels],[48,t.decibels.byteLength],[52,t.columns]])result.writeUInt32LE(value,offset)
 result.writeBigUInt64LE(BigInt(t.firstFrame),40);id.copy(result,64);Buffer.from(t.status).copy(result,headerBytes)
 Buffer.from(t.decibels.buffer,t.decibels.byteOffset,t.decibels.byteLength).copy(result,headerBytes+maskBytes)
 checksum(result.subarray(0,96),result.subarray(headerBytes)).copy(result,96)
 return result
}
export function decodeSpectrogramTile(bytes:Buffer,key:string):SpectrogramTile{
 try{
  if(bytes.length<headerBytes||!bytes.subarray(0,8).equals(magic)||bytes.readUInt32LE(8)!==1||bytes.readUInt32LE(12)!==headerBytes||!bytes.subarray(64,96).equals(identity(key)))throw Error()
  const fftSize=bytes.readUInt32LE(16),columns=bytes.readUInt32LE(20),bins=bytes.readUInt32LE(24),hop=bytes.readUInt32LE(28),sampleRate=bytes.readUInt32LE(32),channels=bytes.readUInt32LE(36)
  const dataBytes=bytes.readUInt32LE(48),maskBytes=Math.ceil(columns/4)*4
  if(columns<1||columns>64||bins!==fftSize/2+1||dataBytes!==columns*bins*4||dataBytes>4*1024*1024||bytes.readUInt32LE(52)!==columns||bytes.length!==headerBytes+maskBytes+dataBytes||
   !checksum(bytes.subarray(0,96),bytes.subarray(headerBytes)).equals(bytes.subarray(96,128)))throw Error()
  const decibels=new Float32Array(columns*bins);new Uint8Array(decibels.buffer).set(bytes.subarray(headerBytes+maskBytes))
  return validateSpectrogramTile({firstFrame:bytes.readBigUInt64LE(40).toString(),fftSize,columns,bins,hop,sampleRate,channels,decibels,status:Uint8Array.from(bytes.subarray(headerBytes,headerBytes+columns))})
 }catch{throw Error('CORRUPT_SPECTROGRAM_TILE')}
}
