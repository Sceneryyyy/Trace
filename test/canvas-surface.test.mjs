import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
await mkdir('artifacts/transport',{recursive:true})
await build({entryPoints:['src/trace/renderer/canvasSurface.ts'],outfile:'artifacts/transport/canvas.cjs',bundle:true,format:'cjs',platform:'node'})
const {canvasSurface}=(await import(pathToFileURL(resolve('artifacts/transport/canvas.cjs')))).default
await build({entryPoints:['src/trace/renderer/surfaceCursor.ts'],outfile:'artifacts/transport/surface-cursor.cjs',bundle:true,format:'cjs',platform:'node'})
const {surfaceCursor,drawSurfaceCursor}=(await import(pathToFileURL(resolve('artifacts/transport/surface-cursor.cjs')))).default
test('repeated paints clear pixels without reallocating the canvas backing store',()=>{
 globalThis.window={devicePixelRatio:2};let width=0,height=0,writes=0,clears=0;const transforms=[]
 const canvas={getBoundingClientRect:()=>({width:300,height:180}),get width(){return width},set width(v){width=v;writes++},get height(){return height},set height(v){height=v;writes++},getContext:()=>({setTransform:(...a)=>transforms.push(a),clearRect:()=>clears++,setLineDash:()=>{},globalAlpha:1})}
 for(let i=0;i<100;i++)canvasSurface(canvas)
 assert.equal(writes,2);assert.equal(clears,100);assert.deepEqual(transforms.at(-1),[2,0,0,2,0,0])
 globalThis.window.devicePixelRatio=1;canvasSurface(canvas);assert.equal(writes,4);assert.equal(width,300);assert.equal(height,180)
})
test('3D cursor marker uses projected time, clips invisible ranges and stays in CSS pixels',()=>{
 const identity=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
 assert.deepEqual(surfaceCursor(identity,.5,300,180),{x:150,y:90})
 for(const value of [null,-.01,1.01,NaN])assert.equal(surfaceCursor(identity,value,300,180),null)
 assert.equal(surfaceCursor(new Float64Array(16),.5,300,180),null)
 const calls=[],ctx={save:()=>{},restore:()=>{},beginPath:()=>{},closePath:()=>{},stroke:()=>{},fill:()=>{},moveTo:(...p)=>calls.push(p),lineTo:(...p)=>calls.push(p)}
 drawSurfaceCursor(ctx,{x:150,y:90},'#fff');assert.equal(ctx.lineWidth,2)
 assert.deepEqual(calls,[[150,90],[150,79],[150,90],[145,83],[155,83]])
})
