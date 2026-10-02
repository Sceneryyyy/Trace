# 71 · 仪表主题色（M13）开发方案

状态：v1.2 方案与阶段实施记录。初始基线 `recorder/dev@7d38357`（preview.30）；主题实现 `2938c8e`、72-R1/R2 修复 `c67e9e9` 等已于 2026-09-30 推送并合入 `recorder/dev`，用户已验收开发构建（10.4）。72-R3 首帧断言已在 2026-10-02 的 `2995174` 修正，最新 Windows 完整 flow/首帧复验仍待执行；preview.31 尚未打包。当前状态见 [13](13-HANDOFF.md)，审计见 [72](72-INSTRUMENT-THEMES-REVIEW.md)、[73](73-CLOUD-CODE-REVIEW.md)。

## 1. 目标与范围

方案建立时 Trace 各仪表只有一套绿—青配色。本阶段已增加五套可选主题：

| 主题 ID | 名称 | 主信号色 | 说明 |
| --- | --- | --- | --- |
| `trace-green` | Trace 绿（默认） | `#91E65C` | 颜色值与 preview.30 一致；仅有第 5 节 TH-A01 列明的预期差异 |
| `graphite` | 石墨灰 | `#F2F5F7` | 低饱和中性灰，适合长时间盯表或录屏；信号近白并加粗 |
| `ember` | 黄橙 | `#C2551C` → `#FFB03A` | 电平柱、响度柱和声谱使用橙—金渐变 |
| `ocean` | 海蓝 | `#5AA9FF` | 蓝色系，第二曲线用青绿 |
| `duo` | 蓝橙（色弱友好） | `#56B4E9` / `#E69F00` | 基于 Okabe–Ito 色板，声谱用 cividis 类色标；红绿色弱用户首选 |

**范围内**：
- 实时电平/峰值柱、RMS；M/S/I 响度柱与历史曲线；滚动波形与文件波形
- 频谱（当前/平均/保持）、相关度/平衡/矢量示波、参考 A/B 曲线
- 2D/3D 声谱图的“跟随主题”配色，以及图例、选区/游标/目标带
- 主按钮与控件激活态
- 中性色去绿调（见 3.1）

**不在范围内**：
- LeoMoon 狮子月牙标识（`resources/trace/branding/leomoon-trace-v1.png`）和 LeoMoon 字标保持 61 规定的样式，不随主题变化。顶部 TRACE 小字（`.brand .product-name`）按用户决定**跟随主题**，见第 6 节。
- 危险红（REC、削波、超限、设备故障）、注意琥珀、焦点环在所有主题中固定。
- 导出的 HTML/CSV 报告、诊断包保持固定配色。
- 用户自定义任意颜色、亮色主题、按仪器单独设主题。结构允许后续扩展，第一版不做。
- 主题只影响显示，不改变任何计量、缓存、协议或分析结果。

## 2. 当前实现事实（recorder/dev@7d38357）

| 位置 | 现状 | 对本方案的影响 |
| --- | --- | --- |
| `renderer/instruments.css:1-8` | `:root` 下唯一的 token 源：`--green/--cyan/--red/--amber` 等；控件/输入底色带绿调（`#242d27`、`#202823`），与偏蓝灰的 `--bg:#11151a` 不一致 | 没有主题切换点；灰/蓝主题会残留绿调 |
| renderer 下 6 个 CSS 文件 | 约 70 处颜色字面量，包括峰值渐变 `styles.css:81`、响度柱 `instruments.css:114`、声谱图例 `spectrogram.css:8-9`、弹窗 `styles.css:147-148`、主按钮 `styles.css:161-162` | 需要逐项改为 token |
| `LiveInstruments.tsx:33,38` | 电平/响度刻度为 −60…0 dB 线性。峰值渐变 70% 处约 −18 dBFS，89% 处约 −6.6 dBFS（黄），100% 处为红 | 颜色分区本身表达电平安全等级，不能只当装饰色 |
| `LiveInstruments.tsx:22-29` | 未就绪和数据错误都显示“—”，只能通过 `title` 区分；就绪数字用 `--green`，未就绪用 `--secondary` | 就绪与否已有非颜色提示；“测量中”和“无数据”在视觉上不可分 |
| `Timeline.tsx:61-115` | Canvas 硬编码波形、M 实线 / S `[5,3]` / I `[2,3]` 曲线、目标带、选区、游标、网格 | CSS 变量影响不到；线型区分已存在 |
| `AnalysisInstruments.tsx:33-78` | 频谱曲线中当前、平均都是实线，保持为 `[3,3]`；矢量示波硬编码 `#91e65c/#e5b463` | 当前与平均曲线只靠颜色区分 |
| `ReferencePanel.tsx`、`SpectrogramPanel.tsx`、`SurfaceCanvas.tsx` | 参考 A/B、声谱网格、3D 坐标标签硬编码 | 需要读取主题 |
| `spectrogramPresentation.ts:4` / `surfaceRenderer.ts:33` | 2D LUT 与 3D shader 各存一份 `trace`/`heat` 五段色标；`trace` 色标 L\* 为 6/26/54/84/89 | 数据重复；末段亮度只升 5 |
| `displaySettings.ts:9`、`main.ts:680` | 显示设置严格校验字段集合；恢复失败被 catch 吞掉后回退默认 | 往 `DisplaySettings` 加字段会导致 preview.30 降级时丢失目标/波形倍率设置 |
| `contracts.ts:58-70`、`main.ts:384/535-536` | 已有单字段命令 `view.gain`，以及顶层偏好 `app.configure{confirmExitWhileRecording}` | 主题可以照此做成独立命令和独立顶层字段 |
| `spectrogramProtocol.ts:17` | 声谱缓存键只含 FFT/声道/频率范围 | 换主题不会使声谱缓存失效，这是期望行为 |
| `App.tsx:308`、`styles.css:147` | 显示设置是居中 510 px 弹窗，遮罩 `#050906b8`（约 72% 不透明） | 弹窗背后的仪表几乎看不见，不能依赖它预览 |
| `main.ts` | `loadFile(index.html)` 之后才下发状态快照 | 若不处理，启动时会先闪一帧绿色 |

