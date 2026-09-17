import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
const output = resolve('artifacts/m1/contracts-test.mjs')
await mkdir(resolve('artifacts/m1'), { recursive: true })
await build({ entryPoints: ['src/trace/contracts.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm' })
const { validateRequest, isMutation } = await import(pathToFileURL(output))
function request(command = 'state.get', payload = {}) {
  return { protocolVersion: 1, requestId: 'test-1', expectedStateRevision: 0, command, payload }
}
test('core commands and continuous windows have explicit payload rules', () => {
  for (const command of ['state.get', 'devices.list', 'live.stop', 'live.reset']) assert.equal(validateRequest(request(command)).command, command)
  assert.equal(validateRequest(request('live.start', { deviceId: 'endpoint' })).payload.deviceId, 'endpoint')
  for (const seconds of [5, 5.25, 10, 30.5, 60]) assert.equal(validateRequest(request('view.window', { seconds })).payload.seconds, seconds)
})
test('unknown commands and unsupported windows are rejected', () => {
  assert.throws(() => validateRequest(request('arbitrary.shell')), /INVALID_REQUEST/)
  for (const seconds of [0, 1, 4.99, -30, 60.01, NaN, Infinity, '30']) assert.throws(() => validateRequest(request('view.window', { seconds })), /INVALID_WINDOW/)
})
test('request identity and state revision are validated', () => {
  for (const value of [null, [], 'request', 1]) assert.throws(() => validateRequest(value))
  for (const expectedStateRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN]) assert.throws(() => validateRequest({ ...request(), expectedStateRevision }))
  for (const requestId of ['', 1, 'x'.repeat(101)]) assert.throws(() => validateRequest({ ...request(), requestId }))
  assert.throws(() => validateRequest({ ...request(), protocolVersion: 2 }))
})
test('extra, missing, and non-plain payloads cannot cross the boundary', () => {
  assert.throws(() => validateRequest(request('live.start', {})))
  assert.throws(() => validateRequest(request('live.start', {deviceId:'device\0suffix'})))
  assert.throws(() => validateRequest(request('live.start', { deviceId: 'x', path: 'C:\\anything' })))
  assert.throws(() => validateRequest(request('state.get', { extra: 1 })))
  assert.throws(() => validateRequest(request('state.get', new Date())))
  const inherited = Object.assign(Object.create({ deviceId: 'endpoint' }), { unexpected: 1 })
  assert.throws(() => validateRequest(request('live.start', inherited)))
})
test('queries do not require a mutation revision match', () => {
  assert.equal(isMutation('state.get'), false)
  assert.equal(isMutation('devices.list'), false)
  for (const command of ['live.start', 'live.stop', 'live.reset', 'view.window']) assert.equal(isMutation(command), true)
})

test('report commands accept identifiers only, bound event indices and permit immediate cancellation',()=>{
 for(const scope of ['whole','selection'])assert.equal(validateRequest(request('report.prepare',{playbackId:'source',scope})).payload.scope,scope)
 for(const scope of ['live','all',null])assert.throws(()=>validateRequest(request('report.prepare',{playbackId:'source',scope})))
 for(const command of ['report.get','report.cancel','report.retry','report.open','report.export']){
  validateRequest(request(command,{reportId:'id'}));assert.throws(()=>validateRequest(request(command,{reportId:'id',path:'C:/anywhere'})))
 }
 for(const index of [-1,1000,.5,'1'])assert.throws(()=>validateRequest(request('report.jump',{reportId:'id',index})))
 validateRequest(request('report.jump',{reportId:'id',index:999}));assert.equal(isMutation('report.cancel'),false);assert.equal(isMutation('report.get'),false)
})

