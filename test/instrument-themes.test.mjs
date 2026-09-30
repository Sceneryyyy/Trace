// docs/71 TH-T1/TH-A02/TH-A04: one colour source, no stray literals, readable themes.
import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,readFile,readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/themes',{recursive:true})
await build({entryPoints:['src/trace/instrumentThemes.ts'],outfile:'artifacts/themes/themes.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/renderer/spectrogramPresentation.ts'],outfile:'artifacts/themes/presentation.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/contracts.ts'],outfile:'artifacts/themes/contracts.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/displaySettings.ts'],outfile:'artifacts/themes/display.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/renderer/meterZones.ts'],outfile:'artifacts/themes/zones.cjs',platform:'node',format:'cjs',bundle:true})
const themes=(await import(pathToFileURL(resolve('artifacts/themes/themes.cjs')))).default
const presentation=(await import(pathToFileURL(resolve('artifacts/themes/presentation.cjs')))).default
const {validateRequest}=(await import(pathToFileURL(resolve('artifacts/themes/contracts.cjs')))).default
const display=(await import(pathToFileURL(resolve('artifacts/themes/display.cjs')))).default
const zones=(await import(pathToFileURL(resolve('artifacts/themes/zones.cjs')))).default

// WCAG 2.x relative luminance / contrast, CIELAB (D65) and CIEDE2000; Machado 2009 severity-1.0 CVD matrices.
const rgb=h=>themes.parseHex(h).slice(0,3).map(v=>v/255)
const lin=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4
const luminance=h=>{const [r,g,b]=rgb(h).map(lin);return .2126*r+.7152*g+.0722*b}
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const lab=c=>{const [r,g,b]=c.map(lin),f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,X=f((r*.4124+g*.3576+b*.1805)/.95047),Y=f(r*.2126+g*.7152+b*.0722),Z=f((r*.0193+g*.1192+b*.9505)/1.08883);return [116*Y-16,500*(X-Y),200*(Y-Z)]}
function de2000([L1,a1,b1],[L2,a2,b2]){const rad=Math.PI/180,C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cb=(C1+C2)/2,G=.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7))),ap1=a1*(1+G),ap2=a2*(1+G),Cp1=Math.hypot(ap1,b1),Cp2=Math.hypot(ap2,b2),hp=(x,y)=>{const h=Math.atan2(y,x)/rad;return h<0?h+360:h},h1=hp(ap1,b1),h2=hp(ap2,b2);let dh=h2-h1;if(Cp1*Cp2===0)dh=0;else if(dh>180)dh-=360;else if(dh<-180)dh+=360;const dL=L2-L1,dC=Cp2-Cp1,dH=2*Math.sqrt(Cp1*Cp2)*Math.sin(dh/2*rad),Lb=(L1+L2)/2,Cpb=(Cp1+Cp2)/2;let hb=h1+h2;if(Cp1*Cp2!==0){hb=Math.abs(h1-h2)>180?(h1+h2+360)/2:(h1+h2)/2;if(hb>=360)hb-=360}const T=1-.17*Math.cos((hb-30)*rad)+.24*Math.cos(2*hb*rad)+.32*Math.cos((3*hb+6)*rad)-.2*Math.cos((4*hb-63)*rad),Sl=1+.015*(Lb-50)**2/Math.sqrt(20+(Lb-50)**2),Sc=1+.045*Cpb,Sh=1+.015*Cpb*T,Rt=-2*Math.sqrt(Cpb**7/(Cpb**7+25**7))*Math.sin(60*Math.exp(-(((hb-275)/25)**2))*rad);return Math.sqrt((dL/Sl)**2+(dC/Sc)**2+(dH/Sh)**2+Rt*(dC/Sc)*(dH/Sh))}
const cvd={deutan:[[.367322,.860646,-.227968],[.280085,.672501,.047413],[-.01182,.04294,.968881]],protan:[[.152286,1.052583,-.204868],[.114503,.786281,.099216],[-.003882,-.048116,1.051998]]}
const simulate=(c,m)=>{const v=c.map(lin);return m.map(r=>Math.min(1,Math.max(0,r[0]*v[0]+r[1]*v[1]+r[2]*v[2]))).map(x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055)}
const dE=(a,b)=>de2000(lab(rgb(a)),lab(rgb(b)))
const dEcvd=(a,b)=>Math.min(...Object.values(cvd).map(m=>de2000(lab(simulate(rgb(a),m)),lab(simulate(rgb(b),m)))))
const stopHex=s=>'#'+s.map(v=>v.toString(16).padStart(2,'0')).join('')
const renderer='src/trace/renderer'