## 3. 设计

### 3.1 三层 token

1. **基础色板**（每个主题只提供这一层，TS 中定义）：
   - `signalLo`、`signal`、`signalHi`
   - `meterNear`
   - `seriesS`、`seriesI`
   - `cursor`
   - `onSignal`、`button`
   - `spectrogram[5]`
2. **语义 token**（由基础色板生成，CSS 变量名）：
   - `--signal`、`--signal-strong`
   - `--series-m/-s/-i`、`--target`
   - `--cursor`、`--on-signal`
   - `--meter-safe-lo/-safe/-near`
   - 派生值：`--signal-soft` 为 signal 加 12% 透明度；`--signal-border` 为 signal 与 `--border` 按 40% 混合；`--selection-fill` 为 cursor 加 12% 透明度。派生规则写在代码里，不在每个主题里手写。
3. **组件 token**：`--meter-peak-gradient`、`--loudness-bar-gradient`、`--curve-current/-average/-hold`、`--ref-a/-b`、`--field-in/-out`、`--button-primary-bg/-fg`、`--brand-product`（TRACE 小字，取 `signalHi`）、`--live-badge` 等，全部从语义 token 引用。

**固定层**（所有主题共用，不在主题里定义）：

| 分组 | token | 值 |
| --- | --- | --- |
| 中性 | `--bg/--panel/--border/--text/--secondary` | 保持现值 `#11151a/#191f26/#333d48/#e8edf2/#abb7c4` |
| 中性（去绿调） | `--control-bg/--control-hover/--control-border-strong/--input-bg/--input-border`，以及弹窗底/边、遮罩、Canvas 网格/轴字 | 统一为蓝灰：`#242d36/#303b46/#5f6b78/#1d252d/#3e4a57`；弹窗 `#191f26`/`#48545f`；遮罩 `#06090cb8`；网格 `#303e4a`；轴字 `#aebccb`（与频谱现用值一致） |
| 危险 | `--danger` | `#FF5E66`，用于 REC、过载区、超限、故障 |
| 注意 | `--attention` | `#EFB65B`，必须配 ⚠ 图标或文字标签 |
| 焦点 | `--focus-ring` | `#FFFFFF`，2 px 描边 + 2 px 偏移，对面板 16.6:1 |

旧名 `--green/--cyan/--amber/--red` 在 T1 期间作为别名保留，T3 结束前清除全部引用。

### 3.2 主题色值（已实测）

