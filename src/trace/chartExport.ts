import {spectrumPixels} from './spectrumDisplay'
import {deflate} from 'node:zlib'
import {promisify} from 'node:util'
import {crc32} from './analysisCache'
import type {SpectrogramView} from './spectrogramView'
import type {SpectrogramSettings} from './spectrogramProtocol'
import type {InstrumentSettings,NativeInstrumentResult} from './instrumentTypes'
export type ChartMetadata={version:1;product:'Trace';sourceLabel:string;sourceSha256:string[];sampleRate:number;channelCount:number;positionFrame:string;measurementConfigId:string;quality:string;settings:InstrumentSettings;createdAt:string;memory?:{sourceId:string;epochId:string;measurementEpoch:string;originFrame:string;captureStartFrame:string;frames:string};kind?:'spectrum'|'spectrogram';analysis?:{windowStartFrame:string;hop:number;averageWindows:number;holdWindows:number;partialAverage:boolean;partialHold:boolean};spectrogram?:{settings:SpectrogramSettings;startFrame:string;endFrame:string;timeOffsetSeconds:number;overviewLevel:number;binStride:number}}
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
/** Standalone SVG, with embedded provenance and labelled amplitude axes. */
export function spectrumSvg(data:NativeInstrumentResult,metadata:ChartMetadata):string{
 const s=metadata.settings,lo=Math.min(s.minFrequency,data.sampleRate/2*.9),hi=Math.min(s.maxFrequency,data.sampleRate/2),width=1000,height=620,l=65,r=970,t=90,b=525
 const x=(f:number)=>l+Math.log(f/lo)/Math.log(hi/lo)*(r-l),y=(d:number)=>b-(d-s.minDecibels)/(s.maxDecibels-s.minDecibels)*(b-t)
 let body=`<rect width="1000" height="620" fill="#111b23"/><g font-family="sans-serif" fill="#d4e3ed"><text x="65" y="30" font-size="18">TRACE · ${xml(metadata.sourceLabel)}</text><text x="65" y="55" font-size="12">${data.sampleRate} Hz · ${data.channelCount} ch · 帧 ${xml(data.positionFrame)} · ${xml(metadata.quality)}</text>`
 body+=`<text x="65" y="74" font-size="11">图表生成 ${xml(metadata.createdAt)}${metadata.memory?' · LIVE 原点帧 '+xml(metadata.memory.originFrame):''}</text>`
 for(const f of [20,50,100,200,500,1000,2000,5000,10000,20000,40000])if(f>=lo&&f<=hi)body+=`<path d="M${x(f)} ${t}V${b}" stroke="#30404c"/><text x="${x(f)}" y="547" text-anchor="middle" font-size="11">${f}</text>`
 for(let d=Math.ceil(s.minDecibels/12)*12;d<=s.maxDecibels;d+=12)body+=`<path d="M${l} ${y(d)}H${r}" stroke="#30404c"/><text x="55" y="${y(d)+4}" text-anchor="end" font-size="11">${d}</text>`
 for(const [powers,visible,color]of [[data.current,s.showCurrent,'#49ddb6'],[data.average,s.showAverage,'#63c4fa'],[data.peakHold,s.showPeakHold,'#f1bd62']]as const){if(!visible)continue;const points=spectrumPixels(powers,data.binHz,lo,hi,r-l,s).map(p=>`${x(p.frequency).toFixed(2)},${Math.max(t,Math.min(b,y(Math.max(s.minDecibels,p.decibels)))).toFixed(2)}`).join(' ');body+=`<polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.3"/>`}
 body+=`<text x="${(l+r)/2}" y="575" text-anchor="middle" font-size="12">频率 Hz · 幅度 dBFS · 像素峰值（非 PSD）</text><text x="65" y="601" font-size="11">FFT ${s.fftSize} · 周期 Hann · Δf ${data.binHz.toFixed(3)} Hz · 窗 ${(s.fftSize/data.sampleRate*1000).toFixed(2)} ms · 平滑 ${s.smoothing?'1/'+s.smoothing+' oct':'关闭'} · 倾斜 ${s.tilt} dB/oct @ 1 kHz</text></g>`
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><metadata>${xml(JSON.stringify(metadata))}</metadata>${body}</svg>`
}
/** Raster is embedded in the SVG; peaks, mixed quality and axes remain explicit. */
export async function spectrogramSvg(view:SpectrogramView,metadata:ChartMetadata,settings:SpectrogramSettings):Promise<string>{
 const w=view.width,h=view.height,rows=Buffer.alloc((w*4+1)*h)
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const db=view.decibels[(h-1-y)*w+x],state=view.status[x],v=Math.max(0,Math.min(1,(db-settings.minDecibels)/(settings.maxDecibels-settings.minDecibels))),at=y*(w*4+1)+1+x*4
  const gap=Boolean(state&12),uncovered=Boolean(state&1)||view.coverage[x]<1,striped=(x+y)%8<3
  let color=settings.palette==='heat'?[Math.round(255*v),Math.round(255*Math.max(0,(v-.3)/.7)),Math.round(110*(1-v))]:[Math.round(25+55*v),Math.round(30+210*v),Math.round(45+180*v)]
  if(gap&&striped)color=[170,67,60];else if(uncovered&&striped)color=[80,86,94];if(!(state&2)&&!striped)color=[22,27,33]
  rows[at]=color[0];rows[at+1]=color[1];rows[at+2]=color[2];rows[at+3]=255
 }
 const chunk=(name:string,data:Buffer)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4);data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,8+data.length)),8+data.length);return out}
 const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',await promisify(deflate)(rows)),chunk('IEND',Buffer.alloc(0))]).toString('base64')
 let stops='';for(let i=0;i<=20;i++){const v=i/20,color=settings.palette==='heat'?[Math.round(255*v),Math.round(255*Math.max(0,(v-.3)/.7)),Math.round(110*(1-v))]:[Math.round(25+55*v),Math.round(30+210*v),Math.round(45+180*v)];stops+=`<stop offset="${v*100}%" stop-color="rgb(${color.join(',')})"/>`}
 const scale=`<defs><linearGradient id="amplitude-scale" x1="0" y1="1" x2="0" y2="0">${stops}</linearGradient></defs><rect x="938" y="90" width="14" height="435" fill="url(#amplitude-scale)"/>`
 const offset=metadata.spectrogram?.timeOffsetSeconds||0,start=Number(view.startFrame)/view.sampleRate+offset,end=Number(view.endFrame)/view.sampleRate+offset
 let axes='';for(let i=0;i<=5;i++){const x=75+840*i/5;axes+=`<text x="${x}" y="552" text-anchor="middle">${(start+(end-start)*i/5).toFixed(3)}</text>`}
 for(let i=0;i<=5;i++){const y=525-435*i/5,f=view.minFrequency*(view.maxFrequency/view.minFrequency)**(i/5);axes+=`<text x="66" y="${y+4}" text-anchor="end">${Math.round(f)}</text>`}
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620" viewBox="0 0 1000 620"><metadata>${xml(JSON.stringify(metadata))}</metadata><rect width="1000" height="620" fill="#111b23"/><image x="75" y="90" width="840" height="435" preserveAspectRatio="none" href="data:image/png;base64,${png}"/>${scale}<g font-family="sans-serif" fill="#d4e3ed" font-size="11"><text x="65" y="30" font-size="18">TRACE · ${xml(metadata.sourceLabel)} · 声谱图</text><text x="65" y="55">${xml(metadata.quality)} · ${view.sampleRate} Hz · ${settings.minDecibels} ～ ${settings.maxDecibels} dBFS · 周期 Hann</text><text x="65" y="74">图表生成 ${xml(metadata.createdAt)}${metadata.memory?' · LIVE 原点帧 '+xml(metadata.memory.originFrame):''}</text>${axes}<text x="970" y="80" text-anchor="end">${settings.maxDecibels} dBFS</text><text x="970" y="550" text-anchor="end">${settings.minDecibels}</text><text x="500" y="575" text-anchor="middle">时间 s / 频率 Hz · 色块为峰值 · 斜纹为缺口 / 未覆盖</text><text x="65" y="601">FFT ${view.fftSize} · Δf ${(view.sampleRate/view.fftSize).toFixed(3)} Hz · 窗 ${(view.fftSize/view.sampleRate*1000).toFixed(2)} ms · 概览 ×${2**(view.overviewLevel||0)} · 频率分组 ×${view.overviewBinStride||1} · 精确悬停另查原始 FFT</text></g></svg>`
}
