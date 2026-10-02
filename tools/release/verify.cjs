// Run commands rather than accepting handwritten PASS records.
const fs=require('node:fs'),path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/release')
fs.mkdirSync(folder,{recursive:true})
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()
const sourceDirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim())
const report={schemaVersion:1,commit,sourceDirty,platform:process.platform,arch:process.arch,status:'running',checks:[],scope:'Engineering checks; no real device, official EBU WAV, signing or user acceptance'}
const scripts=['typecheck','test:trace','build:trace']
if(process.platform==='win32'){scripts.unshift('build:trace-engine');scripts.push('test:capture-support','test:lufsmeter-native','test:trace-native')}
try{
 for(const script of scripts){
  const npm=process.platform==='win32'?['cmd.exe',['/d','/s','/c','npm run '+script]]:['npm',['run',script]]
  const result=spawnSync(npm[0],npm[1],{cwd:root,stdio:'inherit',env:{...process.env,TRACE_REQUIRE_NATIVE:'1'},windowsHide:true})
  report.checks.push({command:'npm run '+script,exitCode:result.status,status:!result.error&&result.status===0?'pass':'fail'})
  if(result.error||result.status!==0)throw result.error||Error('Failed: '+script)
 }
 report.status='pass'
}catch(error){report.status='fail';report.error=String(error);process.exitCode=1}
finally{fs.writeFileSync(path.join(folder,'verification.json'),JSON.stringify(report,null,2))}
