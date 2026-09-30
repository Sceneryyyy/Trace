# 72 · M13 仪表主题独立审计

2026-09-30，审计 `feature/instrument-themes` 上的 `2938c8e`（实现）及 `07d44e1`（文档），比较基线 `7d38357`。开始时工作区干净。本次只新增审计记录并同步 13；没有修改产品代码，没有提交、推送、合并或打包。71 是验收目标和既有实施记录，不把其中的后续操作说明视为本次执行请求。

## 初次审计结论

主题 token、顶层偏好、命令校验和数据/显示分离的基本路线成立。本轮未发现需要按 P0/P1 阻断的音频数据路径问题；这不等于真实设备或发布验收通过。确认两项界面缺陷、一项自动验收误报，均为 P2，建议修正后再合并与生成 preview.31 内测包。原用户开发构建验收保留，本轮发现作为增量问题记录。

## R1 · P2：故障被重新标成“测量中”

位置：`src/trace/renderer/LiveInstruments.tsx:29-37`；关联 `renderer/viewModel.ts:43`、`LiveInstruments.tsx:142-159`。

`deriveView` 在来源错误、文件快照失败、录音重连等情况下将 `numberMetrics` 设为 `null`。新增 `MetricNumber/StateNote` 又将缺失 metric 回退成 `status:'insufficient'`，于是错误来源的 I/M/S 全部显示“—测量中”，新增的“无数据”分支无法覆盖这条主要故障路径。电平栏只有“—”；LRA/MAX TP 等摘要仍走原格式化函数，也没有新的状态标签。

复现：当前构建打开生成的文件夹具、停在同一游标，向 renderer 注入带错误的同来源快照。实际 I/M/S 均为“—测量中”，`.metric-state.is-fault` 数量为 0，六个电平读数全为“—”。该步骤是 renderer 故障接线验证，不是真实拔设备验收。清空故障数值是既有安全行为；本次新增标签没有接入故障原因，导致 71 §3.3/TH-A05 的状态区分不完整。

建议：保留数值清空行为，单独传递来源/分析的可用状态；让测量未就绪、分析中和数据错误各有明确标签，覆盖设备失效、文件分析失败、重连及逐 metric 缺口。不要通过重新展示故障前的读数修复。

## R2 · P2：打开非默认主题时，焦点落到未选中的绿色卡

位置：`src/trace/renderer/App.tsx:116-124`；关联 `ThemePicker.tsx:31-34`、`tools/themes/theme-flow.cjs:31`。

新增色卡是 button。旧的对话框自动聚焦选择器取第一个可用 button，没有排除 `tabIndex=-1` 的色卡。偏好已保存为 ocean 时，打开“显示与帮助”会聚焦 `trace-green`（`aria-checked=false`、`tabIndex=-1`），而选中的卡是 ocean。无需先导航，按空格就会意外预览 Trace 绿；按 Tab 还会再次进入选中卡，与单一 Tab 停靠设计不一致。Esc 恢复已保存主题正常。

本轮在真实 Electron renderer 中复现上述焦点与空格操作。原 flow 测试先主动 `.focus()` 选中的卡，再验证方向键，因此绕过了用户实际进入弹窗的过程。

建议：打开色卡对话框时聚焦选中 radio，或让通用初始焦点选择器尊重可 Tab 状态。补测每个非默认主题的打开弹窗、空格和正反向 Tab 流程，测试不要先手工修正焦点。

## R3 · P2：缺失 first-paint 时仍报告“首帧前应用通过”

位置：`tools/themes/theme-flow.cjs:89-91`；关联 71 §10.2 TH-A08。

断言允许 `firstPaint.paint===null`，因此未取得绘制时刻也会打印“applies it before the first paint”。本轮复测实际记录 `mark=82.10 ms`、`paint=null`，脚本仍输出 `PASS ... (82.1 ms < undefined ms)`；旧本地 flow 报告也存在相同情况。这只能证明已恢复 ocean 并产生应用标记，无法证明它早于首帧。

