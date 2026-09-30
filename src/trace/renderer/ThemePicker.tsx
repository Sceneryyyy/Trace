import {useRef} from 'react'
import {cssTokens,instrumentThemes,spectralGradient,themeIds,type ThemeId} from '../instrumentThemes'
import {METER_NEAR_DB,METER_OVER_DB,meterFraction} from './meterZones'

/** Self-contained swatch: shows the meter zones, the three series line styles and the spectrogram scale
 * without relying on live signal behind the modal (docs/71 §3.6). */
function Preview({id}:{id:ThemeId}){
 const t=cssTokens(id),near=meterFraction(METER_NEAR_DB)*100,over=meterFraction(METER_OVER_DB)*100
 const meter='linear-gradient(to top,'+t['signal-lo']+' 0%,'+t['signal']+' '+near+'%,'+t['meter-near']+' '+near+'%,'+t['meter-near']+' '+over+'%,'+t['meter-over']+' '+over+'%)'
 return <span className="theme-preview" aria-hidden="true" style={{background:t['panel']}}>
  <span className="theme-preview-meter" style={{background:meter}}><i style={{bottom:near+'%',background:t['meter-mark']}}/><i style={{bottom:over+'%',background:t['meter-mark']}}/></span>
  <svg className="theme-preview-lines" viewBox="0 0 60 30" preserveAspectRatio="none">
   <line x1="2" x2="58" y1="7" y2="7" stroke={t['series-m']} strokeWidth="2"/>
   <line x1="2" x2="58" y1="15" y2="15" stroke={t['series-s']} strokeWidth="2" strokeDasharray="5 3"/>
   <line x1="2" x2="58" y1="23" y2="23" stroke={t['series-i']} strokeWidth="2" strokeDasharray="2 3"/>
  </svg>
  <span className="theme-preview-spectrum" style={{background:spectralGradient(instrumentThemes[id].spectrogram)}}/>
 </span>
}

export function ThemePicker({value,change}:{value:ThemeId;change:(id:ThemeId)=>void}){
 const refs=useRef<Record<string,HTMLButtonElement|null>>({})
 const select=(id:ThemeId)=>{change(id);refs.current[id]?.focus()}
 function key(e:React.KeyboardEvent){
  const i=themeIds.indexOf(value),last=themeIds.length-1
  const next=e.key==='ArrowRight'||e.key==='ArrowDown'?(i+1)%themeIds.length:e.key==='ArrowLeft'||e.key==='ArrowUp'?(i+last)%themeIds.length:e.key==='Home'?0:e.key==='End'?last:-1
  if(next<0)return;e.preventDefault();select(themeIds[next])
 }
 return <div className="theme-picker" role="radiogroup" aria-label="仪表主题" onKeyDown={key}>
  {themeIds.map(id=>{const theme=instrumentThemes[id],checked=id===value
   return <button key={id} ref={el=>{refs.current[id]=el}} type="button" role="radio" aria-checked={checked} tabIndex={checked?0:-1} className="theme-card" data-theme-choice={id} onClick={()=>select(id)} aria-label={theme.name+'，'+theme.description}>
    <Preview id={id}/>
    <span className="theme-card-label"><span className="theme-check" aria-hidden="true">{checked?'✓':''}</span>{theme.name}{id==='duo'&&<small>色弱友好</small>}</span>
   </button>})}
 </div>
}
