const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m2','recovery-'+Date.now())
fs.mkdirSync(folder,{recursive:true})
const env={...process.env,TRACE_RECOVERY_CASE:folder};delete env.ELECTRON_RUN_AS_NODE
const delay=ms=>new Promise(r=>setTimeout(r,ms))
function start(mode){return spawn(require('electron'),['tools/m2/recovery-app.cjs','--trace-test'],{cwd:root,env:{...env,TRACE_RECOVERY_MODE:mode},windowsHide:true,stdio:['ignore','pipe','pipe']})}
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
async function main(){
 const seed=start('seed');let errors=''
 seed.stderr.on('data',x=>{errors+=x})
 const ready=path.join(folder,'seed-ready.json')
 for(let i=0;i<300&&!fs.existsSync(ready);i++){if(seed.exitCode!==null)throw Error('Seed exited: '+errors);await delay(50)}
 if(!fs.existsSync(ready)){seed.kill();throw Error('Seed timeout')}
 const closed=new Promise(r=>seed.once('close',r))
 seed.kill('SIGKILL');await closed;await delay(300)
 const takes=path.join(folder,'takes'),takeDir=path.join(takes,fs.readdirSync(takes)[0]),audio=path.join(takeDir,'audio')
 const originals=fs.readdirSync(audio).filter(n=>n.endsWith('.wav')).map(n=>({name:n,hash:hash(path.join(audio,n))}))
 const child=start('recover');let stderr=''
 child.stderr.on('data',x=>{stderr+=x})
 const exit=await new Promise(r=>child.once('close',r))
 const reportPath=path.join(folder,'recovery-ui.json')
 if(exit||!fs.existsSync(reportPath))throw Error(stderr+' '+(fs.existsSync(path.join(folder,'recovery-error.json'))?fs.readFileSync(path.join(folder,'recovery-error.json'),'utf8'):'No report'))
 for(const file of originals)if(hash(path.join(audio,file.name))!==file.hash)throw Error('Original audio changed')
 const result={...JSON.parse(fs.readFileSync(reportPath,'utf8')),originalHashesUnchanged:true,folder}
 fs.writeFileSync(path.join(root,'artifacts/m2/recovery-latest.json'),JSON.stringify(result,null,2))
 console.log(JSON.stringify(result,null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1})
