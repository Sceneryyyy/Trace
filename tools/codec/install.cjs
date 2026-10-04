const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process')
const {sha,validateBuildReport,validateSystemInventory}=require('./identity.cjs')
const {prepareSources}=require('../release/dependency-sources.cjs')
const root=path.resolve(__dirname,'../..'),hash=file=>sha(fs.readFileSync(file))
async function install(){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('WINDOWS_X64_CODEC_REQUIRED')
 const codec=JSON.parse(fs.readFileSync(path.join(root,'ffmpeg.lock.json'),'utf8'))
 if(codec.build!=='Trace source build')throw Error('TRACE_SOURCE_CODEC_LOCK_REQUIRED')
 await prepareSources({fetch:true,requireComplete:true})
 const lockBytes=fs.readFileSync(path.join(root,codec.buildLock)),lock=JSON.parse(lockBytes)
 const recipeHashes=Object.fromEntries(Object.keys(codec.recipeHashes).map(file=>[file,hash(path.join(root,file))]))
 function verify(folder){
  const bytes=fs.readFileSync(path.join(folder,'build-report.json')),report=JSON.parse(bytes)
  if(sha(bytes)!==codec.buildReportSha256)throw Error('CODEC_BUILD_REPORT_CHANGED')
  validateBuildReport(codec,lock,lockBytes,report,{recipeHashes})
  for(const name of ['ffmpeg','ffprobe'])if(hash(path.join(folder,'bin',name+'.exe'))!==codec[name+'Sha256'])throw Error('CODEC_BINARY_HASH_CHANGED')
  for(const [name,key]of [['config.h','configHeaderSha256'],['config.mak','configMakSha256'],['system-inputs.json','systemInventorySha256']])if(hash(path.join(folder,name))!==report[key])throw Error('CODEC_ATTACHMENT_CHANGED: '+name)
  validateSystemInventory(report,JSON.parse(fs.readFileSync(path.join(folder,'system-inputs.json'),'utf8')))
  for(const [file,source]of [['LICENSE','COPYING.GPLv3'],['README.txt','README-build.txt']])if(hash(path.join(folder,file))!==hash(path.join(root,'references/trace-ffmpeg',source)))throw Error('CODEC_NOTICE_CHANGED')
 }
 const destination=path.join(root,'.tools/ffmpeg')
 if(fs.existsSync(path.join(destination,'build-report.json'))){verify(destination);console.log('FFMPEG_SOURCE_RUNTIME_ALREADY_VERIFIED');return}
 const staged=path.join(root,'.tools/trace-ffmpeg')
 if(!fs.existsSync(path.join(staged,'build-report.json')))execFileSync(process.execPath,[path.join(root,'tools/codec/build.cjs')],{cwd:root,stdio:'inherit'})
 verify(staged)
 const next=destination+'-staging-'+process.pid,previous=destination+'-previous-'+process.pid
 if(fs.existsSync(next)||fs.existsSync(previous))throw Error('CODEC_INSTALL_STAGING_EXISTS')
 fs.mkdirSync(path.join(next,'bin'),{recursive:true})
 try{
  for(const name of ['bin/ffmpeg.exe','bin/ffprobe.exe','LICENSE','README.txt','config.h','config.mak','system-inputs.json','build-report.json'])fs.copyFileSync(path.join(staged,name),path.join(next,name))
  verify(next)
  const hadPrevious=fs.existsSync(destination)
  if(hadPrevious)fs.renameSync(destination,previous)
  try{fs.renameSync(next,destination)}catch(error){if(hadPrevious)fs.renameSync(previous,destination);throw error}
  fs.rmSync(previous,{recursive:true,force:true})
 }finally{fs.rmSync(next,{recursive:true,force:true})}
 verify(destination);console.log('FFMPEG_SOURCE_RUNTIME_VERIFIED',codec.version,codec.ffmpegSha256,codec.ffprobeSha256)
}
module.exports={install}
if(require.main===module)install().catch(error=>{console.error(error);process.exitCode=1})
