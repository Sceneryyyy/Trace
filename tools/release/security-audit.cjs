// Run the registry audit for the exact locked graph, including build/runtime
// packages declared as devDependencies. No production-only shortcut.
const fs=require('node:fs'),path=require('node:path'),{spawnSync,execFileSync}=require('node:child_process'),{createHash}=require('node:crypto')
const root=path.resolve(__dirname,'../..'),sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function validateSecurityInventory(security,lockSha){
 if(security.packageLockSha256!==lockSha)throw Error('STALE_SECURITY_INVENTORY')
 for(const kind of ['allDependencies','npmProductionDependencies']){
  for(const key of ['info','low','moderate','high','critical','total']){
   if(security[kind]?.[key]!==0)throw Error('DEPENDENCY_ADVISORY_GATE_FAILED: '+kind+'.'+key)
  }
 }
 for(const command of ['npm audit --json','npm audit --omit=dev --json']){
  if(!security.auditCommands?.some(item=>item.command===command&&item.exitCode===0&&/^[a-f0-9]{64}$/.test(item.reportSha256||'')))throw Error('MISSING_SECURITY_AUDIT: '+command)
 }
}
function main(){
 const folder=path.join(root,'artifacts/release');fs.mkdirSync(folder,{recursive:true})
 const lockSha=sha(path.join(root,'package-lock.json'))
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'docs/release/security-baseline.json'),'utf8'))
 validateSecurityInventory(baseline,lockSha)
 const report={schemaVersion:1,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceDirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),packageLockSha256:lockSha,status:'running',scope:'Current npm advisory gate for full locked dependencies; not physical-device, FFmpeg static-dependency or release approval',checks:[]}
 try{
  for(const args of [['audit','--json'],['audit','--omit=dev','--json']]){
   const command='npm '+args.join(' '),name=args.includes('--omit=dev')?'npm-audit-production.json':'npm-audit-all.json'
   const npm=process.platform==='win32'?['cmd.exe',['/d','/s','/c',command]]:['npm',args]
   const r=spawnSync(npm[0],npm[1],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,timeout:180000,windowsHide:true})
   fs.writeFileSync(path.join(folder,name),r.stdout||'')
   const audit=JSON.parse(r.stdout||'{}'),counts=audit.metadata?.vulnerabilities
   report.checks.push({command,exitCode:r.status,counts,reportSha256:sha(path.join(folder,name))})
   if(r.error||r.status!==0||!counts||['info','low','moderate','high','critical','total'].some(key=>counts[key]!==0))throw Error('CURRENT_NPM_AUDIT_FAILED: '+command)
  }
  report.status='pass'
 }catch(error){report.status='fail';report.error=error.message;process.exitCode=1}
 finally{fs.writeFileSync(path.join(folder,'security-audit.json'),JSON.stringify(report,null,2)+'\n');console.log('TRACE_NPM_SECURITY',report.status,lockSha)}
}
module.exports={validateSecurityInventory}
if(require.main===module){try{main()}catch(error){console.error(error.message);process.exitCode=1}}
