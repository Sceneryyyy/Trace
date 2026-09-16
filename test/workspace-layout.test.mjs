import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
await mkdir('artifacts/m7',{recursive:true})
for(const name of ['workspace','contracts'])await build({entryPoints:['src/trace/'+name+'.ts'],outfile:'artifacts/m7/'+name+'.cjs',platform:'node',format:'cjs',bundle:true})
const w=(await import(pathToFileURL(resolve('artifacts/m7/workspace.cjs')))).default
const {validateRequest}=(await import(pathToFileURL(resolve('artifacts/m7/contracts.cjs')))).default
test('old and malformed workspace settings fall back without mutating provided objects',()=>{
 assert.deepEqual(w.restoreWorkspace(undefined),w.defaultWorkspace())
 const bad={version:99,recordDirectory:'unrelated'};assert.deepEqual(w.restoreWorkspace(bad),w.defaultWorkspace());assert.equal(bad.recordDirectory,'unrelated')
 const invalid=[
  {...w.defaultWorkspace(),extra:1},
  {...w.defaultWorkspace(),layout:{...w.defaultWorkspace().layout,tree:'waveform'}},
  {...w.defaultWorkspace(),layout:{...w.defaultWorkspace().layout,hidden:['levels','levels']}},
  {...w.defaultWorkspace(),layout:{...w.defaultWorkspace().layout,options:{...w.defaultWorkspace().layout.options,loudness:'unknown'}}}
 ]
 for(const v of invalid)assert.throws(()=>w.validateWorkspace(v))
})
test('hide and restore every instrument retains its original tree and supports an empty workspace',()=>{
 let state=w.defaultWorkspace(),before=structuredClone(state)
 for(const i of w.instruments)if(!state.layout.hidden.includes(i.id))state=w.toggleInstrument(state,i.id)
 assert.equal(w.visibleTree(state.layout.tree,state.layout.hidden),null)
 assert.deepEqual(state.layout.tree,before.layout.tree)
 for(const i of w.instruments)if(!before.layout.hidden.includes(i.id))state=w.toggleInstrument(state,i.id)
 assert.deepEqual(state.layout.tree,before.layout.tree);assert.deepEqual(state.layout.hidden,before.layout.hidden)
 assert.deepEqual(w.defaultWorkspace(),before)
})
test('all docking directions preserve each instrument exactly once; hidden siblings keep resize paths valid',()=>{
 for(const source of w.instruments)for(const target of w.instruments)for(const side of ['left','right','top','bottom']){
  const before={...w.defaultWorkspace(),locked:false},next=w.dockInstrument(before,source.id,target.id,side)
  assert.doesNotThrow(()=>w.validateWorkspace(next))
  assert.equal(w.visibleTree(before.layout.tree,before.layout.hidden).first,'levels')
 }
 let s={...w.defaultWorkspace(),locked:false};s=w.toggleInstrument(s,'levels')
 s=w.resizeSplit(s,[0,0,1,0],.7);assert.equal(s.layout.tree.first.first.second.first.ratio,.7)
 assert.equal(w.resizeSplit(s,[0,0,1,0],100).layout.tree.first.first.second.first.ratio,.85)
 assert.throws(()=>w.resizeSplit(s,[9],.5))
 assert.deepEqual(w.dockInstrument(w.defaultWorkspace(),'levels','history','top'),w.defaultWorkspace())
})
test('user presets update rename delete independently and factory presets stay immutable',()=>{
 const base=w.defaultWorkspace(),saved=w.saveWorkspacePreset(base,'user-one','检查')
 let edited=w.toggleInstrument(saved,'history')
 edited=w.saveWorkspacePreset(edited,'user-one','检查')
 assert.equal(edited.presets.length,1);assert.deepEqual(edited.presets[0].layout.hidden,[...base.layout.hidden,'history'])
 const renamed=w.renameWorkspacePreset(edited,'user-one','自定义');assert.equal(renamed.presets[0].name,'自定义')
 const loaded=w.loadWorkspacePreset(w.loadWorkspacePreset(renamed,'metering'),'user-one');assert.deepEqual(loaded.layout.hidden,[...base.layout.hidden,'history'])
 assert.equal(w.deleteWorkspacePreset(loaded,'user-one').presets.length,0)
 assert.throws(()=>w.renameWorkspacePreset(saved,'recorder','覆盖'))
 assert.throws(()=>w.saveWorkspacePreset(saved,'user-two','检查'))
 assert.deepEqual(w.factoryLayouts[0].layout.hidden,['spectrum','soundfield'])
})
test('workspace IPC only accepts a bounded visual state; cannot smuggle audio or file commands',()=>{
 const r={protocolVersion:1,requestId:'layout',expectedStateRevision:0,command:'workspace.configure',payload:{workspace:w.defaultWorkspace()}}
 assert.equal(validateRequest(r).command,'workspace.configure')
 assert.throws(()=>validateRequest({...r,payload:{...r.payload,recordDirectory:'C:/other'}}))
 assert.throws(()=>validateRequest({...r,payload:{workspace:{...w.defaultWorkspace(),monitoringRequested:false}}}))
 let s=w.defaultWorkspace();for(let i=0;i<20;i++)s=w.saveWorkspacePreset(s,'user-'+i,'布局'+i)
 assert.throws(()=>w.saveWorkspacePreset(s,'user-extra','超额'))
})

test('version-one layouts migrate without losing user presets or changing the visible arrangement',()=>{
 const legacyTree={axis:'row',ratio:.2,first:'levels',second:{axis:'column',ratio:.7,first:'waveform',second:{axis:'row',ratio:.5,first:'history',second:'loudness'}}}
 const layout={tree:legacyTree,hidden:['levels'],options:{loudness:'compact',levelReadout:'rms',historyTraces:['s']}}
 const legacy={version:1,layout,presets:[{id:'user-old',name:'我的布局',layout}],activePreset:'user-old',locked:true}
 const upgraded=w.restoreWorkspace(legacy)
 assert.equal(upgraded.version,2);assert.equal(upgraded.presets[0].name,'我的布局');assert.equal(upgraded.activePreset,'user-old')
 assert.deepEqual(w.visibleTree(upgraded.layout.tree,upgraded.layout.hidden),w.visibleTree(legacyTree,['levels']))
 assert(upgraded.layout.hidden.includes('spectrum')&&upgraded.layout.hidden.includes('soundfield'))
 assert.equal(legacy.version,1)
})
