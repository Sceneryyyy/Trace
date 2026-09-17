import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m12',{recursive:true});await build({stdin:{contents:"export {ReferenceSpectrumService} from './src/trace/referenceSpectrum';export {defaultInstrumentSettings,instrumentConfigKey} from './src/trace/instrumentTypes';",resolveDir:process.cwd(),loader:'ts'},outfile:'artifacts/m12/reference-spectrum.cjs',bundle:true,platform:'node',format:'cjs'})
const {ReferenceSpectrumService,defaultInstrumentSettings:s,instrumentConfigKey}=(await import(pathToFileURL(resolve('artifacts/m12/reference-spectrum.cjs')))).default
const tick=()=>new Promise(r=>setImmediate(r)),wait=async f=>{for(let i=0;i<1000;i++){if(f())return;await tick()}throw Error('spectrum wait')}
const peer=(name,rate)=>({id:name,playbackId:name==='a'?'active':undefined,source:{label:name,sources:['C:/test-only/'+name+'.wav'],sampleRate:rate,frames:String(rate*4)},range:{startFrame:'0',endFrame:String(rate*4)}})
const data=(rate,position)=>({sampleRate:rate,positionFrame:position,fftSize:2048,binHz:rate/2048,averageWindows:4,partialAverage:false,status:'ready',average:new Float64Array([0,.25,.01])})
function setup(){const a=peer('a',48000),b=peer('b',44100),packets=[],calls=[];let version=1,positions={a:'96000',b:'88200'},query=async r=>({phase:'ready',configKey:instrumentConfigKey(s),data:data(r.sampleRate,r.positionFrame)});const refs={peer:slot=>slot==='a'?a:b,get version(){return version},activeSlot:'a',positions:()=>({...positions})};const svc=new ReferenceSpectrumService(refs,async r=>{calls.push(r);return query(r)},p=>packets.push(p));return {a,b,refs,svc,packets,calls,setVersion:v=>version=v,setPositions:p=>positions=p,setQuery:q=>query=q}}
test('the active full-file spectrum is reused and the other source retains its own frequency grid',async()=>{
 const t=setup();t.svc.request({sourceId:'active',instruments:{phase:'ready',configKey:instrumentConfigKey(s),data:data(48000,'96000')}},s);await wait(()=>!t.svc.busy);assert.equal(t.calls.length,1);assert.equal(t.calls[0].sampleRate,44100);assert.equal(t.packets[0].a.binHz,48000/2048);assert.equal(t.packets[0].b.binHz,44100/2048);assert.equal(t.packets[0].b.powers[1],.25)
})
test('selected ranges use clipped PCM origins and publish positions in the original file axis',async()=>{
 const t=setup();t.a.range={startFrame:'48000',endFrame:'144000'};t.a.source.decodeRange={startFrame:'1024',endFrame:'193024'};t.svc.request({sourceId:'active'},s);await wait(()=>!t.svc.busy);assert.equal(t.calls[0].startFrame,'49024');assert.equal(t.calls[0].endFrame,'145024');assert.equal(t.calls[0].positionFrame,'48000');assert.equal(t.packets[0].a.positionFrame,'96000')
})
test('late spectra from old bindings are discarded and cancellation waits for an active read',async()=>{
 const t=setup();let finish;t.setQuery(()=>new Promise(r=>finish=()=>r({phase:'ready',data:data(48000,'96000')})));t.svc.request({sourceId:'active'},s);await wait(()=>!!finish);t.setVersion(2);let done=false;const cancelled=t.svc.cancel().then(()=>done=true);t.svc.request({sourceId:'active'},s);await tick();assert(!done);finish();await cancelled;assert.equal(t.packets.length,0)
})
test('out-of-range mappings are unavailable rather than zero curves or native queries',async()=>{
 const t=setup();t.setPositions({a:'96000',b:null});t.svc.request({sourceId:'active'},s);await wait(()=>!t.svc.busy);assert.equal(t.calls.length,0);assert.equal(t.packets[0].phase,'unavailable');assert.equal(t.packets[0].b,undefined)
})