test('renderer CSS and canvas code contain no colour literals outside the theme source',async()=>{
 const literal=/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g,legacy=/var\(--(green|cyan|amber|red)\)/g,offenders=[]
 for(const name of await readdir(renderer)){
  if(!/\.(css|tsx?|ts)$/.test(name))continue
  const text=(await readFile(resolve(renderer,name),'utf8')).replace(/\/\*[\s\S]*?\*\//g,'')
  for(const [i,line] of text.split('\n').entries()){
   // HTML entities (&#…;) and the colour-agnostic SVG/currentColor markup are not colours.
   const cleaned=line.replace(/&#x?[0-9a-fA-F]+;/g,'')
   for(const m of [...cleaned.matchAll(literal),...cleaned.matchAll(legacy)])offenders.push(name+':'+(i+1)+' '+m[0])
  }
 }
 assert.deepEqual(offenders,[],'colour literals must live in src/trace/instrumentThemes.ts')
})

test('every theme defines every token as a valid colour and the default matches preview.30',()=>{
 const {themeIds,instrumentThemes,themeTokenNames,fixedTokens,cssTokens,parseHex,defaultThemeId,isThemeId}=themes
 assert.equal(defaultThemeId,'trace-green');assert(isThemeId('trace-green'));assert(!isThemeId('amber'));assert(!isThemeId(undefined))
 for(const id of themeIds){
  const theme=instrumentThemes[id];assert.equal(theme.id,id)
  assert.deepEqual(Object.keys(theme.tokens).sort(),[...themeTokenNames].sort(),id+' token set')
  for(const [name,value] of Object.entries(theme.tokens))assert.doesNotThrow(()=>parseHex(value),id+' '+name)
  assert.equal(theme.spectrogram.length,5)
  const tokens=cssTokens(id);for(const name of Object.keys(fixedTokens))assert(name in tokens)
 }
 const g=instrumentThemes['trace-green'].tokens
 assert.deepEqual([g.signal,g['series-s'],g['series-i'],g.cursor,g['button-bg'],g['on-signal']],['#91e65c','#58d4da','#efb65b','#58d4da','#7ac44b','#14200f'])
 assert.deepEqual(fixedTokens.danger,'#ff5e66')
})

test('spectrogram lookups follow the theme scale, keep heat fixed and stay bounded',()=>{
 const view={width:4,height:2,decibels:Float32Array.from([-100,-75,-50,0,-100,-25,-10,0]),status:Uint8Array.from([2,2,2,2]),coverage:Float32Array.from([1,1,1,1])}
 const settings={version:2,palette:'trace',minDecibels:-100,maxDecibels:0}
 const defaults=presentation.colorizeSpectrogram(view,settings)
 const custom=[[0,0,0],[10,10,10],[20,20,20],[30,30,30],[250,250,250]]
 const alt=presentation.colorizeSpectrogram(view,settings,custom)
 assert.notDeepEqual([...alt],[...defaults])
 assert.deepEqual([...alt.slice(12,15)],[250,250,250])
 const heatA=presentation.colorizeSpectrogram(view,{...settings,palette:'heat'}),heatB=presentation.colorizeSpectrogram(view,{...settings,palette:'heat'},custom)
 assert.deepEqual([...heatA],[...heatB])
 for(let i=0;i<20;i++)presentation.colorizeSpectrogram(view,settings,[[i,0,0],[i,1,0],[i,2,0],[i,3,0],[i,4,0]])
 assert(presentation.spectrogramLutCount()<=themes.themeIds.length+1)
})

test('view.theme is a whitelisted single-field command; displaySettings stays untouched for older builds',()=>{
 const make=payload=>({protocolVersion:1,requestId:'theme',expectedStateRevision:0,command:'view.theme',payload})
 for(const theme of themes.themeIds)assert.equal(validateRequest(make({theme})).payload.theme,theme)
 for(const payload of [{theme:'amber'},{theme:''},{theme:1},{},{theme:'ocean',extra:true},{theme:'ocean;--x:red'}])assert.throws(()=>validateRequest(make(payload)),/INVALID_THEME|INVALID/)
 assert.equal(display.displaySettingsVersion,2)
 assert.throws(()=>display.validateDisplaySettings({...display.defaultDisplaySettings,themeId:'ocean'}),/INVALID_DISPLAY_SETTINGS/)
 // preview.30 reads only displaySettings from the preferences object, so a top-level theme field is ignored there.
 const saved=JSON.parse(JSON.stringify({instrumentTheme:'ember',instrumentThemeVersion:1,displaySettings:{targetEnabled:true,targetLufs:-16,waveGain:2}}))
 assert.deepEqual(display.restoreDisplaySettings(saved.displaySettings),{targetEnabled:true,targetLufs:-16,waveGain:2})
})

test('meter zones sit at −6 and −1 dBFS on the −60…0 scale',()=>{
 assert.equal(zones.meterFraction(-6),.9);assert(Math.abs(zones.meterFraction(-1)-59/60)<1e-12)
 assert.equal(zones.meterZone(-6.01),'safe');assert.equal(zones.meterZone(-6),'near');assert.equal(zones.meterZone(-1.01),'near');assert.equal(zones.meterZone(-1),'over');assert.equal(zones.meterZone(0.5),'over')
 assert.equal(zones.meterZone(null),null);assert.equal(zones.meterZone(-Infinity),null)
})

test('TH-A04: computed contrast, colour difference and colour-vision-deficiency thresholds',()=>{
 const f=themes.fixedTokens,panel=f.panel,report=[]
 assert(contrast(f.text,panel)>=4.5&&contrast(f.secondary,panel)>=4.5,'body text')
 assert(contrast(f['focus-ring'],panel)>=4.5,'focus ring')
 for(const id of themes.themeIds){
  const t=themes.instrumentThemes[id].tokens,exempt=id===themes.defaultThemeId
  for(const key of ['signal','series-m','series-s','series-i','signal-lo','cursor','curve-current','curve-average','curve-hold','ref-a','ref-b'])assert(contrast(t[key],panel)>=3,id+' '+key+' contrast '+contrast(t[key],panel).toFixed(2))
  assert(contrast(t['on-signal'],t['button-bg'])>=4.5,id+' primary button text')
  assert(contrast(t['brand-product'],f['topbar-bg'])>=4.5,id+' TRACE wordmark on top bar')
  const series=[t['series-m'],t['series-s'],t['series-i']]
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){
   assert(dE(series[i],series[j])>=20,id+' series ΔE '+dE(series[i],series[j]).toFixed(1))
   // Series always differ by line style (solid / [5,3] / [2,3]); the new themes must also pass the CVD colour floor.
   if(!exempt)assert(dEcvd(series[i],series[j])>=12,id+' series CVD ΔE '+dEcvd(series[i],series[j]).toFixed(1))
  }
  assert(dE(t.signal,t['meter-near'])>=12,id+' safe/near zone ΔE '+dE(t.signal,t['meter-near']).toFixed(1))
  assert(dE(t['meter-near'],f['meter-over'])>=12,id+' near/over zone ΔE')
  if(!exempt){
   const stops=themes.instrumentThemes[id].spectrogram.map(stopHex)
   for(const view of ['normal','deutan']){
    const L=stops.map(h=>lab(view==='normal'?rgb(h):simulate(rgb(h),cvd.deutan))[0])
    for(let i=1;i<L.length;i++)assert(L[i]-L[i-1]>=8,id+' spectrogram L* '+view+' '+L.map(v=>v.toFixed(0)).join('/'))
   }
  }
  report.push(id)
 }
 assert.deepEqual(report,[...themes.themeIds])
})
