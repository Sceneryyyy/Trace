// Windows source build. Nothing is fetched by configure or linked from MSYS2.
const fs=require('node:fs'),path=require('node:path'),{execFileSync,spawnSync}=require('node:child_process'),{createHash}=require('node:crypto')
const {downloadArchive,validateArchive}=require('../release/dependency-sources.cjs')
const root=path.resolve(__dirname,'../..'),lockPath=path.join(root,'references/trace-ffmpeg/build-lock.json')
const lock=JSON.parse(fs.readFileSync(lockPath,'utf8')),work='C:\\trace-codec'
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const run=(program,args,options={})=>execFileSync(program,args,{cwd:work,stdio:'inherit',...options})
const capture=(program,args,options={})=>execFileSync(program,args,{cwd:work,encoding:'utf8',...options}).trim()
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'"
async function main(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('WINDOWS_X64_BUILD_REQUIRED')
 const cache=path.join(root,'.tools/ffmpeg-source');fs.mkdirSync(cache,{recursive:true})
 for(const source of [...lock.sources,...lock.buildTools]){const file=path.join(cache,source.archiveFile);if(!fs.existsSync(file))await downloadArchive(source,file);await validateArchive(file,source)}
 fs.mkdirSync(work,{recursive:true})
 if(!process.argv.includes('--worker')){
  const vcvars='C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise\\VC\\Auxiliary\\Build\\vcvarsall.bat'
  const batch=path.join(work,'build.cmd')
  fs.writeFileSync(batch,`@echo off\r\ncall "${vcvars}" x64 ${lock.toolchain.windowsSdkVersion} -vcvars_ver=${lock.toolchain.msvcToolsVersion}\r\nif errorlevel 1 exit /b %errorlevel%\r\n"${process.execPath}" "${__filename}" --worker\r\nexit /b %errorlevel%\r\n`)
  run('cmd.exe',['/d','/c',batch]);return
 }
 process.env.VSLANG='1033';process.env.SOURCE_DATE_EPOCH=String(lock.sourceDateEpoch)
 const bin=path.join(process.env.VCToolsInstallDir,'bin/Hostx64/x64')
 const bash='C:\\msys64\\usr\\bin\\bash.exe',tooling=path.join(work,'tooling')
 fs.mkdirSync(tooling,{recursive:true})
 for(const tool of lock.buildTools)run('tar.exe',['-xf',path.join(cache,tool.archiveFile),'-C',tooling])
 const make=path.join(tooling,'usr/bin/make.exe')
 // MSYS link.exe must never shadow Microsoft's linker.
 process.env.PATH=bin+';'+path.dirname(make)+';C:\\msys64\\usr\\bin;'+process.env.PATH
 const cl=spawnSync(path.join(bin,'cl.exe'),[],{encoding:'utf8'}),compiler=(cl.stdout||'')+(cl.stderr||'')
 if(cl.error)throw cl.error
 if(!compiler.includes(lock.toolchain.compilerVersion))throw Error('MSVC_COMPILER_VERSION_MISMATCH: '+compiler)
 if(process.env.VCToolsVersion?.replace(/\\$/,'')!==lock.toolchain.msvcToolsVersion||process.env.WindowsSDKVersion?.replace(/\\$/,'')!==lock.toolchain.windowsSdkVersion)throw Error('MSVC_SDK_VERSION_MISMATCH')
 const tools=[bash,make,...['cl.exe','link.exe','lib.exe','nmake.exe','dumpbin.exe'].map(n=>path.join(bin,n))].map(file=>({file:file.replaceAll('\\','/'),sha256:hash(file)}))
 const versions={compiler:compiler.trim(),bash:capture(bash,['--version']).split('\n')[0],make:capture(make,['--version']).split('\n')[0]}
 console.log('TRACE_CODEC_TOOLCHAIN',JSON.stringify({tools,versions,msvc:process.env.VCToolsVersion,sdk:process.env.WindowsSDKVersion}))
 for(const folder of ['source','prefix'])fs.rmSync(path.join(work,folder),{recursive:true,force:true})
 fs.mkdirSync(path.join(work,'source'),{recursive:true})
 for(const source of lock.sources)run('tar.exe',['-xf',path.join(cache,source.archiveFile),'-C',path.join(work,'source')])
 const lame=path.join(work,'source/lame-3.100'),ff=path.join(work,'source/FFmpeg-'+lock.sources[0].commit)
 const macros=Object.entries(lock.lame.macros).map(([key,value])=>key+'='+value)
 run(path.join(bin,'nmake.exe'),['/nologo','/f','Makefile.MSVC',...macros,'config.h'],{cwd:lame})
 run(path.join(bin,'nmake.exe'),['/nologo','/f','Makefile.MSVC',...macros,lock.lame.target],{cwd:lame})
 fs.mkdirSync(path.join(work,'prefix/include/lame'),{recursive:true});fs.mkdirSync(path.join(work,'prefix/lib'),{recursive:true})
 fs.copyFileSync(path.join(lame,'include/lame.h'),path.join(work,'prefix/include/lame/lame.h'))
 fs.copyFileSync(path.join(lame,'output/libmp3lame-static.lib'),path.join(work,'prefix/lib/mp3lame.lib'))
 const script='set -euo pipefail\ncd /c/trace-codec/source/FFmpeg-'+lock.sources[0].commit+'\n./configure '+lock.configure.map(quote).join(' ')+'\nmake -j4\nmake install\n'
 fs.writeFileSync(path.join(work,'compile.sh'),script)
 run(bash,['--noprofile','--norc','/c/trace-codec/compile.sh'])
 const folder=path.join(root,'.tools/trace-ffmpeg');fs.mkdirSync(path.join(folder,'bin'),{recursive:true})
 const outputs={}
 for(const name of ['ffmpeg','ffprobe']){
  const file=path.join(work,'prefix/bin',name+'.exe'),version=capture(file,['-version'])
  outputs[name]={sha256:hash(file),bytes:fs.statSync(file).size,version,dependents:capture(path.join(bin,'dumpbin.exe'),['/dependents',file])}
  fs.copyFileSync(file,path.join(folder,'bin',name+'.exe'))
 }
 fs.copyFileSync(path.join(ff,'COPYING.GPLv3'),path.join(folder,'LICENSE'))
 fs.writeFileSync(path.join(folder,'README.txt'),'Trace FFmpeg '+lock.version+' source build; FFmpeg + LAME only.\nSee references/trace-ffmpeg/build-lock.json and tools/codec/build.cjs.\n')
 const report={schemaVersion:1,buildLockSha256:hash(lockPath),sources:lock.sources,tools,versions,outputs,configuration:outputs.ffmpeg.version.split('\n').find(s=>s.startsWith('configuration:')),patches:[],crtLinkage:lock.toolchain.crtLinkage,sourceDateEpoch:lock.sourceDateEpoch}
 fs.copyFileSync(path.join(ff,'config.h'),path.join(folder,'config.h'));fs.copyFileSync(path.join(ff,'ffbuild/config.mak'),path.join(folder,'config.mak'))
 fs.writeFileSync(path.join(folder,'build-report.json'),JSON.stringify(report,null,2)+'\n')
 console.log('TRACE_CODEC_BUILD_REPORT',JSON.stringify(report))
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
