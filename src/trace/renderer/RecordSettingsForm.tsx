import {recordingCapacity} from '../capacityModel'
import type {RecordingCapacity} from '../capacityModel'
import type {RecordSettings,WavRecordSettings} from '../shared'
import {recordingLabel} from '../recordSettings'
type Props={value:RecordSettings;change:(value:RecordSettings)=>void;busy:boolean;directoryBusy?:boolean;sourceRate?:number;sourceChannels?:number;capacity?:RecordingCapacity;directory?:string;chooseDirectory:()=>void;apply:()=>void;embedded?:boolean}
export function RecordSettingsForm({value,change,busy,directoryBusy,sourceRate,sourceChannels,capacity,directory,chooseDirectory,apply,embedded=false}:Props):React.JSX.Element{
 const wav=!value.format?value as WavRecordSettings:null
  const estimate=recordingCapacity(capacity?.freeBytes?BigInt(capacity.freeBytes):null,value,sourceRate||48000,sourceChannels||2)
  const duration=estimate.estimatedSeconds===null?'—':estimate.estimatedSeconds<60?'不足 1 分钟':Math.floor(estimate.estimatedSeconds/3600)+' 小时 '+Math.floor(estimate.estimatedSeconds%3600/60)+' 分钟'
 const setFormat=(format:string)=>{
  const namePrefix=value.namePrefix,sampleRate=sourceRate===44100?44100:48000
  if(format==='wav')change({namePrefix,keepOriginal:value.keepOriginal,encoding:'pcm24',sampleRate:'source'})
  else if(format==='mp3')change({namePrefix,keepOriginal:value.keepOriginal,format:'mp3',sampleRate,bitrate:192})
  else change({namePrefix,keepOriginal:value.keepOriginal,format:'aac',container:'m4a',sampleRate,bitrate:192})
 }
 return <div className="settings-content">
  <label>格式<select aria-label="录音格式" value={value.format||'wav'} onChange={e=>setFormat(e.target.value)}><option value="wav">WAV</option><option value="mp3">MP3</option><option value="aac">AAC</option></select></label>
  {value.format==='aac'&&<label>AAC 封装<select aria-label="录音 AAC 封装" value={value.container} onChange={e=>change({...value,container:e.target.value as 'm4a'|'adts'})}><option value="m4a">M4A · 文件回听</option><option value="adts">ADTS · .aac</option></select></label>}
  <label>采样率<select aria-label="录音采样率" value={value.sampleRate} onChange={e=>change({...value,sampleRate:e.target.value==='source'?'source':Number(e.target.value)} as RecordSettings)}>
   {wav&&<option value="source">跟随来源</option>}{(wav?[44100,48000,88200,96000]:[44100,48000]).map(rate=><option key={rate} value={rate}>{rate/1000} kHz</option>)}
  </select></label>
  {wav?<label>采样精度<select aria-label="录音采样精度" value={wav.encoding} onChange={e=>change({...wav,encoding:e.target.value as WavRecordSettings['encoding']})}><option value="pcm16">16-bit PCM</option><option value="pcm24">24-bit PCM</option><option value="float32">32-bit float</option></select></label>:
   <label>目标码率<select aria-label="录音码率" value={value.format?value.bitrate:192} onChange={e=>change({...value,bitrate:Number(e.target.value)} as RecordSettings)}>{(value.format==='mp3'?[128,192,256,320]:[128,192,256]).map(rate=><option value={rate} key={rate}>{rate} kbps</option>)}</select></label>}
  <label>文件名称前缀<input aria-label="录音名称前缀" value={value.namePrefix} maxLength={48} onChange={e=>change({...value,namePrefix:e.target.value})}/></label>
  <div className="save-directory"><span>保存目录</span><strong>{directory||'首次录音时选择'}</strong><button disabled={busy||directoryBusy} onClick={chooseDirectory}>选择目录</button></div>
  {directory&&<div className="record-capacity" title="保守预估包含源音频、转码工作文件与分析缓存预算，并预留 512 MiB；实际空间消耗随内容和处理阶段变化。"><span>可用 {capacity?.freeBytes?(Number(capacity.freeBytes)/1073741824).toFixed(1)+' GiB':'—'}</span><span>预计可录 {duration}</span></div>}
   <label>保留原始 WAV<input aria-label="保留原始 WAV" type="checkbox" checked={value.keepOriginal!==false} onChange={e=>change({...value,keepOriginal:e.target.checked})}/></label>
  <p className="settings-hint">关闭后，仅在独立成品和分析核验完成后整理原始文件。WAV 直录本身的最终文件始终保留。</p>
  <p className="settings-summary">采集 {sourceRate?sourceRate/1000:'—'} kHz → {recordingLabel(value)} · {value.sampleRate==='source'?'跟随来源':value.sampleRate/1000+' kHz'}</p>
  <p className="settings-hint">{wav?'需要重采样时，停止后后台生成成品。原始 WAV 按上方设置保留或整理。':'停止后后台生成压缩成品，原始 WAV 按上方设置处理；成品可以独立回听和分析。'}</p>
  {value.format==='aac'&&value.container==='adts'&&<p className="settings-hint">ADTS 在其他播放器中可能包含首尾填充；文件回听建议选择 M4A。</p>}
  {!embedded&&<button className="primary-button" disabled={busy} onClick={apply}>应用设置</button>}
 </div>
}
