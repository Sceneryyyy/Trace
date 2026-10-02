const releaseConfig=require('../../electron-builder.trace.cjs'),packageOutput=releaseConfig.directories.output,packageVersion=releaseConfig.extraMetadata.version
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),files=[]
function walk(relative){for(const d of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const p=relative+'/'+d.name;if(d.isDirectory())walk(p);else if(/\.(ts|tsx|css|html|cjs|mjs|cpp|h|md|txt|json|ps1|cmake)$/i.test(p)||d.name==='CMakeLists.txt')files.push(p)}}
for(const p of ['src/trace','native/src/recorder','native/recorder','tools','test','docs'])walk(p)
for(const p of ['Trace.ps1','README.md','AGENTS.md','CODEX-START.md','electron-builder.trace.cjs','electron-vite.trace.config.ts','package.json','package-lock.json','ffmpeg.lock.json','.gitignore'])files.push(p)
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
const report={createdAt:new Date().toISOString(),product:'Trace',version:packageVersion,upstream:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim(),worktreeStatus:spawnSync('git',['status','--short'],{cwd:root,encoding:'utf8',windowsHide:true}).stdout.trim().split('\n'),sources:Object.fromEntries(files.sort().map(p=>[p,sha(p)])),nativeSha256:sha('build/trace-engine/Release/trace_engine.node'),mainSha256:sha('out-trace/main/index.js'),asarSha256:sha(packageOutput+'/win-unpacked/resources/app.asar'),archive:JSON.parse(fs.readFileSync(path.join(root,'artifacts/m6/archive-latest.json'),'utf8'))}
if(report.archive.status!=='pass'||!report.archive.relocatedSmokeFolder)throw Error('Archive delivery incomplete')
fs.writeFileSync(path.join(root,'artifacts/m6/checkpoint.json'),JSON.stringify(report,null,2));console.log('M6_CHECKPOINT',files.length,report.nativeSha256,report.mainSha256)
const tasklist=spawnSync('C:/Windows/System32/tasklist.exe',['/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true}).stdout
console.log('TRACE_OR_ELECTRON_PROCESSES',tasklist.split('\n').filter(l=>/^"(Trace|electron)\.exe",/i.test(l)).join('\n')||'none')
