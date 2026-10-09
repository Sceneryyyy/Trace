// Inject filesystem error returns into the real import path, with actual codec
// output and files. This does not simulate a full physical disk or driver.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,mkdir,mkdtemp,readdir,rm,writeFile} from 'node:fs/promises'
import {existsSync,createReadStream} from 'node:fs'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
const compiled=resolve('artifacts/file-faults/disk')
await mkdir(compiled,{recursive:true})
const injection={name:'test-only-filesystem-faults',setup(builder){
 builder.onLoad({filter:/[/\\](importMedia|mediaTasks)\.ts$/},async args=>({contents:(await readFile(args.path,'utf8')).replace("from 'node:fs/promises'","from 'trace-test-fault-fs'"),loader:'ts',resolveDir:resolve('src/trace')}))
 builder.onResolve({filter:/^trace-test-fault-fs$/},()=>({path:'fs',namespace:'test-fs'}))
 builder.onLoad({filter:/.*/,namespace:'test-fs'},()=>({loader:'js',contents:`
  import * as fs from 'node:fs/promises'; export * from 'node:fs/promises';
  let fault='';export function setFault(value){fault=value}
  function failure(){const e=Error('Injected ENOSPC');e.code='ENOSPC';return e}
  export async function open(path,flags){const handle=await fs.open(path,flags);if(fault==='owner'&&String(path).endsWith('owner.json')&&flags==='wx'){const write=handle.writeFile.bind(handle);handle.writeFile=async data=>{await write(String(data).slice(0,7));throw failure()}}return handle}
  export async function writeFile(path,...args){if(fault==='metadata'&&String(path).endsWith('decoded.json')){await fs.writeFile(path,'{',...args.slice(1));throw failure()}return fs.writeFile(path,...args)}
  export async function mkdir(path,...args){if(fault==='pcm'&&String(path).endsWith('pcm'))throw failure();return fs.mkdir(path,...args)}
 `}))
}}
// Export the injection control from the same bundle to avoid duplicated state.
await build({stdin:{contents:"export * from './src/trace/importMedia'; export {setFault} from 'trace-test-fault-fs'",resolveDir:resolve('.')},outfile:join(compiled,'importMedia.js'),bundle:true,platform:'node',format:'cjs',plugins:[injection]})
await build({entryPoints:['src/trace/file-worker.ts','src/trace/media-runner.ts'],outdir:compiled,bundle:true,platform:'node',format:'cjs'})
const {decodeImport,setFault}=(await import(pathToFileURL(join(compiled,'importMedia.js')))).default
const system=process.env.TRACE_TEST_SYSTEM_CODEC==='1'&&process.platform!=='win32'
if(system&&process.env.TRACE_REQUIRE_NATIVE==='1')throw Error('SYSTEM_CODEC_IS_NOT_LOCKED_WINDOWS_EVIDENCE')
const ffmpeg=system?'/usr/bin/ffmpeg':resolve('.tools/ffmpeg/bin/ffmpeg.exe'),ffprobe=system?'/usr/bin/ffprobe':resolve('.tools/ffmpeg/bin/ffprobe.exe'),ready=(system||process.platform==='win32')&&existsSync(ffmpeg)&&existsSync(ffprobe)
if(!ready&&process.env.TRACE_REQUIRE_NATIVE==='1')throw Error('LOCKED_CODEC_REQUIRED')
async function hash(file){const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex')}
const tools=ready?{ffmpeg,ffprobe,nativePath:'unused',ffmpegSha256:await hash(ffmpeg),ffprobeSha256:await hash(ffprobe)}:undefined
if(ready&&!system){const lock=JSON.parse(await readFile('ffmpeg.lock.json','utf8'));assert.equal(tools.ffmpegSha256,lock.ffmpegSha256);assert.equal(tools.ffprobeSha256,lock.ffprobeSha256)}
for(const fault of ['owner','pcm','metadata'])test('ENOSPC during '+fault+' creation cleans partial owned files and permits retry',{skip:!ready,timeout:60000},async t=>{
 const root=await mkdtemp(join(tmpdir(),'trace-import-disk-')),source=join(root,'source.wav'),cache=join(root,'cache');t.after(()=>rm(root,{recursive:true,force:true}))
 const b=Buffer.alloc(44+4096*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(192000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);await writeFile(source,b)
 try{setFault(fault);await assert.rejects(decodeImport(tools,source,cache,{capacity:async()=>10000000000n}),error=>error.code==='ENOSPC');assert.deepEqual(await readdir(cache),[]);assert.deepEqual(await readFile(source),b)}finally{setFault('')}
 const imported=await decodeImport(tools,source,cache,{capacity:async()=>10000000000n});assert.equal(imported.frames,'4096');assert.deepEqual(await readFile(source),b)
})
