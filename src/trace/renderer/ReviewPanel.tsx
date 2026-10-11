import {useEffect,useState} from 'react'
import type {ReviewMarker} from '../markerStore'
import type {Command,PlaybackView} from '../shared'
import {userError} from '../userErrors'
export function ReviewPanel({file,recording,request,onNavigate}:{file?:PlaybackView|null;recording:boolean;request:(name:Command,payload?:Record<string,unknown>)=>Promise<unknown>;onNavigate:()=>void}){
 const [markers,setMarkers]=useState<ReviewMarker[]>([]),[label,setLabel]=useState(''),[comment,setComment]=useState(''),[editing,setEditing]=useState<ReviewMarker|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const ready=Boolean(file&&!file.temporary&&file.analysisPhase==='ready'&&!recording)
 useEffect(()=>{let valid=true;setMarkers([]);setEditing(null);setError('');if(ready&&file)request('markers.list',{playbackId:file.id}).then(v=>{if(valid)setMarkers((v as {markers:ReviewMarker[]}).markers)}).catch(e=>{if(valid)setError(userError(e))});return()=>{valid=false}},[file?.id,file?.analysisPhase,ready])
 const action=async(name:Command,payload:Record<string,unknown>)=>{setBusy(true);setError('');try{const v=await request(name,payload) as {markers?:ReviewMarker[]};if(v.markers)setMarkers(v.markers);if(name==='markers.jump')onNavigate();return v} catch(e){setError(userError(e));throw e}finally{setBusy(false)}}
 const save=()=>{if(!file)return;const marker:ReviewMarker=editing?{...editing,label,comment}:{id:crypto.randomUUID(),startFrame:file.selection?.startFrame||file.positionFrame,endFrame:file.selection?.endFrame||null,label,comment,createdAt:new Date().toISOString()};void action('markers.save',{playbackId:file.id,marker}).then(()=>{setEditing(null);setLabel('');setComment('')}).catch(()=>{})}
 const chart=async(format:'svg'|'png',kind:'spectrum'|'spectrogram'='spectrum')=>{
  if(!file)return;setBusy(true);setError('')
  try{const {ticket,svg}=await request('chart.prepare',{playbackId:file.id,kind}) as {ticket:string;svg:string};let png:string|undefined
   if(format==='png'){const image=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('CHART_RENDER_FAILED'));image.src=url});const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=620;const context=canvas.getContext('2d');if(!context)throw Error('CHART_RENDER_FAILED');context.drawImage(image,0,0);png=canvas.toDataURL('image/png').split(',')[1]}finally{URL.revokeObjectURL(url)}}
   const result=await request('chart.save',{ticket,format,...(png?{png}:{})}) as {saved?:boolean};if(result.saved)setError('已保存分析图与测量元数据')
  }catch(e){setError(userError(e))}finally{setBusy(false)}
 }
 return <details className="review-panel"><summary>复核标记与分析图</summary>
  {!file&&<button disabled={recording||busy} onClick={()=>void request('live.replay').catch(e=>setError(userError(e)))}>冻结 LIVE 缓存以导出分析图</button>}
  {file?.temporary&&<small>当前是固定的 LIVE 缓存快照；持久化标记须先保存为录音。</small>}
  <div className="review-editor"><input aria-label="标记名称" maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} placeholder="标记名称"/><input aria-label="标记评论" maxLength={500} value={comment} onChange={e=>setComment(e.target.value)} placeholder="复核评论"/><button disabled={!ready||busy||!label.trim()} onClick={save}>{editing?'更新标记':file?.selection?'标记选区':'标记游标'}</button>{editing&&<button onClick={()=>{setEditing(null);setLabel('');setComment('')}}>取消编辑</button>}</div>
  <div className="review-markers">{markers.map(m=><div key={m.id}><button disabled={busy||!ready} onClick={()=>void action('markers.jump',{playbackId:file!.id,markerId:m.id}).catch(()=>{})}>{m.label} · {(Number(m.startFrame)/(file?.sampleRate||48000)).toFixed(3)} s{m.endFrame?' ～ '+(Number(m.endFrame)/(file?.sampleRate||48000)).toFixed(3)+' s':''}</button><span>{m.comment}</span><button disabled={!ready||busy} onClick={()=>{setEditing(m);setLabel(m.label);setComment(m.comment)}}>编辑</button><button disabled={!ready||busy} onClick={()=>void action('markers.remove',{playbackId:file!.id,markerId:m.id}).catch(()=>{})}>删除</button></div>)}</div>
  <div className="review-chart"><button disabled={recording||busy||!file||!file.temporary&&file.analysisPhase!=='ready'} onClick={()=>void chart('svg')}>频谱 SVG</button><button disabled={recording||busy||!file||!file.temporary&&file.analysisPhase!=='ready'} onClick={()=>void chart('png')}>频谱 PNG</button><button disabled={recording||busy||!file||!file.temporary&&file.analysisPhase!=='ready'} onClick={()=>void chart('svg','spectrogram')}>声谱 SVG</button><button disabled={recording||busy||!file||!file.temporary&&file.analysisPhase!=='ready'} onClick={()=>void chart('png','spectrogram')}>声谱 PNG</button><small>导出时暂停回听并固定游标；图中含坐标、窗口与质量说明，随图保存来源和参数。</small></div>
  {error&&<p role="status">{error}</p>}
 </details>
}
