// Preserve and verify the source that is actually available for the codec.
// The publisher's unreported static dependencies remain an explicit blocker.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
const {Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises')
const root=path.resolve(__dirname,'../..')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
function validateManifest(codec,manifest,{requireComplete=false}={}){
 if(manifest.schemaVersion!==1)throw Error('SOURCE_MANIFEST_SCHEMA')
 for(const key of ['version','platform','archiveSha256','ffmpegSha256','ffprobeSha256','configuration']){
  if(manifest.binary?.[key]!==codec[key])throw Error('STALE_CODEC_SOURCE: '+key)
 }
 const upstream=manifest.upstream
 if(!/^[a-f0-9]{40}$/.test(upstream?.commit||'')||upstream.commit!==codec.upstreamCommit||upstream.release!==codec.version)throw Error('SOURCE_COMMIT_MISMATCH')
 if(upstream.archiveUrl!=='https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/'+upstream.commit)throw Error('SOURCE_ORIGIN_MISMATCH')
 if(!Number.isSafeInteger(upstream.archiveBytes)||upstream.archiveBytes<=0||!/^[a-f0-9]{64}$/.test(upstream.archiveSha256||''))throw Error('SOURCE_INTEGRITY_MISSING')
 if(upstream.archiveFile!==`FFmpeg-${codec.version}-Upstream-Source.tar.gz`)throw Error('SOURCE_FILENAME_MISMATCH')
 for(const source of manifest.additionalUpstreams||[]){
  if(source.publisherVersion!==manifest.publisherVersionRecords?.[source.publisherRecordName])throw Error('DEPENDENCY_SOURCE_VERSION_MISMATCH')
  if(!/^https:\/\//.test(source.archiveUrl)||!Number.isSafeInteger(source.archiveBytes)||source.archiveBytes<=0||!/^[a-f0-9]{64}$/.test(source.archiveSha256||'')||!/^[A-Za-z0-9._-]+-Upstream-Source\.tar\.gz$/.test(source.archiveFile||''))throw Error('DEPENDENCY_SOURCE_INTEGRITY_MISSING')
 }
 // This tool verifies the upstream archive only. Claiming correspondence for
 // the static binary requires a separate verified dependency/build bundle.
 if(manifest.correspondingSourceComplete!==false)throw Error('UNVERIFIED_COMPLETE_SOURCE_CLAIM')
 if(!Array.isArray(manifest.missingProducerInputs)||!manifest.missingProducerInputs.length)throw Error('SOURCE_BLOCKER_MISSING')
 if(requireComplete)throw Error('DEPENDENCY_SOURCE_INCOMPLETE: '+manifest.missingProducerInputs.join('; '))
 return {upstreamVerified:true,correspondingSourceComplete:false,missingProducerInputs:manifest.missingProducerInputs}
}
async function validateArchive(file,upstream){
 const st=fs.lstatSync(file)
 if(!st.isFile()||st.size!==upstream.archiveBytes)throw Error('SOURCE_ARCHIVE_SIZE_MISMATCH')
 const hash=createHash('sha256')
 for await(const chunk of fs.createReadStream(file))hash.update(chunk)
 if(hash.digest('hex')!==upstream.archiveSha256)throw Error('SOURCE_ARCHIVE_HASH_MISMATCH')
}
async function prepareSources({fetch=false,requireComplete=false}={}){
 const codec=JSON.parse(fs.readFileSync(path.join(root,'ffmpeg.lock.json'),'utf8'))
 const manifestPath=path.join(root,codec.correspondingSourceManifest)
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'))
 const result=validateManifest(codec,manifest,{requireComplete})
 for(const [name,identity]of Object.entries(manifest.documents)){
  if(path.basename(name)!==name)throw Error('SOURCE_DOCUMENT_PATH')
  const bytes=fs.readFileSync(path.join(path.dirname(manifestPath),name))
  if(bytes.length!==identity.bytes||sha(bytes)!==identity.sha256)throw Error('SOURCE_DOCUMENT_CHANGED: '+name)
 }
 const folder=path.join(root,'.tools/ffmpeg-source'),archives=[]
 for(const source of [manifest.upstream,...(manifest.additionalUpstreams||[])]){
 const file=path.join(folder,source.archiveFile)
 if(fetch&&!fs.existsSync(file)){
  fs.mkdirSync(folder,{recursive:true})
  const response=await globalThis.fetch(source.archiveUrl,{signal:AbortSignal.timeout(240000)})
  if(!response.ok||!response.body)throw Error('SOURCE_DOWNLOAD_FAILED: '+response.status)
  const partial=file+'.partial-'+process.pid+'-'+Date.now()
  let bytes=0
  const limit=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;callback(bytes>source.archiveBytes?Error('SOURCE_DOWNLOAD_TOO_LARGE'):null,chunk)}})
  try{
   await pipeline(Readable.fromWeb(response.body),limit,fs.createWriteStream(partial,{flags:'wx'}))
   await validateArchive(partial,source)
   fs.renameSync(partial,file)
  }catch(error){if(fs.existsSync(partial))fs.unlinkSync(partial);throw error}
 }
 if(fetch)await validateArchive(file,source)
 archives.push({source,path:file})
 }
 return {...result,manifest,manifestPath,archivePath:archives[0].path,archives,archiveVerified:fetch}
}
module.exports={validateManifest,validateArchive,prepareSources}
if(require.main===module){
 const args=process.argv.slice(2)
 if(args.some(arg=>!['--fetch','--require-complete'].includes(arg))){console.error('Usage: dependency-sources.cjs [--fetch] [--require-complete]');process.exitCode=1}
 else prepareSources({fetch:args.includes('--fetch'),requireComplete:args.includes('--require-complete')}).then(result=>{
  console.log('TRACE_FFMPEG_SOURCE',result.manifest.upstream.commit,result.archiveVerified?'archive-verified':'inventory-verified','static-dependencies-incomplete')
 }).catch(error=>{console.error(error.message);process.exitCode=1})
}
