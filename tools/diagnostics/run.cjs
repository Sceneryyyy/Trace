// SDK-only Windows packet diagnostics. This never loads the Trace or Prism addon.
const {spawnSync}=require('node:child_process')
const {mkdirSync,writeFileSync}=require('node:fs')
const path=require('node:path')
const root=path.resolve(__dirname,'../..')
const artifacts=path.join(root,'artifacts/diagnostics')
// Windows environment names are case-insensitive. MSBuild rejects duplicate
// Path/PATH entries, so normalize the child environment only.
const env=Object.fromEntries(new Map(Object.entries(process.env).map(([k,v])=>[k.toUpperCase(),v])))
function run(command,args){
  const result=spawnSync(command,args,{cwd:root,env,stdio:'inherit'})
  if(result.error)throw result.error
  if(result.status!==0)throw Error(`${path.basename(command)} exited ${result.status}`)
}
async function main(){
  const [action='list',...args]=process.argv.slice(2)
  if(process.platform!=='win32')throw Error('WASAPI diagnostics require Windows')
  if(action==='build'){
    if(args.length)throw Error('build accepts no extra arguments')
    run('cmake',['-S','tools/diagnostics','-B','build/trace-diagnostics','-G','Visual Studio 17 2022','-A','x64'])
    run('cmake',['--build','build/trace-diagnostics','--config','Release','--parallel','1'])
    return
  }
  if(!['list','raw'].includes(action))throw Error('Expected build, list, or raw')
  const result=spawnSync(path.join(root,'build/trace-diagnostics/Release/trace-capture-probe.exe'),[action,...args],
    {cwd:root,env,encoding:'utf8',maxBuffer:8*1024*1024,timeout:75000,windowsHide:true})
  if(result.error)throw result.error
  // Incomplete output cannot become evidence. Save a valid report even when
  // the device run fails, preserving the failure instead of marking it a pass.
  const report=JSON.parse(result.stdout)
  mkdirSync(artifacts,{recursive:true})
  const file=path.join(artifacts,`${action}.json`)
  writeFileSync(file,JSON.stringify(report,null,2)+'\n')
  if(result.status!==0)throw Error(`Diagnostic exited ${result.status}: ${result.stderr}`)
  if(action==='raw'){
    const {inspectRawReport}=await import('./probe-report.mjs')
    console.log(JSON.stringify(inspectRawReport(report),null,2))
  }else console.log(JSON.stringify(report,null,2))
  console.log(`Evidence: ${path.relative(root,file)}`)
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
