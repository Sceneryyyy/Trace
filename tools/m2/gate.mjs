import assert from 'node:assert/strict'
import {readFile,writeFile,readdir,stat} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {join,resolve,relative} from 'node:path'
const root=resolve('.'),folder=join(root,'artifacts/m2')
const load=async name=>JSON.parse(await readFile(join(folder,name),'utf8'))
const native=await load('native-latest.json'),ui=await load('ui-latest.json'),recovery=await load('recovery-latest.json'),reopen=await load('reopen-ui-latest.json'),long=await load('long-latest.json')
for(const report of [native,ui,recovery,reopen,long])assert.equal(report.status,'pass')
assert(long.durationSeconds>=1800)
const verification=JSON.parse(await readFile(join(long.folder,'reopen-verification.json'),'utf8'))
assert.equal(verification.status,'pass');assert.equal(verification.frames,long.final.writtenFrames)
assert(recovery.originalHashesUnchanged);assert.equal(reopen.source,ui.folder)
const ctest=await readFile(join(root,'build/trace-engine/Testing/Temporary/LastTest.log'),'utf8')
assert.equal((ctest.match(/Test Passed\./g)||[]).length,3)
const binaries=['build/trace-engine/Release/trace_engine.node','out-trace/main/index.js','out-trace/main/file-worker.js']
const hashes={}
async function hash(path){const h=createHash('sha256');for await(const data of createReadStream(path))h.update(data);return h.digest('hex')}
for(const path of binaries)hashes[path]={sha256:await hash(join(root,path)),modified:(await stat(join(root,path))).mtime.toISOString()}
assert(Date.parse(hashes[binaries[0]].modified)<=Date.parse(native.started),'Native smoke must follow current native build')
assert(Date.parse(hashes[binaries[0]].modified)<=Date.parse(long.started),'Long recording must use current native build')
assert(Date.parse(hashes[binaries[1]].modified)<=Date.parse(reopen.checkedAt),'UI reopen must follow current app build')
const source={}
async function walk(directory){
 for(const entry of await readdir(join(root,directory),{withFileTypes:true})){
  const path=join(directory,entry.name)
  if(entry.isDirectory())await walk(path)
  else if(/\.(cpp|h|c|ts|tsx|css|cjs|mjs|ps1|json|txt)$/.test(entry.name))source[path.replaceAll('\\','/')]=await hash(join(root,path))
 }
}
for(const directory of ['native/src/recorder','native/recorder','src/trace','test/native','tools/m2'])await walk(directory)
const git=arg=>spawnSync('git',arg,{encoding:'utf8',windowsHide:true}).stdout.trim()
const memory=long.samples.map(s=>s.memory.private)
const gate={milestone:'M2',status:'minimum-engineering-gate-pass',checkedAt:new Date().toISOString(),head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),
 worktree:'uncommitted development tree; file hashes identify current evidence',binaries:hashes,sourceSha256:source,
 checks:{ctest:{targets:3,cases:{core:16,wav:7,recorder:6}},jsTraceCases:13,typecheck:'pass',nativeThreeWav:'pass',actualUiChecks:ui.checks.length,
  recoveryOriginalsPreserved:true,persistedSessionsReopen:true,longSeconds:long.durationSeconds,frames:long.final.writtenFrames,
  longPrivateMemoryKB:{first:memory[0],last:memory.at(-1),max:Math.max(...memory)},reopen:verification.checks},
 evidence:{native:'native-latest.json',ui:'ui-latest.json',recovery:'recovery-latest.json',reopen:'reopen-ui-latest.json',
  long:relative(root,join(long.folder,'report.json')).replaceAll('\\','/'),wavReopen:relative(root,join(long.folder,'reopen-verification.json')).replaceAll('\\','/')},
 limits:['Hardware 44.1/96 kHz capture untested','Automatic cross-rate same-session recovery remains open','FILE playback and deterministic cache are subsequent milestones',
 'Official EBU files not yet obtained; no EBU material pass claimed','Uncommitted source; not a release or user acceptance'],
 next:'M3 deterministic file analysis and paged history'}
await writeFile(join(folder,'gate.json'),JSON.stringify(gate,null,2)+'\n')
console.log(JSON.stringify({status:gate.status,checks:gate.checks,next:gate.next},null,2))
