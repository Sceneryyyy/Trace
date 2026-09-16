export const instruments = [
  {id:'levels',title:'电平',unit:'dBFS',help:'各声道峰值与 RMS；TP 使用 dBTP。'},
  {id:'waveform',title:'波形',unit:'L / R',help:'拖动查看历史；Shift 拖动建立选区。滚轮调整倍率，Ctrl + 滚轮缩放时间。'},
  {id:'history',title:'响度历史',unit:'LUFS',help:'M、S、I 与波形共享时间范围和游标；线型用于区分曲线。'},
  {id:'loudness',title:'响度',unit:'LUFS',help:'I 的累计范围显示在读数旁；文件 LRA 和 MAX TP 为整段统计。'}
] as const
export type InstrumentId = typeof instruments[number]['id']
export type LayoutNode = InstrumentId | {axis:'row'|'column';ratio:number;first:LayoutNode;second:LayoutNode}
export type PanelOptions = {loudness:'auto'|'compact'|'meters';levelReadout:'both'|'peak'|'rms';historyTraces:('m'|'s'|'i')[]}
export type InstrumentLayout = {tree:LayoutNode;hidden:InstrumentId[];options:PanelOptions}
export type WorkspacePreset = {id:string;name:string;layout:InstrumentLayout}
export type WorkspaceState = {version:1;layout:InstrumentLayout;presets:WorkspacePreset[];activePreset:string|null;locked:boolean}
const ids=instruments.map(i=>i.id)
const options=():PanelOptions=>({loudness:'auto',levelReadout:'both',historyTraces:['m','s','i']})
export const factoryLayouts:WorkspacePreset[]=[
 {id:'recorder',name:'录音回看',layout:{tree:{axis:'row',ratio:.15,first:'levels',second:{axis:'row',ratio:.74,first:{axis:'column',ratio:.62,first:'waveform',second:'history'},second:'loudness'}},hidden:[],options:options()}},
 {id:'metering',name:'响度检查',layout:{tree:{axis:'row',ratio:.54,first:{axis:'column',ratio:.65,first:'loudness',second:'levels'},second:{axis:'column',ratio:.7,first:'history',second:'waveform'}},hidden:[],options:{...options(),loudness:'meters'}}}
]
const clone=<T,>(v:T):T=>structuredClone(v)
export function defaultWorkspace():WorkspaceState{return {version:1,layout:clone(factoryLayouts[0].layout),presets:[],activePreset:'recorder',locked:true}}
function object(v:unknown):v is Record<string,unknown>{return Boolean(v)&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)}
function keys(v:Record<string,unknown>,expected:string):void{if(Object.keys(v).sort().join(',')!==expected)throw Error('INVALID_WORKSPACE')}
export function validateLayout(value:unknown):InstrumentLayout{
 if(!object(value))throw Error('INVALID_WORKSPACE');keys(value,'hidden,options,tree')
 const leaves:string[]=[]
 function node(v:unknown,depth:number):void{
  if(depth>8)throw Error('INVALID_WORKSPACE')
  if(typeof v==='string'){if(!ids.includes(v as InstrumentId)||leaves.includes(v))throw Error('INVALID_WORKSPACE');leaves.push(v);return}
  if(!object(v))throw Error('INVALID_WORKSPACE');keys(v,'axis,first,ratio,second')
  if(!['row','column'].includes(v.axis as string)||typeof v.ratio!=='number'||!Number.isFinite(v.ratio)||v.ratio<.15||v.ratio>.85)throw Error('INVALID_WORKSPACE')
  node(v.first,depth+1);node(v.second,depth+1)
 }
 node(value.tree,0)
 if(leaves.length!==ids.length||!Array.isArray(value.hidden)||value.hidden.length>ids.length||new Set(value.hidden).size!==value.hidden.length||value.hidden.some(v=>!ids.includes(v)))throw Error('INVALID_WORKSPACE')
 const o=value.options
 if(!object(o))throw Error('INVALID_WORKSPACE');keys(o,'historyTraces,levelReadout,loudness')
 if(!['auto','compact','meters'].includes(o.loudness as string)||!['both','peak','rms'].includes(o.levelReadout as string)||!Array.isArray(o.historyTraces)||o.historyTraces.length>3||new Set(o.historyTraces).size!==o.historyTraces.length||o.historyTraces.some(v=>!['m','s','i'].includes(v)))throw Error('INVALID_WORKSPACE')
 return clone(value) as InstrumentLayout
}
export function validateWorkspace(value:unknown):WorkspaceState{
 if(!object(value))throw Error('INVALID_WORKSPACE');keys(value,'activePreset,layout,locked,presets,version')
 if(value.version!==1||typeof value.locked!=='boolean'||!Array.isArray(value.presets)||value.presets.length>20)throw Error('INVALID_WORKSPACE')
 const layout=validateLayout(value.layout),seen=new Set<string>(),names=new Set<string>()
 const presets=value.presets.map(p=>{
  if(!object(p))throw Error('INVALID_WORKSPACE');keys(p,'id,layout,name')
  if(typeof p.id!=='string'||!/^user-[a-zA-Z0-9-]{1,64}$/.test(p.id)||seen.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>40||/[\x00-\x1f]/.test(p.name)||names.has(p.name.trim().toLocaleLowerCase()))throw Error('INVALID_WORKSPACE')
  seen.add(p.id);names.add(p.name.trim().toLocaleLowerCase())
  return {id:p.id,name:p.name.trim(),layout:validateLayout(p.layout)}
 })
 if(value.activePreset!==null&&!(typeof value.activePreset==='string'&&[...factoryLayouts,...presets].some(p=>p.id===value.activePreset)))throw Error('INVALID_WORKSPACE')
 if(JSON.stringify(value).length>65536)throw Error('INVALID_WORKSPACE')
 return {version:1,layout,presets,activePreset:value.activePreset as string|null,locked:value.locked}
}
export function restoreWorkspace(value:unknown):WorkspaceState{try{return validateWorkspace(value)}catch{return defaultWorkspace()}}
export function visibleTree(tree:LayoutNode,hidden:InstrumentId[]):LayoutNode|null{
 if(typeof tree==='string')return hidden.includes(tree)?null:tree
 const first=visibleTree(tree.first,hidden),second=visibleTree(tree.second,hidden)
 return first&&second?{...tree,first,second}:first||second
}
export function toggleInstrument(state:WorkspaceState,id:InstrumentId):WorkspaceState{
 const next=clone(state),h=next.layout.hidden;next.layout.hidden=h.includes(id)?h.filter(v=>v!==id):[...h,id];next.activePreset=null;return validateWorkspace(next)
}
export function loadWorkspacePreset(state:WorkspaceState,id:string):WorkspaceState{
 const preset=[...factoryLayouts,...state.presets].find(p=>p.id===id);if(!preset)throw Error('UNKNOWN_LAYOUT')
 return {...state,layout:clone(preset.layout),activePreset:id}
}
export function saveWorkspacePreset(state:WorkspaceState,id:string,name:string):WorkspaceState{
 const preset={id,name,layout:clone(state.layout)},presets=state.presets.some(p=>p.id===id)?state.presets.map(p=>p.id===id?preset:p):[...state.presets,preset]
 return validateWorkspace({...state,presets,activePreset:id})
}
export function renameWorkspacePreset(state:WorkspaceState,id:string,name:string):WorkspaceState{
 if(!state.presets.some(p=>p.id===id))throw Error('READ_ONLY_LAYOUT')
 return validateWorkspace({...state,presets:state.presets.map(p=>p.id===id?{...p,name}:p)})
}
export function deleteWorkspacePreset(state:WorkspaceState,id:string):WorkspaceState{
 if(!state.presets.some(p=>p.id===id))throw Error('READ_ONLY_LAYOUT')
 return {...state,presets:state.presets.filter(p=>p.id!==id),activePreset:state.activePreset===id?null:state.activePreset}
}
export function dockInstrument(state:WorkspaceState,source:InstrumentId,target:InstrumentId,side:'left'|'right'|'top'|'bottom'):WorkspaceState{
 if(state.locked||source===target)return state
 function remove(n:LayoutNode):LayoutNode|null{if(typeof n==='string')return n===source?null:n;const a=remove(n.first),b=remove(n.second);return a&&b?{...n,first:a,second:b}:a||b}
 function insert(n:LayoutNode):LayoutNode{
  if(n===target){const before=side==='left'||side==='top';return {axis:side==='left'||side==='right'?'row':'column',ratio:.5,first:before?source:target,second:before?target:source}}
  return typeof n==='string'?n:{...n,first:insert(n.first),second:insert(n.second)}
 }
 const base=remove(state.layout.tree);if(!base)throw Error('INVALID_LAYOUT_TARGET')
 return validateWorkspace({...state,layout:{...state.layout,tree:insert(base)},activePreset:null})
}
export function resizeSplit(state:WorkspaceState,path:number[],ratio:number):WorkspaceState{
 if(state.locked)return state
 function change(n:LayoutNode,depth:number):LayoutNode{
  if(typeof n==='string')throw Error('INVALID_LAYOUT_TARGET')
  if(depth===path.length)return {...n,ratio:Math.max(.15,Math.min(.85,ratio))}
  if(path[depth]!==0&&path[depth]!==1)throw Error('INVALID_LAYOUT_TARGET')
  return path[depth]===0?{...n,first:change(n.first,depth+1)}:{...n,second:change(n.second,depth+1)}
 }
 return validateWorkspace({...state,layout:{...state.layout,tree:change(state.layout.tree,0)},activePreset:null})
}
