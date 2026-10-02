const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process'),crypto=require('crypto')
const root=path.resolve(__dirname,'..'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;env.CSC_IDENTITY_AUTO_DISCOVERY='false';env.ELECTRON_BUILDER_CACHE=path.join(root,'.tools/electron-builder-cache')
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Trace packaging requires Windows x64')
if(require('electron/package.json').version!=='40.8.3'||require('electron-builder/package.json').version!=='26.8.1')throw Error('Packaging toolchain changed')
const runtime=require('./release/vc-runtime.cjs').discoverRuntime(env)
const stage=path.resolve(root,'.tools/trace-package-app'),stageParent=path.resolve(root,'.tools');if(!stage.startsWith(stageParent+path.sep)||path.basename(stage)!=='trace-package-app')throw Error('Invalid packaging stage');
if(fs.existsSync(stage)){if(fs.lstatSync(stage).isSymbolicLink())throw Error('Linked package stage');fs.rmSync(stage,{recursive:true,force:true})}
fs.mkdirSync(stage,{recursive:true});fs.cpSync(path.join(root,'out-trace'),path.join(stage,'out-trace'),{recursive:true,filter:source=>require('./trace-package-files.cjs')(path.relative(path.join(root,'out-trace'),source))});
fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:'trace',version:require('../electron-builder.trace.cjs').extraMetadata.version,description:'Trace 声迹 · Audio Recorder & Analyzer',main:'out-trace/main/index.js',author:'Trace contributors',license:'GPL-3.0-only',dependencies:{}},null,2));
const output=path.join(root,'resources/trace/runtime'),licenses=path.join(root,'resources/trace/licenses');fs.mkdirSync(output,{recursive:true});fs.mkdirSync(licenses,{recursive:true})
for(const name of fs.readdirSync(output))if(!runtime.names.includes(name)&&name.endsWith('.dll'))fs.unlinkSync(path.join(output,name))
for(const name of runtime.names)fs.copyFileSync(path.join(runtime.directory,name),path.join(output,name))
for(const [from,to]of [['LICENSE','Prism-GPL-3.0.txt'],['.tools/ffmpeg/LICENSE','FFmpeg-GPL.txt'],['.tools/ffmpeg/README.txt','FFmpeg-build.txt'],['native/vendor/libebur128/COPYING','libebur128-MIT.txt'],['native/vendor/libebur128/SOURCE.json','libebur128-source.json'],['native/vendor/libebur128/TRACE-PATCHES.md','libebur128-patches.md'],['node_modules/react/LICENSE','React-MIT.txt'],['node_modules/react-dom/LICENSE','ReactDOM-MIT.txt'],['node_modules/scheduler/LICENSE','ReactScheduler-MIT.txt'],['node_modules/@fontsource/inter/LICENSE','Inter-OFL.txt'],['node_modules/@fontsource/jetbrains-mono/LICENSE','JetBrainsMono-OFL.txt']])fs.copyFileSync(path.join(root,from),path.join(licenses,to))
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
fs.writeFileSync(path.join(licenses,'runtime-provenance.json'),JSON.stringify({electron:'40.8.3',electronBuilder:'26.8.1',vcRedist:runtime.version+' x64',dlls:Object.fromEntries(runtime.names.map(name=>[name,sha(path.join(output,name))]))},null,2))
function run(command,args){const r=spawnSync(command,args,{cwd:root,env,stdio:'inherit',windowsHide:true});if(r.error||r.status!==0)throw r.error||Error('Packaging step failed')}
run(require('electron'),['tools/m6/icon.cjs'])
run(process.execPath,['node_modules/electron-builder/cli.js','--config','electron-builder.trace.cjs','--win',...(process.argv.includes('--dir')?['--dir']:[]),'--publish','never'])
