const releaseConfig=require('../../electron-builder.trace.cjs'),packageOutput=releaseConfig.directories.output,packageVersion=releaseConfig.extraMetadata.version
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{launch,delay}=require('./cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m6','package-'+Date.now()),executable=process.env.TRACE_PACKAGE_EXE||path.join(root,packageOutput+'/win-unpacked/Trace.exe')
fs.mkdirSync(folder,{recursive:true});const report={status:'running',folder,checks:[]};let session
async function wait(fn,label){const start=Date.now();while(Date.now()-start<30000){const v=await fn();if(v)return v;await delay(20)}throw Error('Timeout '+label)}
async function main(){
 session=await launch(executable,folder);const {cdp}=session
 await wait(async()=>(await cdp.state()).active,'packaged LIVE')
 const info=(await cdp.request('app.info')).data;report.info=info
 assert.equal(info.packaged,true);assert.equal(info.appVersion,process.env.TRACE_PACKAGE_VERSION||packageVersion)
 for(const p of Object.values(info.nativeModules)){const resolved=p?.startsWith(String.fromCharCode(92,92,63,92))?p.slice(4):p;assert(resolved&&resolved.toLowerCase().startsWith(path.dirname(executable).toLowerCase()),'Native runtime resolved outside package: '+p)}
 report.checks.push('Packaged Trace and its bundled native runtime load from an empty working directory')
 await cdp.evaluate("window.__package=null;window.trace.onSnapshot(s=>window.__package=s);true")
 await delay(400);assert.equal(fs.readdirSync(path.join(folder,'takes')).length,0)
 report.checks.push('Offline LIVE creates no audio files')
 await cdp.request('view.settings',{targetEnabled:true,targetLufs:-18,waveGain:4})
 await cdp.key('KeyR','r',82);await wait(async()=>(await cdp.state()).currentRecord,'R record')
 await delay(700);await cdp.key('Escape','Escape',27);await wait(async()=>!(await cdp.state()).currentRecord,'Escape stop')
 const wave=await wait(async()=>(await cdp.state()).recordings.find(t=>t.status==='ready'),'WAV ready')
 report.checks.push('R/Escape record and finalize actual WAV audio in the package')
 await cdp.request('record.configure',{format:'mp3',sampleRate:48000,bitrate:192,namePrefix:'Packaged',keepOriginal:false})
 await cdp.click('[aria-label="设置与帮助"]');await cdp.click('[data-section="recording"]');await wait(()=>cdp.evaluate('!!document.querySelector("[aria-label=录音格式]")'),'record settings')
 for(const format of ['aac','wav','mp3']){
  await cdp.evaluate("(()=>{const e=document.querySelector('[aria-label=录音格式]');e.value="+JSON.stringify(format)+";e.dispatchEvent(new Event('change',{bubbles:true}))})()")
  await wait(()=>cdp.evaluate("document.querySelector('[aria-label=录音格式]').value==="+JSON.stringify(format)),'format '+format)
  assert.equal(await cdp.evaluate("document.querySelector('[aria-label=\"保留原始 WAV\"]').checked"),false,'Format switch lost retention choice')
 }
 await cdp.screenshot(path.join(folder,'record-settings.png'));await cdp.click('.trace-modal .primary-button');await wait(()=>cdp.evaluate('!document.querySelector("[role=dialog]")'),'settings applied')
 report.checks.push('WAV/MP3/AAC format switching preserves the explicit original-file retention choice')
 await cdp.request('record.start');await delay(800);await cdp.request('record.stop')
 const compressed=await wait(async()=>{const list=(await cdp.state()).recordings;const t=list.find(t=>t.id!==wave.id&&t.preferredExportId);return t?.retention?.phase==='removed'?t:null},'verified source cleanup')
 assert(!compressed.roles.includes('source'));report.checks.push('Packaged encoder, decoder and analysis verify the output before requested original cleanup')
 await cdp.request('file.open',{takeId:compressed.id,role:'export',exportId:compressed.preferredExportId})
 const file=await wait(async()=>{const s=(await cdp.state()).playback;return s?.phase==='paused'?s:null},'MP3 file')
 await wait(()=>cdp.evaluate('window.__package?.sourceId==='+JSON.stringify(file.id)+'&&window.__package.fileView.analysisPhase==='+JSON.stringify('ready')),'MP3 history')
 const position=(BigInt(file.totalFrames)/2n).toString();await cdp.request('playback.seek',{playbackId:file.id,positionFrame:position,resume:false})
 await wait(()=>cdp.evaluate('window.__package?.positionFrame==='+JSON.stringify(position)),'MP3 seek')
 await cdp.request('playback.play',{playbackId:file.id});await delay(150);await cdp.request('playback.pause',{playbackId:file.id})
 report.checks.push('The packaged application reopens compressed output with its own file history')
 const exported=(await cdp.request('export.start',{takeId:compressed.id,role:'export',exportId:compressed.preferredExportId,range:{startFrame:'0',endFrame:position},preset:{format:'aac',container:'adts',sampleRate:44100,bitrate:128}})).data
 const aac=await wait(async()=>{const e=(await cdp.state()).exportJobs.find(e=>e.id===exported.jobId);if(e?.phase==='failed')throw Error(e.error);return e?.phase==='ready'?e:null},'packaged ADTS export')
 await cdp.request('file.open',{takeId:compressed.id,role:'export',exportId:aac.id})
 await wait(async()=>{const f=(await cdp.state()).playback;return f?.exportId===aac.id&&f.phase==='paused'},'packaged ADTS open')
 const currentFile=(await cdp.state()).playback
 await wait(()=>cdp.evaluate('window.__package?.sourceId==='+JSON.stringify(currentFile.id)+'&&window.__package.fileView?.analysisPhase==="ready"'),'ADTS own history ready')
 await delay(80);await cdp.screenshot(path.join(folder,'packaged-adts.png'))
 report.checks.push('Packaged media-runner supports compressed selection export and ADTS logical playback')
 await session.close();session=null
 const preferences=JSON.parse(fs.readFileSync(path.join(folder,'user-data','trace-settings.json'),'utf8'));assert.equal(preferences.displaySettings.targetLufs,-18)
 session=await launch(executable,folder);await wait(async()=>(await session.cdp.state()).active,'fresh restart')
 const reopened=await session.cdp.state();assert.equal(reopened.displaySettings.targetLufs,-18);assert(reopened.recordings.some(t=>t.id===compressed.id&&t.preferredExportId))
 await session.cdp.request('file.open',{takeId:compressed.id,role:'export',exportId:aac.id})
 await wait(async()=>{const f=(await session.cdp.state()).playback;return f?.exportId===aac.id&&f.phase==='paused'},'reopened ADTS')
 report.checks.push('Offline restart restores settings, recordings, exports and decoded timelines')
 await session.close();session=null
 report.exeSha256=crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex');report.status='pass'
}
main().catch(async error=>{report.status='fail';report.error=String(error);report.stack=error.stack;console.error(error);if(session){report.state=await session.cdp.state().catch(()=>null);await session.cdp.screenshot(path.join(folder,'failure.png')).catch(()=>{})}process.exitCode=1}).finally(async()=>{
 if(session)await session.close().catch(error=>console.error(error))
 fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m6/package-latest.json'),JSON.stringify(report,null,2));console.log('M6_PACKAGE',report.status,report.checks.length)
})
