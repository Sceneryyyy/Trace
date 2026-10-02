# Trace 声迹 / Prism 前端代码质量审计报告

审计日期：2026-09-20

2026-10-02 勘误：第 6 节的快照订阅优化已接入，但旧 selector 缺陷使相等结果仍触发更新；完整修复与真实 React/Chromium 证据见 [73-R1](73-CLOUD-CODE-REVIEW.md)。该修复位于 2995174，旧 preview.29/30 包不包含它。本文其余 findings/行号/“未运行”保留审计当时语义，当前验证见 [13](13-HANDOFF.md)。
审计范围：`src/trace/renderer/`（39 文件）、`src/renderer/`（66 文件），全部逐行实读
技术栈：Electron 40 · React 19 · zustand 5（仅 Prism 侧）· 手写 CSS（Trace 侧）/ 61KB 单文件 CSS（Prism 侧）

---

## 0. 总体结论

工程底子**高于平均水平**：Trace 侧有命令串行化 + 乱序防护 + 高频命令合并；Prism 侧有共享 FrameScheduler、离屏静态层缓存、瀑布自 blit、ResizeObserver 快照迁移防闪白。ARIA 覆盖（meter / separator / dialog / aria-live）在两个界面都明显经过设计。

核心短板集中在四点：

1. **Trace 主界面 30Hz 快照直接 `setState` 驱动整棵树 React 协调**，组件层零 memo 隔离（`React.memo`/`useCallback` 全 0，`useMemo` 仅 2 处）。
2. **Trace 侧 CSS 设计 token 双源冲突**（绿色系 vs 蓝色系两套 `:root` 互相覆盖）+ 116 处硬编码颜色双份维护。
3. **Prism 侧三个热点**：频谱 peak 浮层每帧触发 React 重渲染；设置提交每次 3 次全量 JSON 序列化 + 同步写盘；VU 表盘无缓存层每帧全量重绘 + `measureText`。
4. **逐帧 layout 级动画残留**：`height%`、`left%` 内联样式在 30/60Hz 路径上触发 layout，同文件内就有 `transform`/`clipPath` 的正确示范。

客观检查：本机无 Node/npm，**typecheck 与 79 个测试文件未运行**，标注为未验证。

---

## 1. Trace 声迹主界面（`src/trace/renderer/`）

### 1.1 架构摘要

- 状态管理：**无 store 库**。`App.tsx:79-106` 汇聚 20+ 个 `useState`；主进程 33ms（30Hz）`setInterval` 推送快照（`main.ts:768-792`）→ preload `postMessage` → `snapshotTransport.ts` 单订阅扇出 → `App.tsx:135` `setSnapshot`。
- 写得好的部分：命令串行队列 + `STALE_REQUEST` 重试（`App.tsx:109-131`）；seek/inspect/gain 高频命令「只保留最新」合并并对齐 rAF（`App.tsx:157-173`）；`historyPresentation.ts` 按 revision 丢弃乱序快照；窗口隐藏主进程降频 10 倍 + `visibilitychange` 补帧（`main.ts:772`、`App.tsx:137-138`）。

### 1.2 P0 — 渲染性能

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| T1 | 30Hz 快照使 App 全树（顶栏、sourcebar、TargetStrip、整个仪器网格、footer）每 33ms 协调一次 | `App.tsx:85,135` | `MeterSnapshot` 移出 React state：`useSyncExternalStore` 或复用已安装的 zustand，面板按字段 selector 订阅；canvas 类组件经 ref 在 React 外订阅直接绘制 |
| T2 | 每帧对象重建链使 memo 无法生效 | `App.tsx:237-241`（displaySnapshot 多层 spread）、`App.tsx:287-297`（timelineInstrument 工厂每次新建 3 个元素）、`App.tsx:330`（contents 字面量） | `useMemo` 化；之后给 `InstrumentWorkspace.tsx:81`、`Timeline.tsx:28` 加 `React.memo` |
| T3 | LoudnessBar 30Hz 改 `height%` 触发 layout | `App.tsx:51`（已抽查确认）；同文件 66-67 行就是 `clipPath`/`transform: scaleY()` 正确示范 | 改 `transform: scaleY()` |
| T4 | 相关度游标 30Hz 改 `left%` 触发 layout | `AnalysisInstruments.tsx:77` | 改 `transform: translateX()` |
| T5 | `layer` 对象字面量每渲染新建 → Timeline 每帧断开重建 `ResizeObserver` | `SpectrogramPanel.tsx:67` → `Timeline.tsx:114-115` | `useMemo`/`useRef` 稳定引用 |
| T6 | 2D 声谱 partial 分片到达即整帧重建约 52 万像素 ImageData | `SpectrogramPanel.tsx:58-64` + `spectrogramPresentation.ts:18-29` | 只更新新增列区间，或移入 OffscreenCanvas/Worker |