| 字段 | trace-green | graphite | ember | ocean | duo |
| --- | --- | --- | --- | --- | --- |
| `signalLo` | `#559938` | `#6B7683` | `#C2551C` | `#3B7BC8` | `#2B7FB8` |
| `signal`（安全区顶/波形） | `#91E65C` | `#E4E8EC` | `#FFB03A` | `#6BB2FF` | `#56B4E9` |
| `signalHi`（M/就绪数字） | `#91E65C` | `#F2F5F7` | `#FFA53D` | `#5AA9FF` | `#56B4E9` |
| `meterNear`（−6 … −1 dBFS） | `#D9DD63` | `#F2CF4A` | `#FFF0C2` | `#F2CF4A` | `#F0E442` |
| `seriesS` | `#58D4DA` | `#6FB0E8` | `#58D4DA` | `#4FE0B0` | `#E69F00` |
| `seriesI` / `--target` | `#EFB65B` | `#EFB65B` | `#B48CFF` | `#EFB65B` | `#F5F5F5` |
| `cursor` | `#58D4DA` | `#58D4DA` | `#E8EDF2` | `#F4F8FF` | `#CC79A7` |
| `button` / `onSignal` | `#7AC44B` / `#14200F` | `#D9DEE3` / `#11151A` | `#F59A3A` / `#1F1206` | `#5AA9FF` / `#0B1628` | `#56B4E9` / `#0B1628` |
| `spectrogram[5]` | `#0E151C #224153 #2D8F95 #91E65C #F6E17D` | `#0E1116 #2B3139 #56606B #9AA3AC #EEF1F4` | `#120E0B #3D1D12 #8F3A1A #EA8A2E #FFE7A8` | `#0B1320 #153459 #1F70B2 #52C4F5 #E2F5FF` | `#00204C #31446B #666970 #958F78 #FFEA46` |

实测结果：
- 对比度以面板 `#191f26` 为背景，按 WCAG 相对亮度计算。
- ΔE 为 CIEDE2000，“色弱”取 Machado 2009 模型下 deutan 与 protan 两者中的较小值。
- M/S/I 两两之间取最小值。

