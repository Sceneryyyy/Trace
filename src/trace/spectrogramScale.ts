/** Display projection v2: a smooth Mel-style scale with a 700 Hz knee.
 * Raw FFT bins, dBFS values and persistent tile identities remain unchanged. */
export const spectrogramScaleId='mel-700-v2'
const knee=700
const coordinate=(frequency:number)=>Math.log1p(frequency/knee)
const frequency=(value:number)=>knee*Math.expm1(value)
export function frequencyRatio(hz:number,lo:number,hi:number):number {
 return (coordinate(hz)-coordinate(lo))/(coordinate(hi)-coordinate(lo))
}
export function frequencyAt(ratio:number,lo:number,hi:number):number {
 if(ratio===0)return lo;if(ratio===1)return hi
 return frequency(coordinate(lo)+(coordinate(hi)-coordinate(lo))*ratio)
}
export function zoomFrequencies(lo:number,hi:number,nyquist:number,ratio:number,delta:number):{minFrequency:number;maxFrequency:number} {
 const floor=coordinate(1),ceiling=coordinate(nyquist),anchor=coordinate(frequencyAt(ratio,lo,hi))
 const span=Math.max(Math.min(.015,ceiling-floor),Math.min(ceiling-floor,(coordinate(hi)-coordinate(lo))*Math.exp(Math.max(-200,Math.min(200,delta))*.002)))
 let a=anchor-span*ratio,b=a+span
 if(a<floor){a=floor;b=a+span}if(b>ceiling){b=ceiling;a=b-span}
 return {minFrequency:Math.max(1,frequency(a)),maxFrequency:Math.min(nyquist,frequency(b))}
}
export function frequencyTicks(lo:number,hi:number,height:number):number[] {
 const ticks=[lo,hi],spacing=20/Math.max(1,height)
 for(const hz of [1000,5000,10000,20000,500,2000,3000,7000,15000,100,200,300,50,20,12000,30000,40000,48000]){
  if(hz>lo&&hz<hi&&ticks.every(t=>Math.abs(frequencyRatio(t,lo,hi)-frequencyRatio(hz,lo,hi))>=spacing))ticks.push(hz)
 }
 return ticks.sort((a,b)=>a-b)
}
export function frequencyLabel(hz:number):string {
 return hz>=1000?Number((hz/1000).toFixed(1))+'k':String(Math.round(hz))
}
