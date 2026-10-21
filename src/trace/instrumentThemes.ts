// Single colour source for the Trace renderer (docs/71). CSS only uses var(--token);
// canvas/WebGL code reads the same values through renderer/themeRuntime.ts.
// Themes change display colour only: they never enter metering, caches or protocols.

export const themeIds=['trace-green','graphite','ember','ocean','duo'] as const
export type ThemeId=typeof themeIds[number]
export const defaultThemeId:ThemeId='trace-green'
export const instrumentThemeVersion=1
export function isThemeId(value:unknown):value is ThemeId{return typeof value==='string'&&(themeIds as readonly string[]).includes(value)}

type Rgb=readonly [number,number,number]
export type SpectrogramStops=readonly [Rgb,Rgb,Rgb,Rgb,Rgb]

/** Tokens whose value depends on the selected instrument theme. */
export const themeTokenNames=[
 'signal','signal-alt','signal-lo','series-m','brand-product',
 'meter-near','loud-lo','loud-hi','rms-fill',
 'signal-border','signal-bg','signal-bg-strong','live-border','live-bg','field-border','field-positive',
 'series-s','series-i','target','target-fill',
 'curve-current','curve-average','curve-hold','field-in','field-out','field-point','ref-a','ref-b',
 'cursor','selection-fill','selection-edge',
 'accent','accent-border','accent-border-soft','accent-border-muted','accent-bg','accent-bg-soft','file-badge-border','file-badge-bg','divider-glow','dock-fill',
 'button-bg','button-hover','on-signal',
 'surface-bg','surface-cursor','surface-selection',
] as const
export type ThemeTokenName=typeof themeTokenNames[number]
export type ThemeTokens=Record<ThemeTokenName,string>

/** Theme-independent tokens: neutral (blue-grey, no green cast), status colours and focus. */
export const fixedTokens={
 'bg':'#11151a','panel':'#191f26','border':'#333d48','text':'#e8edf2','secondary':'#abb7c4',
 'control-bg':'#242d36','control-hover':'#303b46','control-border-strong':'#5f6b78','input-bg':'#1d252d','input-border':'#3e4a57',
 'danger':'#ff5e66','danger-marker':'#ff7e83','meter-over':'#ff5e66','attention':'#efb65b','attention-dim':'#795038',
 'focus-ring':'#ffffff',
 'chrome-bg':'#171d24','meter-track-bg':'#10171e','meter-track-border':'#36434c','meter-mark':'#e8edf2','clip-idle':'#3a414b','badge-border':'#4a535d',
 'hint':'#97a3b0','note-border':'#677380','statusbar-border':'#262f38','backdrop':'#06090cb8','modal-bg':'#191f26','modal-border':'#48545f',
 'rule':'#303a44','summary-label':'#abb7c4','summary-value':'#e8edf2','export-border':'#3a4653','export-bg':'#171e25','ruler-bg':'#202831',
 'transport-hover':'#354049','empty-wave-bg':'#191f26e8',
 'rec-text':'#ffc0c3','rec-active-bg':'#4a2428','rec-active-border':'#b05259','rec-active-text':'#ffe2e4','rec-badge-text':'#ffb1b7','rec-badge-bg':'#3b2326','rec-badge-border':'#9a4950','rec-transport-bg':'#622a32',
 'over-bg':'#ff5e66','over-text':'#1a0b0c',
 'error-banner-bg':'#38281c','error-banner-text':'#ffcf8a','notice-error-border':'#94703e',
 'topbar-bg':'#171d24','bar-bg':'#151b21','bar-control-bg':'#202831','bar-control-border':'#3b4653','popover-border':'#546170','popover-input-bg':'#141b22','popover-input-border':'#4c5d6d','popover-button-bg':'#29343f',
 'heading-border':'#303944','heading-bg':'#1c242d','heading-icon':'#acbac8','heading-icon-hover':'#ffffff','heading-hover-bg':'#34424f','heading-drag-bg':'#21313a',
 'selection-panel-bg':'#19222b','transport-bg':'#171e25','transport-button-bg':'#252f38','empty-overlay':'#191f26e8','instrument-empty-bg':'#191f26d9',
 'loud-track-bg':'#10171e','loud-track-border':'#36434c','loud-track-rule':'#ffffff0a','shadow':'#0008','shadow-soft':'#0007','target-strip-bg':'#1b242a','report-bg':'#202831',
 'timeline-grid':'#303e4a','timeline-axis':'#aebccb','timeline-center':'#39444f','timeline-mask':'#090c1094','timeline-edge':'#66707c',
 'grid':'#303e4a','axis-text':'#aebccb','field-grid':'#41505c','correlation-cursor':'#e6eff4',
 'spectro-grid':'#43536366','spectro-axis':'#bdcbd7','surface-label':'#b8c7d3','surface-wire':'#3d4d5c',
} as const
export type FixedTokenName=keyof typeof fixedTokens

