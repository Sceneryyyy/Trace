const {spawnSync}=require('child_process');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const r=spawnSync(require('electron'),['tools/workbench/ui.cjs','--trace-test'],{env,cwd:require('path').resolve(__dirname,'../..'),windowsHide:true,stdio:'inherit',timeout:180000});if(r.error||r.status!==0)throw r.error||Error('UI process failed');
const report=require('../../artifacts/workbench/ui-latest.json');if(report.status!=='pass')throw Error(report.error);
