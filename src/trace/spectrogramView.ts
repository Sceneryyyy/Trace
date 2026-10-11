import type {SpectralOverview} from './spectrogramOverview'
import type {SpectrogramTile} from './spectrogramTile'
import {SpectrogramProjectionCache,spectralRows,spectralMaximum,type SpectralRows} from './spectrogramProjection'

export type SpectrogramRange = {
  startFrame:string; endFrame:string; width:number; height:number
  minFrequency:number; maxFrequency:number
}
export type SpectrogramView = SpectrogramRange & {
  key:string; requestGeneration:number; sampleRate:number; fftSize:number; hop:number
  /** Each pixel is a maximum over its original bins/windows, never an exact point reading. */
  decibels:Float32Array; status:Uint8Array; coverage:Float32Array
  rowFirstBin:Uint32Array; rowLastBin:Uint32Array
  progress:number; complete:boolean;overviewLevel?:number;overviewBinStride?:number
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
  private rows:SpectralRows
  private peaks:Float32Array
  private nodes=new Uint16Array(16)
  constructor(range:SpectrogramRange,key:string,generation:number,rate:number,fftSize:number,private projections=new SpectrogramProjectionCache(),private projectionBudget=16*1024*1024) {
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
    this.rows=spectralRows(first,last);this.peaks=new Float32Array(this.rows.first.length)
    this.view={...range,width,key,requestGeneration:generation,sampleRate:rate,fftSize,hop:Math.min(fftSize/4,Math.floor(rate/50)),
      decibels:new Float32Array(width*range.height).fill(-Infinity),status:new Uint8Array(width),coverage:new Float32Array(width),rowFirstBin:first,rowLastBin:last,progress:0,complete:false}
  }
  setProjectionBudget(bytes:number):void {this.projectionBudget=bytes;this.projections.trim(bytes)}
  add(tile:SpectrogramTile,availableStart:bigint,availableEnd:bigint):void {
    const v=this.view
    if(tile.fftSize!==v.fftSize||tile.sampleRate!==v.sampleRate||tile.hop!==v.hop)throw Error('STALE_SPECTROGRAM_TILE')
    const first=BigInt(tile.firstFrame),hop=BigInt(tile.hop),begin=max(first,this.start),finish=min(min(first+BigInt(tile.columns)*hop,this.end),availableEnd)
    if(finish<=begin)return
    const projection=this.projections.get(tile,this.rows,this.projectionBudget)
    const x0=Number(((begin-this.start+1n)*BigInt(v.width)-1n)/(this.end-this.start)),x1=Number(((finish-this.start)*BigInt(v.width)-1n)/(this.end-this.start))
    const validFrom=Number(min(BigInt(tile.columns),max(0n,(availableStart+BigInt(tile.fftSize)-first+hop-1n)/hop)))
    for(let x=x0;x<=x1;x++){
      const left=max(begin,this.edges[x]),right=min(finish,this.edges[x+1]);if(right<=left)continue
      const from=Number((left-first)/hop),to=Number((right-1n-first)/hop)+1,eligible=Math.min(to,Math.max(from,validFrom))
      const leftTrim=Number(left-first-BigInt(from)*hop),rightTrim=Number(first+BigInt(to)*hop-right)
      let readyFrames=0
      for(let state=0;state<4;state++){
        const count=projection.counts[state][to]-projection.counts[state][eligible]+(state===0?eligible-from:0)
        if(count)v.status[x]|=1<<state
        if(state===1)readyFrames=count*tile.hop
      }
      if(from>=validFrom&&tile.status[from]===1)readyFrames-=leftTrim
      if(to-1>=validFrom&&tile.status[to-1]===1)readyFrames-=rightTrim
      this.touched[x]+=Number(right-left);this.ready[x]+=readyFrames
      if(readyFrames>0){spectralMaximum(projection,eligible,to,this.peaks,this.nodes);for(let y=0;y<v.height;y++)v.decibels[y*v.width+x]=Math.max(v.decibels[y*v.width+x],this.peaks[this.rows.map[y]])}
    }
  }
  addOverview(tile:SpectralOverview,availableStart:bigint,availableEnd:bigint):void {
    const v=this.view;if(tile.fftSize!==v.fftSize||tile.sampleRate!==v.sampleRate)throw Error('STALE_SPECTRAL_OVERVIEW')
    v.overviewLevel=Math.max(v.overviewLevel||0,tile.level);v.overviewBinStride=tile.binStride
    const first=BigInt(tile.firstFrame),hop=BigInt(tile.hop)
    for(let col=0;col<tile.columns;col++){
      const a=max(max(first+BigInt(col)*hop,this.start),availableStart+BigInt(tile.fftSize)),b=min(min(first+BigInt(col+1)*hop,this.end),availableEnd)
      if(b<=a)continue
      const x0=Number((a-this.start)*BigInt(v.width)/(this.end-this.start)),x1=Number(((b-this.start)*BigInt(v.width)-1n)/(this.end-this.start))
      for(let x=x0;x<=x1;x++){
        const frames=Number(min(b,this.edges[x+1])-max(a,this.edges[x]));if(frames<=0)continue
        this.touched[x]+=frames;this.ready[x]+=frames*tile.ready[col];v.status[x]|=tile.masks[col]
        if(!(tile.masks[col]&2))continue
        for(let y=0;y<v.height;y++){let peak=-Infinity;for(let bin=Math.floor(v.rowFirstBin[y]/tile.binStride);bin<=Math.floor(v.rowLastBin[y]/tile.binStride);bin++)peak=Math.max(peak,tile.peaks[col*tile.bins+bin]);v.decibels[y*v.width+x]=Math.max(v.decibels[y*v.width+x],peak)}
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
