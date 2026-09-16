import {useState} from 'react'
import type {Command,TraceState} from '../shared'
import type {ExportSource} from '../exportTypes'
import {ExportItems} from './ExportPanel'
import {assetFormatLabel} from '../assetFormat'
import {timecode} from './time'
import {userError} from '../userErrors'
import './imports.css'
const processing=(phase?:string)=>Boolean(phase&&['queued','hashing','decoding','verifying'].includes(phase))
export function ImportedLibrary({state,busy,query,status,from,to,run,request,onExport}:{state:TraceState;busy:boolean;query:string;status:string;from:string;to:string;run:(name:Command,payload?:Record<string,unknown>)=>void;request:(name:Command,payload?:Record<string,unknown>)=>Promise<unknown>;onExport:(source:ExportSource)=>void}){
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(''),[name,setName]=useState(''),[limit,setLimit]=useState(50)
 const recording=Boolean(state.currentRecord),locked=busy||recording
 const items=(state.imports||[]).filter(a=>{const d=new Date(a.createdAt),day=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');return (a.name+' '+a.sourceName).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(!from||day>=from)&&(!to||day<=to)&&(status==='all'||status==='ready'&&a.status==='ready'||status==='processing'&&processing(a.phase)||status==='attention'&&['failed','changed','missing'].includes(a.status))})
 const act=async(command:Command,payload:Record<string,unknown>)=>{setError('');setNotice('');try{await request(command,payload);if(command==='imports.rename')setEditing('');if(command==='imports.remove')setNotice('已移除引用，外部原文件和生成的成品均保留。');if(command==='imports.clearCache')setNotice('缓存已清理，查看前请重新准备。')}catch(e){setError(userError(e))}}
 const exportRun=(command:Command,payload?:Record<string,unknown>)=>{if(command==='library.remove'&&payload?.exportId){void act('imports.removeExport',{assetId:payload.takeId,exportId:payload.exportId});return}run(command,payload)}
 return <section className="imports-section" aria-label="外部音频素材">
  <header><h3>外部素材 <small>{items.length}</small></h3><button onClick={()=>run('imports.openRoot')} title="包含当前素材及移除引用后保留的成品目录">打开素材目录</button></header>
  {!!state.importIssues?.length&&<p className="take-error" role="status">{state.importIssues.length} 条导入记录暂不可读取；文件已保留。</p>}
  {(error||notice)&&<p className={error?'take-error':'settings-hint'} role="status">{error||notice}</p>}
  {!items.length&&<p className="empty-recordings">{state.imports?.length?'没有匹配的外部素材。':'导入 WAV、MP3、M4A 或 AAC，或将文件拖入窗口。'}</p>}
  {items.slice(0,limit).map(item=>{const active=processing(item.phase),ready=item.status==='ready'&&!active,source:ExportSource={takeId:item.id,role:'source'},exports=(state.exportJobs||[]).filter(e=>e.takeId===item.id)
   const label=active?item.phase==='queued'?(recording?'等待录音结束':'等待准备'):item.phase==='hashing'?'读取文件':item.phase==='decoding'?'准备音频':'核对结果':item.status==='ready'?'可查看':item.status==='changed'?'原文件已变化':item.status==='missing'?'原文件已移动或删除':item.phase==='cancelled'?'已取消':item.status==='failed'?'准备失败':'需要准备'
   return <article className="take-row library-take imported-take" key={item.id} data-import-id={item.id}>
    <div className="take-header"><div className="take-identity"><strong>{item.name}</strong><span title={item.format?.container==='adts'?'ADTS 使用实际解码长度，不推测原始编辑边界。':item.sourceName}>{assetFormatLabel(item.format)||item.sourceName}{item.frames&&item.format?' · '+timecode(item.frames,item.format.sampleRate):''}</span><small>{label} · {new Date(item.createdAt).toLocaleString('zh-CN',{hour12:false})} 导入</small></div>
     {!active&&!ready&&<button className="primary-button" data-import-prepare disabled={locked} onClick={()=>void act(item.status==='missing'?'imports.relocate':'imports.prepare',item.status==='missing'?{assetId:item.id}:{assetId:item.id,acceptChanged:item.status==='changed'})}>{item.status==='missing'?'重新定位':item.status==='changed'?'更新素材':'准备素材'}</button>}<button data-import-open disabled={locked||!ready} onClick={()=>run('file.open',{...source})}>查看</button><button disabled={locked||!ready} onClick={()=>onExport(source)}>导出</button></div>
    {active&&<div className="import-progress"><progress max={1} value={item.phase==='queued'||item.phase==='hashing'?undefined:item.fraction}/><button onClick={()=>void act('imports.cancel',{assetId:item.id})}>取消准备</button></div>}
    {item.error&&<small className="take-error" title={item.error}>{userError(item.error)}</small>}
    <details className="take-details"><summary>文件与成品{exports.length?' · '+exports.length+' 个成品':''}</summary>
     <ExportItems items={exports} takeId={item.id} jobs={state.analysisJobs||[]} disabled={locked} run={exportRun}/>
     {editing===item.id&&<form className="take-rename" onSubmit={e=>{e.preventDefault();void act('imports.rename',{assetId:item.id,name})}}><input aria-label="素材名称" autoFocus value={name} maxLength={120} onChange={e=>setName(e.target.value)}/><button disabled={busy}>保存名称</button><button type="button" onClick={()=>setEditing('')}>取消</button></form>}
     <div className="take-actions"><button disabled={locked||active} onClick={()=>void act('imports.prepare',{assetId:item.id,acceptChanged:item.status==='changed'})}>{item.status==='changed'?'更新素材':ready?'重新准备':'准备素材'}</button><button disabled={locked} onClick={()=>void act('imports.relocate',{assetId:item.id})}>重新定位</button><button onClick={()=>run('imports.openSource',{assetId:item.id})}>原文件位置</button><button disabled={busy} onClick={()=>{setEditing(item.id);setName(item.name)}}>重命名</button><button disabled={locked} onClick={()=>void act('imports.clearCache',{assetId:item.id})}>清理缓存</button><button disabled={locked} title="仅移除引用和可重建缓存；外部原文件与生成的成品保留。" onClick={()=>void act('imports.remove',{assetId:item.id})}>移除引用</button></div>
    </details>
   </article>
  })}
  {items.length>limit&&<button onClick={()=>setLimit(limit+50)}>显示更多素材</button>}
 </section>
}
