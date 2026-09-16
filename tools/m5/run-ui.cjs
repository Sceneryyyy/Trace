const fs=require('fs'),{spawnSync}=require('child_process');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const begin=Date.now(),r=spawnSync(require('electron'),['tools/m5/ui-export.cjs','--trace-test'],{env,windowsHide:true,encoding:'utf8',timeout:180000})
fs.mkdirSync('artifacts/m5',{recursive:true});fs.writeFileSync('artifacts/m5/ui-console.log',(r.stdout||'')+(r.stderr||''))
if(r.error||r.status!==0){console.log(r.stdout,r.stderr);throw r.error||Error('M5 UI exited '+r.status)}
const p='artifacts/m5/ui-latest.json',result=JSON.parse(fs.readFileSync(p,'utf8'));if(result.status!=='pass'||fs.statSync(p).mtimeMs<begin){console.log(r.stdout,r.stderr);throw Error(result.error||'Stale UI report')}console.log('M5_UI_PASS',result.checks.length)
