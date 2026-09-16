const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m5','close-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const env={...process.env,TRACE_M5_CLOSE_DIR:folder};delete env.ELECTRON_RUN_AS_NODE
function run(mode){const r=spawnSync(require('electron'),['tools/m5/close-app.cjs','--trace-test'],{env:{...env,TRACE_M5_CLOSE_MODE:mode},windowsHide:true,encoding:'utf8',timeout:60000});fs.writeFileSync(path.join(folder,mode+'.log'),(r.stdout||'')+(r.stderr||''));if(r.error||r.status!==0)throw r.error||Error(r.stderr)}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
try{
 run('seed');const takes=path.join(folder,'takes'),take=path.join(takes,fs.readdirSync(takes)[0]),doc=JSON.parse(fs.readFileSync(path.join(take,'session.json'),'utf8'))
 if(doc.status!=='ready'||!doc.exports?.length||BigInt(doc.frames)<=0n)throw Error('Close did not persist raw recording and pending output')
 const originals=doc.assets.filter(a=>a.role==='source').map(a=>({path:path.join(take,a.relativePath),hash:hash(path.join(take,a.relativePath))}))
 run('reopen')
 if(originals.some(f=>hash(f.path)!==f.hash))throw Error('Retry modified the original recording')
 const result={...JSON.parse(fs.readFileSync(path.join(folder,'result.json'),'utf8')),folder,checks:['Close during compressed REC finalizes source audio','Automatic output remains explicitly retryable after exit','Reopened retry produces the selected format without changing source']}
 fs.writeFileSync(path.join(root,'artifacts/m5/close-latest.json'),JSON.stringify(result,null,2));console.log('M5_CLOSE',result.status)
}catch(error){console.error(error);fs.writeFileSync(path.join(root,'artifacts/m5/close-latest.json'),JSON.stringify({status:'fail',folder,error:String(error)},null,2));process.exitCode=1}
