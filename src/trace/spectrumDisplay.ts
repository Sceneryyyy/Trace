export type SpectrumDisplayOptions={smoothing:0|3|6|12|24;tilt:number}
/** Fractional octave averaging of linear power, including partial bin widths. */
export function smoothSpectrum(powers:Float64Array,fraction:number):Float64Array{
 if(![0,3,6,12,24].includes(fraction)||powers.length>8193||powers.some(p=>!Number.isFinite(p)||p<0))throw Error('INVALID_SPECTRUM_DISPLAY')
 if(!fraction)return powers.slice()
 const prefix=new Float64Array(powers.length+1);for(let i=0;i<powers.length;i++)prefix[i+1]=prefix[i]+powers[i]
 const integral=(x:number)=>{const p=Math.max(0,Math.min(powers.length,x)),i=Math.floor(p);return prefix[i]+(i<powers.length?(p-i)*powers[i]:0)}
 const result=new Float64Array(powers.length),factor=2**(1/(2*fraction));result[0]=powers[0]
 for(let i=1;i<powers.length;i++){const a=Math.max(0,i/factor+.5),b=Math.min(powers.length,i*factor+.5);result[i]=Math.max(0,(integral(b)-integral(a))/(b-a))}
 return result
}
/** Keep per-pixel peaks in dense regions; interpolate linear power only where
 * no FFT bin lands on a pixel. Empty screen columns are not audio silence.
 * This display projection never mutates or substitutes for measurement arrays. */
export function spectrumPixels(powers:Float64Array,binHz:number,lo:number,hi:number,width:number,options:SpectrumDisplayOptions):Array<{frequency:number;decibels:number}>{
 if(![binHz,lo,hi,width,options.tilt].every(Number.isFinite)||binHz<=0||lo<=0||hi<=lo||width<1||Math.abs(options.tilt)>6)throw Error('INVALID_SPECTRUM_DISPLAY')
 const n=Math.min(4096,Math.ceil(width)),values=smoothSpectrum(powers,options.smoothing),peaks=new Float64Array(n).fill(-Infinity),occupied=new Uint8Array(n)
 for(let bin=1;bin<values.length;bin++){const f=bin*binHz;if(f<lo||f>hi)continue;const x=Math.min(n-1,Math.floor(Math.log(f/lo)/Math.log(hi/lo)*n)),db=values[bin]>0?10*Math.log10(values[bin])+options.tilt*Math.log2(f/1000):-Infinity;peaks[x]=Math.max(peaks[x],db);occupied[x]=1}
 return Array.from(peaks,(decibels,x)=>{
  const frequency=lo*(hi/lo)**((x+.5)/n)
  if(!occupied[x]){
   const bin=frequency/binHz,a=Math.floor(bin),b=Math.ceil(bin)
   if(a>=1&&b<values.length){
    const power=values[a]+(values[b]-values[a])*(bin-a)
    decibels=power>0?10*Math.log10(power)+options.tilt*Math.log2(frequency/1000):-Infinity
   }
  }
  return {frequency,decibels}
 })
}
