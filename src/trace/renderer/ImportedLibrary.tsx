import {ActionMenu} from './ActionMenu'
import {useState} from 'react'
import type {Command,TraceState} from '../shared'
import type {ImportView} from '../importService'
import {ExportItems} from './ExportPanel'
import {importProcessing} from './libraryModel'
import type {LibraryAction} from './RecordingDetails'

export function ImportedDetails({item,state,busy,run,act}:{item:ImportView;state:TraceState;busy:boolean;run:(name:Command,payload?:Record<string,unknown>)=>void;act:LibraryAction}){
 const [editing,setEditing]=useState(false),[name,setName]=useState(item.name)
 const active=importProcessing(item),locked=busy||Boolean(state.currentRecord)
 const exports=(state.exportJobs||[]).filter(e=>e.takeId===item.id)
 const exportRun=(command:Command,payload?:Record<string,unknown>)=>{
  if(command==='library.remove'&&payload?.exportId){void act('imports.removeExport',{assetId:item.id,exportId:payload.exportId});return}
  run(command,payload)
 }
 return <>
  <p className="settings-hint">{item.sourceName} · 外部原文件保持不变。</p>
  {item.format?.container==='adts'&&<p className="settings-hint">ADTS 使用实际解码长度，不推测原始编辑边界。</p>}
  {active&&<div className="import-progress"><progress max={1} value={item.phase==='queued'||item.phase==='hashing'?undefined:item.fraction}/><button onClick={()=>void act('imports.cancel',{assetId:item.id})}>取消准备</button></div>}
  <div className="version-actions"><button disabled={locked||item.status!=='ready'||active} onClick={()=>run('file.open',{takeId:item.id,role:'source'})}>查看分析</button>{item.status!=='ready'&&<button disabled={locked||active} data-import-prepare onClick={()=>void act(item.status==='missing'?'imports.relocate':'imports.prepare',item.status==='missing'?{assetId:item.id}:{assetId:item.id,acceptChanged:item.status==='changed'})}>{item.status==='missing'?'重新定位':item.status==='changed'?'更新素材':'准备素材'}</button>}</div>
  <ExportItems items={exports} takeId={item.id} jobs={state.analysisJobs||[]} disabled={locked} run={exportRun}/>
  {editing&&<form className="take-rename" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setEditing(false)}}} onSubmit={e=>{e.preventDefault();void act('imports.rename',{assetId:item.id,name}).then(ok=>{if(ok)setEditing(false)})}}><input autoFocus aria-label="素材名称" value={name} maxLength={120} onChange={e=>setName(e.target.value)}/><button disabled={locked}>保存名称</button><button type="button" onClick={()=>setEditing(false)}>取消</button></form>}
  <div className="take-actions"><ActionMenu label="外部素材管理" text="管理素材" items={[
   ...(item.status==='ready'?[{label:'重新准备',attributes:{'data-import-prepare':''},disabled:locked||active,onSelect:()=>void act('imports.prepare',{assetId:item.id,acceptChanged:false})}]:[]),
   ...(item.status!=='missing'?[{label:'重新定位',disabled:locked,onSelect:()=>void act('imports.relocate',{assetId:item.id})}]:[]),
   {label:'原文件位置',onSelect:()=>run('imports.openSource',{assetId:item.id})},
   {label:'重命名',disabled:locked,onSelect:()=>{setName(item.name);setEditing(true)}},
   {label:'清理缓存',disabled:locked,onSelect:()=>void act('imports.clearCache',{assetId:item.id})},
   {label:'移除引用（保留原文件和成品）',danger:true,disabled:locked,onSelect:()=>void act('imports.remove',{assetId:item.id})}
  ]}/></div>
 </>
}