建议：等待 paint 证据；环境确实不能提供时，把该子项明确记为未验证，不能计入通过。补测五套主题的冷启动及 UI 恢复；文档区分有完整时序的样本和无绘制证据的运行，不抹掉已有有效样本。

## 其他核查与遗漏

- **恢复界面的启动主题可能陈旧**：`main.ts:778` 的 query 仅在创建窗口时设置，`supportRuntime.ts:63` 恢复界面使用 `reload()`。本轮从 ocean 启动、改存 ember 后恢复 UI，观察到先应用 ocean（12.60 ms）再应用 ember（35.60 ms），first-paint 为 40 ms。该样本没有出现可见闪帧，所以暂不列为已复现的视觉 bug；下一次防闪测试应包含这一条路径，不能只测退出再启动。
- **截图矩阵没有故障场景**：`theme-ui.cjs` 的九个场景为 idle、safe/over/near、metering、spectral、2D/3D 和显示设置；没有显式制造设备/来源失效。矩阵与“所有状态均截图核对”的结论存在覆盖缺口，R1 不能靠 idle 截图排除。
- **小型方案差异**：时间轴目标线仍为 `[7,5]`，71 §3.3 写的是 `[4,2]`；通用 button 仍有 130 ms 背景/边框过渡，而方案要求切主题无颜色渐变。这些不影响数值，但应落实或记录例外。
- **文档时态未完全同步**：71 顶部仍说“尚未提交”，第 10 节标题仍是“本地未提交”，10.3 的提交说明也是旧时态；实际两项本地提交已经存在。13 已正确记录本地提交，但其顶部“下一任务推送/合并”应先加入本轮修正任务。
- **已知待办保留**：3D 游标三角、实时监测帧时间专项、preview.31 打包/内测包、62 PDF、色弱用户主观体验。3D 游标和帧时间属于原方案中尚未完成的要求，不是本轮新引入的发现。71 已记录 2026-09-30 开发构建用户验收，不能将原有“人工未做”一概解释为用户没有验收。

## 本轮验证

| 检查 | 结果与边界 |
| --- | --- |
| `node tools/trace.cjs check` | typecheck 通过；portable 214/214；native 49/49；采集支持 3/3；响度原生 6/6，均无失败/跳过 |
| `node tools/trace.cjs appbuild` | 当前源码构建成功；这是开发构建，不是分发包 |
| 主题 flow 正常流程 | 通过：旧偏好默认、预览/取消、实际应用/持久化、五主题固定文件位置读数一致、声谱 request/context 不变、200 次切换堆增长 627832 bytes（约 0.60 MiB）、preview.30 降级保持显示设置 |
| 主题 flow 首帧子项 | 脚本计为 PASS，但 paint 为 null；本审计判为未验证（R3） |
| renderer 边界复现 | R1/R2 复现；Esc 恢复正确；OVER 在退出过载后保持约 2 秒并清除；UI 恢复应用旧 query 后收敛到当前偏好 |
| 提交差异空白检查 | `git diff --check 7d38357 HEAD` 通过；审计文档写入后再次检查工作区差异 |

flow 运行使用 `artifacts/themes/audit-positive-flow.cjs`：在运行时副本中明确跳过原脚本的 WASAPI 录音段，不修改已提交脚本；报告明确记录 `recordingSkipped`。不能把这次 flow 总体 PASS 解释为重新通过了录音连续性或首帧门禁。

本次未重跑真实系统声音录音、96 kHz、设备拔插、完整 M7/DPI 截图矩阵、GPU 长测、实际显示器/色弱用户体验、preview.31 打包及干净 Windows 运行。当前实现没有新增原生算法或 PCM 路径修改，因此没有为纯主题审计扩展这些硬件测试。

