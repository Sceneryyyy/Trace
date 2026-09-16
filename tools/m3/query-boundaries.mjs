import assert from 'node:assert/strict'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/m3',{recursive:true})
const target=resolve('artifacts/m3/query-reader.mjs')
await build({entryPoints:['src/trace/analysisCache.ts'],outfile:target,platform:'node',format:'esm',bundle:true})
const {AnalysisCache}=await import(pathToFileURL(target))
const report=JSON.parse(await readFile('artifacts/m3/integration-latest.json','utf8'))
assert.equal(report.status,'pass')
for(const directory of [report.cacheDirectory,report.long.cacheDirectory]){
 const cache=await AnalysisCache.open(directory),end=cache.manifest.frames
 for(const limit of [1,12,600]){
  const points=await cache.loudness('0',end,limit)
  assert(points.length<=limit)
  assert.equal(points.at(-1).frame,end)
 }
 assert.deepEqual(await cache.loudness(end,end,12),[])
 assert.deepEqual(await cache.waveform(end,end,12),[])
 assert.deepEqual((await cache.metrics(end)).integratedToCursor,cache.manifest.summary.integratedToCursor)
}
await writeFile('artifacts/m3/query-boundaries-latest.json',JSON.stringify({status:'pass',checkedAt:new Date().toISOString(),sourceReport:report.folder,checks:['EOF retained at limits 1/12/600','zero ranges empty in both charts','final I unchanged']},null,2))
console.log('M3_QUERY_BOUNDARIES_PASS: EOF retained at all query limits; empty ranges consistent')
