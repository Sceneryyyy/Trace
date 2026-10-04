const {createHash}=require('node:crypto')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
function validateBuildLock(lock){
 if(lock.schemaVersion!==1||lock.platform!=='win32-x64'||!/^\d+\.\d+\.\d+$/.test(lock.version))throw Error('CODEC_BUILD_SCHEMA')
 if(!Array.isArray(lock.sources)||lock.sources.length!==2)throw Error('CODEC_SOURCE_SET')
 const [ff,lame]=lock.sources
 if(!/^[a-f0-9]{40}$/.test(ff.commit||'')||ff.release!==lock.version||ff.archiveUrl!=='https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/'+ff.commit)throw Error('CODEC_FFMPEG_ORIGIN')
 if(lame.name!=='LAME'||lame.archiveUrl!=='https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz'||lock.lame?.version!=='3.100')throw Error('CODEC_LAME_ORIGIN')
 for(const source of [...lock.sources,...(lock.buildTools||[])])if(!Number.isSafeInteger(source.archiveBytes)||source.archiveBytes<=0||!/^[a-f0-9]{64}$/.test(source.archiveSha256||'')||!/^[A-Za-z0-9._-]+$/.test(source.archiveFile||''))throw Error('CODEC_SOURCE_INTEGRITY')
 const flags=lock.configure
 if(!Array.isArray(flags)||!['--toolchain=msvc','--disable-autodetect','--disable-everything','--disable-network','--disable-shared','--enable-static','--enable-libmp3lame'].every(f=>flags.includes(f))||flags.filter(f=>f.startsWith('--enable-lib')).some(f=>f!=='--enable-libmp3lame'))throw Error('CODEC_FEATURE_BOUNDARY')
 if(lock.toolchain?.crtLinkage!=='static /MT'||!/^\d+\.\d+\.\d+$/.test(lock.toolchain.msvcToolsVersion||'')||!/^\d+\.\d+\.\d+$/.test(lock.toolchain.compilerVersion||'')||!/^10\.0\.\d+\.0$/.test(lock.toolchain.windowsSdkVersion||''))throw Error('CODEC_TOOLCHAIN_REQUIRED')
 if(!Number.isSafeInteger(lock.sourceDateEpoch)||lock.sourceDateEpoch<0)throw Error('CODEC_EPOCH_REQUIRED')
 return true
}
function validateBuildReport(codec,lock,lockBytes,report,{recipeHashes}={}){
 validateBuildLock(lock)
 if(report.schemaVersion!==1||report.buildLockSha256!==sha(lockBytes)||codec.buildLockSha256!==sha(lockBytes))throw Error('CODEC_BUILD_LOCK_CHANGED')
 if(!same(report.sources,lock.sources)||report.crtLinkage!==lock.toolchain.crtLinkage||report.sourceDateEpoch!==lock.sourceDateEpoch||!same(report.patches,[]))throw Error('CODEC_BUILD_INPUT_CHANGED')
 if(!recipeHashes||!same(report.recipes,recipeHashes)||!same(codec.recipeHashes,recipeHashes))throw Error('CODEC_RECIPE_CHANGED')
 if(!Array.isArray(lock.toolchain.tools)||!lock.toolchain.tools.length||!same(report.tools,lock.toolchain.tools))throw Error('CODEC_TOOL_HASH_CHANGED')
 if(!lock.toolchain.systemInputs||!same(report.systemInputs,lock.toolchain.systemInputs))throw Error('CODEC_SYSTEM_INPUT_CHANGED')
 for(const key of ['systemInventorySha256','configHeaderSha256','configMakSha256'])if(!/^[a-f0-9]{64}$/.test(report[key]||''))throw Error('CODEC_BUILD_ATTACHMENT_MISSING: '+key)
 for(const name of ['ffmpeg','ffprobe']){
  const output=report.outputs?.[name]
  if(!/^[a-f0-9]{64}$/.test(output?.sha256||'')||output.sha256!==codec[name+'Sha256']||!Number.isSafeInteger(output.bytes)||output.bytes<=0||!output.version?.includes('version '+codec.version))throw Error('CODEC_OUTPUT_CHANGED: '+name)
  if(!output.version.split('\n').includes(codec.configuration)||report.configuration!==codec.configuration)throw Error('CODEC_CONFIGURATION_CHANGED')
  if(typeof output.dependents!=='string')throw Error('CODEC_DLL_REPORT_REQUIRED')
  const dlls=[...output.dependents.matchAll(/^\s+(\S+\.dll)\s*$/gmi)].map(m=>m[1].toLowerCase())
  if(!dlls.length||dlls.some(d=>!lock.systemDlls?.includes(d)))throw Error('CODEC_UNEXPECTED_DLL: '+name)
 }
 return {correspondingSourceComplete:true,scope:'FFmpeg and LAME source plus unmodified build recipe; pinned Microsoft system/toolchain inputs are recorded separately'}
}
function validateSystemInventory(report,inventory){
 if(!same(Object.keys(report.systemInputs),Object.keys(inventory)))throw Error('CODEC_SYSTEM_INVENTORY_CHANGED')
 for(const [name,input]of Object.entries(inventory)){
  const files=input.inventory,expected=report.systemInputs[name]
  if(!Array.isArray(files)||files.length!==expected.files||files.reduce((n,f)=>n+f.bytes,0)!==expected.bytes||sha(JSON.stringify(files))!==expected.sha256)throw Error('CODEC_SYSTEM_INVENTORY_CHANGED: '+name)
 }
 return true
}
module.exports={sha,validateBuildLock,validateBuildReport,validateSystemInventory}
