const {spawnSync}=require('child_process'),path=require('path'),fs=require('fs')
const root=path.resolve(__dirname,'../..'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.TRACE_INTERACTION_REOPEN;delete env.TRACE_INTERACTION_FOLDER
function run(extra={}){const r=spawnSync(require('electron'),['tools/feedback3/ui.cjs','--trace-test'],{cwd:root,env:{...env,...extra},windowsHide:true,stdio:'inherit',timeout:120000});if(r.error||r.status!==0)throw r.error||Error('UI process failed')}
run();const first=JSON.parse(fs.readFileSync(path.join(root,'artifacts/feedback3/ui-latest.json'),'utf8'));if(first.status!=='pass')throw Error(first.error)
run({TRACE_INTERACTION_REOPEN:'1',TRACE_INTERACTION_FOLDER:first.folder});const reopened=JSON.parse(fs.readFileSync(path.join(root,'artifacts/feedback3/reopen-latest.json'),'utf8'));if(reopened.status!=='pass')throw Error(reopened.error)
console.log('INTERACTION_REOPEN_PASS')