### 1.3 P1 — 性能与代码健康

- `Timeline.tsx:155` 拖拽 `setPreview` 每个 pointermove 经 Context 广播给 2-3 个 Timeline 重绘 → 按 rAF 节流。
- `AnalysisInstruments.tsx:51` 频谱 hover `setHover` 未节流（对比 `SpectrogramPanel.tsx:81`、`SurfaceCanvas.tsx:60` 均有 60ms 节流，标准不统一）。
- 死代码：`App.tsx:217` Space 分支不可达（行 209 已 return）。
- 录音库/素材库手工分页 50 条/页（`RecordingLibrary.tsx:54,111`、`ImportedLibrary.tsx:11,35`），500+ 条目建议虚拟化；`RecordingLibrary.tsx:71-75` 过滤每 render 全量执行。
- `ReportPanel.tsx:21` 排序移入 `useMemo`。

### 1.4 P1 — CSS / 视觉一致性（提升空间最大）

| # | 问题 | 证据 |
|---|---|---|
| C1 | **token 双源冲突**：`styles.css:1-6` 定义绿色系（`--bg:#121615`），`instruments.css:1-4` 又在 `:root` 重定义蓝色系（`--bg:#11151a`），导入顺序使后者覆盖前者——前者失效但仍被阅读引用，极易改错（已抽查确认） | `styles.css:1-6`、`instruments.css:1-4`、`main.tsx:9-10` |
| C2 | CSS 内硬编码 hex 76 处 + TS/canvas 侧约 40 处，canvas 调色板与 CSS token 双份手工维护 | `Timeline.tsx:55-111`、`spectrogramPresentation.ts:4`、`surfaceRenderer.ts:33` 等 |
| C3 | 按钮/下拉底色 `#242d27` 不走变量，主题覆盖后与面板色系脱节 | `styles.css:19-20,23` |
| C4 | 滚动条样式仅一处 `scrollbar-width:thin`，其他滚动区域不统一 | `styles.css:145` |
| C5 | 同族规则分散增量叠加：`.level-reading`（85/215 行）、`.error-banner`（125/270-272 行）、`.transport` 媒体查询重复 5 处（30/127/170/195/211 行） | `styles.css` |
| C6 | CSP `style-src 'unsafe-inline'` 为 5 处内联 style 放行，T3/T4 消除后可收紧 | `index.html:6` |

良好实践（保留）：`clipPath`/`transform` 仪表填充、grid + `container-type:size` 容器查询（`instruments.css:36,125-154`）、`prefers-reduced-motion` 兜底（`styles.css:138`）、Splitter 拖动直写 DOM 松手提交（`InstrumentWorkspace.tsx:74-78`）、内联 style 全库仅 5 处很克制。

### 1.5 P2 — 交互与可访问性缺口