| 指标 | trace-green | graphite | ember | ocean | duo |
| --- | --- | --- | --- | --- | --- |
| M / S / I 对面板 | 10.81 / 9.36 / 9.10 | 15.16 / 7.15 / 9.10 | 8.46 / 9.36 / 6.43 | 6.76 / 9.98 / 9.10 | 7.19 / 7.37 / 15.22 |
| `signalLo` 对面板 | 4.74 | 3.59 | 3.64 | 3.84 | 3.82 |
| 游标对面板 | 9.36 | 9.36 | 14.09 | 15.58 | 5.42 |
| 主按钮文字 | 7.90 | 13.53 | 8.34 | 7.38 | 7.85 |
| M/S/I 最小 ΔE（正常） | 32.7 | 25.6 | 36.5 | 38.8 | 27.4 |
| M/S/I 最小 ΔE（色弱） | **2.1**（M–I，靠线型区分） | 23.9 | 15.1 | 14.6 | 24.2 |
| 安全区 / 接近区 ΔE（正常） | 13.9 | 30.6 | 21.3 | 61.5 | 57.5 |
| 声谱 L\* | 6/26/54/84/**89** | 5/20/40/67/95 | 4/15/36/66/92 | 6/21/46/75/95 | 13/29/44/59/92 |

说明：
- 默认主题 M 与 I 在绿色盲下 ΔE 只有 2.1，末段声谱亮度只升 5，都是 preview.30 的现状。本阶段不改（保证默认不变），由线型规则兜底；是否调整留作后续议题。
- ember 的信号色与固定“注意”琥珀 ΔE 只有 7.9，所以“注意”必须配图标或文字（见 3.3）。目标带在 ember 下改用紫色 `--target`，不借用“注意”色。

### 3.3 不依赖颜色的保障（硬性规则）

1. **电平分区按 dB 定义**，不再按百分比：
   - 安全区低于 −6 dBFS，由 `signalLo` 渐变到 `signal`。
   - 接近区为 −6 至 −1 dBFS，使用 `meterNear`。
   - 过载区从 −1 dBFS 起，使用固定的 `--danger`。
   - 阈值是 `renderer` 常量 `METER_NEAR_DB/METER_OVER_DB`，只影响显示，不进入计量。
   - 所有主题在 −6 与 −1 dBFS 处画 1 px 刻度线。
   - 峰值读数进入过载区时，读数改为反色块，柱顶显示 `OVER` 标记并保持 2 秒。数据源是 sample peak，标记和文案都不得写成 TP。
2. **线型是第一保障**：同一图中的系列线型必须互不相同。
   - 时间轴：M 实线、S `[5,3]`、I `[2,3]`，现状保留。
   - 频谱：当前实线、平均 `[6,3]`、保持 `[3,3]`。平均曲线目前是实线，这里改为虚线，属于 TH-A01 的预期差异。
   - 参考：A 实线、B `[5,3]`，现状保留。
   - 目标线为 `[4,2]` 并配带状填充。
3. **读数状态**：
   - 测量中：保留“—”，旁边加 10 px 的“测量中”小字。
   - 数据不可用：显示“无数据”并加故障图标，用 `--danger`。
   - 就绪：正常数值，在 graphite 下字重 600。
4. **注意**：凡使用 `--attention` 的地方（负相关、超出目标、库操作警告）都要配 ⚠ 图标或文字，所有主题一致。
5. **游标**：所有主题的游标宽 2 px，顶端加 6 px 三角标记，与标签文字和曲线在形状上区分。
6. **焦点与选中**：焦点环固定白色，不随主题变化；选中态除边框外必须带 ✓ 图标。
7. **无过渡动画**：切换主题立即生效，不做颜色渐变（避免 Canvas 过渡开销，也照顾减少动效的偏好）。

### 3.4 单一数据源与接入

- 新增 `src/trace/instrumentThemes.ts`（主进程和渲染进程共用），内容包括：
  - `ThemeId` 类型、`themeIds`、`defaultThemeId='trace-green'`
  - `themes: Record<ThemeId, ThemePalette>`，即 3.2 表中的数据
  - `deriveTokens(palette)`，生成语义 token 和组件 token

  这是颜色的唯一来源。CSS 文件只写 `var(--…)`；固定层写在 `instruments.css :root`。
- 新增 `renderer/themeRuntime.ts`：
  - `applyTheme(id)` 把派生 token 写到 `document.documentElement.style`，并设置 `data-trace-theme`。
  - 导出当前主题对象和订阅接口，供 Canvas 使用。
- **Canvas**：读取主题对象，不在每帧调用 `getComputedStyle`；把 `themeId` 加入重绘依赖。切换主题只重绘，不重新请求数据。
- **声谱**：
  - `spectrogramPresentation.ts` 按色标惰性生成 4096×3 LUT 并缓存，上限为 5 个主题加 `heat`，内存有界。
  - `surfaceRenderer.ts` 从同一份色标构造 uniform，删除重复数据。
  - `SpectrogramSettings.palette` 仍是 `'trace'|'heat'`：`'trace'` 的含义改为“跟随主题”，`'heat'` 不变。存储值不迁移，协议和缓存版本不变。
- **启动防闪**：主进程在创建窗口前已读取偏好，`loadFile(…,{query:{theme}})`；`renderer/main.tsx` 首次渲染前按白名单校验后调用 `applyTheme`，非法值回退默认。之后以状态快照中的 `instrumentTheme` 为准。

### 3.5 持久化与命令

- 偏好文件新增顶层字段 `instrumentTheme`，外加 `instrumentThemeVersion:1`。
- **`DisplaySettings` 和 `displaySettingsVersion` 保持不变**。preview.30 只读取已知的键，会忽略新字段，所以降级后目标开关、目标 LUFS、波形倍率都不会丢失。降级期间一旦保存偏好，主题字段会被丢弃，重新升级后回到默认，这是可接受的。
- 新增白名单命令 `view.theme`，payload 为 `{theme}`，照 `view.gain` 的先例：
  - `contracts.ts` 校验字段集合必须正好是 `theme`，且值在 `themeIds` 内，否则抛出 `INVALID_THEME`。
  - `main.ts` 更新 `state.instrumentTheme` 并调用 `savePreferences()`。
  - 选择独立命令的原因：不动 `validateDisplaySettings` 的严格结构，回滚也最简单。
- **恢复**：字段缺失或值未知时回退默认，不影响其他偏好。
- `TraceState` 增加 `instrumentTheme`，随快照下发。诊断包的偏好摘要带上主题 ID，便于复现截图问题。

### 3.6 设置界面

- `DisplaySettingsForm.tsx` 增加“仪表主题”色卡组：
  - 使用 `role="radiogroup"`，每张卡为 `role="radio"` 加 `aria-checked`。
  - 方向键切换，Home/End 跳到首尾，Tab 只停在当前选中卡。
  - 触控目标不小于 44×44 px。
- 每张色卡内置迷你预览，不依赖弹窗背后的实时信号：
  - 一根带 −6/−1 刻度线的电平柱，展示安全、接近、过载三段。
  - M/S/I 三段短线，按各自线型绘制。
  - 一条声谱色带。
  - 主题名称；duo 额外显示“色弱友好”标签。
- 选中后立即应用到整个窗口，同时更新预览。点“应用设置”后依次发送 `view.settings`、`view.theme`、`app.configure`。任一步失败都保留弹窗并提示，已成功的部分不回滚（各命令相互独立）。
- 关闭或 Esc 且未应用时，恢复打开弹窗前的主题。
- 声谱设置中的“Trace”配色改名为“跟随主题”；图例 `.spectral-colors` 使用当前色标。

## 4. 分阶段任务

| 编号 | 任务 | 主要文件 | 完成证据 |
| --- | --- | --- | --- |
| TH-T0 | 记录基线：运行 `node tools/trace.cjs check`；在 1× 下截取 6 个场景（见 TH-A02）；默认主题另截 1.5×/2× | — | 13 中记录基线提交、检查结果、截图位置 |
| TH-T1 | **token 化，外观零变化**：CSS/Canvas 全部字面量改为三层 token；新增 `instrumentThemes.ts`，只含 `trace-green`；固定层暂用现值（含绿调中性色） | renderer 下全部 `*.css`、`Timeline.tsx`、`AnalysisInstruments.tsx`、`ReferencePanel.tsx`、`SpectrogramPanel.tsx`、`SurfaceCanvas.tsx`、`spectrogramPresentation.ts`、`surfaceRenderer.ts` | 截图与基线逐像素一致（只容忍抗锯齿）；静态检查确认 renderer 中除主题定义和白名单外没有颜色字面量 |
| TH-T2 | 主题数据与持久化：补齐四个新主题；中性色去绿调；新增 `view.theme`、顶层偏好、启动 query | `instrumentThemes.ts`、`instruments.css`、`contracts.ts`、`main.ts`、`shared.ts`、`renderer/main.tsx` | 命令校验、未知值回退、preview.30 格式偏好读写的单元测试通过 |
| TH-T3 | 运行时与可辨识性：`themeRuntime.ts`；Canvas 重绘；声谱 LUT/uniform 统一；dB 分区与刻度线、OVER 标记；读数三态；游标标记；频谱平均曲线改虚线；TRACE 小字与“实时”徽章接入主题（D1） | `themeRuntime.ts`、各 Canvas 组件、`LiveInstruments.tsx`、`styles.css`（`.brand`、`.live-badge`）、声谱相关文件 | 五个主题下范围内仪器无残留绿色；切换前后读数不变；声谱不重新计算 |
| TH-T4 | 设置界面：色卡组、迷你预览、应用/取消语义、键盘与焦点 | `DisplaySettingsForm.tsx`、`styles.css`、`SpectrogramPanel.tsx` | 键盘和鼠标都能切换并应用；重启后恢复；Esc 还原 |
| TH-T5 | 验收与文档：色值自动测试、截图矩阵、文档同步、版本升到 preview.31 | `test/`、`docs/05`、`docs/28`、`docs/61`、`docs/62`、`docs/07`、`docs/13`、`product.ts` | TH-A01–A09 都有证据；M7 界面检查五个主题各跑一轮（1×） |

T1 最关键，它把“换颜色”变成“改一张表”，可以单独合回 `recorder/dev`。

## 5. 验收（TH-A01–A09）

| 编号 | 检查 | 通过标准 |
| --- | --- | --- |
| TH-A01 | 默认主题回归 | T1 后与基线逐像素一致。T2/T3 之后只允许以下预期差异，并且每项都有前后对比截图：① 中性色去绿调；② −6/−1 刻度线与 dB 分区边界（原 89% 过渡点变为 −6 dBFS，约 90%）；③ OVER 标记；④ “测量中/无数据”标注；⑤ 游标 2 px 与三角标记；⑥ 频谱平均曲线改虚线。旧偏好启动后仍为绿色 |
| TH-A02 | 覆盖完整 | 6 个场景 × 5 个主题，全部在 1× 下截图：实时有信号、峰值进入过载、测量中/设备失效、选区 + 循环、目标超限、3D 声谱。默认主题另做 1.5×/2×。所有范围内元素都随主题变化，静态检查无遗漏字面量 |
| TH-A03 | 持久化与兼容 | 应用后重启恢复；未知 ID 回退；非法 `view.theme` 被拒；preview.30 读取新偏好后，目标与波形倍率设置不丢 |
| TH-A04 | 可读性（自动计算，数据来自 `instrumentThemes.ts`） | ① 正文和读数对面板 ≥ 4.5:1；② 信号、系列、`signalLo`、游标对面板 ≥ 3:1；③ 主按钮文字对按钮底 ≥ 4.5:1；④ 同一图中系列两两 ΔE ≥ 20（正常视觉）；⑤ 色弱模拟（deutan、protan）下 ΔE ≥ 12，或满足 3.3 的线型不同规则；⑥ 相邻电平区 ΔE ≥ 12（正常视觉），且有刻度线；⑦ 新主题的声谱色标 L\* 单调递增，相邻差 ≥ 8（正常和 deutan 模拟都要满足），默认主题按现状豁免 |
| TH-A05 | 状态语义 | REC、过载、超限、设备故障、缺失、测量中在所有主题下都有非颜色提示（文字、图标、线型或形状），截图逐项核对 |
| TH-A06 | 数据不变 | 同一文件同一时刻，切换主题前后 M/S/I/LRA/TP、相关度读数完全一致；声谱缓存键和分块不变；录音中切换主题不产生缺口 |
| TH-A07 | 性能 | 切换只触发重绘；实时监测帧时间不回退；LUT 缓存 ≤ 6 份；10 分钟内反复切换无内存增长 |
| TH-A08 | 品牌与启动 | LeoMoon 狮子月牙和 LeoMoon 字标不变；TRACE 小字、“实时”徽章随主题变化，且 TRACE 小字对顶栏底色 ≥ 4.5:1；每个主题下人工复核顶栏协调性；冷启动非默认主题时无绿色闪帧 |
| TH-A09 | 键盘与无障碍 | 色卡组可以只用键盘完成选择、应用和取消；焦点环在五个主题下都清晰；读屏能读出主题名与选中状态 |

真实显示器上的观感和色弱用户的主观体验列为人工验收，不能用自动计算代替；未经人工验收，不得写成“已验证色弱友好”。

## 6. 已确认决定（2026-09-28，用户确认）

| # | 事项 | 决定 | 落实位置 |
| --- | --- | --- | --- |
| D1 | 顶部 TRACE 小字是否跟随主题 | **跟随**。狮子月牙 PNG 和 LeoMoon 字标不变；TRACE 小字、“实时”徽章、按钮激活态随主题变化 | 第 1 节范围、3.1 `--brand-product`、TH-T3、TH-A08；同步修改 61 |
| D2 | 电平分区阈值 | **−6 / −1 dBFS**，按方案执行 | 3.3 第 1 条、TH-A01 ② |
| D3 | 默认主题的 6 处预期差异 | **接受**，默认主题同样应用 | TH-A01 |
| D4 | ember 下的“注意”提示 | **保持琥珀色 + ⚠ 图标**；ember 信号色不改为橙红 | 3.2 说明、3.3 第 4 条 |

| D5 | 实施中新增的默认主题差异（⚠ 前缀、白色焦点环、过载红 `#FF5E66`） | **接受**（2026-09-30 验收时确认） | 10.3、10.4 |

后续如有调整，在此表追加新行，不改写已确认的行。

## 7. 原定 Git 与交付策略

- 实施分支 `feature/instrument-themes` 从 `recorder/dev@7d38357` 创建；后续已合入 `recorder/dev`，不依赖本地是否存在上游 `main`。
- 分批提交：T1（纯重构）、T2（数据与持久化）、T3（运行时与可辨识性）、T4（界面）、T5（测试与文档），便于回滚。
- T1 验收后可以先合回 `recorder/dev`；TH-A01–A09 全部通过后再合并其余部分并打包 preview.31。推送 `origin` 和生成内测包都需要用户授权。
- 期间如果 `recorder/dev` 有新提交，未推送的分支用 rebase 同步，已推送的分支改用 merge，不强推。

## 8. 风险

| 风险 | 应对 |
| --- | --- |
| 字面量分散，遗漏导致局部残留绿色 | T1 静态检查加 T0/T1 逐像素截图双重把关 |
| 主题切换误触发数据重算或丢帧 | 主题不进入音频分析缓存键或计量协议，仅扩展显示命令/偏好；TH-A06 用固定文件逐值比对 |
| 灰色主题降低“正在录音/有信号”的醒目度 | REC 固定红色和文字；信号近白加粗；有信号状态保留徽章文字 |
| 过载提示被误读为 true peak | OVER 只来自 sample peak，文案不带 TP；TP 读数仍由统一引擎提供 |
| 3D 声谱 shader 与 2D LUT 不一致 | 两者从同一份色标生成，测试对比抽样色值 |
| 自动色差测试通过但真实体验差 | TH-A04 只作下限；人工验收单列，不合并为自动通过 |
| 与 Mac 移植（70）并行时冲突 | 本阶段只动 renderer、偏好和一个命令，不碰原生后端；冲突集中在 `main.ts` 的少数行 |

## 9. 修订记录

- **v1.0**（2026-09-28）：初版，四个主题，主题字段放在 `DisplaySettings` v3 中。
- **v1.1**（2026-09-28）：按 UI/UX 评审修订：
  - 电平改为按 dB 分区，并加刻度线和 OVER 标记。
  - 线型成为第一保障，频谱平均曲线改为虚线。
  - 读数三态增加文字标注。
  - ember（原 `amber`，改名以免和 `--amber` 混淆）不再把“注意”改成品红，改为固定琥珀加图标，目标带用紫色。
  - 色弱友好主题 `duo` 进入首批。
  - 色卡内置迷你预览，焦点环固定。
  - 主题改为顶层偏好加 `view.theme` 命令，保证降级兼容。
  - token 分三层，中性色去绿调，新增 `--on-signal`。
  - 声谱色标规定亮度单调。
  - 截图改为按场景覆盖。
  - TH-A04 改为分级门槛，新增 TH-A09。
  - 全部色值经过实测（3.2 节）。
  - 更正评审中的一处事实：preview.30 未就绪时已显示“—”，真正的问题是“测量中”和“无数据”无法区分。
- **v1.2**（2026-09-28）：用户确认第 6 节四项决定（D1–D4）。TRACE 小字改为跟随主题，新增组件 token `--brand-product`，TH-T3 与 TH-A08 相应更新；−6/−1 dBFS 阈值、默认主题 6 处差异、ember 下“注意”保持琥珀加图标，均按原方案执行。

## 10. 初次实施记录（2026-09-28，preview.31）

### 10.1 交付内容

| 任务 | 结果 | 主要文件 |
| --- | --- | --- |
| TH-T0 | 基线检查：typecheck、portable 208/208、native 49/49、采集支持 3/3、响度原生 6/6。基线截图 9 个场景，重复截图逐像素一致（最大通道差 1） | `artifacts/themes/baseline-t0/`、`tools/themes/theme-ui.cjs`、`tools/themes/png.cjs` |
| TH-T1 | CSS 与 Canvas/WebGL 中的颜色字面量全部改为 token，颜色唯一来源 `src/trace/instrumentThemes.ts`，运行时 `renderer/themeRuntime.ts`；2D LUT 与 3D shader 共用同一份五段色标。T1 结束时 9 个场景与基线逐像素一致（容差 2，最大差 1） | 6 个 CSS、`Timeline.tsx`、`AnalysisInstruments.tsx`、`ReferencePanel.tsx`、`SpectrogramPanel.tsx`、`SurfaceCanvas.tsx`、`surfaceRenderer.ts`、`spectrogramPresentation.ts` |
| TH-T2 | 五套主题（按 3.2 色值，新主题由基础色板派生）；中性色去绿调；顶层偏好 `instrumentTheme`/`instrumentThemeVersion:1`；白名单命令 `view.theme`（`INVALID_THEME`）；启动时主进程先恢复主题并经 URL 传给渲染层，首帧前应用 | `instrumentThemes.ts`、`contracts.ts`、`shared.ts`、`main.ts`、`renderer/main.tsx`、`App.tsx` |
| TH-T3 | −6/−1 dBFS 分区、刻度线、OVER（保持 2 秒，仅样本峰值）、Peak 读数红底；“测量中/无数据”标注；时间轴游标 2 px + 三角；频谱平均曲线 `[6,3]`；TRACE 小字与“实时”徽章随主题；“注意”统一加 ⚠；诊断摘要增加 `display.instrumentTheme` | `renderer/meterZones.ts`、`LiveInstruments.tsx`、`styles.css`、`diagnostics.ts` |
| TH-T4 | 色卡组 `role=radiogroup`，方向键/Home/End，单一 Tab 停靠；每张卡内置电平分区、三种线型和声谱色带预览；选中即预览，“应用设置”依次发送 `view.settings`→`view.theme`→`app.configure`，Esc/关闭恢复已保存主题；声谱配色“Trace”改名“跟随主题” | `renderer/ThemePicker.tsx`、`DisplaySettingsForm.tsx`、`SpectrogramPanel.tsx` |
| TH-T5 | 版本 `0.1.0-preview.31`（`product.ts`、`electron-builder.trace.cjs` 输出目录）；测试与文档同步 | `test/instrument-themes.test.mjs`、`tools/themes/theme-flow.cjs`、05/07/13/28/61 |

### 10.2 初次验收证据与后续勘误

| 编号 | 结果 | 证据 |
| --- | --- | --- |
| TH-A01 | 通过（含 10.3 列出的新增预期差异）。T1 逐像素一致；最终默认主题与基线差异 4.9%–8.8% 像素（中性色去绿调遍布全界面为主），设置对话框 96.3%（新增色卡与遮罩） | `artifacts/themes/a01-default-*/report.json` |
| TH-A02 | 通过。9 个场景 × 5 个主题（1×）＋ 默认主题 1.5×/2× 全部稳定截图；非默认主题 8 个仪器场景中默认绿色像素为 0，设置对话框仅剩 Trace 绿色卡本身（466 px）；静态检查无颜色字面量 | `artifacts/themes/final-*`、`test/instrument-themes.test.mjs` |
| TH-A03 | 通过。应用后写入顶层偏好且 `displaySettings` 不变；重启恢复；未知 ID 回退；非法 `view.theme`（未知值、空、数字、多字段、注入串）被拒；本机 preview.30 程序读取新偏好后目标/波形倍率不丢 | `theme-flow` 报告、单元测试 |
| TH-A04 | 通过（自动计算）。正文/焦点环 ≥ 4.5:1；信号、系列、`signalLo`、游标、曲线 ≥ 3:1；主按钮与 TRACE 小字 ≥ 4.5:1；系列两两 ΔE ≥ 20；新主题色弱模拟（deutan/protan 取小）ΔE ≥ 12；相邻电平区 ΔE ≥ 12；新主题声谱 L\* 单调且相邻差 ≥ 8（正常与 deutan） | `test/instrument-themes.test.mjs` |
| TH-A05 | 初次截图覆盖 OVER/红底、⚠、REC 与线型；故障路径覆盖不足，72-R1 发现缺失 metric 被误标“测量中”，已在 c67e9e9 修复并补故障/恢复验证 | 原截图矩阵及 72 复验 |
| TH-A06 | 通过。同一文件同一游标下，五个主题的电平/响度读数文本完全一致；声谱请求键与绘制上下文在切换主题时不变；WASAPI 录音在 20 次切换中持续写入且无缺口标记 | `theme-flow` 报告 |
| TH-A07 | 部分通过。200 次切换后渲染进程堆增长 ≈ 0.8 MiB（门槛 4 MiB）；LUT 缓存上限 6 份（单元测试）；切换只重绘不请求数据。**实时监测帧时间未单独测量** | `theme-flow` 报告 |
| TH-A08 | 部分证据成立：狮子月牙不变、TRACE 随主题，完整样本 89.1 ms < 96.0 ms；缺失 paint 的运行不计通过，整体无闪帧仍未验证。72-R3 断言已在 2995174 修正；用户开发构建总体验收见 10.4，不替代五主题冷启动/UI 恢复专项 | 原 flow 完整样本、72/73 |
| TH-A09 | 初次 flow 覆盖组内按键/单一 Tab/焦点环/Esc，绕过非默认主题的实际弹窗入口；72-R2 发现并在 c67e9e9 修正初始焦点，补验五主题入口、空格及正反向 Tab | 原 flow 与 72 复验 |

回归：`node tools/trace.cjs check` 全过（typecheck；portable 214/214，含新增 6 项；native 49/49；采集支持 3/3；响度原生 6/6）。M7 工作台界面检查（开发构建）默认主题 1×/1.5×/2× 与四个新主题 1× 各 11/11 通过。

### 10.3 与方案的偏差和未完成项

- **默认主题新增预期差异**（TH-A01 原列 6 项之外，需用户知悉）：⑦“注意”文字前统一加 ⚠（3.3 第 4 条要求所有主题一致）；⑧ 焦点环由青色改为固定白色（3.1 固定层）；⑨ 过载区颜色由 `#FF7A65` 改为固定危险红 `#FF5E66`（3.3 第 1 条）。
- 3D 声谱中的游标仍为 shader 中的细线，未加三角标记；3.3 第 5 条目前只在 2D 时间轴（波形、响度历史、2D 声谱）落实。
- 3.5 中的派生值与 3.2 表基本一致；新主题的派生边框/底色由 `deriveTokens` 计算，未逐项手工调色。
- 初次实现未按 7 节的 T1–T5 拆分提交，实施改动交织；2026-09-30 已按用户授权提交实现与文档，后续 R1/R2 修复另有 c67e9e9，均已合入默认开发分支。
- preview.31 内测包及 62 PDF 尚未更新。2026-09-30 用户已验收开发构建并接受 D5；额外显示器矩阵、色弱用户体验与首帧/帧时间专项仍未完成，不能一概写“人工验收未进行”。

### 10.4 用户验收（2026-09-30）

用户在本机开发构建（`electron out-trace/main/index.js`，非打包版）上完成验收并确认“无误”，同时接受 10.3 中默认主题的三处新增差异（⑦ ⚠ 前缀、⑧ 白色焦点环、⑨ 过载红 `#FF5E66`），据此记为 D5。色弱用户的主观体验与 preview.31 打包版仍未单独验收；3D 声谱游标三角与实时监测帧时间专项仍待办。
