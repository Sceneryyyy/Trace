// Preserve and verify the source that is actually available for the codec.
// The publisher's unreported static dependencies remain an explicit blocker.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto')
const https=require('node:https')
const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises')
const root=path.resolve(__dirname,'../..')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
function validateManifest(codec,manifest,{requireComplete=false}={}){
 if(![1,2].includes(manifest.schemaVersion))throw Error('SOURCE_MANIFEST_SCHEMA')
 for(const key of ['version','platform','ffmpegSha256','ffprobeSha256','configuration',...(manifest.schemaVersion===1?['archiveSha256']:[])]){
  if(manifest.binary?.[key]!==codec[key])throw Error('STALE_CODEC_SOURCE: '+key)
 }
 const upstream=manifest.upstream
 if(!/^[a-f0-9]{40}$/.test(upstream?.commit||'')||upstream.commit!==codec.upstreamCommit||upstream.release!==codec.version)throw Error('SOURCE_COMMIT_MISMATCH')
 if(upstream.archiveUrl!=='https://codeload.github.com/FFmpeg/FFmpeg/tar.gz/'+upstream.commit)throw Error('SOURCE_ORIGIN_MISMATCH')
 if(!Number.isSafeInteger(upstream.archiveBytes)||upstream.archiveBytes<=0||!/^[a-f0-9]{64}$/.test(upstream.archiveSha256||''))throw Error('SOURCE_INTEGRITY_MISSING')
 if(upstream.archiveFile!==`FFmpeg-${codec.version}-Upstream-Source.tar.gz`)throw Error('SOURCE_FILENAME_MISMATCH')
 for(const source of manifest.additionalUpstreams||[]){
  if(manifest.schemaVersion===1&&source.publisherVersion!==manifest.publisherVersionRecords?.[source.publisherRecordName])throw Error('DEPENDENCY_SOURCE_VERSION_MISMATCH')
  if(!/^https:\/\//.test(source.archiveUrl)||!Number.isSafeInteger(source.archiveBytes)||source.archiveBytes<=0||!/^[a-f0-9]{64}$/.test(source.archiveSha256||'')||!/^[A-Za-z0-9._-]+-Upstream-Source\.tar\.gz$/.test(source.archiveFile||''))throw Error('DEPENDENCY_SOURCE_INTEGRITY_MISSING')
 }
 if(manifest.schemaVersion===2){
  if(codec.build!=='Trace source build'||codec.buildLock!=='references/trace-ffmpeg/build-lock.json'||codec.buildReport!=='references/trace-ffmpeg/build-report.json'||manifest.correspondingSourceComplete!==true||!Array.isArray(manifest.missingProducerInputs)||manifest.missingProducerInputs.length)throw Error('UNVERIFIED_COMPLETE_SOURCE_CLAIM')
  const lockBytes=fs.readFileSync(path.join(root,codec.buildLock)),buildLock=JSON.parse(lockBytes),reportBytes=fs.readFileSync(path.join(root,codec.buildReport)),report=JSON.parse(reportBytes)
  if(sha(reportBytes)!==codec.buildReportSha256||manifest.buildReportSha256!==codec.buildReportSha256)throw Error('CODEC_BUILD_REPORT_CHANGED')
  const names=['tools/codec/build.cjs','tools/codec/identity.cjs','tools/release/dependency-sources.cjs']
  const recipeHashes=Object.fromEntries(names.map(name=>[name,sha(fs.readFileSync(path.join(root,name)))]))
  if(JSON.stringify([upstream,...(manifest.additionalUpstreams||[])])!==JSON.stringify(buildLock.sources))throw Error('CODEC_SOURCE_SET_CHANGED')
  const result=require('../codec/identity.cjs').validateBuildReport(codec,buildLock,lockBytes,report,{recipeHashes})
  return {upstreamVerified:true,...result,missingProducerInputs:[]}
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
async function downloadArchive(source,file,{request=https.get,timeoutMs=240000}={}){
 // Node 24's fetch/Undici parser can assert at socket EOF while a large
 // response is paused. Use native HTTP streams, preserving proxy and CA trust.
 const agent=new https.Agent({proxyEnv:process.env}),signal=AbortSignal.timeout(timeoutMs)
 const partial=file+'.partial-'+process.pid+'-'+Date.now()
 function responseFrom(address,redirects=0){
  return new Promise((resolve,reject)=>{
   const url=new URL(address)
   if(url.protocol!=='https:'||url.username||url.password)return reject(Error('SOURCE_DOWNLOAD_HTTPS_REQUIRED'))
   const req=request(url,{agent,signal,headers:{'accept-encoding':'identity','user-agent':'Trace-source-verification'}},response=>{
    if([301,302,303,307,308].includes(response.statusCode)){
     const location=response.headers.location;response.destroy()
     if(!location)return reject(Error('SOURCE_DOWNLOAD_REDIRECT_MISSING'))
     if(redirects>=5)return reject(Error('SOURCE_DOWNLOAD_REDIRECT_LIMIT'))
     try{resolve(responseFrom(new URL(location,url),redirects+1))}catch(error){reject(error)}
    }else if(response.statusCode!==200){
     response.destroy();reject(Error('SOURCE_DOWNLOAD_FAILED: '+response.statusCode))
    }else resolve(response)
   })
   req.once('error',reject)
  })
 }
 try{
  const response=await responseFrom(source.archiveUrl)
  let bytes=0
  const limit=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;callback(bytes>source.archiveBytes?Error('SOURCE_DOWNLOAD_TOO_LARGE'):null,chunk)}})
  await pipeline(response,limit,fs.createWriteStream(partial,{flags:'wx'}),{signal})
  await validateArchive(partial,source)
  fs.renameSync(partial,file)
 }catch(error){if(fs.existsSync(partial))fs.unlinkSync(partial);if(signal.aborted)throw Error('SOURCE_DOWNLOAD_TIMEOUT',{cause:error});throw error}
 finally{agent.destroy()}
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
  await downloadArchive(source,file)
 }
 if(fetch)await validateArchive(file,source)
 archives.push({source,path:file})
 }
 return {...result,manifest,manifestPath,archivePath:archives[0].path,archives,archiveVerified:fetch}
}
module.exports={validateManifest,validateArchive,downloadArchive,prepareSources}
if(require.main===module){
 const args=process.argv.slice(2)
 if(args.some(arg=>!['--fetch','--require-complete'].includes(arg))){console.error('Usage: dependency-sources.cjs [--fetch] [--require-complete]');process.exitCode=1}
 else prepareSources({fetch:args.includes('--fetch'),requireComplete:args.includes('--require-complete')}).then(result=>{
  console.log('TRACE_FFMPEG_SOURCE',result.manifest.upstream.commit,result.archiveVerified?'archive-verified':'inventory-verified',result.correspondingSourceComplete?'corresponding-source-verified':'static-dependencies-incomplete')
 }).catch(error=>{console.error(error.message);process.exitCode=1})
}
