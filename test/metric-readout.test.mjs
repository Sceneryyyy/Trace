import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'

await mkdir('artifacts/readouts',{recursive:true})
for(const name of ['metricReadout','viewModel'])await build({entryPoints:['src/trace/renderer/'+name+'.ts'],outfile:'artifacts/readouts/'+name+'.cjs',platform:'node',format:'cjs',bundle:true})
const {metricReadout}=(await import(pathToFileURL(resolve('artifacts/readouts/metricReadout.cjs')))).default
const {deriveView}=(await import(pathToFileURL(resolve('artifacts/readouts/viewModel.cjs')))).default
const ready=Object.freeze({value:-23.4,status:'ready',unit:'LUFS'})
const snapshot=(patch={})=>({sourceKind:'live',sourceId:'device',positionFrame:'48000',format:{sampleRate:48000,channelCount:2},diagnostics:{},error:null,momentary:ready,...patch})
const file=(patch={})=>({id:'file',analysisPhase:'ready',error:null,sampleRate:48000,channelCount:2,startFrame:'0',endFrame:'480000',positionFrame:'48000',...patch})
const view=(state={},frame=snapshot())=>deriveView({state:{revision:1,deviceId:'device',active:true,error:null,...state},snapshot:frame,devices:[],windowDraft:null,recordWindow:{mode:'all',start:'0',end:'0'},seconds:30})
const note=v=>metricReadout(v.numberMetrics?.momentary,v.numberAvailability).note

test('estimated and unknown capture quality remain visible in live and file views',()=>{
 for(const [continuity,text]of [['estimated-silence','包含估计静音'],['unknown','采集完整性未知'],['gaps','音频有中断'],['complete','']]){
  assert.equal(view({},snapshot({continuity})).continuity,text)
  assert.equal(view({playback:file()},snapshot({sourceKind:'file',sourceId:'file',continuity})).continuity,text)
 }
})

test('source faults keep numerical readings suppressed and show unavailable, not measuring',()=>{
 for(const v of [view({error:'DEVICE_LOST'}),view({},snapshot({error:'SNAPSHOT_FAILED'})),view({error:'DEVICE_LOST'},null)]){
  assert.equal(v.numberMetrics,null);assert.equal(note(v),'无数据')
 }
 assert.equal(note(view({},null)),'测量中')
})

test('file failure and pending analysis have different labels; background LIVE faults do not blank a healthy file',()=>{
 const frame=snapshot({sourceKind:'file',sourceId:'file'})
 for(const playback of [file({error:'FILE_SNAPSHOT_FAILED: injected'}),file({analysisPhase:'failed'}),file({analysisPhase:'cancelled'})]){
  const v=view({playback},frame);assert.equal(v.numberMetrics,null);assert.equal(note(v),'无数据')
 }
 for(const analysisPhase of ['queued','hashing','running','verifying']){
  const v=view({playback:file({analysisPhase})},frame);assert.equal(v.numberMetrics,null);assert.equal(note(v),'分析中')
 }
 const healthy=view({playback:file(),error:'BACKGROUND_DEVICE_LOST'},frame)
 assert.equal(healthy.numberAvailability,'available');assert.equal(healthy.numberMetrics.momentary,ready)
 assert.equal(metricReadout(healthy.numberMetrics.momentary,healthy.numberAvailability).value,'−23.4')
 assert.equal(note(view({playback:file()},snapshot({sourceKind:'file',sourceId:'file',error:'FILE_DATA_UNAVAILABLE'}))),'无数据')
})

test('recording reconnect clears values and describes reconnecting instead of window formation',()=>{
 for(const error of [null,'DEVICE_LOST']){
  const v=view({currentRecord:{id:'take',phase:'reconnecting',regionCount:1},error})
  assert.equal(v.numberMetrics,null);assert.equal(note(v),'重新连接')
 }
})

test('silence, insufficient windows, individual gaps and ready numbers remain distinct',()=>{
 assert.equal(metricReadout(ready).value,'−23.4');assert.equal(metricReadout(ready).note,'');assert(metricReadout(ready).ready)
 assert.equal(metricReadout({value:null,status:'silence',unit:'LUFS'}).value,'−∞')
 assert.equal(metricReadout({value:null,status:'insufficient',unit:'LUFS'}).note,'测量中')
 for(const status of ['gap','error']){
  const reading=metricReadout({value:null,status,unit:'LUFS'});assert.equal(reading.note,'无数据');assert(reading.fault)
 }
 assert.equal(metricReadout({value:null,status:'ready',unit:'LUFS'}).note,'无数据')
})

test('unavailable display states never expose held values or mutate the original metric',()=>{
 for(const [availability,label] of [['unavailable','无数据'],['analyzing','分析中'],['reconnecting','重新连接'],['measuring','测量中']]){
  const reading=metricReadout(ready,availability);assert.equal(reading.value,'—');assert.equal(reading.note,label);assert.equal(reading.ready,false)
 }
 assert.deepEqual(ready,{value:-23.4,status:'ready',unit:'LUFS'})
})
