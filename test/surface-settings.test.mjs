import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m10',{recursive:true});await build({entryPoints:['src/trace/spectrogramProtocol.ts'],outfile:'artifacts/m10/protocol.cjs',bundle:true,format:'cjs',platform:'node'})
const {defaultSpectrogramSettings:s,restoreSpectrogramSettings,validateSpectrogramSettings,spectrogramConfigKey}=(await import(pathToFileURL(resolve('artifacts/m10/protocol.cjs')))).default
test('version-one spectral settings migrate to 2D while retaining measurement and scale choices',()=>{
 const {surface,...old}=s;old.version=1;old.fftSize=8192;old.channel='side';old.minFrequency=50
 const next=restoreSpectrogramSettings(old);assert.equal(next.version,2);assert.equal(next.surface.mode,'2d');assert.equal(next.fftSize,8192);assert.equal(next.channel,'side');assert.equal(next.minFrequency,50);assert.equal(old.version,1)
})
test('camera mode, pose, height and detail do not alter analysis identity',()=>{
 const next={...s,surface:{...s.surface,mode:'3d',yaw:80,pitch:65,zoom:1.8,height:2,detail:256}}
 assert.deepEqual(validateSpectrogramSettings(next),next);assert.equal(spectrogramConfigKey(next),spectrogramConfigKey(s))
 assert.throws(()=>validateSpectrogramSettings({...next,surface:{...next.surface,detail:1024}}))
 const repaired=restoreSpectrogramSettings({...next,fftSize:4096,surface:{zoom:NaN}});assert.equal(repaired.fftSize,4096);assert.equal(repaired.surface.mode,'2d')
})
