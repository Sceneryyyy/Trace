import {spectrogramConfigKey,type SpectrogramSettings,type SpectrogramPacket,type SpectrogramSourceRef} from '../spectrogramProtocol'
import type {SpectrogramView} from '../spectrogramView'
const size=4096
const stops={trace:[[14,21,28],[34,65,83],[45,143,149],[145,230,92],[246,225,125]],heat:[[14,20,33],[51,62,132],[170,63,101],[244,141,60],[253,233,156]]} as const
function palette(name:SpectrogramSettings['palette']):Uint8Array {
 const values=new Uint8Array(size*3),colors=stops[name]
 for(let n=0;n<size;n++){const x=n/(size-1)*4,i=Math.min(3,Math.floor(x)),f=x-i;for(let c=0;c<3;c++)values[n*3+c]=Math.round(colors[i][c]*(1-f)+colors[i+1][c]*f)}
 return values
}
const palettes={trace:palette('trace'),heat:palette('heat')}
export function spectrogramPacketMatches(packet:SpectrogramPacket|null,source:SpectrogramSourceRef|undefined,settings:SpectrogramSettings):boolean {
 const p=packet?.source
 return Boolean(p&&source&&p.kind===source.kind&&p.sourceId===source.sourceId&&p.epochId===source.epochId&&p.measurementEpoch===source.measurementEpoch&&
  (p.analysisId||'')===(source.analysisId||'')&&packet!.configKey===spectrogramConfigKey(settings))
}
export function spectrogramContextKey(source:SpectrogramSourceRef|undefined,settings:SpectrogramSettings):string {return JSON.stringify(source||null)+spectrogramConfigKey(settings)}
/** Bounded RGBA output. The palette lookup changes only display colour, not raw dB/bin data. */
export function colorizeSpectrogram(view:SpectrogramView,settings:SpectrogramSettings):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(view.width*view.height*4),colors=palettes[settings.palette],scale=(size-1)/(settings.maxDecibels-settings.minDecibels)
 for(let y=0;y<view.height;y++)for(let x=0;x<view.width;x++){
  const index=((view.height-1-y)*view.width+x)*4,flags=view.status[x],hatch=(x+y)%8<2
  let r:number,g:number,b:number
  if(!(flags&2)){if(hatch){r=flags&12?142:56;g=flags&12?110:66;b=flags&12?56:74}else{r=21;g=27;b=32}}
  else if(view.coverage[x]<.999&&hatch){r=flags&12?177:86;g=flags&12?133:101;b=flags&12?61:108}
  else {const n=Math.max(0,Math.min(size-1,Math.round((view.decibels[y*view.width+x]-settings.minDecibels)*scale)))*3;r=colors[n];g=colors[n+1];b=colors[n+2]}
  out[index]=r;out[index+1]=g;out[index+2]=b;out[index+3]=255
 }
 return out
}
