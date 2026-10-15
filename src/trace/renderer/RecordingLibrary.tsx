import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react'
import {ImportedDetails} from './ImportedLibrary'
import {RecordingDetails} from './RecordingDetails'
import {timecodeNs} from './time'
import {TransportIcon} from './FileControls'
import {exportLabel} from './ExportPanel'
import {userError} from '../userErrors'
import type {ExportSource} from '../exportTypes'
import type {LibraryUsage} from '../libraryStorage'
import type {Command,TraceState} from '../shared'
import {formatBytes} from './formatting'
import {filterLibrary,importedRow,libraryPageSize,libraryDuration,recordingRow,rowWarning,type LibraryCategory,type LibraryFilter,type LibraryRow,type LibrarySort} from './libraryModel'
import './library.css'
export {preferredSource} from './libraryModel'

type Props={state:TraceState;busy:boolean;visible:boolean;attentionRequest:number;pending:boolean;playbackError:string;dismissError:()=>void;run:(name:Command,payload?:Record<string,unknown>)=>void;request:(name:Command,payload?:Record<string,unknown>)=>Promise<unknown>;onOpen:(source:ExportSource,play:boolean)=>void;onExport:(source:ExportSource)=>void}
const defaults:LibraryFilter={query:'',status:'all',from:'',to:'',sort:'newest'}
export function RecordingLibrary({state,busy,visible,attentionRequest,pending,playbackError,dismissError,run,request,onOpen,onExport}:Props):React.JSX.Element{
 const [filter,setFilter]=useState(defaults),[category,setCategory]=useState<LibraryCategory>('recordings')
 const [selected,setSelected]=useState({recordings:'',imports:''}),[pages,setPages]=useState({recordings:0,imports:0})
 const [details,setDetails]=useState(false),[management,setManagement]=useState(false)
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[usage,setUsage]=useState<LibraryUsage|null>(null),[scanning,setScanning]=useState(false)
 const [menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null),[focusId,setFocusId]=useState('')
 const list=useRef<HTMLDivElement>(null),scroll=useRef({recordings:0,imports:0}),scanEpoch=useRef(0)
 const recording=Boolean(state.currentRecord),locked=busy||recording
 const rows=useMemo(()=>category==='recordings'?(state.recordings||[]).map(recordingRow):(state.imports||[]).map(item=>importedRow(item,recording)),[category,state.recordings,state.imports,recording])
 const filtered=useMemo(()=>filterLibrary(rows,filter),[rows,filter])
 const page=Math.min(pages[category],Math.max(0,Math.ceil(filtered.length/libraryPageSize)-1)),start=page*libraryPageSize
 const displayed=filtered.slice(start,start+libraryPageSize)
 const chosen=rows.find(row=>row.id===selected[category]),menuRow=rows.find(row=>row.id===menu?.id)
 const current=state.playback&&!state.playback.temporary?state.playback:undefined
 const playing=Boolean(current?.outputReady&&!['ended','failed','paused'].includes(current.phase))
 const updateFilter=(patch:Partial<LibraryFilter>)=>{setFilter(previous=>({...previous,...patch}));setPages({recordings:0,imports:0});scroll.current={recordings:0,imports:0};setMenu(null)}
 const resetFilters=()=>updateFilter({query:'',status:'all',from:'',to:''})
 const hasFilters=Boolean(filter.query||filter.from||filter.to||filter.status!=='all')
 useEffect(()=>{if(attentionRequest){setFilter({...defaults,status:'attention'});setPages({recordings:0,imports:0});setCategory('recordings');scroll.current={recordings:0,imports:0}}},[attentionRequest])
 useEffect(()=>{setSelected(previous=>({...previous,recordings:''}));setPages(previous=>({...previous,recordings:0}));scroll.current.recordings=0;setUsage(null);setMenu(null);scanEpoch.current++},[state.recordDirectory])
 useLayoutEffect(()=>{if(visible&&list.current)list.current.scrollTop=scroll.current[category]},[visible,category,page,filter])
 useEffect(()=>{if(!visible)setMenu(null)},[visible])
 useEffect(()=>{if(!focusId||!visible)return;const node=Array.from(list.current?.querySelectorAll<HTMLElement>('[data-library-row]')||[]).find(n=>n.dataset.libraryRow===focusId);if(node){node.focus();node.scrollIntoView({block:'nearest'});setFocusId('')}},[focusId,visible,page,displayed])
 useEffect(()=>{if(!menu)return;const close=(event:MouseEvent)=>{if(!(event.target as HTMLElement).closest('.library-context,[data-row-more]'))setMenu(null)};document.addEventListener('pointerdown',close);document.querySelector<HTMLElement>('.library-context button:not(:disabled)')?.focus();return()=>document.removeEventListener('pointerdown',close)},[menu])
 const refreshUsage=async()=>{const epoch=++scanEpoch.current;setScanning(true);try{const result=await request('library.storage') as LibraryUsage;if(epoch===scanEpoch.current)setUsage(result)}catch(error){if(epoch===scanEpoch.current)setError(userError(error))}finally{if(epoch===scanEpoch.current)setScanning(false)}}
 useEffect(()=>{if(visible&&management)void refreshUsage();return()=>{scanEpoch.current++;setScanning(false)}},[visible,management,state.recordDirectory])
 const act=async(command:Command,payload:Record<string,unknown>={})=>{
  setError('');setNotice('')
  try{
   const data=await request(command,payload) as {accepted?:Array<{id:string}>;errors?:Array<{name:string;message:string}>;removed?:number;freedBytes?:string;protectedExports?:number}|null
   if(data?.accepted)setNotice(data.accepted.length?'已加入 '+data.accepted.length+' 个素材，准备完成后可查看。':'未添加素材。')
   if(data?.errors?.length)setError(data.errors.map(e=>e.name+'：'+userError(e.message)).join('；'))
   if(data?.removed!==undefined)setNotice(data.removed?'已清理 '+data.removed+' 条失效记录':'没有可清理的失效记录；不完整录音仍保留。')
   if(data?.freedBytes!==undefined)setNotice('已清理 '+formatBytes(data.freedBytes)+' 缓存'+(data.protectedExports?'；'+data.protectedExports+' 个成品缺失或变化，已保留对应解码音频。':''))
   if(command==='imports.remove')setNotice('已移除引用，外部原文件和生成的成品均保留。')
   if(command==='imports.clearCache')setNotice('缓存已清理，查看前请重新准备。')
   if(management&&command!=='library.rename'&&command!=='imports.rename')void refreshUsage()
   return true
  }catch(error){setError(userError(error));return false}
 }
 const select=(row:LibraryRow)=>setSelected(previous=>({...previous,[category]:row.id}))
 const sourceFor=(row:LibraryRow):ExportSource|undefined=>current?.takeId===row.id?{takeId:current.takeId,role:current.role,...(current.regionId?{regionId:current.regionId}:{}),...(current.exportId?{exportId:current.exportId}:{})}:row.source
 const open=(row:LibraryRow,play:boolean)=>{if(!row.ready||!row.source||recording||(busy&&!pending))return;select(row);setMenu(null);onOpen(sourceFor(row)!,play)}
 const pageTo=(next:number)=>{scroll.current[category]=0;setPages(previous=>({...previous,[category]:next}));setMenu(null)}
 const locate=()=>{
  if(!current)return
  const kind:LibraryCategory=state.imports?.some(a=>a.id===current.takeId)?'imports':'recordings'
  const all=kind==='recordings'?(state.recordings||[]).map(recordingRow):(state.imports||[]).map(item=>importedRow(item,recording))
  const matches=filterLibrary(all,filter),index=matches.findIndex(row=>row.id===current.takeId)
  const next=index<0?filterLibrary(all,{...filter,query:'',status:'all',from:'',to:''}):matches
  const target=next.findIndex(row=>row.id===current.takeId)
  if(target<0){setNotice('当前文件已不在列表中，请刷新检查。');return}
  if(index<0){resetFilters();setNotice('当前文件被筛选隐藏，已清除筛选并定位。')}
  setCategory(kind);setPages(previous=>({...previous,[kind]:Math.floor(target/libraryPageSize)}));setSelected(previous=>({...previous,[kind]:current.takeId}));setFocusId(current.takeId)
 }
 const detailRun=(command:Command,payload?:Record<string,unknown>)=>{if(command==='file.open'&&payload){onOpen(payload as ExportSource,false);return}run(command,payload)}
 const closeMenu=(focus=true)=>{if(focus){const button=Array.from(list.current?.querySelectorAll<HTMLElement>('[data-row-more]')||[]).find(n=>n.dataset.rowMore===menu?.id);button?.focus()}setMenu(null)}
 return <div className="recording-library">
  <div className="library-categories" role="group" aria-label="音频类别"><button aria-pressed={category==='recordings'} onClick={()=>{setCategory('recordings');setMenu(null)}}>录音 <span>{state.recordings?.length||0}</span></button><button aria-pressed={category==='imports'} onClick={()=>{setCategory('imports');setMenu(null)}}>外部素材 <span>{state.imports?.length||0}</span></button><button className="library-import" onClick={()=>void act('imports.choose')}>导入</button></div>
  <div className="library-search"><input aria-label="搜索音频文件" placeholder="搜索名称" value={filter.query} onChange={e=>updateFilter({query:e.target.value})}/><select aria-label="音频排序" value={filter.sort} onChange={e=>updateFilter({sort:e.target.value as LibrarySort})}><option value="newest">最新优先</option><option value="oldest">最早优先</option><option value="name">名称</option><option value="duration">时长最长</option></select><button title="定位当前载入的文件；被筛选隐藏时清除筛选" aria-label="定位当前文件" disabled={!current} onClick={locate}>定位</button></div>
  <div className="library-options"><details><summary>筛选{hasFilters?' · 已启用':''}</summary><div className="library-filter-fields"><select aria-label="文件状态筛选" value={filter.status} onChange={e=>updateFilter({status:e.target.value})}><option value="all">全部状态</option><option value="ready">可查看</option><option value="processing">处理中</option><option value="attention">需要处理</option></select><label>从<input aria-label="开始日期" type="date" value={filter.from} onChange={e=>updateFilter({from:e.target.value})}/></label><label>至<input aria-label="结束日期" type="date" value={filter.to} onChange={e=>updateFilter({to:e.target.value})}/></label></div></details><span>{filtered.length} 项</span>{hasFilters&&<button onClick={resetFilters}>清除筛选</button>}<button disabled={locked} onClick={()=>void act(category==='recordings'?'library.refresh':'imports.refresh')}>刷新</button></div>
  {hasFilters&&<p className="library-active-filters">{filter.query?'名称：'+filter.query+' ':''}{filter.status!=='all'?{ready:'可查看',processing:'处理中',attention:'需要处理'}[filter.status]+' ':''}{filter.from||filter.to?(filter.from||'不限')+' 至 '+(filter.to||'不限'):''}</p>}
  {recording&&<p className="library-notice">录音期间可浏览列表；结束录音后可回听和管理文件。</p>}
  {!!state.importIssues?.length&&category==='imports'&&<p className="library-notice take-error">{state.importIssues.length} 条导入记录暂不可读取；文件已保留。</p>}
  {(error||playbackError||notice)&&<div className={'library-notice '+(error||playbackError?'take-error':'')} role={error||playbackError?'alert':'status'}><span>{error||playbackError||notice}</span><button aria-label="关闭列表提示" onClick={()=>{setError('');setNotice('');dismissError()}}>×</button></div>}
  <div className="library-scroll" ref={list} onScroll={e=>{scroll.current[category]=e.currentTarget.scrollTop}} role="group" aria-label={category==='recordings'?'录音列表':'外部素材列表'}>
   {!displayed.length&&<p className="empty-recordings">{rows.length?'没有匹配的音频。':category==='recordings'?'暂无录音。点击“录音”开始保存系统声音。':'导入 WAV、MP3、M4A 或 AAC，或将文件拖入窗口。'}</p>}
   {displayed.map((row,index)=>{
    const loaded=current?.takeId===row.id,isPlaying=loaded&&playing,warning=rowWarning(row),active=selected[category]===row.id
    const region=loaded&&current.regionId?row.take?.analysisRegions?.find(r=>r.id===current.regionId&&r.role===current.role):undefined
    const output=loaded&&current.exportId?(row.take?.exports||state.exportJobs||[]).find(e=>e.id===current.exportId):undefined
    return <article className="library-row" key={row.id} data-library-row={row.id} data-take-id={row.take?.id} data-import-id={row.asset?.id} data-selected={active} aria-label={row.name+(active?' · 已选中':'')+(loaded?' · '+(isPlaying?'正在回听':'已载入'):'')} aria-current={loaded?'true':undefined} tabIndex={active||(!displayed.some(item=>item.id===selected[category])&&index===0)?0:-1} onClick={()=>select(row)} onDoubleClick={e=>{if(!(e.target as HTMLElement).closest('button'))open(row,true)}} onContextMenu={e=>{e.preventDefault();select(row);setMenu({id:row.id,x:Math.min(e.clientX,window.innerWidth-205),y:Math.min(e.clientY,window.innerHeight-210)})}} onKeyDown={e=>{
     if(e.target!==e.currentTarget)return
     if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const next=displayed[e.key==='Home'?0:e.key==='End'?displayed.length-1:Math.max(0,Math.min(displayed.length-1,index+(e.key==='ArrowDown'?1:-1)))];select(next);setFocusId(next.id)}
     if(e.key==='Enter'){e.preventDefault();e.stopPropagation();open(row,false)}
     if(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10'){e.preventDefault();e.stopPropagation();select(row);const rect=e.currentTarget.getBoundingClientRect();setMenu({id:row.id,x:Math.min(rect.left+20,window.innerWidth-205),y:Math.min(rect.bottom,window.innerHeight-210)})}
    }}>
     <button className="library-play" data-library-play={row.id} disabled={recording||busy&&!pending||!row.ready} aria-label={(isPlaying?'暂停回听：':'回听：')+row.name} title={recording?'结束录音后可回听':!row.ready?row.status:isPlaying?'暂停回听':'回听'} onClick={e=>{e.stopPropagation();open(row,true)}}><TransportIcon kind={isPlaying?'pause':'play'}/></button>
     <div className="library-row-text"><strong title={row.name}>{row.name}</strong><small className="library-row-meta"><span title={row.format}>{row.format}{row.take?.regionCount&&row.take.regionCount>1?' · '+row.take.regionCount+' 段':''}</span><time dateTime={row.createdAt||undefined} title={row.createdAt?new Date(row.createdAt).toLocaleString('zh-CN',{hour12:false}):'日期未知'}>{row.createdAt?new Date(row.createdAt).toLocaleString('zh-CN',{year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'日期未知'}</time></small>{(row.status!=='已保存'&&row.status!=='已准备'||warning)&&<small className={row.attention||warning?'take-error':''} title={warning||row.status}>{warning||row.status}</small>}{loaded&&<small className="library-loaded">{isPlaying?'正在回听':'已载入'} · {current.role==='export'?'导出成品':current.role==='session'?'会话':current.role==='deliverable'?'成品':current.role==='recovered'?'恢复文件':'原始文件'}{region?' · 第 '+region.ordinal+' 段':current.regionId?' · 连续段':''}{output?' · '+exportLabel(output.preset)+' · '+new Date(output.createdAt).toLocaleTimeString('zh-CN',{hour12:false}):''}</small>}</div>
     <span className="library-duration" title={row.durationNs>0n?timecodeNs(row.durationNs.toString()):'时长未就绪'}>{libraryDuration(row.durationNs)}</span>
     <button data-row-more={row.id} aria-label={'更多操作：'+row.name} aria-haspopup="menu" aria-expanded={menu?.id===row.id} onClick={e=>{e.stopPropagation();select(row);const rect=e.currentTarget.getBoundingClientRect();setMenu(menu?.id===row.id?null:{id:row.id,x:Math.min(rect.right-190,window.innerWidth-205),y:Math.min(rect.bottom+4,window.innerHeight-210)})}}>⋯</button>
    </article>
   })}
  </div>
  <nav className="library-pagination" aria-label="音频列表分页"><button disabled={page===0} onClick={()=>pageTo(page-1)}>上一页</button><span>{filtered.length?start+1:0}–{Math.min(start+libraryPageSize,filtered.length)} / {filtered.length}</span><button disabled={start+libraryPageSize>=filtered.length} onClick={()=>pageTo(page+1)}>下一页</button></nav>
  {chosen&&<section className="library-selected" aria-label="选中音频"><div><strong title={chosen.name}>{chosen.name}</strong><button aria-expanded={details} onClick={()=>setDetails(!details)}>{details?'收起详情':'文件详情'}</button><button data-take-open={chosen.take?'':undefined} data-import-open={chosen.asset?'':undefined} disabled={locked||!chosen.ready} onClick={()=>open(chosen,false)}>查看分析</button></div>{details&&<div className="library-detail-content" key={category+chosen.id}><p className={chosen.attention?'take-error':'settings-hint'}>{rowWarning(chosen)||chosen.status}</p>{chosen.take?<RecordingDetails take={chosen.take} state={state} busy={busy} run={detailRun} act={act} onExport={onExport}/>:chosen.asset?<ImportedDetails item={chosen.asset} state={state} busy={busy} run={detailRun} act={act}/>:null}</div>}</section>}
  <details className="library-storage" open={management} onToggle={e=>setManagement(e.currentTarget.open)}><summary>{category==='recordings'?'录音目录与空间管理':'素材管理'}</summary>{category==='recordings'?<><p title={state.recordDirectory}>{state.recordDirectory||'尚未选择录音目录'}</p><p>{scanning?'统计空间…':usage?'音频 '+formatBytes(usage.audioBytes)+' · 缓存 '+formatBytes(usage.cacheBytes)+(usage.incomplete?' · 部分不可访问':''):''}</p><button disabled={locked} onClick={()=>run('record.chooseDirectory')}>切换目录</button><button disabled={locked} onClick={()=>void act('library.pruneMissing')}>清理失效记录</button></>:<><p>WAV · MP3 · M4A · AAC；移除引用保留外部原文件与生成的成品。</p><button onClick={()=>run('imports.openRoot')}>打开素材目录</button></>}</details>
  {menu&&menuRow&&<div className="library-context" role="menu" aria-label={menuRow.name+'的操作'} style={{left:Math.max(4,menu.x),top:Math.max(4,menu.y)}} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu()}
   if(e.key==='Tab'){closeMenu(false);return}
   if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const i=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}
  }}><button role="menuitem" disabled={locked||!menuRow.ready} onClick={()=>{closeMenu();open(menuRow,false)}}>查看分析</button><button role="menuitem" data-take-export={menuRow.take?'':undefined} disabled={locked||!menuRow.ready} onClick={()=>{closeMenu();if(sourceFor(menuRow))onExport(sourceFor(menuRow)!)}}>导出</button><button role="menuitem" disabled={locked||!menuRow.ready} onClick={()=>{closeMenu();if(sourceFor(menuRow))run('reference.set',{...sourceFor(menuRow)!})}}>设为参考</button><button role="menuitem" onClick={()=>{closeMenu();setDetails(true)}}>文件与管理详情</button></div>}
 </div>
}