- 时间轴无键盘等价物：`Timeline.tsx:206,210` 波形/ruler 只有 pointer 事件，无法键盘移动游标/建选区；ruler 无 tabindex/role。
- 主模态聚焦用 `document.querySelector('.trace-modal button')`（`App.tsx:141`）脆弱且落在关闭按钮；关闭后焦点不归还触发控件（对比 `InstrumentWorkspace.tsx:84,98` 有现成恢复模式）。
- 实时读数（游标时间 `App.tsx:345`、频点 `SpectrogramPanel.tsx:106`）无 `aria-live` 降频摘要。
- 操作提示大量只在 `title`；快捷键说明藏于「显示与帮助」弹窗（`DisplaySettingsForm.tsx:14`），主界面无入口。
- 滑杆 `output` 未与 `input` 关联（`App.tsx:290-291`）。

---

## 2. Prism 分析界面（`src/renderer/`）

### 2.1 架构摘要

- 16 个组件 + 14 个可视化器（全 Canvas 2D，DSP 走原生模块）+ 10 个 zustand store。
- 绘制循环组织**良好**：共享 `FrameScheduler`（`frameScheduler.ts:60-147`，帧率目标节流 + FPS 统计）；不播放时 `shouldRun` 自动退订 rAF（`visualizerFrameLoop.ts:50-57`）；resize 走 ResizeObserver → rAF 合并 → 旧内容快照迁移防闪白（`ScopeModule.tsx:576-617`）。
- zustand 订阅绝大多数是细粒度字段选择器且引用稳定，未见多余重渲染。

### 2.2 P0 — 正确性 / 明显浪费

| # | 问题 | 证据 | 建议 |
|---|---|---|---|
| P1 | 频谱开启 peak info 后每帧 `emitPeakInfo` 新建对象 → ScopeModule 每帧 React 重渲染 + `useLayoutEffect` 每帧测量 overlay | `SpectrumAnalyzer.ts:1175,796-803` → `ScopeModule.tsx:436-438,463-499` | 值比较去重，或浮层改 canvas 内绘制 / 直写 DOM style |
| P2 | 设置提交热路径：每次 set 做 3 次全量 `JSON.stringify` + 同步 `localStorage.setItem`；Strip 拖拽调宽 mousemove 频率触发 | `settingsStore.ts:400-412,254-263`、`profileDraft.ts:40`（已抽查确认）、`Strip.tsx:181-182` | persist 200-500ms 防抖；`profilesMatch` 改字段比较或缓存签名 |
| P3 | VU 指针表盘无任何缓存层，每帧重画全部刻度/标签/弧 + 每帧 `measureText` 布局 + 大量 rgba 字符串分配 | `VUMeter.ts:1364-1388,845-857,949-1216` | 表盘进离屏静态层；测量结果按 faceScale 缓存 |
| P4 | `SettingsPanel.tsx:12` 整库订阅，任何设置变化重渲染整个设置面板 | `SettingsPanel.tsx:12` | 改分字段选择器 |

### 2.3 P1 — 帧内分配与绘制成本

- Spectrum 热力填充每列每帧拼 `rgba()` 字符串（`SpectrumAnalyzer.ts:963-981`）→ 改 `ImageData` 单 buffer（`Spectrogram.ts:546-572` 已是正确范式）。
- 渐变对象每帧重建：`SpectrumAnalyzer.ts:996`、`Oscilloscope.ts:308-316` → 按尺寸/颜色 key 缓存。
- Vectorscope 每帧 4096 点逐点 `fillRect` + 每点新对象（`Vectorscope.ts:572-588,362-377`）→ 预分配 Float32Array / Path2D 批量。
- LUFSMeter 每帧多候选 `measureText`（`LUFSMeter.ts:337-349`）→ 缓存测量结果，刻度进静态层。
- Spectrogram 频率网格每帧重绘未进静态层（`Spectrogram.ts:584-632`）。
- 原生 DSP 缺失时 `console.error` 每帧刷屏（`SpectrumAnalyzer.ts:1060`、`Oscilloscope.ts:251`）→ 只打一次。
- Strip 拖拽调宽每个 mousemove 使整树 reconcile（`Strip.tsx:181-182`）。
- popout 采样队列无上限，掉帧积压（`ScopePopoutDataSource.ts:57-78`）。

