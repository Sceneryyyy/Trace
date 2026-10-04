import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,rmSync} from 'node:fs'
import {createServer,get as httpGet} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {validateEvidence,verifyZip}=createRequire(import.meta.url)('../tools/release/candidate.cjs')
const {portableOutcome,expectedFromEnvironment}=createRequire(import.meta.url)('../tools/release/wait-portable-ci.cjs')
const {validateSecurityInventory}=createRequire(import.meta.url)('../tools/release/security-audit.cjs')
const {validateManifest,validateArchive,downloadArchive}=createRequire(import.meta.url)('../tools/release/dependency-sources.cjs')
const verification={commit:'abc',sourceDirty:false,status:'pass',platform:'win32',arch:'x64',checks:['build:trace-engine','check:security','typecheck','test:trace','build:trace','test:trace-native'].map(c=>({command:'npm run '+c,status:'pass',exitCode:0}))}
const load={commit:'abc',status:'pass',exeSha256:'exe',asarSha256:'asar'},audit={status:'pass',files:{'Trace.exe':{sha256:'exe'},'resources/app.asar':{sha256:'asar'}}}
test('release evidence must match the exact commit and require real Windows native checks',()=>{
 validateEvidence('abc',verification,load,audit)
 assert.throws(()=>validateEvidence('new',verification,load,audit),/STALE_RELEASE_EVIDENCE/)
 assert.throws(()=>validateEvidence('abc',{...verification,sourceDirty:true},load,audit),/DIRTY_RELEASE_EVIDENCE/)
 assert.throws(()=>validateEvidence('abc',{...verification,platform:'linux'},load,audit),/WINDOWS_VERIFICATION_REQUIRED/)
 assert.throws(()=>validateEvidence('abc',{...verification,checks:verification.checks.slice(0,-1)},load,audit),/MISSING_RELEASE_CHECK/)
 assert.throws(()=>validateEvidence('abc',verification,{...load,status:'fail'},audit),/RELEASE_CHECK_FAILED/)
 assert.throws(()=>validateEvidence('abc',verification,{...load,exeSha256:'old'},audit),/STALE_PACKAGE_LOAD_PROOF/)
})
test('parallel Windows candidate packing waits for portable success in the same run, SHA and attempt',()=>{
 const expected={runId:123,headSha:'a'.repeat(40),attempt:1}
 const run={id:123,head_sha:expected.headSha,run_attempt:1,status:'in_progress',conclusion:null}
 const job={id:456,run_id:123,head_sha:expected.headSha,run_attempt:1,name:'portable',status:'queued',conclusion:null}
 const jobs=value=>({total_count:1,jobs:[value]})
 assert.equal(portableOutcome(run,jobs(job),expected).status,'pending')
 assert.equal(portableOutcome(run,jobs({...job,status:'in_progress'}),expected).status,'pending')
 const done={...job,status:'completed',conclusion:'success'}
 assert.deepEqual(portableOutcome(run,jobs(done),expected),{status:'pass',jobId:456,conclusion:'success'})
 assert.equal(portableOutcome(run,jobs({...done,name:'candidate / portable'}),expected).status,'pass')
 for(const conclusion of ['failure','cancelled','skipped','timed_out',null])assert.throws(()=>portableOutcome(run,jobs({...done,conclusion}),expected),/PORTABLE_CI_FAILED/)
 assert.throws(()=>portableOutcome({...run,id:124},jobs(done),expected),/RUN_MISMATCH/)
 assert.throws(()=>portableOutcome({...run,head_sha:'b'.repeat(40)},jobs(done),expected),/HEAD_MISMATCH/)
 assert.throws(()=>portableOutcome({...run,run_attempt:2},jobs(done),expected),/ATTEMPT_MISMATCH/)
 for(const patch of [{run_id:124},{head_sha:'b'.repeat(40)},{run_attempt:2}])assert.throws(()=>portableOutcome(run,jobs({...done,...patch}),expected),/JOB_IDENTITY_MISMATCH/)
 assert.throws(()=>portableOutcome(run,{total_count:0,jobs:[]},expected),/METADATA_MISSING/)
 assert.throws(()=>portableOutcome(run,{total_count:2,jobs:[done]},expected),/METADATA_MISSING/)
 assert.throws(()=>portableOutcome(run,jobs({...done,id:undefined}),expected),/METADATA_MISSING/)
 assert.throws(()=>portableOutcome({...run,status:'completed',conclusion:'failure'},jobs(done),expected),/RUN_FAILED/)
})
test('portable CI gate requires actual GitHub run metadata and a read token',()=>{
 const env={GITHUB_RUN_ID:'123',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'Sceneryyyy/Trace',GITHUB_TOKEN:'unit-test-placeholder'}
 assert.equal(expectedFromEnvironment(env).runId,123)
 for(const key of ['GITHUB_RUN_ID','GITHUB_SHA','GITHUB_RUN_ATTEMPT','GITHUB_REPOSITORY','GITHUB_TOKEN'])assert.throws(()=>expectedFromEnvironment({...env,[key]:undefined}))
 assert.throws(()=>expectedFromEnvironment({...env,GITHUB_RUN_ID:'123.5'}))
 assert.throws(()=>expectedFromEnvironment({...env,GITHUB_API_URL:'https://different.invalid'}),/UNSUPPORTED_GITHUB_API/)
})
test('a current full dependency audit is required; production-only or stale zero counts cannot authorize a candidate',()=>{
 const baseline=JSON.parse(readFileSync(new URL('../docs/release/security-baseline.json',import.meta.url),'utf8'))
 const lockSha=baseline.packageLockSha256
 validateSecurityInventory(baseline,lockSha)
 assert.throws(()=>validateSecurityInventory(baseline,'0'.repeat(64)),/STALE_SECURITY_INVENTORY/)
 assert.throws(()=>validateSecurityInventory({...baseline,allDependencies:{...baseline.allDependencies,high:1,total:1}},lockSha),/DEPENDENCY_ADVISORY_GATE_FAILED/)
 assert.throws(()=>validateSecurityInventory({...baseline,allDependencies:undefined},lockSha),/DEPENDENCY_ADVISORY_GATE_FAILED/)
 assert.throws(()=>validateSecurityInventory({...baseline,auditCommands:baseline.auditCommands.filter(c=>c.command.includes('--omit=dev'))},lockSha),/MISSING_SECURITY_AUDIT/)
})
test('upstream FFmpeg source must match the actual codec and cannot masquerade as complete static corresponding source',()=>{
 const codec=JSON.parse(readFileSync(new URL('../ffmpeg.lock.json',import.meta.url),'utf8'))
 const manifest=JSON.parse(readFileSync(new URL('../'+codec.correspondingSourceManifest,import.meta.url),'utf8'))
 assert.equal(validateManifest(codec,manifest).correspondingSourceComplete,false)
 assert.throws(()=>validateManifest(codec,manifest,{requireComplete:true}),/DEPENDENCY_SOURCE_INCOMPLETE/)
 assert.throws(()=>validateManifest({...codec,ffmpegSha256:'0'.repeat(64)},manifest),/STALE_CODEC_SOURCE/)
 assert.throws(()=>validateManifest(codec,{...manifest,correspondingSourceComplete:true}),/UNVERIFIED_COMPLETE_SOURCE_CLAIM/)
 assert.throws(()=>validateManifest(codec,{...manifest,missingProducerInputs:[]}),/SOURCE_BLOCKER_MISSING/)
 assert.throws(()=>validateManifest(codec,{...manifest,upstream:{...manifest.upstream,archiveUrl:'https://different.invalid/source.tar.gz'}}),/SOURCE_ORIGIN_MISMATCH/)
 const changedDependency=structuredClone(manifest);changedDependency.additionalUpstreams[0].publisherVersion='unreported';assert.throws(()=>validateManifest(codec,changedDependency),/DEPENDENCY_SOURCE_VERSION_MISMATCH/)
 const escapedArchive=structuredClone(manifest);escapedArchive.additionalUpstreams[0].archiveFile='../escape.tar.gz';assert.throws(()=>validateManifest(codec,escapedArchive),/DEPENDENCY_SOURCE_INTEGRITY_MISSING/)
})
test('source archives reject truncation and changed contents even when a cache already exists',async()=>{
 const file=join(mkdtempSync(join(tmpdir(),'trace-source-')),'source.tar.gz'),bytes=Buffer.from('fixture-original-source')
 const identity={archiveBytes:bytes.length,archiveSha256:createHash('sha256').update(bytes).digest('hex')}
 writeFileSync(file,bytes);await validateArchive(file,identity)
 const corrupted=Buffer.from(bytes);corrupted[0]^=1;writeFileSync(file,corrupted)
 await assert.rejects(validateArchive(file,identity),/SOURCE_ARCHIVE_HASH_MISMATCH/)
 writeFileSync(file,bytes.subarray(1));await assert.rejects(validateArchive(file,identity),/SOURCE_ARCHIVE_SIZE_MISMATCH/)
})
async function downloadFixture(t,handler){
 const server=createServer(handler)
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const folder=mkdtempSync(join(tmpdir(),'trace-source-download-'))
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(folder,{recursive:true,force:true})})
 // Exercise the real native HTTP parser on loopback only. Production always
 // uses HTTPS and its environmental proxy/CA agent; no TLS bypass is shipped.
 const request=(url,options,callback)=>httpGet(new URL(url.href.replace(/^https:/,'http:')),{...options,agent:false},callback)
 return {folder,file:join(folder,'source.tar.gz'),url:`https://127.0.0.1:${server.address().port}`,request}
}
const sourceIdentity=(bytes,archiveUrl)=>({archiveUrl,archiveBytes:bytes.length,archiveSha256:createHash('sha256').update(bytes).digest('hex')})
test('native source download handles redirect and chunked socket EOF with exact streamed integrity',async t=>{
 const bytes=Buffer.alloc(512*1024,123)
 const fixture=await downloadFixture(t,(req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{location:'/archive'});res.end();return}
  res.writeHead(200,{'connection':'close'});res.write(bytes.subarray(0,100));res.end(bytes.subarray(100))
 })
 await downloadArchive(sourceIdentity(bytes,fixture.url+'/redirect'),fixture.file,{request:fixture.request})
 assert.deepEqual(readFileSync(fixture.file),bytes)
 assert.deepEqual(readdirSync(fixture.folder),['source.tar.gz'])
})
test('failed streamed source download removes partial bytes and never publishes an invalid archive',async t=>{
 const bytes=Buffer.from('expected-archive')
 const fixture=await downloadFixture(t,(req,res)=>{
  if(req.url==='/status'){res.writeHead(503);res.end();return}
  res.writeHead(200,{'connection':'close'})
  res.end(req.url==='/large'?Buffer.concat([bytes,bytes]):req.url==='/short'?bytes.subarray(1):Buffer.alloc(bytes.length))
 })
 for(const [route,error] of [['large',/SOURCE_DOWNLOAD_TOO_LARGE/],['short',/SOURCE_ARCHIVE_SIZE_MISMATCH/],['changed',/SOURCE_ARCHIVE_HASH_MISMATCH/],['status',/SOURCE_DOWNLOAD_FAILED: 503/]]){
  await assert.rejects(downloadArchive(sourceIdentity(bytes,fixture.url+'/'+route),fixture.file,{request:fixture.request}),error)
  assert.deepEqual(readdirSync(fixture.folder),[])
 }
})
test('source download refuses HTTPS downgrade and bounds redirect chains',async t=>{
 const fixture=await downloadFixture(t,(req,res)=>{res.writeHead(302,{location:req.url==='/downgrade'?'http://127.0.0.1/archive':'/loop'});res.end()})
 for(const [route,error] of [['downgrade',/SOURCE_DOWNLOAD_HTTPS_REQUIRED/],['loop',/SOURCE_DOWNLOAD_REDIRECT_LIMIT/]]){
  await assert.rejects(downloadArchive(sourceIdentity(Buffer.from('source'),fixture.url+'/'+route),fixture.file,{request:fixture.request}),error)
  assert.deepEqual(readdirSync(fixture.folder),[])
 }
})
test('source download deadline aborts a stalled body and removes its partial file',async t=>{
 const fixture=await downloadFixture(t,(_req,res)=>{res.writeHead(200);res.write('partial')})
 await assert.rejects(downloadArchive(sourceIdentity(Buffer.from('partial-complete'),fixture.url),fixture.file,{request:fixture.request,timeoutMs:100}),/SOURCE_DOWNLOAD_TIMEOUT/)
 assert.deepEqual(readdirSync(fixture.folder),[])
})
// A tiny stored ZIP fixture, independent of external commands or real packages.
function zipFile(entries){
 let offset=0;const locals=[],central=[]
 for(const [name,text]of entries){
  const filename=Buffer.from(name),data=Buffer.from(text);let crc=0xffffffff
  for(const v of data){crc^=v;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}crc=(crc^0xffffffff)>>>0
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(filename.length,26)
  locals.push(h,filename,data)
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);central.push(c,filename);offset+=h.length+filename.length+data.length
 }
 const middle=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(middle.length,12);end.writeUInt32LE(offset,16)
 const file=join(mkdtempSync(join(tmpdir(),'trace-zip-')),'fixture.zip');writeFileSync(file,Buffer.concat([...locals,middle,end]));return file
}
test('the distributed ZIP must match every audited file, including bytes, hash and duplicates',async()=>{
 const expected={'Trace.exe':{bytes:3,sha256:createHash('sha256').update('one').digest('hex')}}
 await verifyZip(zipFile([['Trace.exe','one']]),expected)
 await assert.rejects(verifyZip(zipFile([['Trace.exe','two']]),expected),/ZIP_HASH_MISMATCH/)
 await assert.rejects(verifyZip(zipFile([['Trace.exe','one'],['Trace.exe','one']]),expected),/ZIP_CONTENT_MISMATCH/)
 await assert.rejects(verifyZip(zipFile([['Trace.exe','one'],['extra.wav','audio']]),expected),/ZIP_CONTENT_MISMATCH/)
 await assert.rejects(verifyZip(zipFile([]),expected),/ZIP_MISSING_FILES/)
})
