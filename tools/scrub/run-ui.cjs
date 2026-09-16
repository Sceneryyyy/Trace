
const {spawnSync}=require('child_process'),path=require('path'),fs=require('fs'),root=path.resolve(__dirname,'../..'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
if(process.argv.includes('--baseline'))env.TRACE_SCRUB_BASELINE='1';else delete env.TRACE_SCRUB_BASELINE;
const r=spawnSync(require('electron'),['tools/scrub/ui.cjs','--trace-test'],{cwd:root,env,windowsHide:true,stdio:'inherit',timeout:120000});
if(r.error||r.status!==0)throw r.error||Error('Scrub UI failed');
const report=JSON.parse(fs.readFileSync(path.join(root,'artifacts/scrub',env.TRACE_SCRUB_BASELINE?'baseline-latest.json':'ui-latest.json'),'utf8'));if(!['pass','baseline'].includes(report.status))throw Error(report.error);
