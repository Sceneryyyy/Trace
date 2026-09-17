import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,mkdtemp,readFile,writeFile,readdir,stat} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/public-beta',{recursive:true})
const modules={}
for(const name of ['supportJournal','supportReport','supportContent','contracts']){
 const file=resolve('artifacts/public-beta/'+name+'.cjs')
 await build({entryPoints:['src/trace/'+name+'.ts'],outfile:file,bundle:true,platform:'node',format:'cjs'})
 modules[name]=(await import(pathToFileURL(file))).default
}
const fresh=()=>mkdtemp(resolve('artifacts/public-beta/journal-'))
test('unclean runs and fatal markers survive restart; a clean run clears the warning',async()=>{
 const p=await fresh(),{SupportJournal}=modules.supportJournal
 const first=await SupportJournal.open(p);assert.equal(first.status.previousInterrupted,false)
 first.record('renderer-gone',123);await first.flush()
 const second=await SupportJournal.open(p);assert.equal(second.status.previousInterrupted,true)
 assert.equal(second.status.lastFault.kind,'renderer-gone');await second.finish()
 const third=await SupportJournal.open(p);assert.equal(third.status.previousInterrupted,false)
 await new Promise(r=>setTimeout(r,5));third.fatal('main-uncaught')
 const fourth=await SupportJournal.open(p);assert.equal(fourth.status.previousInterrupted,true)
 assert.equal(fourth.status.lastFault.kind,'main-uncaught');await fourth.finish()
})
test('journal bounds history and discards unknown/private fields from imported state',async()=>{
 const p=await fresh(),{SupportJournal}=modules.supportJournal
 await writeFile(join(p,'events.json'),JSON.stringify({schemaVersion:1,clean:true,events:[{at:new Date().toISOString(),kind:'renderer-gone',count:1,detail:5,path:'PRIVATE_AUDIO',stack:'PRIVATE_PATH'},{at:new Date().toISOString(),kind:'PRIVATE_NAME',count:1}]}))
 const j=await SupportJournal.open(p)
 for(let i=0;i<500;i++)j.record(i%2?'child-gone':'command-failed',i)
 await j.flush();assert.equal(j.history().length,128)
 assert((await stat(join(p,'events.json'))).size<65536)
 assert(!JSON.stringify(j.history()).includes('PRIVATE'))
 j.record('NOT_ALLOWED');assert.equal(j.history().length,128);await j.finish()
})
test('unwritable journal remains usable in memory and reports persistence failure',async()=>{
 const p=await fresh(),file=join(p,'not-a-directory');await writeFile(file,'keep')
 const j=await modules.supportJournal.SupportJournal.open(file);assert.equal(j.status.loggingAvailable,false)
 j.record('renderer-script');await j.flush();assert(j.history().length>=2)
 assert.equal(await readFile(file,'utf8'),'keep')
})
test('diagnostic export uses exclusive new folders and a fixed mail recipient',async()=>{
 const p=await fresh(),fn=modules.supportReport.exportSupportReport
 await writeFile(join(p,'keep.txt'),'original')
 const a=await fn(p,{schemaVersion:1,events:[]}),b=await fn(p,{schemaVersion:1,events:[]})
 assert.notEqual(a,b);assert.deepEqual((await readdir(a)).sort(),['diagnostics.json','feedback.txt'])
 assert.equal(await readFile(join(p,'keep.txt'),'utf8'),'original')
 const uri=modules.supportContent.feedbackMailto('0.1-test')
 assert(uri.startsWith('mailto:472841772@qq.com?subject='));assert(!uri.includes('attachment='))
 await assert.rejects(fn(p,{raw:'x'.repeat(600000)}),/DIAGNOSTICS_TOO_LARGE/)
})
test('support commands reject renderer paths, exception messages and arbitrary targets',()=>{
 const {validateRequest}=modules.contracts,r=(command,payload={})=>({protocolVersion:1,requestId:'support-test',expectedStateRevision:0,command,payload})
 for(const command of ['app.exportDiagnostics','app.feedback','app.reloadUI']){
  validateRequest(r(command));assert.throws(()=>validateRequest(r(command,{path:'private',url:'https://invalid'})))
 }
 validateRequest(r('app.rendererFault',{kind:'react'}))
 assert.throws(()=>validateRequest(r('app.rendererFault',{kind:'react',message:'private'})))
 assert.throws(()=>validateRequest(r('app.rendererFault',{kind:'PRIVATE'})))
})
