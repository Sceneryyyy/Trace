const fs=require('fs'),{spawnSync}=require('child_process');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const started=Date.now(),r=spawnSync(require('electron'),['tools/m4/ui-playback.cjs','--trace-test'],{env,windowsHide:true,encoding:'utf8',timeout:180000});
fs.mkdirSync('artifacts/m4',{recursive:true});fs.writeFileSync('artifacts/m4/ui-console.log',(r.stdout||'')+(r.stderr||''));process.stdout.write((r.stdout||'')+(r.stderr||''));
if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);
const file='artifacts/m4/ui-latest.json',d=JSON.parse(fs.readFileSync(file,'utf8'));if(fs.statSync(file).mtimeMs<started||d.status!=='pass')throw Error(d.error||'Stale/failed M4 report');
