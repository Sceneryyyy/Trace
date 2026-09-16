import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const require=createRequire(import.meta.url),root=path.resolve('.')
await fs.mkdir('artifacts/iteration',{recursive:true})
const folder=await fs.mkdtemp(path.join(root,'artifacts/iteration/long-path-'))
for(const [entry,out]of [['src/trace/fileJobs.ts','jobs.cjs'],['src/trace/file-worker.ts','file-worker.js']])await build({entryPoints:[entry],outfile:path.join(folder,out),bundle:true,platform:'node',format:'cjs'})
const {analyzeFiles,quantizeFiles,copyExportFile,hashFiles,recoverFiles}=require(path.join(folder,'jobs.cjs')),nativePath=path.join(root,'build/trace-engine/Release/trace_engine.node')
test('native analysis, conversion, recovery and atomic copy work beyond traditional Windows path length',async()=>{
 const nested=path.join(folder,'录音与缓存测试-'+('a'.repeat(70)),'长目录-'+('b'.repeat(70)),'c'.repeat(70))
 await fs.mkdir(nested,{recursive:true});const fixture=require('../tools/m4/fixture.cjs')(nested),sources=fixture.document.assets.map(a=>path.join(fixture.folder,a.relativePath))
 assert(sources[0].length>260)
 const analyzed=await analyzeFiles(nativePath,sources,path.join(fixture.folder,'cache'))
 assert.equal(analyzed.manifest.frames,'384000');assert(!analyzed.directory.startsWith('\\\\?\\'))
 const converted=await quantizeFiles(nativePath,sources,path.join(nested,'converted'),'pcm16');assert.equal(converted.frames,'384000')
 const file=path.join(nested,converted.segments[0].file),[hash]=await hashFiles([file])
 const copy=path.join(nested,'copied.wav');await copyExportFile(nativePath,file,copy,hash);assert.equal((await hashFiles([copy]))[0],hash)
 const recovered=path.join(nested,'recovered.wav');const results=await recoverFiles(nativePath,[{source:file,target:recovered}]);assert.equal(results[0].frames,'384000')
})
