import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const {sha,validateBuildLock,validateBuildReport}=createRequire(import.meta.url)('../tools/codec/identity.cjs')
const original=JSON.parse(readFileSync(new URL('../references/trace-ffmpeg/build-lock.json',import.meta.url),'utf8'))
test('source codec requires exactly FFmpeg and LAME from pinned origins and bounded hashed archives',()=>{
 validateBuildLock(original)
 for(const change of [v=>v.sources.push(v.sources[0]),v=>v.sources[0].archiveUrl='https://different.invalid/source',v=>v.sources[1].archiveSha256='',v=>v.sources[1].archiveFile='../source.tar.gz',v=>v.sources[0].archiveBytes=NaN]){
  const v=structuredClone(original);change(v);assert.throws(()=>validateBuildLock(v))
 }
})
test('source codec rejects network/autodetected or additional external codec libraries and unrecorded toolchains',()=>{
 for(const change of [v=>v.configure=v.configure.filter(f=>f!=='--disable-network'),v=>v.configure=v.configure.filter(f=>f!=='--disable-autodetect'),v=>v.configure.push('--enable-libx264'),v=>v.toolchain.crtLinkage='/MD',v=>v.toolchain.windowsSdkVersion='',v=>v.sourceDateEpoch=-1]){
  const v=structuredClone(original);change(v);assert.throws(()=>validateBuildLock(v))
 }
})
function fixture(){
 const lock=structuredClone(original);lock.toolchain.tools=[{file:'fixture/cl.exe',sha256:'a'.repeat(64)}];lock.toolchain.systemInputs={compiler:{files:1,bytes:1,sha256:'b'.repeat(64)}};lock.systemDlls=['kernel32.dll']
 const bytes=Buffer.from(JSON.stringify(lock)),recipeHashes={'fixture/recipe':'c'.repeat(64)}
 const codec={version:lock.version,buildLockSha256:sha(bytes),recipeHashes,configuration:'configuration: fixture',ffmpegSha256:'d'.repeat(64),ffprobeSha256:'e'.repeat(64)}
 const report={schemaVersion:1,buildLockSha256:sha(bytes),sources:lock.sources,crtLinkage:lock.toolchain.crtLinkage,patches:[],recipes:recipeHashes,tools:lock.toolchain.tools,systemInputs:lock.toolchain.systemInputs,systemInventorySha256:'f'.repeat(64),configHeaderSha256:'1'.repeat(64),configMakSha256:'2'.repeat(64),configuration:codec.configuration,outputs:Object.fromEntries(['ffmpeg','ffprobe'].map(name=>[name,{sha256:codec[name+'Sha256'],bytes:1,version:'version '+codec.version+'\n'+codec.configuration,dependents:'    KERNEL32.dll\n'}]))}
 return {lock,bytes,codec,report,recipeHashes}
}
test('complete codec source requires actual recipe, tool and system input binding; a boolean is insufficient',()=>{
 const f=fixture(),check=report=>validateBuildReport(f.codec,f.lock,f.bytes,report,{recipeHashes:f.recipeHashes})
 assert.equal(check(f.report).correspondingSourceComplete,true)
 for(const change of [r=>r.buildLockSha256='0'.repeat(64),r=>r.sources=[],r=>r.patches=['unreported.patch'],r=>r.recipes={},r=>r.tools=[],r=>r.systemInputs={},r=>r.crtLinkage='/MD']){
  const r=structuredClone(f.report);change(r);assert.throws(()=>check(r))
 }
 assert.throws(()=>validateBuildReport(f.codec,f.lock,f.bytes,f.report),/CODEC_RECIPE_CHANGED/)
})
test('codec receipt rejects changed EXEs, configuration, version and non-system DLLs',()=>{
 const f=fixture()
 for(const change of [r=>r.outputs.ffmpeg.sha256='0'.repeat(64),r=>r.outputs.ffprobe.version='version 0\n'+f.codec.configuration,r=>r.outputs.ffmpeg.version+=' changed',r=>r.outputs.ffprobe.dependents+='    msys-2.0.dll\n',r=>r.outputs.ffmpeg.dependents+='    VCRUNTIME140.dll\n']){
  const r=structuredClone(f.report);change(r);assert.throws(()=>validateBuildReport(f.codec,f.lock,f.bytes,r,{recipeHashes:f.recipeHashes}))
 }
})