本地证据（均在忽略的 artifacts 中，文件夹具为生成数据，不提交到源码）：

- `artifacts/themes/audit-check-20260930.log`
- `artifacts/themes/audit-build-20260930.log`
- `artifacts/themes/audit-flow-20260930.log`、`flow-1790754640220/report.json`
- `artifacts/themes/audit-edge-cases.cjs`、`audit-edge-20260930/report.json`、`audit-edge-20260930/error-labels.png`

初次审计的下一任务：修正 R1/R2 并补实际入口与故障场景验证；修正 R3 的结果判定；同步 71 时态与验收范围，再决定合并/打包。初次审计没有修复上述产品/测试代码，阻塞是仍有待修项，不是构建环境故障。

## 2026-09-30：R1/R2 修复与复验

用户要求修复第 1、2 项 P2。R1/R2 已修复并通过本机工程复验；R3 的首帧断言与其他审计遗漏保留待办。2026-09-30 按用户授权，修复及审计文档已提交为 `c67e9e9` 并成功推送到 `origin/feature/instrument-themes`（`Sceneryyyy/Trace`）；此前主题实现和文档随分支一并推送。本段交付记录单独提交，未合并或打包。

- **R1**：`viewModel.ts` 保留原 `numberMetrics` 清空条件，另传 renderer 专用的 `numberAvailability`。`metricReadout.ts` 统一显示“无数据／分析中／重新连接／测量中”，静音保持 `−∞`、正常数值保持原精度；错误和缺口不会显示旧数字。I/M/S、Peak/RMS/TP、LRA/MAX TP/整段 I 及柱表无障碍文字均接入。后台 LIVE 故障不清空健康文件的历史读数；原声道数在故障状态下保留。没有修改原生音频、计量、协议或缓存。
- **R2**：显示设置打开时直接聚焦已选中的主题 radio；通用焦点入口和 Tab 边界排除 `tabIndex=-1` 元素。原 `theme-flow.cjs` 的键盘检查移除人工 `.focus()`，改为断言自动聚焦。
- **新增验证**：portable 的 `metric-readout.test.mjs` 五项检查覆盖来源错误、文件快照/分析失败、等待分析、重连、后台 LIVE 错误隔离、静音/缺口/未就绪，以及不暴露旧数值、不改原 metric；`tools/themes/theme-readout-focus.cjs` 从实际打开弹窗开始验证全部五套主题的焦点、空格、正反向 Tab、方向键、Esc 和触发按钮焦点恢复，并使用生成文件与注入快照验证故障显示和恢复。

复验：`node tools/trace.cjs check` 全过（typecheck；portable **219/219**；native **49/49**；采集支持 **3/3**；响度原生 **6/6**），当前源码 appbuild 成功；`node tools/themes/theme-readout-focus.cjs` 四组检查全过。故障截图中 I/M/S、摘要和电平明确显示“无数据”，故障清除后固定游标原读数完全恢复；逐项 gap/insufficient/silence 不混淆。

修复证据：`artifacts/themes/fix-r1-r2-check-20260930.log`、`fix-r1-r2-build-20260930.log`、`fix-r1-r2-ui-20260930.log`、`readout-focus-1790768016549/report.json` 与 `source-unavailable.png`。使用的是开发构建、生成夹具和 renderer 故障注入；本轮未实施真实拔设备、系统声音录音、96 kHz 或分发包测试，未将其记为通过。

另复测修改后的主题正常 flow（仍显式跳过 WASAPI 录音）：自动入口、应用/取消、偏好保存/降级兼容、五主题同游标读数、声谱不重取数据均通过，200 次切换堆增长约 608 KiB。该次首帧取得完整时序（主题标记 105.7 ms、first-paint 116 ms），样本顺序正确；R3 允许缺失 paint 的断言缺陷仍未修。证据：`artifacts/themes/fix-r1-r2-flow-20260930.log`、`flow-1790768162478/report.json`。
