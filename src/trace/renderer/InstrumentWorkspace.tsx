import {useEffect,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {defaultWorkspace,instruments,factoryLayouts,visibleTree,toggleInstrument,loadWorkspacePreset,saveWorkspacePreset,renameWorkspacePreset,deleteWorkspacePreset,dockInstrument,resizeSplit,type WorkspaceState,type InstrumentId,type LayoutNode,type PanelOptions} from '../workspace'

export function useWorkspace(server:WorkspaceState|undefined,save:(state:WorkspaceState)=>Promise<unknown>){
 const [value,setValue]=useState(()=>server||defaultWorkspace()),[error,setError]=useState('')
 const latest=useRef(value),pending=useRef<WorkspaceState|null>(null),running=useRef(false),saveRef=useRef(save)
 saveRef.current=save
 useEffect(()=>{if(server&&!pending.current&&!running.current){latest.current=server;setValue(server)}},[server])
 async function flush(){
  if(running.current)return
  running.current=true
  try{while(pending.current){const next=pending.current;pending.current=null;await saveRef.current(next)}setError('')}
  catch(e){setError('布局未保存，请重试。');pending.current=latest.current}
  finally{running.current=false}
 }
 function change(next:WorkspaceState){latest.current=next;setValue(next);pending.current=next;queueMicrotask(()=>void flush())}
 useEffect(()=>()=>{void flush()},[])
 return {value,change,error,retry:()=>void flush()}
}
export function InstrumentIcon({kind}:{kind:'settings'|'maximize'|'restore'|'hide'|'edit'|'lock'|'layout'}){
 return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {kind==='settings'?<><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></>:
   kind==='maximize'?<><path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4"/></>:
   kind==='restore'?<><path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/></>:
   kind==='hide'?<path d="m6 6 12 12M18 6 6 18"/>:
   kind==='lock'?<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></>:
   kind==='edit'?<><path d="m5 15 10-10 4 4L9 19l-5 1Z"/><path d="m13 7 4 4"/></>:
   <><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M9 4v16M9 13h12"/></>}
 </svg>
}
type Controls={value:WorkspaceState;change:(value:WorkspaceState)=>void}
export function WorkspaceToolbar({value,change,error,retry}:{error:string;retry:()=>void}&Controls){
 const [menu,setMenu]=useState<'instruments'|'presets'|null>(null),[name,setName]=useState(''),[managedId,setManagedId]=useState(''),[message,setMessage]=useState('')
 const container=useRef<HTMLDivElement>(null)
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(container.current&&!container.current.contains(e.target as Node))setMenu(null)};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[])
 function action(fn:()=>WorkspaceState){try{change(fn());setMessage('')}catch(e){setMessage(String(e).includes('READ_ONLY')?'内置布局保留为只读。':'名称不能重复，最多 40 字；最多保存 20 个布局。')}}
 const custom=value.presets.find(p=>p.id===managedId)
 return <div className="workspace-toolbar" ref={container} onKeyDown={e=>{if(e.key==='Escape'){setMenu(null);e.stopPropagation()}else if(e.key===' '&&(e.target as HTMLElement).closest('button,input,select'))e.stopPropagation()}}>
  <button className="instrument-chooser" aria-expanded={menu==='instruments'} onClick={()=>setMenu(menu==='instruments'?null:'instruments')}><InstrumentIcon kind="layout"/>仪器</button>
  <select aria-label="工作台布局" value={value.activePreset||''} onChange={e=>{if(e.target.value){change(loadWorkspacePreset(value,e.target.value));setMenu(null)}}}>
   <option value="" disabled>自定义 · 未保存</option>
   {[...factoryLayouts,...value.presets].map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
  <button className="manage-layouts" aria-label="管理布局" title="保存与管理布局" onClick={()=>{setMenu(menu==='presets'?null:'presets');const selected=value.presets.find(p=>p.id===value.activePreset)||value.presets[0];setManagedId(selected?.id||'');setName(selected?.name||'');setMessage('')}}><InstrumentIcon kind="settings"/></button>
  <button className="edit-layout" aria-pressed={!value.locked} title={value.locked?'编辑布局：拖动标题停靠，拖动分隔线调整尺寸':'锁定布局'} onClick={()=>change({...value,locked:!value.locked})}><InstrumentIcon kind={value.locked?'lock':'edit'}/>{value.locked?'已锁定':'编辑布局'}</button>
  {error&&<button className="layout-save-error" onClick={retry} title={error}>重试保存</button>}
  {menu==='instruments'&&<div className="workspace-popover" role="group" aria-label="显示仪器">
   {instruments.map(i=><label key={i.id}><input type="checkbox" checked={!value.layout.hidden.includes(i.id)} onChange={()=>change(toggleInstrument(value,i.id))}/><span>{i.title}</span><small>{i.unit}</small></label>)}
   <button onClick={()=>{change({...value,layout:{...value.layout,hidden:[]},activePreset:null});setMenu(null)}}>显示全部</button>
  </div>}
  {menu==='presets'&&<div className="workspace-popover layout-presets" role="dialog" aria-label="管理布局">
   {value.presets.length>0&&<label>已保存布局<select aria-label="已保存布局" value={managedId} onChange={e=>{setManagedId(e.target.value);setName(value.presets.find(p=>p.id===e.target.value)?.name||'')}}><option value="">选择布局</option>{value.presets.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>}
   <label>布局名称<input aria-label="布局名称" value={name} maxLength={40} onChange={e=>setName(e.target.value)}/></label>
   <div className="layout-actions">
    <button disabled={!name.trim()||value.presets.length>=20} onClick={()=>action(()=>saveWorkspacePreset(value,'user-'+crypto.randomUUID(),name))}>另存新布局</button>
    <button disabled={!custom} onClick={()=>action(()=>saveWorkspacePreset(value,custom!.id,custom!.name))}>更新布局</button>
    <button disabled={!custom||!name.trim()} onClick={()=>action(()=>renameWorkspacePreset(value,custom!.id,name))}>重命名</button>
    <button disabled={!custom} onClick={()=>action(()=>deleteWorkspacePreset(value,custom!.id))}>删除布局</button>
   </div>
   <button onClick={()=>{change({...value,layout:defaultWorkspace().layout,activePreset:'recorder',locked:true});setMenu(null)}}>恢复默认布局</button>
   {message&&<p role="status">{message}</p>}
  </div>}
 </div>
}
type Side='left'|'right'|'top'|'bottom'
function minimum(node:LayoutNode):{w:number;h:number}{if(typeof node==='string')return node==='comparison'?{w:360,h:280}:node==='spectrogram'?{w:300,h:230}:node==='spectrum'?{w:300,h:200}:node==='soundfield'?{w:230,h:200}:node==='levels'?{w:130,h:160}:node==='loudness'?{w:190,h:220}:node==='waveform'?{w:280,h:180}:{w:280,h:140};const a=minimum(node.first),b=minimum(node.second);return node.axis==='row'?{w:a.w+b.w+7,h:Math.max(a.h,b.h)}:{w:Math.max(a.w,b.w),h:a.h+b.h+7}}
function dropSide(e:React.DragEvent):Side{const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;return Math.min(x,1-x)<Math.min(y,1-y)?x<.5?'left':'right':y<.5?'top':'bottom'}
function Splitter({node,path,value,change}:{node:Exclude<LayoutNode,string>;path:number[]}&Controls){
 const drag=useRef<{rect:DOMRect;pointer:number;ratio:number}|null>(null)
 function display(e:React.PointerEvent,ratio:number){const host=e.currentTarget.parentElement!;const a=minimum(visibleTree(node.first,value.layout.hidden)!),b=minimum(visibleTree(node.second,value.layout.hidden)!);const tracks='minmax('+(node.axis==='row'?a.w:a.h)+'px,'+(ratio*100)+'fr) 7px minmax('+(node.axis==='row'?b.w:b.h)+'px,'+((1-ratio)*100)+'fr)';if(node.axis==='row')host.style.gridTemplateColumns=tracks;else host.style.gridTemplateRows=tracks}
 function move(e:React.PointerEvent){if(!drag.current||value.locked)return;const r=drag.current.rect;const ratio=Math.max(.15,Math.min(.85,node.axis==='row'?(e.clientX-r.left)/r.width:(e.clientY-r.top)/r.height));drag.current.ratio=ratio;display(e,ratio)}
 return <div className={'instrument-divider '+node.axis} role="separator" tabIndex={value.locked?-1:0} aria-label={node.axis==='row'?'调整左右面板比例':'调整上下仪器比例'} aria-orientation={node.axis==='row'?'vertical':'horizontal'} aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(node.ratio*100)}
  onPointerDown={e=>{if(value.locked||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={rect:e.currentTarget.parentElement!.getBoundingClientRect(),pointer:e.pointerId,ratio:node.ratio}}}
  onPointerMove={move} onPointerUp={e=>{if(drag.current){move(e);change(resizeSplit(value,path,drag.current.ratio));drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId)}}} onPointerCancel={e=>{display(e,node.ratio);drag.current=null}}
  onKeyDown={e=>{if(value.locked)return;const minus=node.axis==='row'?'ArrowLeft':'ArrowUp',plus=node.axis==='row'?'ArrowRight':'ArrowDown';if(![minus,plus,'Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();change(resizeSplit(value,path,e.key==='Home'?.15:e.key==='End'?.85:node.ratio+(e.key===minus?-1:1)*(e.shiftKey?.05:.02)))}}/>
}
export function InstrumentWorkspace({value,change,contents,settingsContent}:{contents:Record<InstrumentId,ReactNode>;settingsContent?:Partial<Record<InstrumentId,ReactNode>>}&Controls){
 const focusOrigin=useRef<HTMLElement|null>(null)
 const [maximized,setMaximized]=useState<InstrumentId|null>(null),[settings,setSettings]=useState<InstrumentId|null>(null),[drop,setDrop]=useState<{id:InstrumentId;side:Side}|null>(null),[target,setTarget]=useState<InstrumentId>('waveform')
 useEffect(()=>{if(settings)return()=>{if(focusOrigin.current?.isConnected)focusOrigin.current.focus()}},[settings])
 useEffect(()=>{if(maximized&&value.layout.hidden.includes(maximized))setMaximized(null)},[value.layout.hidden,maximized])
 function option<K extends keyof PanelOptions>(key:K,v:PanelOptions[K]){change({...value,layout:{...value.layout,options:{...value.layout.options,[key]:v}}})}
 function panel(id:InstrumentId){
  const info=instruments.find(i=>i.id===id)!
  return <section key={id} className={'instrument-panel '+(drop?.id===id?'dock-'+drop.side:'')} data-instrument={id} data-layout-editing={!value.locked} aria-label={info.title+'仪器'}
   onDragOver={e=>{if(value.locked||!e.dataTransfer.types.includes('application/x-trace-instrument'))return;e.preventDefault();e.stopPropagation();setDrop({id,side:dropSide(e)})}}
   onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDrop(null)}}
   onDrop={e=>{e.preventDefault();e.stopPropagation();const source=e.dataTransfer.getData('application/x-trace-instrument') as InstrumentId;if(instruments.some(i=>i.id===source))change(dockInstrument(value,source,id,dropSide(e)));setDrop(null)}}>
   <header className="instrument-heading" onKeyDown={e=>{if(e.key===' '&&(e.target as HTMLElement).closest('button'))e.stopPropagation()}} draggable={!value.locked&&!maximized}
    onDragStart={e=>{if((e.target as Element).closest('button')){e.preventDefault();return}e.dataTransfer.setData('application/x-trace-instrument',id);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>setDrop(null)}>
    <h2>{info.title}<small>{info.unit}</small></h2>
    {id==='history'&&<div className="legend">{value.layout.options.historyTraces.map(k=><span key={k} className={'legend-'+k}>{k.toUpperCase()}</span>)}</div>}
    <div>
     <button aria-label={info.title+'设置'} title={info.title+'设置与说明'} onClick={()=>{focusOrigin.current=document.activeElement as HTMLElement;setSettings(id);setTarget(instruments.find(i=>i.id!==id)!.id)}}><InstrumentIcon kind="settings"/></button>
     <button aria-label={maximized===id?'恢复'+info.title:'最大化'+info.title} title={maximized===id?'恢复布局':'最大化仪器'} onClick={()=>setMaximized(maximized===id?null:id)}><InstrumentIcon kind={maximized===id?'restore':'maximize'}/></button>
     <button aria-label={'隐藏'+info.title} title={'隐藏'+info.title} onClick={()=>change(toggleInstrument(value,id))}><InstrumentIcon kind="hide"/></button>
    </div>
   </header>
   <div className="instrument-content" data-loudness-mode={value.layout.options.loudness} data-level-readout={value.layout.options.levelReadout}>{contents[id]}</div>
  </section>
 }
 function tree(node:LayoutNode,path:number[]=[]):ReactNode{
  if(typeof node==='string')return value.layout.hidden.includes(node)?null:panel(node)
  const a=visibleTree(node.first,value.layout.hidden),b=visibleTree(node.second,value.layout.hidden)
  if(!a)return tree(node.second,[...path,1]);if(!b)return tree(node.first,[...path,0])
  const ma=minimum(a),mb=minimum(b),size=minimum(visibleTree(node,value.layout.hidden)!)
  return <div className={'instrument-split '+node.axis} style={node.axis==='row'?{minWidth:size.w,minHeight:size.h,gridTemplateColumns:`minmax(${ma.w}px,${node.ratio*100}fr) 7px minmax(${mb.w}px,${(1-node.ratio)*100}fr)`}:{minWidth:size.w,minHeight:size.h,gridTemplateRows:`minmax(${ma.h}px,${node.ratio*100}fr) 7px minmax(${mb.h}px,${(1-node.ratio)*100}fr)`}}>
    {tree(node.first,[...path,0])}<Splitter node={node} path={path} value={value} change={change}/>{tree(node.second,[...path,1])}
   </div>
 }
 const selected=instruments.find(i=>i.id===settings)
 return <>
  <div className={'instrument-workspace '+(!value.locked?'editing':'')} data-workspace-layout={value.activePreset||'custom'}>
   {maximized?panel(maximized):visibleTree(value.layout.tree,value.layout.hidden)?tree(value.layout.tree):<div className="empty-workspace"><InstrumentIcon kind="layout"/><p>选择需要显示的仪器</p><button onClick={()=>change({...value,layout:{...value.layout,hidden:[]}})}>显示全部仪器</button></div>}
  </div>
  {selected&&createPortal(<div className="modal-backdrop instrument-modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setSettings(null)}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')setSettings(null);if(e.key==='Tab'){const items=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')],first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}}>
   <section className="trace-modal instrument-settings" role="dialog" aria-modal="true" aria-label={selected.title+'设置'}>
    <header><h2>{selected.title}设置</h2><button autoFocus aria-label="关闭仪器设置" onClick={()=>setSettings(null)}>×</button></header>
    <div className="settings-content"><p>{selected.help}</p>{settingsContent?.[selected.id]}
     {settings==='loudness'&&<label>显示方式<select aria-label="响度显示方式" value={value.layout.options.loudness} onChange={e=>option('loudness',e.target.value as PanelOptions['loudness'])}><option value="auto">随面板尺寸</option><option value="compact">紧凑数字</option><option value="meters">数字与柱表</option></select></label>}
     {settings==='levels'&&<label>电平读数<select aria-label="电平读数" value={value.layout.options.levelReadout} onChange={e=>option('levelReadout',e.target.value as PanelOptions['levelReadout'])}><option value="both">Peak / RMS</option><option value="peak">Peak</option><option value="rms">RMS</option></select></label>}
     {settings==='history'&&(['m','s','i'] as const).map(k=><label key={k}>{k.toUpperCase()} 曲线<input type="checkbox" checked={value.layout.options.historyTraces.includes(k)} onChange={()=>option('historyTraces',value.layout.options.historyTraces.includes(k)?value.layout.options.historyTraces.filter(v=>v!==k):[...value.layout.options.historyTraces,k])}/></label>)}
     {settings==='waveform'&&<p>显示倍率和时间窗位于波形上方。波形与响度历史保持相同的时间范围。</p>}
     {!value.locked&&<fieldset><legend>移动仪器</legend><label>相对于<select aria-label="停靠目标" value={target} onChange={e=>setTarget(e.target.value as InstrumentId)}>{instruments.filter(i=>i.id!==settings).map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select></label><div className="layout-actions">{(['left','right','top','bottom'] as const).map((side,n)=><button key={side} onClick={()=>{change(dockInstrument(value,settings!,target,side));setSettings(null)}}>{['左侧','右侧','上方','下方'][n]}</button>)}</div></fieldset>}
    </div>
   </section>
  </div>,document.body)}
 </>
}