### 2.4 P2 — 体验与健壮性

- **DPR 变化无监听**：跨屏拖动后 canvas 模糊直到下次 resize（`scopeCanvasTransform.ts:56`）→ `matchMedia('(resolution: Xdppx)')` 链式监听。
- 光标轮询 IPC：`ScopePopoutWindow.tsx:107` 无条件 120ms；`App.tsx:252` toolbar 可见期 120ms → mouseenter/leave 为主，轮询降频兜底。
- 窗口被遮挡（未最小化）仍全速绘制：FrameScheduler 无 `document.hidden`/occlusion 门控。
- `transition: max-height 160ms` 触发 layout（`globals.css:2298`）；toolbar/popout 的 `backdrop-filter: blur(14-16px)` 高成本合成层（`globals.css:331-332,1004-1005`）；`prefers-reduced-motion` 只覆盖 2 处动画。
- Astra 进度条 `width%` + 250ms setState（`AstraScopeModule.tsx:357,229-231`）→ `transform: scaleX()`。
- Hooks 顺序隐患：`ScopeModule.tsx:501-508` nowPlaying 提前 return 位于两组 `useEffect` 之前，依赖隐式约定，建议拆独立组件。

### 2.5 交互与可访问性缺口

- 几乎无全局快捷键（全渲染层只有 DialogApp 的 Enter/Escape）；strip 调宽 handle 纯 mouse（`Strip.tsx:288`），应加 `role="slider"` + 方向键 + `aria-valuenow`；重排序只有按钮。
- canvas 对读屏完全透明：建议每个 scope canvas `role="img"` + 读数摘要 `aria-label`；测量 overlay / 进度条的 `aria-hidden` 重新评估（`ScopeMeasurementOverlay.tsx:208`、`AstraScopeModule.tsx:354`）。
- 视觉层亮点：`:root` token 集中（`globals.css:3-59`）、`--accent-rgb` alpha 组合、主题运行时写 CSS 变量 + canvas 颜色经主题对象注入的分层是有意设计，注释充分。

---

## 3. 跨界面对比与协同建议

| 维度 | Trace 侧 | Prism 侧 | 建议 |
|---|---|---|---|
| 高频数据进 React | 30Hz setState 全树协调（差） | FrameScheduler + ref 直绘（好） | Trace 借鉴 Prism 的调度器模式 |
| memo 隔离 | 0 处 | 0 处但靠引用稳定撑着 | 两侧都补，Trace 优先 |
| 设计 token | 双源冲突 + 116 处硬编码（差） | 单源 + 运行时主题（好） | Trace 收敛为单源，canvas 调色板共享 TS token 模块 |
| 动画手段 | 仅 2 处 layout 级残留 | max-height / backdrop-filter 成本 | 统一 transform/opacity 规范 |
| 节流标准 | hover 节流不统一 | peak info 未去重 | 建立统一的高频事件节流/去重工具 |

## 4. 建议落地顺序

1. **第一梯队（性能立竿见影）**：Trace T1+T2+T3（快照出 React state、切断重建链、height→transform）；Prism P1+P2（peak info 去重、设置持久化防抖）。
2. **第二梯队（视觉体系）**：Trace C1+C2+C3（token 单源化、hex 收敛、canvas 调色板共享）；Prism P3（VU 静态层）。
3. **第三梯队（交互打磨）**：两侧键盘等价物与焦点归还、aria-live 读数摘要、DPR 监听、遮挡停帧。

## 5. 未运行的检查

- `npm run typecheck`、`npm test` 及全部专项测试脚本：本机无 Node/npm，未验证。
- 真机 30/60Hz 帧耗时、内存曲线：需开发环境实测验证上述推断的收益量级。

---

## 6. 第一轮迭代实施状态（2026-09-20，改动未提交）

### 已落地

**Trace 侧（`src/trace/renderer/`）**

