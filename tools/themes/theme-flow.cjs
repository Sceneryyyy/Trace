// End-to-end theme checks for docs/71: TH-A03 (persistence/compat), TH-A06 (data unchanged), TH-A07 (switch cost),
// TH-A08 (applied before first paint), TH-A09 (keyboard picker). Generated fixture only; the WASAPI take is deleted afterwards.
// Usage: node tools/themes/theme-flow.cjs [--legacy <preview.30 Trace.exe>]
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const arg=(n,f)=>{const i=process.argv.indexOf('--'+n);return i>0?process.argv[i+1]:f}
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/themes','flow-'+Date.now())
fs.mkdirSync(folder,{recursive:true});const takes=path.join(folder,'takes');fs.mkdirSync(takes)
const fixture=require('../m4/fixture.cjs')(takes),userData=path.join(folder,'user-data');fs.mkdirSync(userData)
const prefs=path.join(userData,'trace-settings.json')
fs.writeFileSync(prefs,JSON.stringify({monitoringRequested:false,confirmExitWhileRecording:false,windowSeconds:10,displaySettings:{targetEnabled:true,targetLufs:-16,waveGain:2}}))
const legacy=arg('legacy',path.join(root,'dist-trace/preview.30/win-unpacked/Trace.exe'))
const report={folder,status:'running',checks:[],kind:'Actual Electron renderer; generated fixture; one short WASAPI take for the recording check'}
const pass=s=>{report.checks.push(s);console.log('PASS',s)}
const wait=async(fn,name,limit=30000)=>{for(const b=Date.now();Date.now()-b<limit;){const v=await fn().catch(()=>false);if(v)return v;await delay(40)}throw Error('Timeout: '+name)}
const ids=['trace-green','graphite','ember','ocean','duo']
let session
const start=(exe=require('electron'),extra=[path.join(root,'out-trace/main/index.js')])=>launch(exe,folder,{userData,recordDirectory:takes,args:[...extra,'--disable-backgrounding-occluded-windows'],bounds:{x:20,y:20,width:1280,height:800}})
const theme=c=>c.evaluate('document.documentElement.dataset.traceTheme')
const readings=c=>c.evaluate("JSON.stringify([...document.querySelectorAll('[data-instrument=levels] .channel-readings strong,[data-instrument=loudness] .metric-number,[data-instrument=loudness] .summary-metric strong')].map(e=>e.firstChild?.textContent??e.textContent))")
async function main(){
 session=await start();let c=session.cdp
 await c.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:1,mobile:false})
 await wait(()=>c.evaluate("document.querySelectorAll('[data-instrument]').length===4"),'workspace')
 assert.equal(await theme(c),'trace-green');assert.equal((await c.state()).instrumentTheme,'trace-green');pass('Legacy preferences without a theme start on Trace 绿')

 // TH-A09 keyboard picker, preview, Escape restores.
 await c.click('[aria-label="显示与帮助"]');await wait(()=>c.evaluate("!!document.querySelector('.theme-picker')"),'picker')
 const a11y=await c.evaluate("(()=>{const g=document.querySelector('.theme-picker'),r=[...g.querySelectorAll('[role=radio]')];return {group:g.getAttribute('role'),label:g.getAttribute('aria-label'),count:r.length,checked:r.filter(x=>x.getAttribute('aria-checked')==='true').map(x=>x.dataset.themeChoice),tabbable:r.filter(x=>x.tabIndex===0).length,names:r.map(x=>x.getAttribute('aria-label'))}})()")
 assert.equal(a11y.group,'radiogroup');assert.equal(a11y.count,5);assert.deepEqual(a11y.checked,['trace-green']);assert.equal(a11y.tabbable,1);assert(a11y.names.every(Boolean));report.a11y=a11y
 await wait(()=>c.evaluate("document.activeElement===document.querySelector('.theme-card[aria-checked=true]')"),'automatic focus on selected theme')
 await c.key('ArrowRight','ArrowRight',39);await wait(async()=>await theme(c)==='graphite','arrow preview')
 const focus=await c.evaluate("(()=>{const e=document.activeElement;return {choice:e.dataset.themeChoice,checked:e.getAttribute('aria-checked'),outline:getComputedStyle(e).outlineColor,style:getComputedStyle(e).outlineStyle}})()")
 assert.equal(focus.choice,'graphite');assert.equal(focus.checked,'true');assert.equal(focus.outline,'rgb(255, 255, 255)');assert.equal(focus.style,'solid')
 await c.key('End','End',35);await wait(async()=>await theme(c)==='duo','End');await c.key('Home','Home',36);await wait(async()=>await theme(c)==='trace-green','Home')
 await c.key('ArrowLeft','ArrowLeft',37);await wait(async()=>await theme(c)==='duo','wrap left')
 assert.equal((await c.state()).instrumentTheme,'trace-green','preview must not persist')
 await c.key('Escape','Escape',27);await wait(()=>c.evaluate("!document.querySelector('.trace-modal')"),'close');await wait(async()=>await theme(c)==='trace-green','Escape restores')
 pass('Keyboard radiogroup previews immediately, keeps a fixed white focus ring, and Escape restores the saved theme')

 // Apply ember through the dialog.
 await c.click('[aria-label="显示与帮助"]');await wait(()=>c.evaluate("!!document.querySelector('.theme-picker')"),'picker again')
 await c.click('[data-theme-choice="ember"]');await wait(async()=>await theme(c)==='ember','click preview')
 await c.click('.settings-content .primary-button');await wait(async()=>(await c.state()).instrumentTheme==='ember','applied')
 await wait(()=>c.evaluate("!document.querySelector('.trace-modal')"),'modal closes');assert.equal(await theme(c),'ember')
 const saved=await wait(async()=>{const v=JSON.parse(fs.readFileSync(prefs,'utf8'));return v.instrumentTheme==='ember'&&v},'preferences written');assert.equal(saved.instrumentTheme,'ember');assert.equal(saved.instrumentThemeVersion,1);assert.deepEqual(saved.displaySettings,{targetEnabled:true,targetLufs:-16,waveGain:2})
 pass('Apply persists instrumentTheme as a top-level preference and keeps displaySettings unchanged')

 // TH-A06 data unchanged across every theme at a fixed file position.
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'});await wait(async()=>(await c.state()).playback?.analysisPhase==='ready','analysis',90000)
 const p=(await c.state()).playback;await c.request('playback.seek',{playbackId:p.id,positionFrame:'240000',resume:false})
 await wait(()=>c.evaluate("document.querySelector('.workspace')?.dataset.historyPosition==='240000'"),'seek');await delay(400)
 const base=await readings(c),results={}
 for(const id of ids){await c.request('view.theme',{theme:id});await wait(async()=>await theme(c)===id,'theme '+id);await delay(250);results[id]=await readings(c);assert.equal(results[id],base,id+' readings')}
 report.readings=JSON.parse(base);pass('Readings at the same file position are identical in all five themes')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=\"工作台布局\"]');e.value='time-frequency';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await wait(()=>c.evaluate("!!document.querySelector('[data-instrument=spectrogram] canvas')?.dataset.spectrogramPaintKey"),'spectrogram painted',60000);await delay(600)
 const spec=()=>c.evaluate("(()=>{const e=document.querySelector('[data-instrument=spectrogram] canvas');return {paint:e.dataset.spectrogramPaintKey,context:e.dataset.spectrogramDrawnContext}})()")
 const before=await spec()
 for(const id of ids){await c.request('view.theme',{theme:id});await wait(async()=>await theme(c)===id,'spec theme '+id);await delay(250);assert.deepEqual(await spec(),before,id+' spectrogram request/context')}
 pass('Theme switches recolour the spectrogram without a new spectrogram request or context change')

 // TH-A07 repeated switching: repaint only, bounded heap.
 await c.send('HeapProfiler.enable');const heap=async()=>{await c.send('HeapProfiler.collectGarbage');return (await c.send('Runtime.getHeapUsage')).usedSize}
 for(let i=0;i<25;i++)await c.request('view.theme',{theme:ids[i%5]});const warm=await heap()
 const t0=Date.now();for(let i=0;i<200;i++)await c.request('view.theme',{theme:ids[i%5]});const elapsed=Date.now()-t0;await delay(300);const after=await heap()
 report.switching={switches:200,msPerSwitch:elapsed/200,heapWarm:warm,heapAfter:after,growth:after-warm}
 assert(after-warm<4*1024*1024,'heap growth '+(after-warm));pass('200 theme switches keep renderer heap growth below 4 MiB ('+((after-warm)/1024).toFixed(0)+' KiB)')
 await c.request('view.theme',{theme:'ocean'})

 // Recording keeps running through theme switches (TH-A06 last clause).
 if((await c.state()).deviceId){
  await c.request('file.close').catch(()=>{})
  await c.evaluate('window.__themeFrame=null;window.trace.onSnapshot(s=>window.__themeFrame=s);true')
  await c.request('record.start');await wait(()=>c.evaluate('BigInt(window.__themeFrame?.recording?.writtenFrames||0)>0n'),'recording frames')
  const a=await c.evaluate('window.__themeFrame.recording.writtenFrames')
  for(let i=0;i<20;i++){await c.request('view.theme',{theme:ids[i%5]});await delay(50)}
  await delay(500);const b=await c.evaluate('window.__themeFrame.recording.writtenFrames'),gaps=await c.evaluate('(window.__themeFrame.recordingView?.gapFrames||[]).length')
  await c.request('record.stop');await wait(async()=>!(await c.state()).currentRecord,'record stop')
  assert(BigInt(b)>BigInt(a));assert.equal(gaps,0);report.recording={before:a,after:b,gaps}
  pass('A WASAPI take keeps writing through 20 theme switches with no gap markers')
 }else report.recordingSkipped='No WASAPI device'
 await c.request('view.theme',{theme:'ocean'})
 await wait(async()=>JSON.parse(fs.readFileSync(prefs,'utf8')).instrumentTheme==='ocean','ocean saved')

 // TH-A08 restart: theme applied before first paint.
 await session.close();session=null;session=await start();c=session.cdp
 await wait(()=>c.evaluate("document.querySelectorAll('[data-instrument]').length>0"),'restart')
 const firstPaint=await c.evaluate("(()=>{const m=performance.getEntriesByName('trace-theme-applied')[0],p=performance.getEntriesByType('paint').find(e=>e.name==='first-paint');return {mark:m?.startTime??null,paint:p?.startTime??null,theme:document.documentElement.dataset.traceTheme,query:location.search}})()")
 report.firstPaint=firstPaint;console.log('FIRST_PAINT',JSON.stringify(firstPaint));assert.equal(firstPaint.theme,'ocean');assert.equal((await c.state()).instrumentTheme,'ocean');require('./first-paint.cjs').assertThemeBeforeFirstPaint(firstPaint)
 pass('Restart restores the saved theme and applies it before the first paint ('+firstPaint.mark?.toFixed(1)+' ms < '+firstPaint.paint?.toFixed(1)+' ms)')
 await session.close();session=null

 // TH-A03 downgrade: preview.30 reads the new preferences without losing display/target settings.
 if(fs.existsSync(legacy)){
  session=await start(legacy,[]);c=session.cdp
  await wait(async()=>(await c.state()).revision>=0,'legacy start')
  const s=await c.state();report.legacy={exe:path.relative(root,legacy),displaySettings:s.displaySettings,instrumentTheme:s.instrumentTheme??null}
  assert.deepEqual(s.displaySettings,{targetEnabled:true,targetLufs:-16,waveGain:2});assert.equal(s.instrumentTheme,undefined)
  pass('preview.30 opens the new preferences and keeps display settings (theme field ignored)')
  await session.close();session=null
 }else report.legacySkipped='preview.30 executable not found'
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{
 if(session)await session.close().catch(e=>{report.closeError=String(e)})
 for(const dir of [takes,userData])try{fs.rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:300})}catch(e){(report.cleanup??=[]).push(String(e).slice(0,200))}
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('THEME_FLOW',report.status,report.checks.length,folder)
})