test('imports expose owned identifiers and native picking, never a path-bearing renderer command',()=>{
 for(const command of ['imports.choose','imports.refresh','imports.openRoot']){validateRequest(request(command));assert.throws(()=>validateRequest(request(command,{path:'C:/arbitrary.wav'})))}
 for(const command of ['imports.prepare','imports.cancel','imports.clearCache','imports.remove','imports.relocate','imports.openSource','imports.openFolder']){
  const payload={assetId:'asset',...(command==='imports.prepare'?{acceptChanged:false}:{})};validateRequest(request(command,payload));assert.throws(()=>validateRequest(request(command,{...payload,path:'C:/arbitrary.wav'})))
 }
 assert.throws(()=>validateRequest(request('imports.add',{path:'C:/arbitrary.wav'})));assert.equal(isMutation('imports.cancel'),false);assert.equal(isMutation('imports.refresh'),false)
})

test('reference commands bound slots, ranges, offsets and source identifiers',()=>{
 validateRequest(request('reference.set',{takeId:'take',role:'source'}));assert.throws(()=>validateRequest(request('reference.set',{takeId:'take',role:'source',path:'C:/any.wav'})))
 validateRequest(request('reference.activate',{slot:'b',atStart:true}));assert.throws(()=>validateRequest(request('reference.activate',{slot:'c'})))
 validateRequest(request('reference.configure',{offsetNs:'-500000000',linked:true}));assert.throws(()=>validateRequest(request('reference.configure',{offsetNs:'86400000000001',linked:true})))
 validateRequest(request('reference.range',{slot:'a',startFrame:'1',endFrame:'2'}));assert.throws(()=>validateRequest(request('reference.range',{slot:'a',startFrame:'2',endFrame:'1'})))
})

const timeOutput = resolve('artifacts/m1/time-test.mjs')
await build({ entryPoints: ['src/trace/renderer/time.ts'], outfile: timeOutput, bundle: true, platform: 'node', format: 'esm' })
const { timecode, relativeFrame } = await import(pathToFileURL(timeOutput))
test('display time is sample-derived at common rates', () => {
  assert.equal(timecode('0', 96000), '00:00:00.000')
  assert.equal(timecode('44100', 44100), '00:00:01.000')
  assert.equal(timecode(String((2 * 3600 + 34 * 60 + 56) * 48000 + 123 * 48), 48000), '02:34:56.123')
})
test('viewport differences preserve single frames above JS safe integer', () => {
  assert.equal(relativeFrame('9007199254740993', '9007199254740994'), -1)
  assert.equal(relativeFrame('18446744073709551614', '18446744073709551615'), -1)
})

test('file analysis commands reject paths and bound frame queries',()=>{
 const make=(command,payload)=>({protocolVersion:1,requestId:'m3',expectedStateRevision:0,command,payload})
 assert.equal(validateRequest(make('analysis.start',{takeId:'take',role:'source'})).command,'analysis.start')
 assert.equal(validateRequest(make('job.cancel',{jobId:'job'})).command,'job.cancel')
 assert.equal(validateRequest(make('metrics.query',{analysisId:'job',positionFrame:'18446744073709551615',requestGeneration:1})).command,'metrics.query')
 assert.equal(isMutation('metrics.query'),false);assert.equal(isMutation('timeline.query'),false)
 for(const payload of [{takeId:'take',role:'source',path:'C:/private.wav'},{takeId:'',role:'source'},{takeId:'take',role:'file'}])assert.throws(()=>validateRequest(make('analysis.start',payload)))
 for(const positionFrame of ['-1','18446744073709551616','1.5',99])assert.throws(()=>validateRequest(make('metrics.query',{analysisId:'job',positionFrame,requestGeneration:0})))
 for(const pixelWidth of [0,2401,1.5])assert.throws(()=>validateRequest(make('timeline.query',{analysisId:'job',startFrame:'0',endFrame:'100',pixelWidth,requestGeneration:1})))
 assert.throws(()=>validateRequest(make('timeline.query',{analysisId:'job',startFrame:'100',endFrame:'99',pixelWidth:100,requestGeneration:1})))
})
