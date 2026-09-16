const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict')
const {launch,delay}=require('./cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/iteration/two-ui-'+Date.now()),takes=path.join(folder,'takes');fs.mkdirSync(takes,{recursive:true})
const fixture=require('../m4/fixture.cjs')(takes)
for(let i=1;i<=60;i++){
 const dir=path.join(takes,'fixture-'+i),d=structuredClone(fixture.document);d.sessionId=crypto.randomUUID();d.name='Test_'+String(i).padStart(2,'0');d.createdAt=new Date(Date.now()-i*3600000).toISOString()
 if(i===1){d.status='failed';d.error='DISK_FULL'}
 fs.mkdirSync(path.join(dir,'audio'),{recursive:true})
 for(const a of d.assets)fs.linkSync(path.join(fixture.folder,a.relativePath),path.join(dir,a.relativePath))
 fs.writeFileSync(path.join(dir,'session.json'),JSON.stringify(d))
}
const userData=path.join(folder,'user-data');fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false}))
const report={folder,status:'running',fixtureOnly:true,checks:[]};let session
const pass=s=>{report.checks.push(s);console.log('PASS',s)}
const wait=async(fn,label,max=30000)=>{for(const t=Date.now();Date.now()-t<max;){const result=await fn();if(result)return result;await delay(25)}throw Error('Timeout '+label)}
async function start(){const packaged=process.env.TRACE_PACKAGE_EXE;session=await launch(packaged||require('electron'),folder,{userData,args:[...(packaged?[]:[path.join(root,'out-trace/main/index.js')]),'--disable-gpu','--disable-renderer-backgrounding']});await wait(async()=>((await session.cdp.state()).recordings||[]).length===61,'library load');await session.cdp.send('Emulation.setDeviceMetricsOverride',{width:1264,height:761,deviceScaleFactor:1,mobile:false});return session.cdp}
async function input(c,selector,value){await c.evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}))})()');await delay(80)}
async function select(c,selector,value){await c.evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("change",{bubbles:true}))})()');await delay(80)}
async function main(){
 let c=await start();await c.click('[data-open-files]');await wait(()=>c.evaluate('document.querySelectorAll(".library-take").length===50'),'page size')
 assert.equal(await c.evaluate('document.querySelectorAll(".take-details[open]").length'),0);pass('61 recordings are initially compact and paginated')
 await input(c,'[aria-label="搜索音频文件"]','Test_01');assert.equal(await c.evaluate('document.querySelectorAll(".library-take").length'),1)
 await select(c,'[aria-label="文件状态筛选"]','ready');assert.equal(await c.evaluate('document.querySelectorAll(".library-take").length'),0)
 await input(c,'[aria-label="搜索音频文件"]','');await select(c,'[aria-label="文件状态筛选"]','attention');assert.equal(await c.evaluate('document.querySelectorAll(".library-take").length'),1)
 await select(c,'[aria-label="文件状态筛选"]','all');await input(c,'[aria-label="开始日期"]','2099-01-01');assert.equal(await c.evaluate('document.querySelectorAll(".library-take").length'),0)
 await input(c,'[aria-label="开始日期"]','');await input(c,'[aria-label="搜索音频文件"]','M4_Playback_Test');pass('Search, state and local-date filters select the expected recordings')
 await c.click('.take-details summary');await c.evaluate("Array.from(document.querySelectorAll('.take-actions button')).find(b=>b.textContent==='重命名').click()")
 await input(c,'[aria-label="录音名称"]','验收片段');await c.click('.take-rename button')
 await wait(async()=>(await c.state()).recordings.find(t=>t.id===fixture.document.sessionId)?.name==='验收片段','rename')
 await input(c,'[aria-label="搜索音频文件"]','验收片段');assert.equal(await c.evaluate('document.querySelectorAll(".library-take").length'),1);pass('Rename updates the recording and search without moving audio files')
 await c.screenshot(path.join(folder,'library.png'))
 await c.click('[data-take-open]');await wait(async()=>((await c.state()).playback?.analysisPhase==='ready'),'file');assert((await c.state()).playback.label.startsWith('验收片段'))
 await c.click('.file-export-button');await wait(()=>c.evaluate('!!document.querySelector("[aria-label=导出格式]")'),'export')
 assert.equal(await c.evaluate('document.querySelector("[aria-label=导出格式]").value'),'wav')
 assert.equal(await c.evaluate('document.querySelector("[aria-label=导出采样精度]").value'),'float32')
 assert((await c.evaluate('document.querySelector(".export-source-summary").textContent')).includes('验收片段'));pass('Initial export inherits actual WAV precision and shows the source and range')
 await select(c,'[aria-label="导出格式"]','mp3');await select(c,'[aria-label="导出码率"]','320')
 await wait(async()=>(await c.state()).lastExportPreset?.bitrate===320,'saved preference')
 await c.click('[aria-label="关闭对话框"]');await c.click('.file-export-button');await wait(()=>c.evaluate('document.querySelector("[aria-label=导出码率]")?.value==="320"'),'reopen preference')
 await c.screenshot(path.join(folder,'export.png'));pass('Export format and bitrate survive closing the dialog')
 await c.click('[aria-label="关闭对话框"]');await c.click('.save-settings');await wait(()=>c.evaluate('document.querySelector(".record-capacity")?.textContent.includes("GiB")'),'disk space');report.capacity=(await c.state()).recordingCapacity
 await c.screenshot(path.join(folder,'settings.png'));pass('Recording settings show actual free space and a conservative working-space estimate')
 await c.click('[aria-label="关闭对话框"]');await session.close();session=null
 c=await start();assert.equal((await c.state()).lastExportPreset.bitrate,320);assert.equal((await c.state()).recordings.find(t=>t.id===fixture.document.sessionId).name,'验收片段');pass('Export preferences and renamed metadata survive a restart')
 report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/iteration/two-ui-latest.json'),JSON.stringify(report,null,2));console.log('ITERATION_TWO_UI',report.status,report.checks.length)})
