export type SpectrogramTile={firstFrame:string;columns:number;fftSize:number;hop:number;bins:number;sampleRate:number;channels:number;decibels:Float32Array;status:Uint8Array}
export function validateSpectrogramTile(t:SpectrogramTile):SpectrogramTile{
 const fail=()=>{throw Error('INVALID_SPECTROGRAM_TILE')}
 if(!t||![512,1024,2048,4096,8192,16384].includes(t.fftSize)||!Number.isInteger(t.columns)||t.columns<1||t.columns>64||t.bins!==t.fftSize/2+1||!Number.isInteger(t.sampleRate)||t.sampleRate<8000||t.sampleRate>96000||![1,2].includes(t.channels)||t.hop!==Math.min(t.fftSize/4,Math.floor(t.sampleRate/50))||
  typeof t.firstFrame!=='string'||!/^[0-9]{1,20}$/.test(t.firstFrame)||BigInt(t.firstFrame)+BigInt((t.columns-1)*t.hop)>0xffffffffffffffffn)fail()
 if(!(t.decibels instanceof Float32Array)||t.decibels.length!==t.columns*t.bins||t.decibels.byteLength>4*1024*1024||t.decibels.some(v=>!Number.isFinite(v)&&v!==-Infinity)||
  !(t.status instanceof Uint8Array)||t.status.length!==t.columns||t.status.some(v=>v>3))fail()
 return t
}
