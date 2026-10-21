import {useEffect,useRef,useState} from 'react'
import {spectralGradient,type SpectrogramStops} from '../instrumentThemes'
import {decibelTicks} from './spectrogramPresentation'

/** Numeric colour key uses the same five stops and dB range as the raster. */
export function SpectrogramLegend({minDb,maxDb,stops}:{minDb:number;maxDb:number;stops:SpectrogramStops}){
 const box=useRef<HTMLDivElement>(null),[height,setHeight]=useState(180)
 useEffect(()=>{if(!box.current)return;const observer=new ResizeObserver(entries=>setHeight(entries[0].contentRect.height));observer.observe(box.current);return()=>observer.disconnect()},[])
 return <aside className="spectrogram-legend" aria-label={'声谱图颜色图示：'+minDb+' 至 '+maxDb+' dBFS'}>
  <span className="spectrogram-legend-unit">dBFS</span>
  <div className="spectrogram-legend-scale" ref={box}>
   <div className="spectrogram-legend-gradient" aria-hidden="true" style={{background:spectralGradient(stops,'to top')}}/>
   {decibelTicks(minDb,maxDb,height).map(db=><span className="spectrogram-legend-tick" key={db} style={{top:(maxDb-db)/(maxDb-minDb)*100+'%'}}><i aria-hidden="true"/>{db}</span>)}
  </div>
 </aside>
}
