import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/iteration',{recursive:true})
await build({entryPoints:['src/trace/renderer/zoom.ts'],outfile:'artifacts/iteration/navigation.cjs',platform:'node',format:'cjs',bundle:true})
await build({entryPoints:['src/trace/assetFormat.ts'],outfile:'artifacts/iteration/format.cjs',platform:'node',format:'cjs',bundle:true})
const {panRange}= (await import(pathToFileURL(resolve('artifacts/iteration/navigation.cjs')))).default
const {assetFormatLabel}= (await import(pathToFileURL(resolve('artifacts/iteration/format.cjs')))).default
test('panning preserves span and clamps at both ends of a long file',()=>{
 assert.deepEqual(panRange(2400000n,2640000n,5760000n,.25),{start:'2460000',end:'2700000'})
 assert.deepEqual(panRange(0n,240000n,5760000n,-1),{start:'0',end:'240000'})
 assert.deepEqual(panRange(5500000n,5740000n,5760000n,2),{start:'5520000',end:'5760000'})
 assert.deepEqual(panRange(0n,5760000n,5760000n,1),{start:'0',end:'5760000'})
 assert.throws(()=>panRange(0n,100n,99n,1))
})
test('file labels distinguish encoded assets from float playback buffers',()=>{
 assert.match(assetFormatLabel({format:'wav',sampleRate:44100,channelCount:1,encoding:'pcm16'}),/WAV · 44.1 kHz · 单声道 · 16-bit PCM/)
 assert.match(assetFormatLabel({format:'mp3',sampleRate:48000,channelCount:2,bitrate:192}),/MP3.*192 kbps/)
 assert(!assetFormatLabel({format:'aac',sampleRate:48000,channelCount:2,container:'m4a',bitrate:256}).includes('float'))
 assert.equal(assetFormatLabel(undefined),'')
})
