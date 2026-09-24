import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
await mkdir('artifacts/audit',{recursive:true})
await build({entryPoints:['src/trace/recording.ts'],outfile:'artifacts/audit/recording.cjs',platform:'node',format:'cjs',bundle:true,external:['electron']})
const {RecordingService}=(await import(pathToFileURL(resolve('artifacts/audit/recording.cjs')))).default

const native={recordStart(){throw Error('REC must not start')},recordStop(){throw Error('REC must not stop')},recordStatus:()=>({phase:'idle'})}
const service=()=>new RecordingService(native,'unused','unused','unused',()=>{})

// A manifest we cannot parse used to be swallowed by an empty catch: the audio
// stayed on disk but the take vanished from the library with no error, which is
// indistinguishable from it never having existed.
test('a take whose manifest cannot be parsed stays visible instead of disappearing',async()=>{
 const root=await mkdtemp(resolve('artifacts/audit/library-')),broken=join(root,'broken-take')
 await mkdir(broken);await writeFile(join(broken,'session.json'),'{ not valid json')
 const audio=join(broken,'audio');await mkdir(audio);await writeFile(join(audio,'take.wav'),'PCM')

 const s=service();await s.setDirectory(root)
 const summaries=s.summaries()
 assert.equal(summaries.length,1,'the unreadable directory must still be listed')
 assert.equal(summaries[0].status,'unreadable')
 assert.equal(summaries[0].name,'broken-take')
 assert(summaries[0].error,'the reason must be reported')
 assert.equal(summaries[0].roles.length,0,'no role may be offered for unparsed metadata')

 // The point of surfacing it is that the audio is recoverable by hand.
 assert.equal(await readFile(join(audio,'take.wav'),'utf8'),'PCM')
 assert.equal(s.folder(summaries[0].id),broken,'the folder action must reach the directory')
 assert.deepEqual(s.unreadableDirectories().map(v=>v.name),['broken-take'])
})

test('rescanning a directory does not accumulate stale unreadable entries',async()=>{
 const root=await mkdtemp(resolve('artifacts/audit/library-')),broken=join(root,'broken-take')
 await mkdir(broken);await writeFile(join(broken,'session.json'),'{ not valid json')
 const s=service()
 await s.setDirectory(root)
 await s.setDirectory(root)
 assert.equal(s.summaries().filter(t=>t.status==='unreadable').length,1)
})

test('an unknown unreadable identifier is still rejected',async()=>{
 const root=await mkdtemp(resolve('artifacts/audit/library-'))
 const s=service();await s.setDirectory(root)
 assert.throws(()=>s.folder('unreadable:'+join(root,'never-scanned')),/UNKNOWN_TAKE/)
})
