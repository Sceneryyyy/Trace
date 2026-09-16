const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m10/no-webgl-'+Date.now()),takes=path.join(folder,'takes'),userData=path.join(folder,'user-data');fs.mkdirSync(takes,{recursive:true});fs.mkdirSync(userData)
const fixture=require('../m4/fixture.cjs')(takes);fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false}));let session;const report={folder,status:'running',checks:[]}
async function wait(fn,label){for(const t=Date.now();Date.now()-t<30000;){if(await fn())return;await delay(25)}throw Error('Timeout '+label)}
async function main(){
 process.env.TRACE_TEST_NO_WEBGL='1'
 session=await launch(process.env.TRACE_PACKAGE_EXE||require('electron'),folder,{userData,recordDirectory:takes,args:['--disable-3d-apis','--disable-webgl','--disable-webgl2',...(process.env.TRACE_PACKAGE_EXE?[]:[path.join(root,'out-trace/main/index.js')])]});const c=session.cdp
 await wait(async()=>Boolean((await c.state()).spectrogramSettings?.surface),'state')
 assert(await c.evaluate('document.createElement("canvas").getContext("webgl2")===null'),'test process must disable WebGL')
 await c.evaluate('window.__sp=null;window.trace.onSpectrogram(p=>window.__sp=p);true')
 await c.evaluate("(()=>{const e=document.querySelector('[aria-label=工作台布局]');e.value='time-frequency';e.dispatchEvent(new Event('change',{bubbles:true}))})()")
 await c.request('file.open',{takeId:fixture.document.sessionId,role:'source'});await wait(()=>c.evaluate('window.__sp?.phase==="ready"'),'2D')
 await c.evaluate('([...document.querySelectorAll("[aria-label=声谱图维度] button")].find(b=>b.textContent==="3D").click())')
 await wait(()=>c.evaluate('document.querySelector(".spectrogram-instrument")?.dataset.surfaceMode==="2d"&&document.querySelector(".surface-failure")?.textContent.includes("已显示 2D")'),'fallback')
 assert.equal((await c.state()).playback.takeId,fixture.document.sessionId);assert.equal((await c.state()).spectrogramSettings.surface.mode,'3d')
 report.checks.push('Unavailable WebGL visibly falls back to 2D without replacing the selected file','The desired view is preserved while the active fallback is explicit');report.status='pass'
}
main().catch(e=>{report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m10/no-webgl-latest.json'),JSON.stringify(report,null,2));console.log('M10_NO_WEBGL',report.status)})
