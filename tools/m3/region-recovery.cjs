const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2-regions','recovery-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const env={...process.env,TRACE_REGION_RECOVERY_CASE:folder};delete env.ELECTRON_RUN_AS_NODE
const delay=ms=>new Promise(r=>setTimeout(r,ms))
function start(mode){return spawn(require('electron'),['tools/m3/region-recovery-app.cjs','--trace-test'],{cwd:root,env:{...env,TRACE_REGION_RECOVERY_MODE:mode},windowsHide:true,stdio:['ignore','pipe','pipe']})}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
async function main(){
 const seed=start('seed');let stderr='';seed.stderr.on('data',b=>{stderr+=b;fs.appendFileSync(path.join(folder,'seed-stderr.log'),b)});seed.stdout.on('data',b=>fs.appendFileSync(path.join(folder,'seed-stdout.log'),b))
 const ready=path.join(folder,'seed-ready.json')
 for(let i=0;i<600&&!fs.existsSync(ready);i++){if(seed.exitCode!==null)throw Error('Seed exited '+stderr);await delay(50)}
 if(!fs.existsSync(ready)){seed.kill();throw Error('Seed timeout: '+stderr)}
 const closed=new Promise(r=>seed.once('close',r));seed.kill('SIGKILL');await closed
 const takeRoot=path.join(folder,'takes'),takeDirectory=path.join(takeRoot,fs.readdirSync(takeRoot)[0]),audio=path.join(takeDirectory,'audio')
 const originals=fs.readdirSync(audio).filter(n=>n.endsWith('.wav')).map(name=>({name,hash:hash(path.join(audio,name))}))
 const child=start('recover');let errors='';child.stderr.on('data',b=>{errors+=b;fs.appendFileSync(path.join(folder,'recover-stderr.log'),b)});child.stdout.on('data',b=>fs.appendFileSync(path.join(folder,'recover-stdout.log'),b))
 const code=await new Promise(r=>child.once('close',r)),resultFile=path.join(folder,'result.json')
 if(code!==0||!fs.existsSync(resultFile))throw Error(errors+' '+(fs.existsSync(path.join(folder,'error.json'))?fs.readFileSync(path.join(folder,'error.json'),'utf8'):'No result'))
 for(const file of originals)if(hash(path.join(audio,file.name))!==file.hash)throw Error('Original source changed')
 const document=JSON.parse(fs.readFileSync(path.join(takeDirectory,'session.json'),'utf8'))
 if(document.regions.length!==2||document.assets.filter(a=>a.role==='recovered').length<2)throw Error('Missing recovered region')
 const result={...JSON.parse(fs.readFileSync(resultFile,'utf8')),folder,kind:'real-WASAPI-two-regions-with-injected-reset-and-process-termination',originalHashesUnchanged:true,regions:document.regions,assets:document.assets}
 fs.writeFileSync(path.join(root,'artifacts/m2-regions/recovery-latest.json'),JSON.stringify(result,null,2));console.log('MULTI_REGION_RECOVERY_PASS',result.take.frames,result.take.regionCount)
}
main().catch(error=>{console.error(error);process.exitCode=1})
