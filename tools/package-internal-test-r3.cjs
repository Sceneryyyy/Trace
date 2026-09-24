// Assemble a documentation revision around an immutable, previously verified desktop package.
// r3: program rebuilt from committed preview.30 fixes; see docs/69-INTERNAL-TEST-R3.md.
// quick-start PDF and manual unchanged from preview.28.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{spawnSync}=require('child_process')
const asar=require('@electron/asar'),seven=require('7zip-bin').path7za
const root=path.resolve(__dirname,'..'),version='0.1.0-preview.30',revision='InternalTest-r3'
const id='Trace-preview.30-'+revision,archiveName='LeoMoon-'+id+'-Windows-x64.zip'
const source=path.join(root,'dist-trace/preview.30/win-unpacked'),work=path.join(root,'artifacts/internal-distribution-'+Date.now())
const stage=path.join(work,'stage',id),unpacked=path.join(work,'解压验证'),delivered=path.join(root,'dist-trace/internal-test',archiveName)
const report={status:'running',version,revision,checks:[],folder:work}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
function inside(parent,file){const rel=path.relative(parent,file);assert(rel&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel),'Path outside root');return rel.replaceAll('\\','/')}
function files(directory){const result=[];function visit(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){assert(!e.isSymbolicLink(),'Linked package entry');const f=path.join(p,e.name);if(e.isDirectory())visit(f);else{assert(e.isFile());result.push(inside(directory,f))}}}visit(directory);return result.sort()}
function run(name,exe,args,options={}){
 console.log('START',name);const r=spawnSync(exe,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,...options})
 fs.writeFileSync(path.join(work,name+'.log'),(r.stdout||'')+(r.stderr||''))
 assert(!r.error&&r.status===0,name+': '+(r.error||'')+(r.stdout||'').slice(-900)+(r.stderr||'').slice(-900));report.checks.push(name);console.log('PASS',name)
}
function verify(directory,manifest){
 assert.deepEqual(files(directory),Object.keys(manifest).concat('SHA256SUMS.txt').sort())
 for(const [f,v]of Object.entries(manifest)){const p=path.join(directory,f);assert.equal(fs.statSync(p).size,v.bytes,f);assert.equal(sha(p),v.sha256,f)}
}
try{
 assert(!fs.existsSync(delivered),'A delivered revision is immutable; choose a new revision instead of overwriting it')
 assert(!fs.lstatSync(source).isSymbolicLink());fs.mkdirSync(stage,{recursive:true})
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'artifacts/m6/package-audit-latest.json'),'utf8'))
 assert.equal(baseline.status,'pass')
 const sourceFiles=files(source)
 for(const f of Object.keys(baseline.files))assert(sourceFiles.includes(f),'Missing verified runtime file: '+f)
 report.skippedSourceEntries=sourceFiles.filter(f=>!Object.hasOwn(baseline.files,f))
 const before=JSON.parse(asar.extractFile(path.join(source,'resources/app.asar'),'package.json'))
 assert.equal(before.version,version);assert.equal(before.name,'trace')
 for(const [f,v]of Object.entries(baseline.files)){
  const src=path.resolve(source,f),dst=path.resolve(stage,f);inside(source,src);inside(stage,dst)
  assert.equal(sha(src),v.sha256,'Baseline changed: '+f)
  fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst,fs.constants.COPYFILE_EXCL)
 }
 report.checks.push('unchanged-verified-runtime')
 fs.copyFileSync(path.join(root,'docs/28-USER-GUIDE.md'),path.join(stage,'README-Trace.md'))
 const pdf=path.join(root,'output/pdf/LeoMoon-Trace-Quick-Start-preview.28-zh-CN.pdf')
 fs.copyFileSync(pdf,path.join(stage,'01-快速上手.pdf'),fs.constants.COPYFILE_EXCL)
 const docRoot=path.join(root,'docs/distribution/internal-test')
 for(const name of fs.readdirSync(docRoot).sort()){
  assert(/^0[0-5]-.+\.txt$/.test(name));const text=fs.readFileSync(path.join(docRoot,name),'utf8').replace(/^﻿/,'').replace(/\r?\n/g,'\r\n')
  fs.writeFileSync(path.join(stage,name),'﻿'+text,{flag:'wx'})
 }
 const meta={schemaVersion:1,product:'Trace',series:'LeoMoon',version,distributionRevision:revision,platform:'Windows x64',createdAt:new Date().toISOString(),
  runtimeSourceRevision:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim(),
  runtimeWorkingTree:'clean committed source; exact runtime fingerprint is runtimeAsarSha256 below',
  manualSourceRevision:spawnSync('git',['rev-parse','75ce8d0'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim(),
  packagingScriptSha256:sha(__filename),runtimeAsarSha256:sha(path.join(stage,'resources/app.asar')),nativeSha256:sha(path.join(stage,'resources/native/trace_engine.node')),
  quickStartSha256:sha(pdf),feedbackEmail:'472841772@qq.com',signature:'Unsigned',scope:'Coworker internal testing; independent clean Windows and hardware matrices remain unverified'}
 assert(/^[a-f0-9]{40}$/.test(meta.runtimeSourceRevision)&&/^[a-f0-9]{40}$/.test(meta.manualSourceRevision))
 fs.writeFileSync(path.join(stage,'BUILD-INFO.json'),JSON.stringify(meta,null,2),{flag:'wx'})
 const entries=files(stage)
 assert(entries.every(f=>!/(^|\/)(\.git|\.tools|node_modules|artifacts|user-data|users|takes|recordings|GPUCache)(\/|$)/i.test(f)))
 assert(entries.every(f=>! /\.(wav|mp3|m4a|aac|log|env|pdb|dmp)$/i.test(f)))
 assert(!entries.some(f=>f.endsWith('trace-settings.json')))
 const packaged=asar.listPackage(path.join(stage,'resources/app.asar')).map(f=>f.replaceAll('\\','/'))
 assert(packaged.every(p=>p==='/package.json'||p==='/out-trace'||p.startsWith('/out-trace/')&&require('./trace-package-files.cjs')(p.slice('/out-trace/'.length))))
 const personal=['C:/Users/v_yuqixing','C:\\Users\\v_yuqixing','V_YUQI~1','WorkBuddy\\TraceDev','WorkBuddy/TraceDev']
 for(const f of entries.filter(f=>/^0\d-.*\.txt$/.test(f)||['README-Trace.md','BUILD-INFO.json'].includes(f))){const text=fs.readFileSync(path.join(stage,f),'utf8');for(const value of personal)assert(!text.toLowerCase().includes(value.toLowerCase()),'Personal path in '+f)}
 const manifest=Object.fromEntries(entries.map(f=>[f,{bytes:fs.statSync(path.join(stage,f)).size,sha256:sha(path.join(stage,f))}]))
 fs.writeFileSync(path.join(stage,'SHA256SUMS.txt'),entries.map(f=>manifest[f].sha256+'  '+f).join('\r\n')+'\r\n',{flag:'wx'})
 report.checks.push('docs-manual-licenses-and-no-personal-data');report.files=manifest
 const zipped=path.join(work,archiveName)
 run('zip-create',seven,['a','-tzip','-mx=5',zipped,id],{cwd:path.dirname(stage)})
 run('zip-integrity',seven,['t',zipped])
 run('zip-extract',seven,['x',zipped,'-o'+unpacked,'-y'])
 const extracted=path.join(unpacked,id);verify(extracted,manifest)
 assert.equal(sha(path.join(extracted,'01-快速上手.pdf')),sha(pdf))
 assert.equal(sha(path.join(extracted,'SHA256SUMS.txt')),sha(path.join(stage,'SHA256SUMS.txt')))
 report.checks.push('all-extracted-file-hashes')
 const env={...process.env,TRACE_PACKAGE_EXE:path.join(extracted,'Trace.exe'),TRACE_PACKAGE_VERSION:version};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS
 run('relocated-record-encode-reopen',process.execPath,['tools/m6/package-smoke.cjs'],{env})
 run('single-instance',process.execPath,['tools/public-beta/single-instance.cjs'],{env:{...env,TRACE_SECOND_EXE:path.join(stage,'Trace.exe')}})
 verify(extracted,manifest);report.checks.push('runtime-files-unchanged-after-use')
 fs.mkdirSync(path.dirname(delivered),{recursive:true});fs.copyFileSync(zipped,delivered,fs.constants.COPYFILE_EXCL)
 const hash=sha(delivered);assert.equal(hash,sha(zipped))
 fs.writeFileSync(delivered+'.sha256',hash+'  '+path.basename(delivered)+'\r\n',{flag:'wx'})
 report.archive={path:inside(root,delivered),bytes:fs.statSync(delivered).size,sha256:hash,files:entries.length+1,topLevelFolder:id}
 report.baseRuntimeFiles=Object.keys(baseline.files).length;report.excluded=['personal settings','recordings','diagnostic logs','test fixtures','developer tools']
 report.status='pass'
}catch(e){report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}
fs.mkdirSync(work,{recursive:true});fs.writeFileSync(path.join(work,'report.json'),JSON.stringify(report,null,2));console.log('INTERNAL_DISTRIBUTION',report.status,report.archive||work)
