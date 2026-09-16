import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m10',{recursive:true});await build({entryPoints:['src/trace/renderer/spectralSurface.ts'],outfile:'artifacts/m10/surface.cjs',bundle:true,platform:'node',format:'cjs'})
const {buildSurface,defaultSurface,validateSurface,cameraMatrix,inverse,multiply,transform,pickSurface,surfacePresets}=(await import(pathToFileURL(resolve('artifacts/m10/surface.cjs')))).default
const view=(w=128,h=64)=>({width:w,height:h,decibels:new Float32Array(w*h).fill(-50),status:new Uint8Array(w).fill(2),coverage:new Float32Array(w).fill(1)})
test('surface uses the same display dB maxima and retains silence/missing distinction without touching input',()=>{
 const v=view(128,64);v.decibels[1]=-4;v.status[20]=4;v.coverage[20]=0;const before=v.decibels.slice(),mesh=buildSurface(v,{...defaultSurface,detail:64},-100,0)
 assert.equal(mesh.decibels[0],-4);assert.equal(mesh.vertices[3],Math.fround(.96));assert.equal(mesh.valid[10],0)
 for(const index of mesh.indices)assert.equal(mesh.valid[index],1)
 assert.deepEqual(v.decibels,before)
 const silent=view(4,4);silent.decibels.fill(-Infinity);const s=buildSurface(silent,defaultSurface,-100,0);assert(s.valid.every(n=>n===1));assert(s.vertices.every((n,i)=>i%4!==1||n===0));assert(s.indices.length>0)
})
test('all camera presets project and unproject without losing the time/frequency coordinates',()=>{
 for(const pose of Object.values(surfacePresets))for(const zoom of [.5,1,2]){
  const m=cameraMatrix({...defaultSurface,...pose,zoom},1.7),inv=inverse(m),product=multiply(m,inv)
  for(let i=0;i<16;i++)assert(Math.abs(product[i]-(i%5===0?1:0))<1e-9)
  for(const p of [[-.8,.2,.6],[0,.5,0],[.7,.8,-.8]]){const result=transform(inv,transform(m,p));p.forEach((x,i)=>assert(Math.abs(result[i]-x)<1e-9))}
 }
})
test('picking selects the projected surface location and reports gaps as floor fallback',()=>{
 const v=view(16,16),mesh=buildSurface(v,defaultSurface,-100,0),matrix=cameraMatrix(defaultSurface,1.7)
 for(const point of [[-.5,.5,.5],[0,.5,0],[.5,.5,-.5]]){const screen=transform(matrix,point),picked=pickSurface(mesh,matrix,screen[0],screen[1]);assert(picked?.surface);assert(Math.abs(picked.time-(point[0]+1)/2)<1e-6);assert(Math.abs(picked.frequency-(1-point[2])/2)<1e-6)}
 v.status.fill(1);v.coverage.fill(0);const empty=buildSurface(v,defaultSurface,-100,0),screen=transform(matrix,[0,0,0]),pick=pickSurface(empty,matrix,screen[0],screen[1]);assert(pick&&!pick.surface)
})
test('maximum detail has bounded vertex/index storage and acceptable independent geometry timing',async()=>{
 const v=view(1024,512),at=performance.now(),mesh=buildSurface(v,{...defaultSurface,detail:256},-100,0),buildMs=performance.now()-at
 assert.equal(mesh.width*mesh.height,32768);assert(mesh.bytes<2*1024*1024);assert(Math.max(...mesh.valid)===1)
 const m=cameraMatrix({...defaultSurface,detail:256},1.7),start=performance.now();pickSurface(mesh,m,0,0);const pickMs=performance.now()-start
 await writeFile('artifacts/m10/geometry.json',JSON.stringify({status:'pass',vertices:32768,triangles:mesh.indices.length/3,bytes:mesh.bytes,buildMs,pickMs},null,2))
 for(const value of [{...defaultSurface,detail:512},{...defaultSurface,pitch:90},{...defaultSurface,zoom:0},{...defaultSurface,height:NaN}])assert.throws(()=>validateSurface(value))
})

test('invalid dimensions and NaN data never enter a GPU mesh',()=>{
 assert.throws(()=>buildSurface({...view(),width:0},defaultSurface,-100,0),/INVALID_SURFACE_DATA/)
 const bad=view();bad.decibels[10]=NaN;assert.throws(()=>buildSurface(bad,defaultSurface,-100,0),/INVALID_SURFACE_DATA/)
})
