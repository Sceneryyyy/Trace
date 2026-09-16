import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { mkdir, writeFile, mkdtemp, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
await mkdir(resolve('artifacts/m2'),{recursive:true})
const modulePath=resolve('artifacts/m2/recovery-test.mjs')
await build({entryPoints:['src/trace/recovery.ts'],outfile:modulePath,bundle:true,platform:'node',format:'esm'})
const {inspectRecovery}=await import(pathToFileURL(modulePath))
async function fixture(names,lines=[]){
 const root=await mkdtemp(resolve('artifacts/m2/inventory-'));await mkdir(join(root,'audio'))
 for(const name of names)await writeFile(join(root,'audio',name),'fixture')
 await writeFile(join(root,'journal.jsonl'),lines.join('\n')+'\n')
 return root
}
test('recovery preserves complete checkpoint before a torn journal tail',async()=>{
 const checkpoint=JSON.stringify({event:'checkpoint',frames:'144000',segments:[{file:'Test-1.wav',frames:'96000'},{file:'Test-2.wav',frames:'48000'}]})
 const root=await fixture(['Test-1.wav','Test-2.wav'],[checkpoint,'{"event":"checkpoint","frames":"'])
 const result=await inspectRecovery(root,'Test')
 assert.deepEqual(result.files,['Test-1.wav','Test-2.wav'])
 assert.equal(result.confirmedFrames,'144000')
 assert.equal(result.ignoredJournalLines,1)
})
test('missing middle and checkpoint-listed final segments cannot be silently concatenated',async()=>{
 const middle=await fixture(['Test-1.wav','Test-3.wav'])
 await assert.rejects(inspectRecovery(middle,'Test'),/RECOVERY_SEGMENT_MISSING: Test-2.wav/)
 const final=await fixture(['Test-1.wav'],[JSON.stringify({event:'checkpoint',frames:'3',segments:[{file:'Test-1.wav',frames:'2'},{file:'Test-2.wav',frames:'1'}]})])
 await assert.rejects(inspectRecovery(final,'Test'),/RECOVERY_SEGMENT_MISSING: Test-2.wav/)
})
test('invalid checkpoint totals and foreign filenames never define confirmed frames',async()=>{
 const root=await fixture(['Test-1.wav'],[
  JSON.stringify({event:'checkpoint',frames:'3',segments:[{file:'Test-1.wav',frames:'2'}]}),
  JSON.stringify({event:'checkpoint',frames:'3',segments:[{file:'../foreign.wav',frames:'3'}]})
 ])
 const result=await inspectRecovery(root,'Test')
 assert.equal(result.confirmedFrames,null);assert.equal(result.ignoredJournalLines,2)
})
test('recovery can inspect pre-checkpoint interruption with an absent journal',async()=>{
 const root=await fixture(['声迹-1.wav','声迹-recovered-old-1.wav'])
 await unlink(join(root,'journal.jsonl'))
 const result=await inspectRecovery(root,'声迹')
 assert.deepEqual(result.files,['声迹-1.wav']);assert.equal(result.confirmedFrames,null)
})
