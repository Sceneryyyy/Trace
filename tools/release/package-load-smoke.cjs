// Actual packaged Electron UI/runtime load and restart, without requiring an
// audio endpoint. This is deliberately separate from the hardware package smoke.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto')
const {launch,delay}=require('../m6/cdp.cjs'),config=require('../../electron-builder.trace.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/release/load-'+Date.now()),exe=path.join(root,config.directories.output,'win-unpacked/Trace.exe')
fs.mkdirSync(folder,{recursive:true})
const report={schemaVersion:1,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),status:'running',checks:[],scope:'Packaged UI/runtime only; no hardware recording or playback verification'}
let session
async function wait(fn){for(let i=0;i<300;i++){if(await fn())return;await delay(50)}throw Error('PACKAGED_STATE_TIMEOUT')}
async function main(){
 if(process.platform!=='win32')throw Error('WINDOWS_REQUIRED')
 session=await launch(exe,folder)
 const info=(await session.cdp.request('app.info')).data
 assert.equal(info.packaged,true);assert.equal(info.appVersion,config.extraMetadata.version)
 assert.equal(info.version,config.extraMetadata.version)
 for(const p of Object.values(info.nativeModules)){
  const resolved=p?.startsWith('\\\\?\\')?p.slice(4):p
  assert(resolved&&path.resolve(resolved).toLowerCase().startsWith(path.dirname(exe).toLowerCase()+path.sep))
 }
 report.checks.push('Package loads its own native runtime and current version')
 await session.cdp.request('view.theme',{theme:'ocean'})
 await wait(async()=>(await session.cdp.state()).instrumentTheme==='ocean')
 await session.close();session=null
 session=await launch(exe,folder)
 await wait(async()=>(await session.cdp.state()).instrumentTheme==='ocean')
 report.checks.push('Package restart restores saved theme')
 await session.close();session=null
 assert.equal(fs.readdirSync(path.join(folder,'takes')).length,0)
 report.checks.push('No REC means no recording files')
 const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
 report.exeSha256=sha(exe);report.asarSha256=sha(path.join(path.dirname(exe),'resources/app.asar'))
 report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);process.exitCode=1}).finally(async()=>{
 if(session)await session.close().catch(()=>{})
 fs.writeFileSync(path.join(root,'artifacts/release/package-load.json'),JSON.stringify(report,null,2))
 console.log('TRACE_PACKAGE_LOAD',report.status)
})
