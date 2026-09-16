import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
await mkdir('artifacts/m9',{recursive:true})
await build({entryPoints:['src/trace/spectrogramCodec.ts'],outfile:'artifacts/m9/codec.cjs',platform:'node',format:'cjs',bundle:true})
const {encodeSpectrogramTile:encode,decodeSpectrogramTile:decode}=(await import(pathToFileURL(resolve('artifacts/m9/codec.cjs')))).default
const key='a'.repeat(64),tile=()=>({firstFrame:'1152921504606849024',columns:3,fftSize:2048,hop:512,bins:1025,sampleRate:48000,channels:2,decibels:new Float32Array(3075).fill(-24.4),status:new Uint8Array([1,0,2])})
test('binary tile preserves original frequency values, silence, masks and 64-bit frames',()=>{
 const t=tile();t.decibels[0]=-Infinity;t.decibels[1]=-600
 const b=encode(t,key),result=decode(b,key);assert.deepEqual(result,t);assert(b.length<4*1024*1024)
 result.decibels[2]=9;assert.notEqual(t.decibels[2],9)
})
test('wrong identity, metadata corruption, truncation and data corruption are rejected',()=>{
 const b=encode(tile(),key)
 assert.throws(()=>decode(b,'b'.repeat(64)),/CORRUPT/)
 assert.throws(()=>decode(b.subarray(0,b.length-1),key),/CORRUPT/)
 for(const offset of [0,8,16,40,64,127,128,b.length-1]){const copy=Buffer.from(b);copy[offset]^=1;assert.throws(()=>decode(copy,key),/CORRUPT/)}
})
test('tile validation rejects impossible dimensions and nonfinite values other than silence',()=>{
 for(const value of [{...tile(),columns:65},{...tile(),hop:0},{...tile(),firstFrame:'18446744073709551615'},{...tile(),sampleRate:96001}])assert.throws(()=>encode(value,key))
 const t=tile();t.decibels[8]=NaN;assert.throws(()=>encode(t,key));t.decibels[8]=Infinity;assert.throws(()=>encode(t,key))
})
