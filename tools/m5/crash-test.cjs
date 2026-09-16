const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{spawn,spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m5','crash-'+Date.now()),takes=path.join(folder,'takes');fs.mkdirSync(takes,{recursive:true})
const fixture=require('../m4/fixture.cjs')(takes),env={...process.env,TRACE_M5_CRASH_DIR:folder};delete env.ELECTRON_RUN_AS_NODE
const delay=ms=>new Promise(r=>setTimeout(r,ms)),alive=pid=>{try{process.kill(pid,0);return true}catch{return false}}
async function main(){
 const child=spawn(require('electron'),['tools/m5/crash-app.cjs','--trace-test'],{env:{...env,TRACE_M5_CRASH_MODE:'seed'},windowsHide:true,stdio:['ignore','pipe','pipe']})
 child.stdout.on('data',b=>fs.appendFileSync(path.join(folder,'seed.log'),b));child.stderr.on('data',b=>fs.appendFileSync(path.join(folder,'seed.log'),b))
 const ready=path.join(folder,'seed-ready.json')
 for(const start=Date.now();!fs.existsSync(ready)&&Date.now()-start<30000;){if(child.exitCode!==null)throw Error('Seed exited');await delay(20)}
 if(!fs.existsSync(ready)){child.kill();throw Error('Seed timeout')}
 const seed=JSON.parse(fs.readFileSync(ready,'utf8'));assert(alive(seed.runnerPid)&&alive(seed.encoderPid))
 const stopped=new Promise(r=>child.once('close',r));child.kill('SIGKILL');await stopped
 for(const start=Date.now();(alive(seed.runnerPid)||alive(seed.encoderPid))&&Date.now()-start<5000;)await delay(20)
 assert(!alive(seed.runnerPid)&&!alive(seed.encoderPid),'Media children survived the main-process termination')
 const r=spawnSync(require('electron'),['tools/m5/crash-app.cjs','--trace-test'],{env:{...env,TRACE_M5_CRASH_MODE:'reopen'},windowsHide:true,encoding:'utf8',timeout:60000})
 fs.writeFileSync(path.join(folder,'reopen.log'),(r.stdout||'')+(r.stderr||''));if(r.error||r.status!==0)throw r.error||Error(r.stderr)
 for(const asset of fixture.document.assets)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(fixture.folder,asset.relativePath))).digest('hex'),asset.hash)
 assert(!fs.readdirSync(fixture.folder).some(n=>n.startsWith('.media-')))
 const result={...JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8')),folder,checks:['Hard-killed main process ends media supervisor and encoder','Interrupted export remains retryable after reopen','Retry removes only owned orphan work and preserves source bytes']}
 fs.writeFileSync(path.join(root,'artifacts/m5/crash-latest.json'),JSON.stringify(result,null,2));console.log('M5_CRASH',result.status)
}
main().catch(error=>{console.error(error);fs.writeFileSync(path.join(root,'artifacts/m5/crash-latest.json'),JSON.stringify({status:'fail',folder,error:String(error)},null,2));process.exitCode=1})
