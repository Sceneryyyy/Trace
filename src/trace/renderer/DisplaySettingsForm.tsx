import {zoomLabel} from './zoom'
import {useState} from 'react'
import type {DisplaySettings} from '../displaySettings'
import {product} from '../product'
export function DisplaySettingsForm({value,busy,apply,copyDiagnostics,confirmExit=true}:{value:DisplaySettings;busy:boolean;apply:(value:DisplaySettings,confirmExit:boolean)=>void;confirmExit?:boolean;copyDiagnostics:()=>Promise<unknown>}):React.JSX.Element{
 const [draft,setDraft]=useState(value),[copied,setCopied]=useState(false),[exitGuard,setExitGuard]=useState(confirmExit)
 return <div className="settings-content">
  <label>响度目标线<input aria-label="显示响度目标线" type="checkbox" checked={draft.targetEnabled} onChange={e=>setDraft({...draft,targetEnabled:e.target.checked})}/></label>
  <label>目标值 · LUFS<input aria-label="响度目标值" type="number" min="-60" max="0" step=".1" value={draft.targetLufs} onChange={e=>setDraft({...draft,targetLufs:Number(e.target.value)})}/></label>
  <label>波形倍率<div className="settings-range"><input aria-label="显示设置波形倍率" type="range" min="1" max="4" step=".01" value={draft.waveGain} onChange={e=>setDraft({...draft,waveGain:Number(e.target.value)})}/><output>×{zoomLabel(draft.waveGain,2)}</output></div></label>
  <label>录音中退出确认<input aria-label="录音中退出确认" type="checkbox" checked={exitGuard} onChange={e=>setExitGuard(e.target.checked)}/></label>
  <button className="primary-button" disabled={busy} onClick={()=>apply(draft,exitGuard)}>应用设置</button>
  <button disabled={busy} onClick={()=>copyDiagnostics().then(()=>setCopied(true)).catch(()=>setCopied(false))}>{copied?'已复制诊断信息':'复制诊断信息'}</button>
  <section className="about-trace"><h3>{product.fullName}</h3><p>{product.subtitle} · {product.version}</p><dl><dt>滚轮</dt><dd>波形区调整倍率 ×1–×4</dd><dt>Ctrl + 滚轮</dt><dd>波形区调整时间窗 5–60 秒</dd><dt>Shift + 滚轮</dt><dd>横向浏览文件或固定缓存</dd><dt>Page Up / Down</dt><dd>向前 / 向后移动一个时间窗</dd><dt>Ctrl + D</dt><dd>清除选区及循环；时间轴右键菜单同样可用</dd><dt>R</dt><dd>开始录音</dd><dt>Escape</dt><dd>结束录音或暂停回听</dd><dt>实时</dt><dd>回到最新位置</dd><dt>图内拖动</dt><dd>查看历史，松开保持游标</dd><dt>Space</dt><dd>播放 / 暂停</dd><dt>Home / End</dt><dd>回到起点 / 终点</dd><dt>刻度轴拖动</dt><dd>直接选择范围；开启循环后播放</dd><dt>Shift + 拖动</dt><dd>建立选区，拖动两端调整范围</dd></dl><p>基于 Prism 复用开发；上游及依赖许可随软件包提供。</p></section>
 </div>
}
