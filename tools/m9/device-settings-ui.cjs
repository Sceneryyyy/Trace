// Actual Electron, isolated preferences, monitoring off; no recording or output.
const fs=require('fs'),path=require('path'),assert=require('assert/strict')
const {launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m9','device-settings-'+Date.now()),userData=path.join(folder,'user-data')
fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false}))
let session;const report={status:'running',checks:[]},pass=text=>{report.checks.push(text);console.log('PASS',text)}
const wait=async(fn,label)=>{for(const start=Date.now();Date.now()-start<20000;){if(await fn())return;await delay(40)}throw Error('Timeout '+label)}
async function main(){
 const launchApp=()=>launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{userData,args:process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')],bounds:{x:20,y:20,width:1280,height:900}})
 session=await launchApp();let c=session.cdp
 const devices=(await c.request('devices.list')).data,device=devices.find(d=>d.supported&&d.format)
 assert(device,'Supported device with real format required')
 await c.request('devices.select',{deviceId:device.id})
 await wait(()=>c.evaluate('document.querySelector(".device-summary").title.includes('+JSON.stringify(device.label)+')'),'device identity')
 assert.equal(await c.evaluate('document.querySelectorAll(".save-settings").length'),0)
 assert.equal(await c.evaluate('document.querySelector(".recording-format-info").tagName'),'DIV')
 assert((await c.evaluate('document.querySelector(".device-summary small").textContent')).includes(device.format.channelCount+' 声道'))
 assert((await c.evaluate('document.querySelector(".recording-format-info").textContent')).includes(device.format.sampleRate/1000+' kHz'))
 for(const width of [1024,1280,1600]){
  await c.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await delay(100)
  assert(await c.evaluate("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.workspace-toolbar').getBoundingClientRect().right<=innerWidth"))
  await c.screenshot(path.join(folder,'header-'+width+'.png'))
 }
 pass('Real device identity/channel/precision and read-only format/rate are visible; 1024/1280/1600 layouts fit')
 const open=async()=>{await c.click('[aria-label="设置与帮助"]');await c.click('[data-section="recording"]')}
 const select=async(label,value)=>{await c.evaluate('(()=>{const e=document.querySelector('+JSON.stringify('[aria-label="'+label+'"]')+');e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("change",{bubbles:true}))})()');await delay(60)}
 await open();assert.equal(await c.evaluate('document.querySelectorAll(".trace-modal .primary-button").length'),1)
 await select('录音格式','mp3');await select('录音码率','256');await select('录音采样率','44100')
 await c.click('[data-section="display"]');await c.click('[data-section="recording"]')
 assert.equal(await c.evaluate('document.querySelector("[aria-label=录音码率]").value'),'256')
 await c.screenshot(path.join(folder,'recording-settings.png'));await c.click('.trace-modal .primary-button');await wait(()=>c.evaluate('!document.querySelector(".trace-modal")'),'settings applied and dialog closed')
 await wait(async()=>(await c.state()).recordSettings?.format==='mp3','saved MP3')
 assert.equal((await c.state()).recordSettings.sampleRate,44100)
 await open();assert.equal(await c.evaluate('document.querySelector("[aria-label=录音码率]").value'),'256')
 await select('录音格式','aac');await c.click('[aria-label="关闭对话框"]')
 assert.equal((await c.state()).recordSettings.format,'mp3');await open()
 assert.equal(await c.evaluate('document.querySelector("[aria-label=录音格式]").value'),'mp3')
 pass('Unified recording category keeps drafts across tabs, applies MP3 rate/bitrate, and discards unapplied AAC draft')
 await select('录音格式','aac');await select('录音 AAC 封装','adts');await c.click('.trace-modal .primary-button');await wait(()=>c.evaluate('!document.querySelector(".trace-modal")'),'settings applied and dialog closed')
 await wait(async()=>(await c.state()).recordSettings?.format==='aac','saved AAC')
 await open();assert.equal(await c.evaluate(`document.querySelector('[aria-label="录音 AAC 封装"]').value`),'adts')
 await select('录音格式','wav');await select('录音采样精度','float32');await c.click('.trace-modal .primary-button');await wait(()=>c.evaluate('!document.querySelector(".trace-modal")'),'settings applied and dialog closed')
 await wait(async()=>(await c.state()).recordSettings?.encoding==='float32','saved WAV')
 assert((await c.evaluate('document.querySelector(".recording-format-info").textContent')).includes('32f'))
 pass('AAC ADTS and WAV float settings persist and update the read-only header')
 await session.close();session=null;session=await launchApp();c=session.cdp
 assert.equal((await c.state()).recordSettings.encoding,'float32')
 assert.equal((await c.state()).monitoringRequested,false)
 pass('Restart restores recording settings without starting monitoring');report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.status='fail';report.closeError=String(e);process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log('DEVICE_SETTINGS',report.status,folder)})
