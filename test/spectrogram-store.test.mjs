import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,mkdtemp,readFile,writeFile,readdir,symlink} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m9',{recursive:true});await build({entryPoints:['src/trace/spectrogramStore.ts'],outfile:'artifacts/m9/store.cjs',platform:'node',format:'cjs',bundle:true})
const {SpectrogramStore}=(await import(pathToFileURL(resolve('artifacts/m9/store.cjs')))).default
const key='a'.repeat(64)
function tile(r,n=2048){return {firstFrame:r.firstFrame,columns:r.columns,fftSize:n,hop:Math.min(n/4,960),bins:n/2+1,sampleRate:48000,channels:2,decibels:new Float32Array(r.columns*(n/2+1)).fill(-24),status:new Uint8Array(r.columns).fill(1)}}
test('file tiles survive reopening and corruption rebuilds without touching audio',async()=>{
 const dir=await mkdtemp(resolve('artifacts/m9/store-')),audio=join(dir,'original.wav'),cache=join(dir,'cache');await writeFile(audio,'immutable audio sentinel')
 let calls=0;const fetch=async r=>{calls++;return tile(r)},request={key,firstFrame:'2048',columns:64}
 const a=new SpectrogramStore(fetch,cache);await a.get(request);await a.close();const b=new SpectrogramStore(fetch,cache);await b.get(request);assert.equal(calls,1);await b.close()
 const file=join(cache,key,'2048.bin'),bytes=await readFile(file);bytes[bytes.length-1]^=1;await writeFile(file,bytes)
 const c=new SpectrogramStore(fetch,cache);await c.get(request);assert.equal(calls,2);assert((await readdir(join(cache,key))).some(p=>p.includes('.corrupt-')));assert.equal(await readFile(audio,'utf8'),'immutable audio sentinel');await c.close()
})
test('memory-only tiles obey aggregate byte budget and retain no unbounded queue',async()=>{
 const a=new SpectrogramStore(async r=>tile(r,16384),undefined,4*1024*1024)
 for(let i=0;i<4;i++){await a.get({key,firstFrame:String(16384+i*61440),columns:64});assert(a.usage.bytes<=a.budgetBytes)}assert(a.usage.tiles<=2);await a.close();assert.equal(a.usage.bytes,0)
})
test('closing before native completion prevents publishing a late tile',async()=>{
 const dir=await mkdtemp(resolve('artifacts/m9/cancel-'));let finish,entered;const start=new Promise(r=>entered=r)
 const a=new SpectrogramStore(r=>new Promise(resolve=>{finish=()=>resolve(tile(r));entered()}),dir)
 const pending=a.get({key,firstFrame:'2048',columns:64});await start;const close=a.close();finish();await assert.rejects(pending,/CANCELLED/);await close
 assert(!(await readdir(join(dir,key))).some(p=>p.endsWith('.bin')))
})
test('cache writes refuse linked directories and malformed cache identities',async()=>{
 const dir=await mkdtemp(resolve('artifacts/m9/linked-')),outside=join(dir,'outside'),link=join(dir,'cache');await mkdir(outside);await symlink(outside,link,'junction')
 const a=new SpectrogramStore(async r=>tile(r),link);await assert.rejects(a.get({key,firstFrame:'2048',columns:1}),/LINKED/)
 assert.deepEqual(await readdir(outside),[]);await assert.rejects(a.get({key:'../escape',firstFrame:'0',columns:1}),/INVALID/)
})

test('a growing live tail fetches only new FFT columns and keeps the old raw values exact',async()=>{
 const calls=[],a=new SpectrogramStore(async r=>{calls.push({...r});const t=tile(r);for(let c=0;c<t.columns;c++)t.decibels.fill(-Number(BigInt(r.firstFrame)+BigInt(c*t.hop)),c*t.bins,(c+1)*t.bins);return t})
 const first=await a.get({key,firstFrame:'2048',columns:3}),old=first.decibels.slice()
 const extended=await a.get({key,firstFrame:'2048',columns:8})
 assert.deepEqual(calls.map(r=>[r.firstFrame,r.columns]),[['2048',3],['3584',5]])
 assert.deepEqual(extended.decibels.subarray(0,old.length),old);assert.deepEqual(first.decibels,old)
 for(let c=0;c<8;c++)assert.equal(extended.decibels[c*extended.bins],-(2048+c*512))
 await a.close()
})
