import type {SpectrogramTile} from './spectrogramTile'

export type SpectrogramRange = {
  startFrame:string; endFrame:string; width:number; height:number
  minFrequency:number; maxFrequency:number
}
export type SpectrogramView = SpectrogramRange & {
  key:string; requestGeneration:number; sampleRate:number; fftSize:number; hop:number
  /** Each pixel is a maximum over its original bins/windows, never an exact point reading. */
  decibels:Float32Array; status:Uint8Array; coverage:Float32Array
  rowFirstBin:Uint32Array; rowLastBin:Uint32Array
  progress:number; complete:boolean
}
export const spectralFrame = (value:string):bigint => {
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value))throw Error('INVALID_SPECTROGRAM_FRAME')
  const n=BigInt(value);if(n>0xffffffffffffffffn)throw Error('INVALID_SPECTROGRAM_FRAME');return n
}
export function validateSpectrogramRange(r:SpectrogramRange,rate:number):SpectrogramRange {
  if(!r||spectralFrame(r.endFrame)<=spectralFrame(r.startFrame)||
    !Number.isInteger(r.width)||r.width<1||r.width>1024||!Number.isInteger(r.height)||r.height<1||r.height>512||
    !Number.isFinite(r.minFrequency)||!Number.isFinite(r.maxFrequency)||r.minFrequency<1||r.maxFrequency>rate/2||r.maxFrequency<=r.minFrequency)throw Error('INVALID_SPECTROGRAM_VIEW')
  return {...r}
}
const max=(a:bigint,b:bigint)=>a>b?a:b
const min=(a:bigint,b:bigint)=>a<b?a:b

/** Time cells use [FFT end, FFT end + hop); all coordinates remain exact uint64 frames. */
export class SpectrogramRaster {
  readonly view:SpectrogramView
  private start:bigint
  private end:bigint
  private edges:bigint[]
  private ready:Float64Array
  private touched:Float64Array
  constructor(range:SpectrogramRange,key:string,generation:number,rate:number,fftSize:number) {
    validateSpectrogramRange(range,rate)
    this.start=spectralFrame(range.startFrame);this.end=spectralFrame(range.endFrame)
    // Do not manufacture several pixels for a sub-frame time range.
    const width=Number(min(BigInt(range.width),this.end-this.start))
    this.edges=Array.from({length:width+1},(_,i)=>this.start+(this.end-this.start)*BigInt(i)/BigInt(width))
    this.ready=new Float64Array(width);this.touched=new Float64Array(width)
    const first=new Uint32Array(range.height),last=new Uint32Array(range.height),binHz=rate/fftSize
    for(let y=0;y<range.height;y++) {
      const lo=range.minFrequency*Math.pow(range.maxFrequency/range.minFrequency,y/range.height)
      const hi=range.minFrequency*Math.pow(range.maxFrequency/range.minFrequency,(y+1)/range.height)
      let a=Math.ceil(lo/binHz),b=Math.min(fftSize/2,Math.ceil(hi/binHz)-1)
      if(y===range.height-1&&hi>=rate/2)b=fftSize/2
      if(b<a)a=b=Math.min(fftSize/2,Math.round(Math.sqrt(lo*hi)/binHz))
      first[y]=a;last[y]=b
    }
    this.view={...range,width,key,requestGeneration:generation,sampleRate:rate,fftSize,hop:Math.min(fftSize/4,Math.floor(rate/50)),
      decibels:new Float32Array(width*range.height).fill(-Infinity),status:new Uint8Array(width),coverage:new Float32Array(width),rowFirstBin:first,rowLastBin:last,progress:0,complete:false}
  }
  add(tile:SpectrogramTile,availableStart:bigint,availableEnd:bigint):void {
    const v=this.view
    if(tile.fftSize!==v.fftSize||tile.sampleRate!==v.sampleRate||tile.hop!==v.hop)throw Error('STALE_SPECTROGRAM_TILE')
    const levels=new Float32Array(v.height)
    for(let i=0;i<tile.columns;i++) {
      const at=BigInt(tile.firstFrame)+BigInt(i*tile.hop)
      const begin=max(at,this.start),finish=min(min(at+BigInt(tile.hop),this.end),availableEnd)
      if(finish<=begin)continue
      const state=at-BigInt(tile.fftSize)<availableStart?0:tile.status[i]
      const x0=Number(((begin-this.start+1n)*BigInt(v.width)-1n)/(this.end-this.start))
      const x1=Number(((finish-this.start)*BigInt(v.width)-1n)/(this.end-this.start))
      levels.fill(-Infinity)
      if(state===1)for(let y=0;y<v.height;y++)for(let bin=v.rowFirstBin[y];bin<=v.rowLastBin[y];bin++)levels[y]=Math.max(levels[y],tile.decibels[i*tile.bins+bin])
      for(let x=x0;x<=x1;x++) {
        const amount=Number(min(finish,this.edges[x+1])-max(begin,this.edges[x]));if(amount<=0)continue
        this.touched[x]+=amount;v.status[x]|=1<<state
        if(state===1) {
          this.ready[x]+=amount
          for(let y=0;y<v.height;y++)v.decibels[y*v.width+x]=Math.max(v.decibels[y*v.width+x],levels[y])
        }
      }
    }
  }
  snapshot(progress:number,complete:boolean):SpectrogramView {
    const v=this.view,status=v.status.slice(),coverage=v.coverage.slice()
    for(let x=0;x<v.width;x++) {
      const total=Number(this.edges[x+1]-this.edges[x])
      if(this.touched[x]<total)status[x]|=1 // uncovered time is explicit, including file start and missing PCM
      coverage[x]=Math.min(1,this.ready[x]/total)
    }
    return {...v,decibels:v.decibels.slice(),status,coverage,rowFirstBin:v.rowFirstBin.slice(),rowLastBin:v.rowLastBin.slice(),progress,complete}
  }
}
