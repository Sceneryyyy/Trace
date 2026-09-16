const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{buildSync}=require('esbuild'),{launch,delay}=require('../m6/cdp.cjs')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m10/render-'+Date.now()),userData=path.join(folder,'user-data')
fs.mkdirSync(userData,{recursive:true});fs.writeFileSync(path.join(userData,'trace-settings.json'),JSON.stringify({monitoringRequested:false}))
buildSync({stdin:{contents:"export * from './src/trace/renderer/spectralSurface';export * from './src/trace/renderer/surfaceRenderer';",resolveDir:root,loader:'ts'},outfile:path.join(folder,'renderer.js'),bundle:true,platform:'browser',format:'iife',globalName:'SurfaceLab'})
let session;const report={folder,status:'running',checks:[]}
async function main(){
 process.env.TRACE_TEST_GPU='1';session=await launch(path.join(root,'dist-trace/preview.17/win-unpacked/Trace.exe'),folder,{userData,bounds:{x:20,y:20,width:1280,height:800}});const c=session.cdp
 await c.evaluate(fs.readFileSync(path.join(folder,'renderer.js'),'utf8')+';true')
 const setup=()=>{
  const overlay=document.createElement('div');overlay.id='surface-lab';overlay.style.cssText='position:fixed;inset:0;background:#11151a;z-index:99999;color:#dfe7ee'
  const title=document.createElement('div');title.style.cssText='height:32px;padding:8px';title.textContent='Synthetic geometry · 时间 / 频率 / dBFS · M10 render probe'
  const canvas=document.createElement('canvas');canvas.id='surface-canvas';canvas.style.cssText='width:100%;height:calc(100% - 50px)';overlay.append(title,canvas);document.body.appendChild(overlay)
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'}),live={buffers:new Set(),programs:new Set(),vaos:new Set(),shaders:new Set()}
  for(const [key,create,remove] of [['buffers','createBuffer','deleteBuffer'],['programs','createProgram','deleteProgram'],['vaos','createVertexArray','deleteVertexArray'],['shaders','createShader','deleteShader']]){const a=gl[create].bind(gl),b=gl[remove].bind(gl);gl[create]=(...args)=>{const v=a(...args);if(v)live[key].add(v);return v};gl[remove]=v=>{live[key].delete(v);return b(v)}}
  canvas.addEventListener('webglcontextlost',()=>{for(const set of Object.values(live))set.clear()});window.__objectCounts=()=>Object.fromEntries(Object.entries(live).map(([k,v])=>[k,v.size]))
  window.__losses=0;window.__restores=0;window.__surface=new SurfaceLab.SurfaceRenderer(canvas,()=>window.__losses++,()=>window.__restores++)
  const w=256,h=128,db=Float32Array.from({length:w*h},(_,i)=>-90+65*Math.exp(-Math.pow((Math.floor(i/w)-h*.45)/5,2))*(.55+.45*Math.sin(i%w*.06)**2))
  window.__view={width:w,height:h,decibels:db,status:new Uint8Array(w).fill(2),coverage:new Float32Array(w).fill(1)}
  window.__scene={mesh:SurfaceLab.buildSurface(window.__view,{...SurfaceLab.defaultSurface,detail:256},-100,0),options:{...SurfaceLab.defaultSurface,detail:256},palette:'trace',cursor:.6,selection:[.25,.4]};window.__surface.draw(window.__scene);return true
 }
 await c.evaluate('('+setup.toString()+')()')

 const image=await c.send('Page.captureScreenshot',{format:'jpeg',quality:92,fromSurface:true});fs.writeFileSync(path.join(folder,'surface.jpg'),Buffer.from(image.data,'base64'))
 report.initialObjects=await c.evaluate('window.__objectCounts()');assert.deepEqual(report.initialObjects,{buffers:3,programs:1,vaos:1,shaders:0});report.initial=await c.evaluate('window.__surface.resources');assert(report.initial.vertexBytes<=524288&&report.initial.indexBytes<=400000)
 report.checks.push('Actual WebGL 2 compiles shaders and draws the bounded synthetic surface')
 report.repeated=await c.evaluate('(()=>{for(let i=0;i<100;i++)window.__surface.draw({...window.__scene,options:{...window.__scene.options,yaw:-60+i*.5}});return window.__surface.resources})()');assert.deepEqual(report.repeated,report.initial);assert.deepEqual(await c.evaluate('window.__objectCounts()'),report.initialObjects)
 report.checks.push('Repeated camera draws reuse the same bounded buffers')
 await c.evaluate('window.__lossControl=document.querySelector("#surface-canvas").getContext("webgl2").getExtension("WEBGL_lose_context");window.__lossControl.loseContext();true');await delay(150)
 assert.equal(await c.evaluate('window.__losses'),1);assert((await c.evaluate('window.__surface.resources')).lost)
 await c.evaluate('window.__lossControl.restoreContext();true')
 for(const begin=Date.now();Date.now()-begin<5000;){if(await c.evaluate('window.__restores===1'))break;await delay(30)}assert.equal(await c.evaluate('window.__restores'),1)
 await c.evaluate('window.__surface.draw(window.__scene);true');assert(!(await c.evaluate('window.__surface.resources')).lost)
 report.checks.push('Forced context loss is reported and restoration rebuilds resources before drawing')
 await c.evaluate('window.__surface.dispose();true');report.disposed=await c.evaluate('window.__surface.resources');assert.equal(report.disposed.buffers,0);assert.equal(report.disposed.programs,0);assert.deepEqual(await c.evaluate('window.__objectCounts()'),{buffers:0,programs:0,vaos:0,shaders:0})
 report.checks.push('Disposal releases owned graphics resources');report.status='pass'
}
main().catch(error=>{report.status='fail';report.error=String(error);console.error(error);process.exitCode=1}).finally(async()=>{if(session)await session.close().catch(e=>{report.closeError=String(e);report.status='fail';process.exitCode=1});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'artifacts/m10/render-latest.json'),JSON.stringify(report,null,2));console.log('M10_RENDER',report.status,report.checks.length)})
