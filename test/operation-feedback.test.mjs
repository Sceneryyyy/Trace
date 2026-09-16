import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
await mkdir('artifacts/iteration',{recursive:true})
await build({entryPoints:['src/trace/diagnostics.ts'],outfile:'artifacts/iteration/diagnostics.cjs',bundle:true,platform:'node',format:'cjs'})
await build({entryPoints:['src/trace/renderer/OperationNotice.tsx'],outfile:'artifacts/iteration/notices.cjs',bundle:true,platform:'node',format:'cjs',jsx:'automatic'})
const {safeDiagnostics,errorCode}=(await import(pathToFileURL(resolve('artifacts/iteration/diagnostics.cjs')))).default
const {recordNotice,exportNotice}=(await import(pathToFileURL(resolve('artifacts/iteration/notices.cjs')))).default
test('copied diagnostics contain no filenames, directories, device identifiers or PCM data',()=>{
 const state={active:false,monitoringRequested:true,recordDirectory:'C:\\PRIVATE\\secret',deviceId:'private-device-id',error:'Error: ENOENT C:\\PRIVATE\\secret.wav',playback:{temporary:false,phase:'paused',positionFrame:'10',totalFrames:'100',analysisPhase:'failed',label:'Secret Sound',error:'FILE_SNAPSHOT_FAILED: C:\\PRIVATE\\secret.wav'},analysisJobs:[{phase:'failed',label:'Secret Sound',error:'C:\\PRIVATE\\secret.wav'}],exportJobs:[{phase:'ready',delivery:{phase:'failed',directory:'C:\\PRIVATE\\out',error:'EACCES C:\\PRIVATE\\out'}}]}
 const json=JSON.stringify(safeDiagnostics('test',state,{format:{sampleRate:48000,channelCount:2},epochId:'1',measurementEpoch:'2',samples:['SECRET_PCM']}))
 for(const token of ['PRIVATE','secret','Secret Sound','private-device-id','SECRET_PCM'])assert(!json.includes(token))
 assert(json.includes('ENOENT'));assert.equal(errorCode('Error: C:\\PRIVATE\\file'),'UNSPECIFIED')
})
test('record completion waits for automatic compressed output and retains failure status',()=>{
 const take={id:'take',name:'Test',status:'ready',exports:[{id:'out',automatic:true,phase:'encoding'}]}
 assert.equal(recordNotice(take).ready,false)
 take.exports[0].phase='ready';assert.equal(recordNotice(take).ready,true)
 take.exports[0].phase='failed';assert.equal(recordNotice(take).failed,true)
})
test('an encoded result is not reported as delivered while copying is pending or failed',()=>{
 const job={id:'job',label:'Test',takeId:'take',phase:'ready',fraction:1,delivery:{phase:'pending'}}
 assert.equal(exportNotice(job).ready,false);assert.match(exportNotice(job).message,/正在另存/)
 job.delivery.phase='failed';job.delivery.error='EACCES';assert.equal(exportNotice(job).failed,true)
 job.delivery.phase='ready';assert.equal(exportNotice(job).ready,true);assert.match(exportNotice(job).message,/已另存/)
})
