import {useSyncExternalStore} from 'react'
import {cssTokens,defaultThemeId,heatStops,instrumentTheme,type SpectrogramStops,type ThemeId} from '../instrumentThemes'

export type RendererTheme={id:ThemeId;tokens:Readonly<Record<string,string>>;spectrogram:SpectrogramStops}
let current:RendererTheme={id:defaultThemeId,tokens:cssTokens(defaultThemeId),spectrogram:instrumentTheme(defaultThemeId).spectrogram}
const listeners=new Set<()=>void>()

/** Writes every token to :root and notifies canvas users. Switching repaints only; no data is requested. */
export function applyTheme(id:ThemeId):void{
 if(typeof document!=='undefined'&&current.id===id&&document.documentElement.dataset.traceTheme===id)return
 current={id,tokens:cssTokens(id),spectrogram:instrumentTheme(id).spectrogram}
 if(typeof document!=='undefined'){
  const root=document.documentElement;for(const [name,value] of Object.entries(current.tokens))root.style.setProperty('--'+name,value);root.dataset.traceTheme=id
  // First application is compared with the first-paint entry to verify there is no default-theme flash.
  if(typeof performance!=='undefined'&&!performance.getEntriesByName('trace-theme-applied').length)performance.mark('trace-theme-applied')
 }
 for(const listener of listeners)listener()
}
export function currentTheme():RendererTheme{return current}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
/** Stable object per theme; include it in canvas effect dependencies. */
export function useRendererTheme():RendererTheme{return useSyncExternalStore(subscribe,currentTheme,currentTheme)}
export function spectrogramStops(theme:RendererTheme,palette:'trace'|'heat'):SpectrogramStops{return palette==='heat'?heatStops:theme.spectrogram}
