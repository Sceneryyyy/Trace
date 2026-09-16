import {open,mkdir,stat,unlink} from 'node:fs/promises'
import {createReadStream} from 'node:fs'
import {createHash} from 'node:crypto'
import {isAbsolute,join} from 'node:path'
import {AnalysisCache} from './analysisCache'
import {ReportEvents} from './reportEvents'
import {validateTargetSettings,evaluateTargets,targetKey,targetPresets} from './targetSettings'
import type {ReportRequest,ReportResult,ReportEvent} from './reportTypes'
import type {Metric} from './shared'

export function csvText(value:unknown):string {let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
export function htmlText(value:unknown):string {return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
const num=(metric:Metric)=>metric.status==='ready'&&metric.value!==null?String(metric.value):''
const sameRange=(a:{startFrame:string;endFrame:string}|undefined,b:{startFrame:string;endFrame:string}|undefined)=>a===undefined&&b===undefined||Boolean(a&&b&&a.startFrame===b.startFrame&&a.endFrame===b.endFrame)
const frame=(s:string)=>{if(!/^(0|[1-9][0-9]{0,19})$/.test(s)||BigInt(s)>0xffffffffffffffffn)throw Error('INVALID_REPORT_FRAME');return BigInt(s)}
const usable=(m:Metric)=>m.status==='ready'||m.status==='silence'
const maximum=(a:Metric,b:Metric):Metric=>b.status==='ready'&&b.value!==null&&(a.status!=='ready'||a.value===null||b.value>a.value)?{...b}:a.status!=='ready'&&b.status==='silence'?{...b}:a
class TextOutput {
 private chunks:string[]=[];private bytes=0
 constructor(private handle:Awaited<ReturnType<typeof open>>){}
 async append(value:string):Promise<void>{this.chunks.push(value);this.bytes+=Buffer.byteLength(value);if(this.bytes>=128*1024)await this.flush()}
 async flush():Promise<void>{if(!this.chunks.length)return;const b=Buffer.from(this.chunks.join(''));this.chunks=[];this.bytes=0;let n=0;while(n<b.length){const r=await this.handle.write(b,n,b.length-n);if(!r.bytesWritten)throw Error('REPORT_WRITE_FAILED');n+=r.bytesWritten}}
 async close(){try{await this.flush()}finally{await this.handle.close()}}
}
const labels:Record<ReportEvent['kind'],string>={'true-peak':'True Peak 超限','integrated-high':'截至此处 I 高于目标','integrated-low':'截至此处 I 低于目标','momentary-high':'M 高于上限','short-term-high':'S 高于上限','data-gap':'数据缺口','data-error':'电平数据错误','loudness-gap':'响度窗口数据缺口','loudness-error':'响度窗口数据错误'}
const stateNames={pass:'符合所选目标',fail:'超出所选目标',unavailable:'尚不能完整判断',disabled:'未启用目标'}
function renderHtml(r:ReportResult):string {
 const escape=htmlText,metric=(m:Metric)=>m.status==='ready'&&m.value!==null?`<span title="${escape(m.value)}">${m.value.toFixed(2)}</span>`:m.status==='silence'?'−∞':`<span class="muted">${escape(m.status)}</span>`
 const rows=r.evaluation.checks.map(c=>`<tr><td>${escape(c.id)}</td><td>${c.metricStatus==='silence'?'−∞':escape(c.value??'—')}</td><td>${escape(c.min??'—')} ～ ${escape(c.max??'—')}</td><td>${escape(stateNames[c.state])}${c.reason?'<br>'+escape(c.reason):''}</td></tr>`).join('')
 const events=[...r.eventPreview].sort((a,b)=>frame(a.startFrame)<frame(b.startFrame)?-1:1).map(e=>`<tr><td>${escape(labels[e.kind])}${e.channel===null?'':' · '+(r.analysis.channelCount===1?'M':e.channel?'R':'L')}</td><td>${(Number(e.startFrame)/r.analysis.sampleRate).toFixed(3)}</td><td>${(Number(e.endFrame)/r.analysis.sampleRate).toFixed(3)}</td><td>${escape(e.extreme??(e.status==='silence'?'−∞':'—'))}</td></tr>`).join('')
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Trace · ${escape(r.source.label)}</title><style>body{font:15px system-ui,sans-serif;background:#11151a;color:#e8edf2;max-width:1100px;margin:32px auto;padding:0 24px;line-height:1.6}h1{font-size:28px}h2{margin-top:30px}small,.muted{color:#aab8c5}.cards{display:flex;gap:20px;flex-wrap:wrap}.cards>div{background:#202831;border:1px solid #3b4653;padding:14px 20px;min-width:160px}.cards strong{display:block;font:28px monospace;color:#91e65c}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #3b4653;text-align:left;padding:8px;vertical-align:top}a{color:#58d4da}code{overflow-wrap:anywhere}.status{padding:12px;background:#253039}li{overflow-wrap:anywhere}@media print{body{background:white;color:black}.cards>div,.status{background:#eee}.cards strong,small,a{color:black}tr{break-inside:avoid}}</style><header><small>TRACE · Measurement Report</small><h1>${escape(r.source.label)}</h1><p>${escape(r.source.format)} · ${r.analysis.sampleRate} Hz · ${r.analysis.channelCount} 声道</p><p>范围：${r.source.scope.kind==='whole'?'整段':'选区独立分析'} · [${escape(r.source.scope.startFrame)}, ${escape(r.source.scope.endFrame)}) 帧 · ${(Number(r.analysis.frames)/r.analysis.sampleRate).toFixed(3)} s</p></header><div class="status">${escape(stateNames[r.evaluation.state])} · 完整性：${escape(r.source.integrity.state)}</div><div class="cards"><div>I · LUFS<strong>${metric(r.summary.integratedToCursor)}</strong></div><div>LRA · LU<strong>${metric(r.summary.loudnessRange)}</strong></div><div>MAX TP · dBTP<strong>${metric(r.summary.maxTruePeak)}</strong></div></div><h2>目标检查</h2><p>${escape(r.targets.preset==='custom'?'自定义':targetPresets[r.targets.preset].name)}。目标仅用于比较，未改变音频或基础测量。</p><table><thead><tr><th>指标</th><th>原始值</th><th>下限 ～ 上限</th><th>结果</th></tr></thead><tbody>${rows}</tbody></table><h2>事件 · ${r.events} 条</h2><p>表格最多展示 1000 条；全部事件按结束顺序写入 CSV。True Peak 为 10 ms 观察窗口，M/S/I 为 100 ms 快照，不是样本级越界时刻。I 事件表示当时累计值，最终判断见上方整段/选区结果。</p><table><thead><tr><th>事件</th><th>起 · s</th><th>止 · s</th><th>极值</th></tr></thead><tbody>${events||'<tr><td colspan="4">没有已识别事件</td></tr>'}</tbody></table><h2>数据与范围</h2><p><a href="${escape(r.files.summary)}">摘要 CSV</a> · <a href="${escape(r.files.history)}">逐点读数 CSV</a> · <a href="${escape(r.files.events)}">事件 CSV</a></p><p>CSV 保存原始数值和状态；空数值不代表 0。帧号以十进制文本记录，查看工具应保留整数精度。报告比较使用未四舍五入值。监听音量、显示倍率和相机均不参与测量。</p><ul>${r.source.integrity.notes.map(n=>'<li>'+escape(n)+'</li>').join('')}</ul><p>电平完整可读帧：${escape(r.coverage.levelReadyFrames)}；M/S/I 均可读帧：${escape(r.coverage.loudnessReadyFrames)}。初始分析窗口尚未就绪与音频缺口不同。</p><h2>可追溯信息</h2><table><tr><th>算法</th><td><code>${escape(r.analysis.measurementConfigId)}</code></td></tr><tr><th>分析键</th><td><code>${escape(r.analysis.cacheKey)}</code></td></tr><tr><th>引擎 SHA256</th><td><code>${escape(r.analysis.engineSha256)}</code></td></tr><tr><th>源 SHA256</th><td><code>${r.analysis.sourceSha256.map(escape).join('<br>')}</code></td></tr><tr><th>生成时间</th><td>${escape(r.createdAt)}</td></tr></table></html>`
}
export async function buildReport(request:ReportRequest,progress:(value:{rows:number;total:string})=>void=()=>{},cancelled:()=>boolean=()=>false):Promise<ReportResult> {
 const {source}=request
 if(!source||typeof source.label!=='string'||source.label.length>1024||source.label.includes('\0')||typeof source.format!=='string'||source.format.length>256||typeof source.takeId!=='string'||!source.takeId||source.takeId.length>128||typeof source.role!=='string'||!source.role||source.role.length>64||!source.scope||!source.integrity||!Array.isArray(source.integrity.notes)||source.integrity.notes.some(n=>typeof n!=='string'||n.length>2048))throw Error('INVALID_REPORT_SOURCE')
 const targets=validateTargetSettings(request.targets),start=frame(source.scope.startFrame),end=frame(source.scope.endFrame)
 if(request.version!==1||!isAbsolute(request.cacheDirectory)||!isAbsolute(request.outputDirectory)||!Array.isArray(request.sourceFiles)||!request.sourceFiles.length||request.sourceFiles.length>10000||request.sourceFiles.some(p=>!isAbsolute(p))||end<=start||end>frame(source.sourceFrames)||source.scope.kind==='whole'&&(start!==0n||end!==frame(source.sourceFrames))||!['whole','selection'].includes(source.scope.kind)||!['complete','estimated','gaps','unknown'].includes(source.integrity.state)||source.integrity.notes.length>1000)throw Error('INVALID_REPORT_REQUEST')
 const check=()=>{if(cancelled())throw Error('REPORT_CANCELLED')}
 const cache=await AnalysisCache.open(request.cacheDirectory,request.cacheKey),m=cache.manifest
 if(frame(m.frames)!==end-start||!sameRange(m.sourceRange,source.physicalRange)||m.sourceSha256.length!==request.sourceFiles.length)throw Error('REPORT_SCOPE_MISMATCH')
 const sourceStats:Array<{size:number;mtimeMs:number}>=[]
 for(let n=0;n<request.sourceFiles.length;n++){
  check();const file=request.sourceFiles[n],before=await stat(file),hash=createHash('sha256');for await(const bytes of createReadStream(file)){check();hash.update(bytes)}const after=await stat(file)
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||hash.digest('hex')!==m.sourceSha256[n])throw Error('REPORT_SOURCE_CHANGED')
  sourceStats.push({size:after.size,mtimeMs:after.mtimeMs})
 }
 await mkdir(request.outputDirectory,{recursive:false})
 const files={html:'report.html',summary:'summary.csv',history:'history.csv',events:'events.csv'},created:string[]=[],writers:TextOutput[]=[]
 try{
  const output=async(name:string)=>{const path=join(request.outputDirectory,name),handle=await open(path,'wx');created.push(path);const writer=new TextOutput(handle);writers.push(writer);return writer}
  const history=await output(files.history),eventsCsv=await output(files.events),summaryCsv=await output(files.summary),html=await output(files.html)
  const empty:Metric={value:null,status:'insufficient',unit:'LUFS'};let momentaryMax={...empty},shortTermMax={...empty},rows=0,eventCount=0,gapFrames=0n,errorFrames=0n,levelReady=0n,loudReady=0n,loudGapFrames=0n,loudErrorFrames=0n,lastLoud=0n,lastProgress=Date.now()
  const preview:ReportEvent[]=[],emitted:ReportEvent[]=[],detector=new ReportEvents(targets,e=>emitted.push(e))
  await history.append('start_frame,end_frame,loudness_index_frame,m_lufs,m_state,s_lufs,s_state,i_since_scope_start_lufs,i_state,channel,peak_dbfs,peak_state,rms_dbfs,rms_state,tp_dbtp,tp_state,flags\r\n')
  await eventsCsv.append('kind,channel,start_frame,end_frame,extreme,threshold,metric_state,observations\r\n')
  const drain=async()=>{for(const e of emitted){check();const mapped={...e,startFrame:String(start+frame(e.startFrame)),endFrame:String(start+frame(e.endFrame))};eventCount++;if(preview.length<1000)preview.push(mapped);await eventsCsv.append([csvText(e.kind),e.channel===null?'':String(e.channel),mapped.startFrame,mapped.endFrame,e.extreme??'',e.threshold??'',csvText(e.status),e.samples].join(',')+'\r\n')}emitted.length=0}
  for await(const row of cache.reportRows()){
   check();detector.push(row);await drain();rows++
   const duration=frame(row.endFrame)-frame(row.startFrame),gap=Boolean(row.flags&4)||row.channels.some(c=>c.truePeak.status==='gap'),error=row.channels.some(c=>c.truePeak.status==='error')
   if(gap)gapFrames+=duration;if(error)errorFrames+=duration
   if(!gap&&!error&&row.channels.every(c=>[c.samplePeak,c.rms,c.truePeak].every(usable)))levelReady+=duration
   if(row.loudnessUpdated){const length=frame(row.loudnessFrame)-lastLoud,metrics=[row.momentary,row.shortTerm,row.integrated];momentaryMax=maximum(momentaryMax,row.momentary);shortTermMax=maximum(shortTermMax,row.shortTerm);if(metrics.every(usable))loudReady+=length;if(row.loudnessFlags&4||metrics.some(m=>m.status==='gap'))loudGapFrames+=length;if(metrics.some(m=>m.status==='error'))loudErrorFrames+=length;lastLoud=frame(row.loudnessFrame)}
   for(let channel=0;channel<row.channels.length;channel++){
    const c=row.channels[channel];await history.append([String(start+frame(row.startFrame)),String(start+frame(row.endFrame)),String(start+frame(row.loudnessFrame)),num(row.momentary),csvText(row.momentary.status),num(row.shortTerm),csvText(row.shortTerm.status),num(row.integrated),csvText(row.integrated.status),channel,num(c.samplePeak),csvText(c.samplePeak.status),num(c.rms),csvText(c.rms.status),num(c.truePeak),csvText(c.truePeak.status),row.flags].join(',')+'\r\n')
   }
   if(Date.now()-lastProgress>100){progress({rows,total:m.streams[0].records});lastProgress=Date.now()}
  }
  detector.finish();await drain();check()
  for(let n=0;n<request.sourceFiles.length;n++){const after=await stat(request.sourceFiles[n]);if(after.size!==sourceStats[n].size||after.mtimeMs!==sourceStats[n].mtimeMs)throw Error('REPORT_SOURCE_CHANGED')}
  const evaluation=evaluateTargets(targets,{integrated:m.summary.integratedToCursor,truePeak:m.summary.maxTruePeak,lra:m.summary.loudnessRange,momentaryMax,shortTermMax},Number(m.frames)/m.sampleRate)
  if((source.integrity.state!=='complete'||gapFrames>0n||errorFrames>0n||loudGapFrames>0n||loudErrorFrames>0n)&&evaluation.state==='pass')evaluation.state='unavailable'
  const result:ReportResult={version:1,source:structuredClone(source),targetKey:targetKey(targets),targets,analysis:{measurementConfigId:m.measurementConfigId,cacheKey:m.cacheKey,engineSha256:m.engineSha256,sourceSha256:m.sourceSha256,sampleRate:m.sampleRate,channelCount:m.channelCount,frames:m.frames,createdAt:m.createdAt},summary:m.summary,momentaryMax,shortTermMax,evaluation,rows,events:eventCount,coverage:{gapFrames:String(gapFrames),errorFrames:String(errorFrames),levelReadyFrames:String(levelReady),loudnessReadyFrames:String(loudReady),loudnessGapFrames:String(loudGapFrames),loudnessErrorFrames:String(loudErrorFrames)},files,createdAt:new Date().toISOString(),eventPreview:preview}
  await summaryCsv.append('label,role,scope,start_frame,end_frame,sample_rate,channels,frames,i_lufs,i_state,lra_lu,lra_state,max_tp_dbtp,max_tp_state,target_result,target_json,integrity,measurement_config,cache_key,engine_sha256,source_sha256\r\n')
  await summaryCsv.append([csvText(source.label),csvText(source.role),csvText(source.scope.kind),String(start),String(end),m.sampleRate,m.channelCount,m.frames,num(m.summary.integratedToCursor),csvText(m.summary.integratedToCursor.status),num(m.summary.loudnessRange),csvText(m.summary.loudnessRange.status),num(m.summary.maxTruePeak),csvText(m.summary.maxTruePeak.status),csvText(evaluation.state),csvText(JSON.stringify(targets)),csvText(source.integrity.state),csvText(m.measurementConfigId),csvText(m.cacheKey),csvText(m.engineSha256),csvText(m.sourceSha256.join(';'))].join(',')+'\r\n')
  await html.append(renderHtml(result));for(const writer of writers)await writer.close();writers.length=0;check();progress({rows,total:m.streams[0].records});return result
 }catch(error){await Promise.allSettled(writers.map(w=>w.close()));for(const file of created)await unlink(file).catch(()=>{});throw error}
}
