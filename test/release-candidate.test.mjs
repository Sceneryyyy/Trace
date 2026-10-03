import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {validateEvidence,verifyZip}=createRequire(import.meta.url)('../tools/release/candidate.cjs')
const {portableOutcome,expectedFromEnvironment}=createRequire(import.meta.url)('../tools/release/wait-portable-ci.cjs')
const verification={commit:'abc',sourceDirty:false,status:'pass',platform:'win32',arch:'x64',checks:['build:trace-engine','typecheck','test:trace','build:trace','test:trace-native'].map(c=>({command:'npm run '+c,status:'pass',exitCode:0}))}
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
