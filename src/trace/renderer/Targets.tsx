import {useState} from 'react'
import {defaultTargetSettings,targetPresets,targetPreset,validateTargetSettings,checkTarget,type TargetSettings} from '../targetSettings'
import type {Metric,NativeRecordSnapshot,MeterSnapshot} from '../shared'
export function TargetSettingsForm({value,apply}:{value:TargetSettings;apply:(s:TargetSettings)=>Promise<unknown>}){
 const [draft,setDraft]=useState(()=>structuredClone(value)),[error,setError]=useState(''),[advanced,setAdvanced]=useState(false)
 const edit=(patch:Partial<TargetSettings>)=>setDraft({...draft,...patch,preset:'custom'})
 return <div className="settings-content target-settings">
  <label>启用目标<input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/></label>
  <label>目标预设<select aria-label="目标预设" value={draft.preset} onChange={e=>{setDraft(e.target.value==='custom'?{...draft,preset:'custom'}:targetPreset(e.target.value as keyof typeof targetPresets,draft.enabled));if(e.target.value==='custom')setAdvanced(true)}}><option value="custom">自定义</option>{Object.entries(targetPresets).map(([id,p])=><option key={id} value={id}>{p.name}</option>)}</select></label>
  <details className="target-advanced" open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}><summary>自定义目标参数</summary>
  <label>整段 I · LUFS<input type="checkbox" aria-label="启用 I 目标" checked={Boolean(draft.integrated)} onChange={e=>edit({integrated:e.target.checked?{target:-23,tolerance:1}:null})}/></label>
  {draft.integrated&&<><label>目标 · LUFS<input aria-label="I 目标值" type="number" min="-60" max="0" step=".1" value={draft.integrated.target} onChange={e=>edit({integrated:{...draft.integrated!,target:Number(e.target.value)}})}/></label><label>容差 · LU<input aria-label="I 目标容差" type="number" min="0" max="10" step=".1" value={draft.integrated.tolerance} onChange={e=>edit({integrated:{...draft.integrated!,tolerance:Number(e.target.value)}})}/></label></>}
  {(['truePeakMax','momentaryMax','shortTermMax'] as const).map((key,i)=><label key={key}>{['TP 上限 · dBTP','M 上限 · LUFS','S 上限 · LUFS'][i]}<div className="target-optional"><input type="checkbox" aria-label={'启用 '+key} checked={draft[key]!==null} onChange={e=>edit({[key]:e.target.checked?(key==='truePeakMax'?-1:-18):null})}/>{draft[key]!==null&&<input aria-label={key} type="number" step=".1" value={draft[key]!} onChange={e=>edit({[key]:Number(e.target.value)})}/>}</div></label>)}
  <label>LRA 范围 · LU<input type="checkbox" aria-label="启用 LRA 目标" checked={Boolean(draft.lra)} onChange={e=>edit({lra:e.target.checked?{min:0,max:20}:null})}/></label>
  {draft.lra&&<><label>下限 · LU<input aria-label="LRA 下限" type="number" min="0" max="50" value={draft.lra.min} onChange={e=>edit({lra:{...draft.lra!,min:Number(e.target.value)}})}/></label><label>上限 · LU<input aria-label="LRA 上限" type="number" min="0" max="50" value={draft.lra.max} onChange={e=>edit({lra:{...draft.lra!,max:Number(e.target.value)}})}/></label></>}
  </details>
  <p className="small-note">目标只用于比较，不改变音频。短于 60 秒的 LRA 不用于目标判定。M/S 事件取 10 ms 快照；I 事件表示当时累计值。</p>
  {draft.preset!=='custom'&&<p className="small-note">{targetPresets[draft.preset].revision} · 目标参考，完整标准验收单独进行。</p>}
  {error&&<p role="status">{error}</p>}<button onClick={()=>{try{const s=validateTargetSettings(draft);void apply(s).catch(e=>setError(String(e)))}catch{setError('请检查目标范围；启用后至少选择一项。')}}}>应用目标</button><button onClick={()=>{setDraft(structuredClone(defaultTargetSettings));setAdvanced(false)}}>恢复默认</button>
 </div>
}
export function TargetStrip({settings,summary,current,scope,duration,configure}:{settings:TargetSettings;summary?:NativeRecordSnapshot['meters']|null;current:MeterSnapshot|null;scope:string;duration:number;configure:()=>void}){
 if(!settings.enabled)return null
 const empty=(unit:Metric['unit']):Metric=>({status:'insufficient',value:null,unit}),i=settings.integrated
 const values=[{label:'I '+scope,check:checkTarget('integrated',summary?.integratedToCursor||empty('LUFS'),i?i.target-i.tolerance:null,i?i.target+i.tolerance:null)},
  {label:'TP '+scope,check:checkTarget('truePeak',summary?.maxTruePeak||empty('dBTP'),null,settings.truePeakMax)},
  {label:'LRA '+scope,check:checkTarget('lra',summary?.loudnessRange||empty('LU'),settings.lra?.min??null,settings.lra?.max??null)},
  {label:'M 当前',check:checkTarget('momentaryMax',current?.momentary||empty('LUFS'),null,settings.momentaryMax)},
  {label:'S 当前',check:checkTarget('shortTermMax',current?.shortTerm||empty('LUFS'),null,settings.shortTermMax)}]
 if(values[2].check.state!=='disabled'&&duration<60){values[2].check.state='unavailable';values[2].check.reason='短于 60 秒，暂不判断 LRA'}
 return <div className="target-strip" aria-label="当前目标监看"><button onClick={configure}>调整目标</button>{values.filter(v=>v.check.state!=='disabled').map(({label,check})=><span key={label} data-result={check.state} title={check.reason||`原始值 ${check.metricStatus==='silence'?'−∞':check.value??'未就绪'}；范围 ${check.min??'不限'} ～ ${check.max??'不限'}`}>{label} · {check.state==='pass'?'目标内':check.state==='fail'?'超出目标':'待判定'}</span>)}</div>
}