| 报告条目 | 状态 | 实现 |
|---|---|---|
| T1 快照驱动全树 | 已接入，后续修正 | 新增 snapshotStore/selector、viewModel 与 9 个 memo 容器；当时 selector 对新快照返回相等值仍产生新引用，顶栏没有实现预期隔离。2995174 修正后真实 React/Chromium 相同快照额外 render 为 0；实机帧时间仍待验（73-R1） |
| T2 每帧对象重建链 | ✅ | App 回调全部 `useCallback`；`contents`/`settingsContent`/`viewInputs` 走 `useMemo`；`InstrumentWorkspace` 包 memo；`useWorkspace` 回调稳定化 |
| T3 LoudnessBar height% | ✅ | 改 `transform: scaleY()`（CSS 侧加 height:100%/transform-origin:bottom），视觉一致 |
| T4 相关度游标 left% | ✅ | 改全宽 `.correlation-cursor` 的 `translateX(%)`，视觉一致 |
| T5 layer 引用不稳 | ✅ | `SpectrogramPanel` volatile ref + `useMemo([])`；同时根治了 `Timeline`/`SpectrumPanel`/`SoundFieldPanel` 每帧重建 ResizeObserver（drawRef/paintRef 模式） |
| hover/拖拽节流 | ✅ | 频谱 hover 60ms；选区拖拽预览 rAF 合并 |
| C1 token 双源 | ✅ | token 全部归入 `instruments.css :root`，`styles.css` 只留字体 |
| C3 控件色硬编码 | ✅ | 新增 `--control-bg/--control-hover/--control-border-strong/--input-bg/--input-border` 并替换 |
| C4 滚动条不统一 | ✅ | 5 个滚动容器统一 thin |
| 死代码 / 排序过滤 | ✅ | App.tsx 不可达 Space 分支删除；ReportPanel 排序、RecordingLibrary 过滤入 `useMemo` |
| 模态焦点（P2-14 提前） | ✅ | 打开聚焦首个非关闭控件；关闭归还焦点给触发控件 |

**Prism 侧（`src/renderer/`）**

| 报告条目 | 状态 | 实现 |
|---|---|---|
| P1 peak info 每帧重渲染 | ✅ | `ScopeModule` 函数式 setState 五字段去重 |
| P2 持久化热路径 | ✅ | `persistWorkingState` 300ms trailing 防抖 + pagehide/beforeunload/hidden 立即 flush |
| P4 SettingsPanel 整库订阅 | ✅ | 改 6 个字段 selector |
| console.error 刷屏 | ✅ | 两个可视化器只打一次，恢复后重置 |
| DPR 变化监听 | ✅ | `matchMedia(resolution)` 链式监听接入既有 resize 管线 |
| Astra 进度条 width% | ✅ | 改 `scaleX`（圆帽在极小/极大进度下有轻微形变，属标准取舍） |
| reduced-motion 覆盖 | ✅ | 补 9 类过渡的分组覆盖 |
| Strip 调宽热路径 | ✅ | mousemove rAF 合并，mouseup 以最终坐标补交 |

### 本轮明确未做（及原因）

- **T6 声谱 partial 增量着色**：`SpectrogramRaster.add` 对旧列做 max 累积（`spectrogramView.ts:81`），前序列可能被后续 tile 改写，增量方案需先证明追加顺序，另立任务。
- **C2 canvas 调色板共享**：需建 TS token 模块并改 5 处绘制代码，留到下一轮。
- **C5 styles.css 同族规则归并**：纯整理，低风险但高 churn，单独提交更清晰。
- **P3 VU 表盘静态层 / Spectrum 热力 ImageData 化 / 渐变缓存**：改动面大，需可运行的性能基线对照。
- **第三梯队交互项**：时间轴键盘等价物、aria-live 读数、遮挡停帧。

### 验证缺口（阻塞提交前必须补）

本机无 Node/npm：`npm run typecheck`、`test:trace-*`、`tools/m7` UI 门禁均未运行；两侧 IDE 诊断干净。需人工目视三种模式（监测/录音/文件回听）下的仪表、波形、声谱、拖拽、缩放与模态焦点行为。