/** Base palette: each theme supplies only these; everything else is derived (docs/71 §3.1–3.2). */
export type ThemePalette={signalLo:string;signal:string;signalHi:string;meterNear:string;seriesS:string;seriesI:string;cursor:string;accent:string;button:string;onSignal:string;spectrogram:SpectrogramStops}
export type InstrumentTheme={id:ThemeId;name:string;description:string;palette:ThemePalette;tokens:ThemeTokens;spectrogram:SpectrogramStops}

const toHex=(c:readonly number[])=>'#'+c.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('')
/** Linear sRGB-space mix used for derived borders/backgrounds: a*(1-t)+b*t. */
export function mix(a:string,b:string,t:number):string{const x=parseHex(a),y=parseHex(b);return toHex([0,1,2].map(i=>x[i]*(1-t)+y[i]*t))}

export function deriveTokens(p:ThemePalette):ThemeTokens{
 const bg=fixedTokens.bg
 return {
  'signal':p.signal,'signal-alt':mix(p.signal,'#000000',.2),'signal-lo':p.signalLo,'series-m':p.signalHi,'brand-product':p.signalHi,
  'meter-near':p.meterNear,'loud-lo':p.signalLo,'loud-hi':p.signal,'rms-fill':mix(p.signal,'#ffffff',.5),
  'signal-border':mix(p.signal,bg,.55),'signal-bg':mix(p.signal,bg,.84),'signal-bg-strong':mix(p.signal,bg,.82),'live-border':mix(p.signal,bg,.62),'live-bg':mix(p.signal,bg,.87),'field-border':mix(p.signal,bg,.45),'field-positive':mix(p.signal,bg,.62),
  'series-s':p.seriesS,'series-i':p.seriesI,'target':p.seriesI,'target-fill':p.seriesI+'14',
  'curve-current':p.signalHi,'curve-average':p.seriesS,'curve-hold':p.seriesI,'field-in':p.signal,'field-out':p.seriesI,'field-point':mix(p.seriesS,'#ffffff',.45),'ref-a':p.signalHi,'ref-b':p.seriesS,
  'cursor':p.cursor,'selection-fill':p.cursor+'1f','selection-edge':p.cursor,
  'accent':p.accent,'accent-border':mix(p.accent,bg,.45),'accent-border-soft':mix(p.accent,bg,.52),'accent-border-muted':mix(p.accent,bg,.55),'accent-bg':mix(p.accent,bg,.84),'accent-bg-soft':mix(p.accent,bg,.86),'file-badge-border':mix(p.accent,bg,.62),'file-badge-bg':mix(p.accent,bg,.87),'divider-glow':p.accent+'55','dock-fill':p.accent+'22',
  'button-bg':p.button,'button-hover':mix(p.button,'#ffffff',.18),'on-signal':p.onSignal,
  'surface-bg':toHex(p.spectrogram[0]),'surface-cursor':p.cursor,'surface-selection':p.cursor,
 }
}

