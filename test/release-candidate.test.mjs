import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {validateEvidence,verifyZip}=createRequire(import.meta.url)('../tools/release/candidate.cjs')
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
