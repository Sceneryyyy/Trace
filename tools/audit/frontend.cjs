// Actual product React/CSS/CSP with simulated IPC. No native or physical-device claims.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{build}=require('esbuild'),{browserPage}=require('./browser.cjs')
const root=path.resolve(__dirname,'../..')
async function main(){
 const base=path.join(root,'artifacts/frontend');await fs.mkdir(base,{recursive:true});const folder=await fs.mkdtemp(path.join(base,'browser-'))
 await build({entryPoints:[path.join(__dirname,'frontend-fixture.jsx')],outfile:path.join(folder,'probe.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',loader:{'.png':'dataurl','.woff':'dataurl','.woff2':'dataurl'}})
 const html=await fs.readFile(path.join(root,'src/trace/renderer/index.html'),'utf8'),csp=html.match(/<meta http-equiv="Content-Security-Policy"[^>]+>/)[0]
 await fs.writeFile(path.join(folder,'index.html'),'<!doctype html><meta charset="utf-8">'+csp+'<link rel="stylesheet" href="probe.css"><div id="root"></div><script src="probe.js"></script>')
 const report={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceDirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),scope:'Actual React/CSS/production CSP; simulated IPC, metadata and device state only; no Windows/audio/user acceptance',checks:[],geometry:[],screenshots:[]}
 await browserPage(folder,'index.html',async c=>{
  const ev=c.evaluate,wait=c.wait
  const click=async selector=>{await wait('!!document.querySelector('+JSON.stringify(selector)+')');await ev('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');if(n.disabled)throw Error("DISABLED "+'+JSON.stringify(selector)+');n.click()})()');await c.delay(40)}
  const key=async(key,code=key)=>{await c.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,text:key==='Enter'?'\r':key===' '?' ':undefined,windowsVirtualKeyCode:({Enter:13,Escape:27,Home:36,End:35,ArrowDown:40,ArrowUp:38,Tab:9,' ':32})[key]});await c.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:({Enter:13,Escape:27,Home:36,End:35,ArrowDown:40,ArrowUp:38,Tab:9,' ':32})[key]});await c.delay(30)}
  const shot=async name=>{const r=await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),p=path.join(folder,name+'.png');await fs.writeFile(p,Buffer.from(r.data,'base64'));report.screenshots.push(path.relative(root,p))}
  await wait('document.querySelectorAll("[data-instrument]").length===4')
  assert.equal(await ev('document.querySelectorAll(".instrument-heading button").length'),8)
  for(const [width,height] of [[1024,700],[1280,800],[1399,800],[1400,800],[1600,900]]){
   await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await c.delay(60)
   const geometry=await ev('(()=>{const r=n=>n.getBoundingClientRect().toJSON();return {width:innerWidth,context:r(document.querySelector(".workbench-heading")),buttons:[...document.querySelectorAll(".context-settings button,.transport button,.workspace-toolbar>button,.workspace-toolbar>select")].map(n=>({label:n.ariaLabel||n.textContent,rect:r(n)})),canvas:[...document.querySelectorAll(".instrument-content")].map(n=>({instrument:n.parentElement.dataset.instrument,rect:r(n)}))}})()')
   for(const button of geometry.buttons)assert(button.rect.left>=0&&button.rect.right<=width+1,JSON.stringify(button))
   const contextButtons=geometry.buttons.filter(b=>b.rect.top<geometry.context.bottom)
   for(let i=1;i<contextButtons.length;i++)assert(contextButtons[i].rect.left>=contextButtons[i-1].rect.right-1,'context buttons overlap')
   report.geometry.push(geometry);if(width===1024||width===1600)await shot('workbench-'+width)
  }
  report.checks.push('Default four instruments use 8 management buttons; context/transport bounded at 1024/1280/1399/1400/1600 CSS px')
  await click('[aria-label="波形更多操作"]');await wait('document.activeElement?.getAttribute("role")==="menuitem"');await key('End');assert.equal(await ev('document.activeElement.textContent'),'隐藏波形');await key('Home');await key('Enter');await wait('!!document.querySelector("[aria-label=波形设置]")');await key('Escape');await wait('!document.querySelector(".instrument-settings")');assert.equal(await ev('document.activeElement.ariaLabel'),'波形更多操作')
  await click('[aria-label="波形更多操作"]');await click('.action-menu button:last-child');assert.equal(await ev('document.querySelectorAll("[data-instrument=waveform]").length'),0);await click('.instrument-chooser');await click('[data-instrument-choice=waveform] input');await click('.instrument-chooser');await wait('!!document.querySelector("[data-instrument=waveform]")')
  report.checks.push('Instrument menus: arrows/Home/End/Enter, focus restore, hide and recover instrument')
  await click('[aria-label="采集设备设置"]');assert.equal(await ev('document.querySelector("[aria-label=\\"系统播放设备\\"]").disabled'),false);await click('[aria-label="关闭对话框"]')
  await ev('window.__publish({currentRecord:{id:"simulated-rec",phase:"recording"}})');await click('[aria-label="采集设备设置"]');assert.equal(await ev('document.querySelector("[aria-label=\\"系统播放设备\\"]").disabled'),true);await click('[aria-label="关闭对话框"]');await ev('window.__publish({currentRecord:null})')
  report.checks.push('Device configuration moved into dialog; live remains actionable and REC disables changing the source')
  if(!process.argv.includes('--batch-a')){
   // Further task-level interactions are added with their implementation batches.
  }
  assert.deepEqual(await ev('window.__uiErrors'),[])
 });await fs.writeFile(path.join(base,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log('Frontend browser checks passed: '+report.checks.length)
}
main().catch(e=>{console.error(e);process.exitCode=1})