const traceGreenPalette:ThemePalette={signalLo:'#559938',signal:'#91e65c',signalHi:'#91e65c',meterNear:'#d9dd63',seriesS:'#58d4da',seriesI:'#efb65b',cursor:'#58d4da',accent:'#58d4da',button:'#7ac44b',onSignal:'#14200f',spectrogram:[[14,21,28],[34,65,83],[45,143,149],[145,230,92],[246,225,125]]}
/** preview.30 values kept verbatim so the default theme does not drift. */
const traceGreen:InstrumentTheme={id:'trace-green',name:'Trace 绿',description:'默认配色',palette:traceGreenPalette,spectrogram:traceGreenPalette.spectrogram,tokens:{
 'signal':'#91e65c','signal-alt':'#70bc4d','signal-lo':'#559938','series-m':'#91e65c','brand-product':'#91e65c',
 'meter-near':'#d9dd63','loud-lo':'#65aa45','loud-hi':'#a0ed6e','rms-fill':'#cbffa6',
 'signal-border':'#568737','signal-bg':'#243820','signal-bg-strong':'#253925','live-border':'#3f6330','live-bg':'#1e2c1c','field-border':'#638e52','field-positive':'#3d6c4e',
 'series-s':'#58d4da','series-i':'#efb65b','target':'#efb65b','target-fill':'#efb65b14',
 'curve-current':'#91e65c','curve-average':'#58d4da','curve-hold':'#e5b463','field-in':'#91e65c','field-out':'#e5b463','field-point':'#acdcca','ref-a':'#91e65c','ref-b':'#58d4da',
 'cursor':'#58d4da','selection-fill':'#58d4da1f','selection-edge':'#58d4da',
 'accent':'#58d4da','accent-border':'#528b96','accent-border-soft':'#47787b','accent-border-muted':'#527b70','accent-bg':'#203b32','accent-bg-soft':'#203037','file-badge-border':'#38666a','file-badge-bg':'#1b2c2c','divider-glow':'#58d4da55','dock-fill':'#58d4da22',
 'button-bg':'#7ac44b','button-hover':'#91e65c','on-signal':'#14200f',
 'surface-bg':'#0e151c','surface-cursor':'#73f0f5','surface-selection':'#57d4db',
}}
function derived(id:ThemeId,name:string,description:string,palette:ThemePalette):InstrumentTheme{return {id,name,description,palette,spectrogram:palette.spectrogram,tokens:deriveTokens(palette)}}

export const instrumentThemes:Record<ThemeId,InstrumentTheme>={
 'trace-green':traceGreen,
 'graphite':derived('graphite','石墨灰','低饱和中性灰',{signalLo:'#6b7683',signal:'#e4e8ec',signalHi:'#f2f5f7',meterNear:'#f2cf4a',seriesS:'#6fb0e8',seriesI:'#efb65b',cursor:'#58d4da',accent:'#6fb0e8',button:'#d9dee3',onSignal:'#11151a',spectrogram:[[14,17,22],[43,49,57],[86,96,107],[154,163,172],[238,241,244]]}),
 'ember':derived('ember','黄橙','橙—金渐变',{signalLo:'#c2551c',signal:'#ffb03a',signalHi:'#ffa53d',meterNear:'#fff0c2',seriesS:'#58d4da',seriesI:'#b48cff',cursor:'#e8edf2',accent:'#ffb03a',button:'#f59a3a',onSignal:'#1f1206',spectrogram:[[18,14,11],[61,29,18],[143,58,26],[234,138,46],[255,231,168]]}),
 'ocean':derived('ocean','海蓝','蓝色系',{signalLo:'#3b7bc8',signal:'#6bb2ff',signalHi:'#5aa9ff',meterNear:'#f2cf4a',seriesS:'#4fe0b0',seriesI:'#efb65b',cursor:'#f4f8ff',accent:'#5aa9ff',button:'#5aa9ff',onSignal:'#0b1628',spectrogram:[[11,19,32],[21,52,89],[31,112,178],[82,196,245],[226,245,255]]}),
 'duo':derived('duo','蓝橙','色弱友好',{signalLo:'#2b7fb8',signal:'#56b4e9',signalHi:'#56b4e9',meterNear:'#f0e442',seriesS:'#e69f00',seriesI:'#f5f5f5',cursor:'#cc79a7',accent:'#56b4e9',button:'#56b4e9',onSignal:'#0b1628',spectrogram:[[0,32,76],[49,68,107],[102,105,112],[149,143,120],[255,234,70]]}),
}
/** The 'heat' spectrogram palette is theme-independent. */
export const heatStops:SpectrogramStops=[[14,20,33],[51,62,132],[170,63,101],[244,141,60],[253,233,156]]

export function instrumentTheme(id:ThemeId):InstrumentTheme{return instrumentThemes[id]}
export function spectralGradient(stops:SpectrogramStops,direction='90deg'):string{return 'linear-gradient('+direction+','+stops.map(toHex).join(',')+')'}
/** Every CSS custom property for a theme, without the leading "--". */
export function cssTokens(id:ThemeId):Record<string,string>{
 const theme=instrumentTheme(id)
 return {...fixedTokens,...theme.tokens,'spectral-legend':spectralGradient(theme.spectrogram),'spectral-legend-heat':spectralGradient(heatStops)}
}
/** Parses #rgb, #rrggbb or #rrggbbaa into 0–255 components. */
export function parseHex(value:string):[number,number,number,number]{
 const m=/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);if(!m)throw Error('INVALID_COLOUR '+value)
 const h=m[1].length<=4?m[1].split('').map(c=>c+c).join(''):m[1]
 return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),h.length===8?parseInt(h.slice(6,8),16):255]
}
