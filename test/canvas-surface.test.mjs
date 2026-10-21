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
await build({entryPoints:['src/trace/renderer/spectralSurface.ts'],outfile:'artifacts/transport/cursor-camera.cjs',bundle:true,format:'cjs',platform:'node'})
const {cameraMatrix,defaultSurface,surfacePresets,transform}=(await import(pathToFileURL(resolve('artifacts/transport/cursor-camera.cjs')))).default
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

test('preview.35 cursor follows the fitted front time axis after resize, presets and zoom',()=>{
 for(const [w,h] of [[300,600],[700,500],[1500,250]])for(const preset of Object.values(surfacePresets))for(const zoom of [.5,1,1.5]){
  const matrix=cameraMatrix({...defaultSurface,...preset,zoom},w/h);
  for(const cursor of [0,.25,.5,.75,1]){
   const p=transform(matrix,[cursor*2-1,0,1]),x=(p[0]+1)*w/2,y=(1-p[1])*h/2,marker=surfaceCursor(matrix,cursor,w,h);
   if(x<0||x>w||y<0||y>h)assert.equal(marker,null);else {assert(marker);assert(Math.abs(marker.x-x)<1e-9&&Math.abs(marker.y-y)<1e-9)}
  }
 }
})
