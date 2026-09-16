const {spawnSync}=require('child_process'),path=require('path'),fs=require('fs')
const root=path.resolve(__dirname,'../..'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const r=spawnSync(require('electron'),['tools/feedback/ui.cjs','--trace-test'],{cwd:root,env,windowsHide:true,stdio:'inherit',timeout:240000});if(r.error||r.status!==0)throw r.error||Error('UI process failed')
const report=JSON.parse(fs.readFileSync(path.join(root,'artifacts/feedback/ui-latest.json'),'utf8'));if(report.status!=='pass')throw Error(report.error)
