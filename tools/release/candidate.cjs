const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto'),yauzl=require('yauzl')
const {validateSecurityInventory}=require('./security-audit.cjs'),{prepareSources}=require('./dependency-sources.cjs')
const root=path.resolve(__dirname,'../..'),config=require('../../electron-builder.trace.cjs')
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function validateEvidence(commit,verification,load,audit){
 if(verification.commit!==commit||load.commit!==commit)throw Error('STALE_RELEASE_EVIDENCE')
 if(verification.sourceDirty!==false)throw Error('DIRTY_RELEASE_EVIDENCE')
 if(verification.status!=='pass'||load.status!=='pass'||audit.status!=='pass')throw Error('RELEASE_CHECK_FAILED')
 if(verification.platform!=='win32'||verification.arch!=='x64')throw Error('WINDOWS_VERIFICATION_REQUIRED')
 for(const command of ['build:trace-engine','check:security','typecheck','test:trace','build:trace','test:trace-native']){
  if(!verification.checks?.some(c=>c.command==='npm run '+command&&c.status==='pass'&&c.exitCode===0))throw Error('MISSING_RELEASE_CHECK: '+command)
 }
 if(!audit.files?.['Trace.exe']||!audit.files?.['resources/app.asar'])throw Error('INCOMPLETE_PACKAGE_AUDIT')
 if(load.exeSha256!==audit.files['Trace.exe'].sha256||load.asarSha256!==audit.files['resources/app.asar'].sha256)throw Error('STALE_PACKAGE_LOAD_PROOF')
}
function verifyZip(file,expected){
 return new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{
  if(error)return reject(error)
  const seen=new Set();let settled=false
  const fail=e=>{if(settled)return;settled=true;zip.close();reject(e)}
  zip.on('error',fail);zip.on('end',()=>{if(settled)return;if(seen.size!==Object.keys(expected).length)return fail(Error('ZIP_MISSING_FILES'));settled=true;resolve()})
  zip.on('entry',entry=>{
   const name=entry.fileName
   if(/\/$/.test(name)){zip.readEntry();return}
   if(seen.has(name)||!Object.hasOwn(expected,name)||entry.uncompressedSize!==expected[name].bytes)return fail(Error('ZIP_CONTENT_MISMATCH: '+name))
   if(((entry.externalFileAttributes>>>16)&0xf000)===0xa000)return fail(Error('ZIP_SYMLINK'))
   seen.add(name);zip.openReadStream(entry,(e,stream)=>{
    if(e)return fail(e)
    const hash=createHash('sha256');stream.on('data',chunk=>hash.update(chunk));stream.on('error',fail)
    stream.on('end',()=>{if(settled)return;if(hash.digest('hex')!==expected[name].sha256)return fail(Error('ZIP_HASH_MISMATCH: '+name));zip.readEntry()})
   })
  });zip.readEntry()
 }))
}
async function main(){
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim()
 if(git(['status','--porcelain']))throw Error('CLEAN_CHECKOUT_REQUIRED')
 const commit=git(['rev-parse','HEAD']),version=config.extraMetadata.version
 const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'))
 const verification=read('artifacts/release/verification.json'),load=read('artifacts/release/package-load.json'),audit=read('artifacts/m6/package-audit-latest.json')
 validateEvidence(commit,verification,load,audit)
 const security=read('docs/release/security-baseline.json')
 validateSecurityInventory(security,sha(path.join(root,'package-lock.json')))
 const securityAudit=read('artifacts/release/security-audit.json')
 if(securityAudit.commit!==commit||securityAudit.sourceDirty!==false||securityAudit.status!=='pass'||securityAudit.packageLockSha256!==security.packageLockSha256)throw Error('STALE_CURRENT_SECURITY_AUDIT')
 const codec=read('ffmpeg.lock.json'),dependencySource=await prepareSources({fetch:true,requireComplete:codec.build==='Trace source build'})
 const complete=dependencySource.correspondingSourceComplete
 const source=path.join(root,config.directories.output),zipName=`Trace-${version}-Windows-x64.zip`,zip=path.join(source,zipName)
 await verifyZip(zip,audit.files)
 const out=path.join(root,'dist-trace/candidate');fs.mkdirSync(out,{recursive:true})
 if(fs.readdirSync(out).length)throw Error('CANDIDATE_DIRECTORY_NOT_EMPTY')
 const copy=(from,name)=>fs.copyFileSync(from,path.join(out,name))
 copy(zip,zipName)
 const sourceName=`Trace-${version}-Source.zip`
 execFileSync('git',['archive','--format=zip',`--prefix=Trace-${version}/`,'--output='+path.join(out,sourceName),commit],{cwd:root})
 const guide=version.replace(/^\d+\.\d+\.\d+-/,'')
 copy(path.join(root,`output/pdf/LeoMoon-Trace-Quick-Start-${guide}-zh-CN.pdf`),`快速上手-${guide}.pdf`)
 copy(path.join(root,'docs/assets/quick-start-preview31/NotoSansSC-OFL.txt'),'PDF字体许可.txt')
 copy(path.join(root,'docs/release/security-baseline.json'),'security-baseline.json')
 copy(path.join(root,'artifacts/release/security-audit.json'),'security-audit.json')
 for(const archive of dependencySource.archives)copy(archive.path,archive.source.archiveFile)
 copy(dependencySource.manifestPath,'ffmpeg-source-manifest.json')
 copy(path.join(path.dirname(dependencySource.manifestPath),'README.md'),'FFmpeg源码说明.md')
 if(complete){
  for(const [from,name]of [[codec.buildLock,'ffmpeg-build-lock.json'],[codec.buildReport,'ffmpeg-build-report.json'],['.tools/ffmpeg/system-inputs.json','ffmpeg-system-inputs.json'],['.tools/ffmpeg/config.h','ffmpeg-config.h'],['.tools/ffmpeg/config.mak','ffmpeg-config.mak']])copy(path.join(root,from),name)
 }
 for(const [file,name]of [['verification.json','verification.json'],['package-load.json','package-load.json']])copy(path.join(root,'artifacts/release',file),name)
 copy(path.join(root,'docs/76-RELEASE-CHECKLIST.md'),'发布验收清单.md')
 const sourceNotice=complete?'自建 FFmpeg/LAME 的固定源码、构建脚本与实际构建清单已核验并附带；Microsoft 系统库/编译工具单列版本及输入哈希，后续组件安全、许可复核与实机发布验收继续单列。':'FFmpeg 静态依赖的精确来源与完整对应源码仍缺失。'
 fs.writeFileSync(path.join(out,'00-开始使用.txt'),`Trace ${version} · Windows x64 工程候选\n\n完整解压 ${zipName} 后运行 Trace.exe；PDF 为单独的快速上手。\n先停止录音并等待处理完成，再退出旧版并使用新目录；保留旧包与用户数据备份。\n\n本附件未签名，真实声卡/96 kHz、长测、完整 EBU Mode/实机计量与独立用户验收尚未完成。\nnpm 完整依赖安全门禁已通过；${sourceNotice}\n不作为正式发布或测量认证。具体范围见发布验收清单.md、manifest.json 与 security-baseline.json。\n项目与构建脚本在 ${sourceName}；另附已校验 FFmpeg/LAME 源码、来源清单和说明。\n校验以 SHA256SUMS.txt 为准。\n`)
 const manifest={schemaVersion:1,product:'Trace',version,commit,status:'engineering-candidate',platform:'win32-x64',signed:false,
  scope:'Automated engineering candidate; hardware, measurement, licensing and user acceptance gates remain open',
  electron:config.electronVersion,security:{checkedAt:security.checkedAt,counts:security.allDependencies,releaseReady:security.releaseReady},ffmpeg:read('ffmpeg.lock.json'),runtime:read(config.directories.output+'/win-unpacked/resources/licenses/runtime-provenance.json'),
  projectSource:sourceName,dependencySourceStatus:complete?'Verified Trace source build: FFmpeg + LAME and recipe; Microsoft system/toolchain inputs separately pinned':'FFmpeg upstream archive verified and attached; static dependency revisions, transitive inventory and producer build scripts unavailable',dependencySource:{manifest:'ffmpeg-source-manifest.json',upstreamArchive:dependencySource.manifest.upstream.archiveFile,upstreamArchiveSha256:dependencySource.manifest.upstream.archiveSha256,additionalUpstreamArchives:dependencySource.archives.slice(1).map(({source})=>({name:source.name,file:source.archiveFile,sha256:source.archiveSha256})),correspondingSourceComplete:complete,...(complete?{buildLock:'ffmpeg-build-lock.json',buildReport:'ffmpeg-build-report.json',systemInputs:'ffmpeg-system-inputs.json',scope:dependencySource.scope}:{})},
  pending:['Windows hardware/96 kHz/long recording/fault recovery','Complete EBU Mode and hardware measurement acceptance','Physical GPU and mixed DPI',complete?'Codec and Microsoft system-runtime advisory/security and license review':'FFmpeg static-dependency provenance/security and complete corresponding source','Authenticode signing and downloaded first run','Independent users and invite beta'],
  files:Object.fromEntries(fs.readdirSync(out).map(name=>[name,{bytes:fs.statSync(path.join(out,name)).size,sha256:sha(path.join(out,name))}]))}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2))
 fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),fs.readdirSync(out).map(name=>sha(path.join(out,name))+'  '+name).join('\n')+'\n')
 console.log('TRACE_CANDIDATE',version,commit,'engineering-candidate')
}
module.exports={validateEvidence,verifyZip}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1})
