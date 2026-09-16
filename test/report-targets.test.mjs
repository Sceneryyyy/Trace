import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
await mkdir('artifacts/m11',{recursive:true})
for(const name of ['targetSettings','reportEvents','reportBuilder'])await build({entryPoints:['src/trace/'+name+'.ts'],outfile:'artifacts/m11/'+name+'.cjs',bundle:true,platform:'node',format:'cjs'})
const mod=async name=>(await import(pathToFileURL(resolve('artifacts/m11/'+name+'.cjs')))).default
const {targetPreset,validateTargetSettings,evaluateTargets,defaultTargetSettings:s}=await mod('targetSettings'),{ReportEvents}=await mod('reportEvents'),{csvText,htmlText}=await mod('reportBuilder')
const metric=(value,unit='LUFS',status='ready')=>({value:status==='ready'?value:null,unit,status})
test('versioned presets use current QC/live tolerances and cannot silently retain a changed preset name',()=>{
 assert.equal(targetPreset('ebu-qc-2023').integrated.tolerance,.2);assert.equal(targetPreset('ebu-live-2023').integrated.tolerance,1)
 assert.equal(targetPreset('ebu-qc-2023').lra,null)
 assert.throws(()=>validateTargetSettings({...targetPreset('ebu-qc-2023'),truePeakMax:0}),/MODIFIED_TARGET_PRESET/)
 for(const patch of [{truePeakMax:NaN},{integrated:{target:-23,tolerance:-1}},{lra:{min:20,max:10}},{path:'other'}])assert.throws(()=>validateTargetSettings({...s,...patch}))
})
test('raw boundary comparison, silence and incomplete measurements remain distinct',()=>{
 const target=targetPreset('ebu-qc-2023'),metrics={integrated:metric(-22.8),truePeak:metric(-1,'dBTP'),lra:metric(8,'LU'),momentaryMax:metric(-20),shortTermMax:metric(-22)}
 assert.equal(evaluateTargets(target,metrics,120).state,'pass')
 assert.equal(evaluateTargets(target,{...metrics,truePeak:metric(-.99999,'dBTP')},120).state,'fail')
 const silence={...metrics,integrated:metric(null,'LUFS','silence'),truePeak:metric(null,'dBTP','silence')},result=evaluateTargets(target,silence,120)
 assert.equal(result.checks[0].state,'fail');assert.equal(result.checks[1].state,'pass');assert.equal(result.checks[0].value,null)
 assert.equal(evaluateTargets(target,{...metrics,integrated:metric(null,'LUFS','gap')},120).state,'unavailable')
 const custom={...s,enabled:true,lra:{min:0,max:20}};assert.equal(evaluateTargets(custom,metrics,8).checks[2].state,'unavailable')
})
function row(start,end,{tp=-10,i=-23,flags=0,updated=true,status='ready'}={}){const channel={samplePeak:metric(-10,'dBFS'),rms:metric(-12,'dBFS'),truePeak:metric(tp,'dBTP',status)};return {startFrame:String(start),endFrame:String(end),flags,loudnessFlags:0,channels:[channel],momentary:metric(-20),shortTerm:metric(-22),integrated:metric(i),lra:metric(5,'LU'),maxTruePeak:metric(tp,'dBTP'),loudnessFrame:String(end),loudnessUpdated:updated}}
test('adjacent excursions merge, recoveries and gaps split them, and extrema keep full precision',()=>{
 const events=[],targets={...s,enabled:true,integrated:null,truePeakMax:-1},detector=new ReportEvents(targets,e=>events.push({...e}))
 detector.push(row(0,480,{tp:-.5}));detector.push(row(480,960,{tp:.123456}));detector.push(row(960,1440,{tp:-2}));detector.push(row(1440,1920,{tp:1,flags:4}));detector.push(row(1920,2400,{tp:-.8}));detector.finish()
 const tp=events.filter(e=>e.kind==='true-peak');assert.equal(tp.length,2);assert.deepEqual([tp[0].startFrame,tp[0].endFrame,tp[0].extreme,tp[0].samples],['0','960',.123456,2]);assert(events.some(e=>e.kind==='data-gap'))
})
test('a gap between loudness snapshots cannot be bridged by a prefix-I event',()=>{
 const events=[],detector=new ReportEvents({...s,enabled:true,truePeakMax:null},e=>events.push({...e}))
 detector.push(row(0,4800,{i:-20}));detector.push(row(4800,5280,{flags:4,updated:false}));detector.push(row(5280,9600,{i:-20}));detector.push(row(9600,14400,{i:-20}));detector.finish()
 const high=events.filter(e=>e.kind==='integrated-high');assert.equal(high.length,2);assert.equal(high[0].endFrame,'4800');assert.equal(high[1].startFrame,'9600');assert(events.some(e=>e.kind==='loudness-gap'))
})
test('metadata escaping protects HTML and spreadsheet text while preserving literal values',()=>{
 assert.equal(htmlText('<script>&"'), '&lt;script&gt;&amp;&quot;');assert.equal(csvText('=1+1'),'"\'=1+1"');assert.equal(csvText('normal, "name"'),'"normal, ""name"""')
})
