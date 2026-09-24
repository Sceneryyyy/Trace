import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,readFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

await mkdir('artifacts/runtime-artifacts',{recursive:true})
const output=resolve('artifacts/runtime-artifacts/runtime-artifacts.cjs')
await build({entryPoints:['src/trace/runtimeArtifacts.ts'],outfile:output,bundle:true,platform:'node',format:'cjs'})
const {runtimeArtifacts,encoderLockHashes}=(await import(pathToFileURL(output))).default
const root=resolve('test-root'),resources=resolve('test-resources')

test('Windows development and packaged paths preserve the existing layout',()=>{
 const dev=runtimeArtifacts('win32','x64',false,root,resources)
 assert.equal(dev.nativePath,join(root,'build','trace-engine','Release','trace_engine'+'.node'))
 assert.equal(dev.ffmpeg,join(root,'.tools','ffmpeg','bin','ffmpeg.exe'))
 assert.equal(dev.ffprobe,join(root,'.tools','ffmpeg','bin','ffprobe.exe'))
 assert.equal(dev.encoderLockPath,join(root,'ffmpeg.lock.json'))
 const packaged=runtimeArtifacts('win32','x64',true,root,resources)
 assert.equal(packaged.nativePath,join(resources,'native','trace_engine'+'.node'))
 assert.equal(packaged.ffmpeg,join(resources,'ffmpeg','ffmpeg.exe'))
 assert.equal(packaged.encoderLockPath,join(resources,'ffmpeg.lock.json'))
})

test('Mac paths select arm64 native and media artifacts without Windows executables',()=>{
 const dev=runtimeArtifacts('darwin','arm64',false,root,resources)
 assert.equal(dev.platformBuild,'darwin-arm64')
 assert.equal(dev.nativePath,join(root,'build','trace-engine','trace_engine'+'.node'))
 assert.equal(dev.ffmpeg,join(root,'.tools','ffmpeg-macos-arm64','bin','ffmpeg'))
 assert.equal(dev.ffprobe,join(root,'.tools','ffmpeg-macos-arm64','bin','ffprobe'))
 assert.equal(dev.encoderLockPath,join(root,'ffmpeg.macos-arm64.lock.json'))
 const packaged=runtimeArtifacts('darwin','arm64',true,root,resources)
 assert.equal(packaged.ffmpeg,join(resources,'ffmpeg','ffmpeg'))
 assert.equal(packaged.nativePath,join(resources,'native','trace_engine'+'.node'))
 assert.equal(packaged.encoderLockPath,join(resources,'ffmpeg.lock.json'))
})

test('unsupported platform and incompatible media lock fail before using binaries',()=>{
 for(const [platform,arch] of [['win32','arm64'],['darwin','x64'],['linux','x64']])
  assert.throws(()=>runtimeArtifacts(platform,arch,false,root,resources),/UNSUPPORTED_TRACE_PLATFORM/)
 const hashes={platform:'win32-x64',ffmpegSha256:'a'.repeat(64),ffprobeSha256:'b'.repeat(64)}
 assert.deepEqual(encoderLockHashes(hashes,'win32-x64'),{ffmpegSha256:hashes.ffmpegSha256,ffprobeSha256:hashes.ffprobeSha256})
 assert.throws(()=>encoderLockHashes(hashes,'darwin-arm64'),/ENCODER_BUILD_CHANGED/)
 assert.throws(()=>encoderLockHashes({...hashes,ffmpegSha256:'bad'},'win32-x64'),/ENCODER_BUILD_CHANGED/)
})

test('the pinned Windows media lock matches the current runtime',async()=>{
 const lock=JSON.parse(await readFile('ffmpeg.lock.json','utf8'))
 const hashes=encoderLockHashes(lock,'win32-x64')
 assert.equal(hashes.ffmpegSha256,lock.ffmpegSha256)
 assert.equal(hashes.ffprobeSha256,lock.ffprobeSha256)
 assert.throws(()=>encoderLockHashes(lock,'darwin-arm64'),/ENCODER_BUILD_CHANGED/)
})
