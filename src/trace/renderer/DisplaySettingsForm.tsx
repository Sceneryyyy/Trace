import {SectionTabs} from './SectionTabs'
import {useState} from 'react'
import type {DisplaySettings} from '../displaySettings'
import {product} from '../product'
import {SupportPanel} from './SupportPanel'
import {ThemePicker} from './ThemePicker'
import {applyTheme} from './themeRuntime'
import type {ThemeId} from '../instrumentThemes'
import type {Command} from '../shared'
export function DisplaySettingsForm({value,busy,apply,request,support,confirmExit=true,theme}:{value:DisplaySettings;busy:boolean;apply:(value:DisplaySettings,confirmExit:boolean,theme:ThemeId)=>void;confirmExit?:boolean;theme:ThemeId;support?:import('../supportJournal').SupportStatus;request:(command:Command,payload?:Record<string,unknown>)=>Promise<unknown>}):React.JSX.Element{
 const [draft]=useState(value),[exitGuard,setExitGuard]=useState(confirmExit),[themeDraft,setThemeDraft]=useState(theme)
 // Preview immediately across the window; App restores the saved theme if the dialog closes unapplied.
 const [section,setSection]=useState<'display'|'behavior'|'help'|'about'>('display')
 const previewTheme=(id:ThemeId)=>{setThemeDraft(id);applyTheme(id)}
 return <div className="settings-content categorized-settings">
  <SectionTabs prefix="settings-section-" label="设置分类" value={section} change={setSection} tabs={[{id:'display',label:'显示'},{id:'behavior',label:'行为'},{id:'help',label:'帮助与诊断'},{id:'about',label:'关于'}]}/>
  <div id="settings-section-display" role="tabpanel" aria-labelledby="settings-section-tab-display" hidden={section!=='display'}>
  <div className="settings-theme"><span id="theme-heading">仪表主题</span><ThemePicker value={themeDraft} change={previewTheme}/><small>选择后立即预览，点“应用设置”保存。只改变显示颜色，不影响测量数值。</small></div>
  <p className="settings-hint">波形倍率与时间窗位于工作台的时间轴工具中。</p></div>
  <div id="settings-section-behavior" role="tabpanel" aria-labelledby="settings-section-tab-behavior" hidden={section!=='behavior'}>
  <label>录音中退出确认<input aria-label="录音中退出确认" type="checkbox" checked={exitGuard} onChange={e=>setExitGuard(e.target.checked)}/></label>
  </div>
  <div id="settings-section-help" role="tabpanel" aria-labelledby="settings-section-tab-help" hidden={section!=='help'}>
   <SupportPanel request={request} loggingAvailable={support?.loggingAvailable}/>
   <details className="shortcut-help"><summary>键盘与鼠标快捷操作</summary><dl><dt>滚轮</dt><dd>波形区调整倍率 ×1–×4</dd><dt>Ctrl + 滚轮</dt><dd>波形区调整时间窗 5–60 秒</dd><dt>Shift + 滚轮</dt><dd>横向浏览文件或固定缓存</dd><dt>Page Up / Down</dt><dd>向前 / 向后移动一个时间窗</dd><dt>Ctrl + D</dt><dd>清除选区及循环；时间轴右键菜单同样可用</dd><dt>R</dt><dd>开始录音</dd><dt>Escape</dt><dd>结束录音或暂停回听</dd><dt>实时</dt><dd>回到最新位置</dd><dt>图内拖动</dt><dd>查看历史，松开保持游标</dd><dt>Space</dt><dd>播放 / 暂停</dd><dt>Home / End</dt><dd>回到起点 / 终点</dd><dt>刻度轴拖动</dt><dd>直接选择范围；开启循环后播放</dd><dt>Shift + 拖动</dt><dd>建立选区，拖动两端调整范围</dd></dl></details>
  </div>
  <div id="settings-section-about" role="tabpanel" aria-labelledby="settings-section-tab-about" hidden={section!=='about'}>  <section className="about-trace"><h3>{product.fullName}</h3><p>LeoMoon 系列 · {product.subtitle} · {product.version}</p><p>基于 Prism 复用开发；上游及依赖许可随软件包提供。</p></section></div>
  <button className="primary-button" disabled={busy} onClick={()=>apply(draft,exitGuard,themeDraft)}>应用设置</button>
 </div>
}
