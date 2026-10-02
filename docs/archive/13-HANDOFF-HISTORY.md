# 13 · 会话交接历史（2026-09-15—2026-10-02）

本页保留各会话结束时的状态、验证与下一步，不代表当前待办。后续提交可能已关闭下文的问题或替代其分支/目录状态；请先读 [当前交接](../13-HANDOFF.md)。2026-10-02 归档时统一了历史标题，修正旧审核编号和代码路径；已删除的临时交接与旧入口可从 Git 历史追溯。

## 历史：云端修复五项问题及两项旧缺口，回归通过（2026-10-02）

按用户授权，已修正 [73](../73-CLOUD-CODE-REVIEW.md) 的 R1–R5：selector 相等输出复用、导出来源质量继承/持久化、原生内存缓存按帧质量及保存/重载、报告事件跳转释放输出并恢复监听、录音和缓存准备失败统一恢复后台另存。还补上 68 的估计静音/未知质量提示，以及 72-R3 首帧缺失 paint 不能 PASS 的断言。ReplayFreeze 元数据升至 v3，quality v1；Session/ExportResult 兼容可选质量字段，旧内存数据缺失质量标为 unknown。03/04/05/06 已同步。版本仍 preview.31；用户随后授权将本轮修复、测试和审核记录提交到本地 Git，本轮交付为 `recorder/dev` 上的本地提交，未推送或打包。提交前空白检查通过，沿用下述已通过验证。

已跑：最终 typecheck、portable **233/233（47 文件、0 fail/skip）**、Trace 构建；新增 13 项跨模块回归中，真实 DeliveryService 完成失败后另存，真实保存服务经重载/回听/报告保留质量。真实 React + Chromium 订阅回归通过，相同 30 个快照下顶栏额外 render 从旧代码 30 次降到 0；props/数值变化仍更新。新增可移植 C++ quality 测试 10 cases 通过，覆盖四采样率单双声道、精确选区、环绕、固定/重置、发布前缀及旧数据。日志 `artifacts/cloud-regression/logs/`；详见 73 顶部修复节。

未跑/阻塞：Windows 原生 addon、WAV 写盘新增质量日志及完整 CTest/native、主题完整 flow 和真实首帧、YouTube/声卡/拔设备/96 kHz、磁盘拥塞、GPU/DPI、退出看门狗与安装包仍受 Linux 云环境限制。新增每对象最多约 5.49 MiB 质量环需实机资源检查。下一任务是 Windows 重编译引擎、跑 native 与主题 flow，再补用户最初三分钟实测；云端可运行检查没有失败。下面审核记录保留发现时态。

## 历史：云环境代码审核完成，五项 P2 待修（2026-10-02）

用户因当前只有云环境，将“三分钟 YouTube + Trace 自由操作/截图”验收改为代码完整审核。本轮基线 `recorder/dev@d2981fd`（preview.31），详细发现、复现与边界见 [73-CLOUD-CODE-REVIEW](../73-CLOUD-CODE-REVIEW.md)。确认五项 P2：selector 在新快照上不复用相等输出；导出回听丢失原采集 continuity；保存内存缓存不保留估计静音质量；报告事件跳转保留暂停输出导致按钮/监听状态不一致；设备启动失败后遗漏后台另存恢复。另复核 68 的估计静音无界面提示与 72-R3 首帧测试允许 paint=null，均仍未关闭。

已跑：typecheck、portable 219/219、Trace 构建、采集支持元数据 3/3；Linux 直接编译未改动的可移植 C++ 测试，core 16/16、生成 EBU 参考 18/18、TP 时间 233/233、并行 meter 初始化、instrument 3736 checks、spectrogram tile 20 cases 均通过。真实业务模块配明确 mock 完成四项专项复现；真实 React hook 在 headless Chromium 中证明相同选择值仍额外 render 30 次。测试日志及生成夹具在忽略目录 `artifacts/cloud-audit/`。没有改产品代码、已有测试或版本，未提交、推送或打包。

未跑：真实 Windows WASAPI/声卡、YouTube 三分钟录音、拔设备/96 kHz、官方 EBU WAV、整套 Windows native、GPU/DPI 矩阵、退出看门狗故障注入和 preview.31 安装包。完整实机验收受当前 Linux 云环境限制；已运行检查没有阻塞。下一任务先修 73-R2/R3/R5 并补跨模块反例，再处理 R4/R1 与已有提示/首帧测试；Windows 可用后补最初真实操作验收。旧 Windows 通过记录是历史结果，本轮没有重复确认。

## 历史：主题分支已合入 recorder/dev，后续开发继续在此分支（2026-09-30）

按用户授权，将 `feature/instrument-themes@da0c8ab` 快进合并到 `recorder/dev`，并成功推送到 `origin/recorder/dev`（`Sceneryyyy/Trace`）。主题实现、R1/R2 修复、测试和文档全部进入开发分支，四个原提交完整保留；合并没有冲突。当前工作区已切至 `recorder/dev`，后续开发默认继续在此分支；同一约定已写入仓库 `AGENTS.md`。

已检查：合并时的代码树与 `feature/instrument-themes@da0c8ab` 完全一致，Git 差异空白检查通过。本轮只合并及补充分支交接记录，沿用下节已通过的完整检查和 Electron 工程复验，没有重复构建/硬件验收。此交接记录单独提交并推送，远程同步以 Git ref 核对为准。未打包。下一任务仍为 R3 首帧测试判定与旧验收记录校正；其他未验收项见下节，没有合并或构建阻塞。

## 历史：M13 审计 R1/R2 已修复并通过工程复验（2026-09-30）

用户要求修复 [72](../72-INSTRUMENT-THEMES-REVIEW.md) 中的第 1、2 项 P2。R1 增加独立的 renderer 读数可用状态，保留既有故障数值清空，统一 I/M/S、电平和摘要的“无数据／分析中／重新连接／测量中”；健康文件不受后台 LIVE 错误影响，静音仍为 `−∞`。R2 让显示设置入口聚焦已选中的主题卡，并让焦点入口/Tab 边界尊重 `tabIndex`。新增 portable 五项状态检查及实际 Electron 入口/故障接线检查，原主题 flow 不再先手动聚焦选中卡。

已跑：`node tools/trace.cjs check`（typecheck、portable 219/219、native 49/49、采集支持 3/3、响度原生 6/6 全过）；当前源码 appbuild；`node tools/themes/theme-readout-focus.cjs` 四组全过（五套主题入口、空格/正反向 Tab/方向键/Esc，故障读数、恢复、逐项静音/缺口/未就绪）。截图已检查；测试使用生成夹具和 renderer 快照注入，未重跑真实录音、拔设备、96 kHz 或打包验收。证据和实现边界见 72 末节。

交付更新（2026-09-30）：按用户授权，修复及前轮审计文档已提交为 `c67e9e9`，并成功推送到 `origin/feature/instrument-themes`（`Sceneryyyy/Trace`），已设置远程跟踪；此前主题实现 `2938c8e` 和文档 `07d44e1` 随分支一并推送。本段交付记录单独提交。未合并或打包。没有构建/测试阻塞。下一任务仍为 R3 首帧测试结果判定与旧验收记录校正，3D 游标三角、实时监测帧时间和发布材料继续待办；R3 不在本次修复范围，不能把其当前 PASS 输出当作新的无闪帧证据。

## 历史：M13 独立审计完成，三项 P2 待修（2026-09-30）

审计实现提交 `2938c8e` 与文档提交 `07d44e1`，比较基线 `7d38357`；开始时工作区干净。完整发现、复现与证据见 [72-INSTRUMENT-THEMES-REVIEW](../72-INSTRUMENT-THEMES-REVIEW.md)。确认：① 来源故障导致 `numberMetrics=null` 时，新增 I/M/S 标签错误显示“测量中”，未接入“无数据”；② 非默认主题打开显示设置，初始焦点落到未选中的绿色卡，空格会意外预览；③ flow 首帧断言将 `paint=null` 计为 PASS，不能证明无闪帧。本轮没有改产品或已提交的测试代码，只新增审计文档并更新本接力；未提交、推送、合并或打包。此前用户开发构建验收保留，新增缺陷单独跟踪。

本轮已跑：`node tools/trace.cjs check`（typecheck、portable 214/214、native 49/49、采集支持 3/3、响度原生 6/6 全通过）；当前源码 appbuild；Electron 主题正常 flow（显式跳过 WASAPI 录音）及 renderer 边界复现。正常应用/取消、顶层偏好保存、preview.30 降级读取、五主题固定游标读数与声谱请求不变均通过；200 次切换渲染堆增长约 0.60 MiB。首帧子项虽被脚本标为 PASS，本轮实际 `paint=null`，审计结论为未验证。恢复界面会先应用创建窗口时的旧 query 主题再恢复当前主题；本次两次应用均早于 first-paint，尚未复现可见闪帧。

未重跑：真实录音连续性、96 kHz/拔设备、完整 M7/DPI 截图矩阵、GPU 长测、显示器/色弱用户主观体验、preview.31 打包/干净 Windows。下一任务优先修正 72 的 R1/R2/R3、补故障与非默认主题键盘入口测试，校正 71 的旧提交时态和验收范围，再评估合并/打包。既有 3D 游标三角、实时监测帧时间和发布材料待办继续保留；没有构建环境阻塞。

## 历史：仪表主题色 M13 已实施并通过用户验收（preview.31），已本地提交

2026-09-30：用户在本机开发构建上验收确认无误，并接受默认主题三处新增差异（71 D5）。改动已在 `feature/instrument-themes` 本地提交，**未推送**、未合并回 `recorder/dev`、未打包。下一任务：用户授权后推送/合并；按需补 3D 声谱游标三角并打包 preview.31 内测包。以下为 2026-09-28 实施记录。

2026-09-28：在 `feature/instrument-themes`（基于 `recorder/dev@7d38357`）完成 TH-T0–T5 工程部分，详见 [71](../71-INSTRUMENT-THEMES-PLAN.md) 第 10 节。颜色唯一来源 `src/trace/instrumentThemes.ts`，运行时 `renderer/themeRuntime.ts`；五套主题 `trace-green/graphite/ember/ocean/duo`；顶层偏好 `instrumentTheme` 加白名单命令 `view.theme`；电平 −6/−1 dBFS 分区、OVER、读数三态、游标三角、⚠ 注意；“显示与帮助”中新增色卡组。

已跑：`node tools/trace.cjs check` 全过（portable 214/214，含新增 `test/instrument-themes.test.mjs` 6 项；native 49/49；采集支持 3/3；响度原生 6/6）；T1 与 preview.30 基线 9 个场景逐像素一致；`tools/themes/theme-ui.cjs` 截图矩阵（9 个场景 × 5 个主题 1×，默认主题另跑 1.5×/2×）；`tools/themes/theme-flow.cjs` 9/9（键盘、持久化、五个主题读数一致、声谱不重算、200 次切换堆增长约 0.8 MiB、WASAPI 录音在切换中不断、重启首帧前应用、preview.30 降级读取）；M7 工作台检查（开发构建）默认主题 3 种缩放与四个新主题 1× 均为 11/11。

未跑或未完成：实时监测帧时间的专门测量；3D 声谱游标三角；preview.31 打包与内测包；62 PDF；真实显示器、色弱用户、顶栏协调性的人工验收。默认主题在原定 6 处之外新增 3 处差异（⚠ 前缀、白色焦点环、过载红改为 `#FF5E66`），已于 2026-09-30 由用户接受。

## 历史：仪表主题色 M13 方案

2026-09-28：用户要求在绿色之外增加可选仪表主题（石墨灰、黄橙渐变、海蓝），并基于 `recorder/dev` 开发。已从 `recorder/dev@7d38357` 创建本地分支 `feature/instrument-themes`，方案见 [71](../71-INSTRUMENT-THEMES-PLAN.md)。同日按 UI/UX 评审修订为 v1.1：五套主题（新增色弱友好 `duo`）、电平按 dB 分区加 OVER 标记、以线型为第一保障、主题存为顶层偏好并使用新命令 `view.theme`（保证降级兼容）、色值经对比度/ΔE2000/色弱模拟实测。本次只写文档，没有修改代码，也没有运行项目测试；尚未提交或推送。下一任务是 TH-T0（记录基线检查结果和截图），然后做 TH-T1（颜色 token 化，不产生视觉变化）。第 6 节四项决定已由用户确认（方案 v1.2）：TRACE 小字跟随主题；电平阈值 −6/−1 dBFS；默认主题接受 6 处预期差异；ember 下“注意”保持琥珀色加图标。61 和 `AGENTS.md` 的品牌说明已同步。已无待确认项，可以开始 TH-T0。

## 仓库首页：已改为 Trace 产品说明

2026-09-28：根目录 `README.md` 原为 Prism 上游介绍，GitHub 首页因此未展示 Trace。本次改为 LeoMoon / Trace 品牌、实际工作台截图、当前功能、用户指南、Windows 开发入口、内测与 macOS 验证边界；原 README 按字节完整保存在 `README-Prism.md`，许可和来源保留。`TRACE-README.md` 改为统一首页的兼容入口，移除 preview.8 的陈旧副本。仅文档变更，执行相对链接/图片存在性、上游归档一致性与 Git 空白检查，不重复音频或应用测试。首页改动已同步至 `recorder/dev` 和 `feature/macos-port` 两个本地分支。本次正常推送因命令行缺少 GitHub 凭据失败（`Cannot prompt` / `unable to get password`），没有确认远程生效；需通过已登录的 GitHub Desktop 对两个分支分别 Push origin。本地缓存的 `origin/HEAD` 指向 `recorder/dev`，远程默认分支和页面仍需单独核实。下一开发任务沿用下方分支记录。

## 历史方案：Mac 移植方案一已写入文档，尚未实施

2026-09-24：用户选择保留 Electron/React/Trace C++ 核心，并增加 macOS 原生后端。执行方案、代码切口、M-MAC0–4 阶段、MAC-A01–08 验收和官方依据见 [70-MACOS-PORT-PLAN](../70-MACOS-PORT-PLAN.md)；工程决定见 [ADR-012](../11-DECISIONS.md)。本次只更新文档，没有修改产品代码、构建或测试。Mac 真机采集、96 kHz、签名/公证均未验证。下一任务是 M-MAC0/T00：在 Apple silicon Mac 上验证 Core Audio taps 的真实系统音频、权限、来源选择及帧时钟，再进入引擎拆分。Windows preview.30 / InternalTest-r3 状态保持如下，远程 CI 仍暂缓。

## 历史：preview.30 / InternalTest-r3 已打包，可交同事内测

2026-09-24：以干净本地提交 `9c1ee21` 为来源重新构建 preview.30，生成新的 R3 内测 ZIP，未覆盖 preview.29 R2。大小、SHA256、解压验证和 M7 新包 10 阶段结果见 [69](../69-INTERNAL-TEST-R3.md)。独立程序与同事内测包均在 `dist-trace/`；建议分发带 PDF、说明和校验文件的 R3 内测包。远程 CI 按用户决定暂缓，独立干净 Windows 与声卡矩阵仍需同事实测。

## 历史：三项 P1、M7 与分批提交已完成；远程 CI 暂缓

2026-09-24：用户确认暂不远程提交，实际 Windows CI 验证本阶段暂缓。除远程 CI 外，本轮目标已完成；继续开发时不要把本机验证写成远程 CI 通过，也不要为触发 CI 擅自推送上游。恢复远程验证时，先确定可写的 Trace 仓库和目标分支。

2026-09-24：针对 [68](../68-INDEPENDENT-CHANGE-REVIEW.md) 的三个 P1 完成修正：保留策略在中断/保存失败后恢复幸存源文件可见性；Windows CI 显式准备 Electron SDK 和上游 DSP；文件 worker 使用事件循环心跳避免健康长任务被 180 秒空闲计时误杀。反例已纳入测试。`tools/trace.cjs check` 全过（portable 208、native 49，另有采集支持 3、响度原生 6）；原生 DSP 重建成功，Trace 引擎 15/15 CTest 通过；M7 完整界面检查在 1×、1.5×、2× 缩放各 11/11 通过。仍须在可写 GitHub 仓库上实际触发 Windows CI，不能把本机结果写成远程 CI 结果。68 中另列的估计静音界面提示与 60 秒退出看门狗专项验证尚未包含在本次三个 P1 修复内；原生同步量化/恢复不能发送事件循环心跳，保留显式取消与退出界限。

原先位于仓库外 `TraceDev/docs/` 的两份审计报告已纳入 [66](../66-FRONTEND-AUDIT.md) 和 [67](../67-CODE-AUDIT-PREVIEW29.md)。三批已分别提交：R2 `25aa347`、前端/M7 `e797f39`、测试与 P1 `e97f96d`。当前唯一远程 `Boof2015/prism` 为上游只读（连接账号 `push: false`），尚无可写仓库可推送并触发 CI；需要可写 GitHub 目标。以下旧段落仅留作历史。

## 历史：65 号交接已做独立复核，暂不合并当前工作树

2026-09-23：复核结论见 [68](../68-INDEPENDENT-CHANGE-REVIEW.md)。portable 202 项、native 49 项、当前源码 TypeScript/Trace 构建和短 UI/WASAPI 流程通过；M7 陈旧失败在旧 preview.28 与当前源码同位置出现。隔离复现了 retention 的两个残留反例：幸存文件仍可被 `removing` 隐藏。另发现新 Windows CI 缺 SDK/DSP 构建前置条件、180 s worker 超时对无进度长任务会误杀、估计静音虽传到文件快照但界面未提示；60 s 退出看门狗的触发与日志落盘也未验证。当前工作树混合三批未提交改动；本次仅新增复核文档并更新接力入口，未修业务代码、提交或重打包。建议先处理三个 P1，再补端到端验证与 CI 实跑。

## 历史：测试接入 CI 与 P0 修复已完成（全部改动未提交）

2026-09-22：按 `docs/67-CODE-AUDIT-PREVIEW29.md`（仓库根 docs/）的方向一 + P0 清单落地，**改动未提交**。

**测试基础设施**：新增 `test/trace-suites.mjs` 分层清单（portable 43 / native 8）、`scripts/run-trace-tests.mjs` 运行器、`test/suite-coverage.test.mjs` 孤儿检测元测试。`tools/trace.cjs check` 由只跑 4 个测试文件扩展到两层全量；CI `main.yml` 新增 `test:trace` + `build:trace`，并新增 windows-2022 的 `trace-engine` job 跑 15 个原生 CTest 与 native 层（带 `TRACE_REQUIRE_NATIVE=1` 防空跑）。审计指出的 6 个孤儿测试中有 4 处已腐化（Windows 盘符大小写），新增 `test/path-equal.mjs` 修正。

**P0 修复**（各附回归测试）：A 回听 continuity 恒报完整 → `AnalysisSource.continuity` + 新导出 `sourceContinuity()`；B 清单不可读致录音静默消失 → `unreadable` 条目 + 库内显示与"打开目录"；C 退出序列改为 drain 原生后再 shutdown + 60s 看门狗 + worker 180s 空闲超时；F 保留策略删除中途失败回滚幸存资产状态；G `reference.set` 补录音互斥守卫；D 原生 `setFFTSize` 2 的幂校验、`getSamplesInterpolated` isfinite+fmod、`getSamples` count 上限。P0-E（上游 `windows_capture.cpp` 合成静音无标识）**未做**，属上游 Prism 独有路径，Trace 包内只有 `trace_engine.node`。

**验证**：check 全绿（202 + 49 项）；15 个原生 CTest 全过；上游 22 项原生测试全过；Trace 构建与 `m0 electron` 冒烟 pass；`m7/workspace-ui.cjs` 停在与干净基线相同的第 36 行断言，无新增回归。P0-F 与 P0-D 的回归测试均经"回退修复→测试失败"双向验证。

`recording-service.test.mjs` 因 P0-B 有意变更行为，断言由"3 个有效项"改写为"3 可用 + 3 不可读"的更强形式（详见 15 号文档 6.4）。

下一步：方向二剩余的 `sessionStore.ts`/`wavPostprocess.ts` 单测，或按用户指示提交。

## 历史：preview.29 同事内测 R2 包已交付（代码仍未提交）

2026-09-20：前端迭代（见下条）经用户目视验收通过后，打包为 InternalTest-r2。交付 `dist-trace/internal-test/LeoMoon-Trace-preview.29-InternalTest-r2-Windows-x64.zip`，210,506,908 bytes，SHA256 `421e1cdd3c17e0d7af59daba85f5c0c27e42663c57d0bc3f96728eb2d7fc88f1`，105 文件。版本升至 0.1.0-preview.29（`src/trace/product.ts`、`electron-builder.trace.cjs`，输出 `dist-trace/preview.29`）。package-audit / 解压逐文件哈希 / package-smoke / single-instance 全过；详见 [64](../64-INTERNAL-TEST-R2.md)。内测 TXT 文档已更新为 r2 口径；PDF 手册沿用 preview.28。

注意：全部改动（前端迭代 + 版本号 + r2 文档/脚本）**仍未提交**；用户授权后一并提交。新增文件：`src/trace/renderer/snapshotStore.ts`、`viewModel.ts`、`LiveInstruments.tsx`、`tools/package-internal-test-r2.cjs`、`docs/64-INTERNAL-TEST-R2.md`。本轮 M7 workspace-ui 基线失败（见下条）仍未修。

## 历史：前端性能与视觉一致性迭代（未提交）

2026-09-20：按 `docs/66-FRONTEND-AUDIT.md`（仓库根 docs/，非本目录）审计报告落地一版前端优化，**改动未提交**，待用户在有 Node 的环境验证。

- Trace 渲染层（`src/trace/renderer/`）：
  - 新增 `snapshotStore.ts`（30 Hz 快照移出 React state，`useSyncExternalStore` + selector）与 `viewModel.ts`（`deriveView` 纯函数从 App.tsx 逐字迁出；`useChromeFlags` 仅在 recordBusy/finalizing/replayAvailable/error/continuity/format 变化时重渲染 App chrome）。
  - 新增 `LiveInstruments.tsx`：9 个 memo 化容器（Timeline×3、Loudness、Levels、Spectrum、SoundField、TargetStrip、WorkbenchSourceBar、TransportElapsed、ContinuityBar、SelectionStatsRow、WorkspaceFrame），各自订阅快照，App 不再 30 Hz 全树协调。`data-history-position`/`data-history-generation` 由 WorkspaceFrame 维持更新（m7/scrub 工具依赖）。
  - `Timeline.tsx`/`AnalysisInstruments.tsx`：ResizeObserver 与逐帧重绘解耦（drawRef/paintRef 模式）；拖拽选区预览 rAF 合并；频谱 hover 60 ms 节流（与声谱一致）。
  - `SpectrogramPanel.tsx`：`layer` 经 volatile ref + `useMemo([])` 稳定引用，不再每帧触发 Timeline effect 重建。
  - `InstrumentWorkspace.tsx`：`InstrumentWorkspace` 包 `memo`，`useWorkspace` 的 flush/change/retry 稳定化。
  - 逐帧 layout 动画消除：`LoudnessBar` height%→`transform:scaleY`（instruments.css 的 `.loudness-bar-track i` 加 height:100%/transform-origin:bottom）；相关度游标 left%→全宽 `.correlation-cursor` 的 `translateX%`（analysis-instruments.css）。
  - CSS token 单源化：基础色与强调色全部归入 `instruments.css :root`（新增 `--control-bg/--control-hover/--control-border-strong/--input-bg/--input-border`），`styles.css :root` 只留字体；按钮/下拉/输入底色改走变量；滚动条 thin 统一到 trace-modal/instrument-workspace/report-event-scroll/workspace-popover。全部为零视觉变化改写。
  - App.tsx：回调全部 useCallback 化；删除不可达 Space 死分支；模态打开聚焦首个非关闭控件、关闭后焦点归还触发控件；`ReportPanel` 排序与 `RecordingLibrary` 过滤移入 useMemo。
  - 声谱 partial 增量着色本轮未做：`SpectrogramRaster.add` 对旧列做 max 累积（spectrogramView.ts:81），前序列可能被后续 tile 改写，增量方案需先证明追加序，另立任务。
- Prism 渲染层（`src/renderer/`）：
  - `ScopeModule.tsx` peak info 函数式 setState 字段去重（消灭静止画面每帧重渲染）；resize 管线加 `matchMedia(resolution)` 链式 DPR 监听，跨屏拖动不再模糊。
  - `settingsStore.ts`：`persistWorkingState` 300 ms trailing 防抖 + pagehide/beforeunload/hidden 立即 flush（拖拽调宽不再每次 mousemove 全量序列化+同步写盘）。
  - `SettingsPanel.tsx` 整库订阅改 6 个字段 selector；`Strip.tsx` 调宽拖拽 rAF 合并、mouseup 补交最终值。
  - `SpectrumAnalyzer.ts`/`Oscilloscope.ts` 原生 DSP 缺失日志只打一次（恢复后可再打印）；`AstraScopeModule.tsx` 进度条 width%→scaleX；`globals.css` reduced-motion 补 9 类过渡覆盖。
- 验证状态（2026-09-20 补）：已通过项目自带工具链（Codex runtime Node 24.19.0 + .tools 本地 npm 10.9.2）完成 `trace.cjs setup`（npm ci + Electron/esbuild + 原生 addon 重建，0 错误）与 `trace.cjs check`——typecheck 通过，capture-support 3 + lufsmeter-native 6 + trace-report 7 + trace-contracts 11 + recording/recovery 6 全过；workspace-layout/session-timeline 过；`m0 run.cjs electron` 冒烟 pass（240000 帧 0 覆盖）。
- **基线失败（非本次引入）**：`tools/m7/workspace-ui.cjs` 第 36 行断言在干净 HEAD 上同样失败（恢复最大化后 2 !== 4 面板）；原因疑似 M7 后 instruments 顺序变化使 `label:nth-child(2)` 从波形变成电平，门禁脚本未同步。已在两侧各跑一次对比确认。另 `tools/m7/verify.cjs` 的 package-audit 需要完整 `dist-trace` 打包产物，本次未跑打包。
- 待人工：目视验收三种模式（监测/录音/文件回听）的仪表动画、波形/声谱绘制、拖拽缩放、模态焦点；确认后提交。
- 下一任务：验证后提交；随后按报告第二梯队余项（VU 静态层、Spectrum 热力 ImageData 化、渐变缓存）与第三梯队（时间轴键盘等价物、aria-live 读数、遮挡停帧）推进。

## 历史：preview.28 同事内测分发修订 r1 已就绪

2026-09-17：按用户要求准备同事内测 ZIP，程序沿用 preview.28，补入 PDF 快速上手、最新 README、首次使用说明、试用清单、已知限制、反馈模板、许可/来源和校验信息。详情见 [63](../63-INTERNAL-TEST-DISTRIBUTION.md)。未更改业务代码、重编译或覆盖旧包，未代发/上传。

交付：dist-trace/internal-test/LeoMoon-Trace-preview.28-InternalTest-r1-Windows-x64.zip，210,504,189 bytes；SHA256 8b1d206f938cafe91eeb1bc5b9697655b30d2a77d1d03be5ecd4fedefdeabf72。同目录有 .zip.sha256。完整解压后先读 00-开始使用.txt，运行目录内 Trace.exe。

105 文件校验、PDF 原件一致、无个人路径/配置/音频、中文路径解压后运行、八项录音编码重开、四项单实例均通过，报告 artifacts/internal-distribution-1789628708810/report.json。源目录新增 debug.log 已按运行组件白名单排除并保留原件。所有测试已结束。

这是同事内测准备，干净 Windows/硬件/官方素材等 PB3–PB5 验收仍未全部完成；未签名状态已在开始说明注明。无工程阻塞，下一步收集同事反馈。

## 历史：preview.28 快速上手 PDF 已交付

2026-09-17：核对发现已有 docs/28-USER-GUIDE.md 文字说明，但没有成册 PDF，且有报告/参考比较仍写后续等旧条目。本次修正文字说明，并生成 8 页 A4 中文快速上手手册：output/pdf/LeoMoon-Trace-Quick-Start-preview.28-zh-CN.pdf，内容与维护方式见 [62](../62-USER-MANUAL.md)。

手册采用 LeoMoon / TRACE 品牌及实际 preview.28 演示截图，覆盖首次录音、历史/选区/循环、布局与仪器、报告、A/B、文件管理和反馈。中文字体嵌入、八页文本、八个书签、四个跳转、边界检查通过，全部页面已渲染查看。报告 artifacts/manual-qa.json。没有运行中的采集或验证任务。

本轮未修改业务代码或重打包，运行包仍为 preview.28；原 ZIP 的 README 保持原交付快照，PDF 单独交付。下一步可根据用户反馈修订，或在后续授权中加入帮助入口和分发包；PB3–PB5 未启动，无工程阻塞。

## 历史：LeoMoon 系列品牌接入，preview.28

2026-09-17 用户纠正品牌方向：复用狮子月牙形状，仅换色；LeoMoon 保留为系列，Trace 为个体产品。现已接入绿—青标识、LeoMoon / TRACE 两级字标、帮助说明和 Windows 六尺寸图标。最终素材在 resources/trace/branding，另一项目仅作读取参考；原波形 SVG 与旧包保留，详见 [61](../61-LEOMOON-TRACE-BRANDING.md)。

类型检查/构建、实际包六组窗口/缩放、图标及包审计通过。八个 main/worker/preload JS 除版本外与 preview.27 相同，native 相同，未重跑音频全量门禁。报告 artifacts/branding/ui-1789625259550/report.json。入口 dist-trace/preview.28/win-unpacked/Trace.exe，ZIP SHA256 550153407e6865484713be7188a0ee6c0cb952fa7d5624b14446a85add160637。

没有运行中的验证任务或工程阻塞；下一步用户确认品牌显示。PB1/PB2 已交付状态不变，PB3–PB5 未启动。

## 历史：PB1/PB2 已交付，preview.27

2026-09-17：已按用户要求完成单实例保护及故障诊断/反馈，详情与机制见 [60](../60-PB1-PB2-SUPPORT.md)。重复启动激活已有窗口；帮助中可导出/复制诊断、打开 472841772@qq.com 邮件草稿。日志有界且只存固定字段，异常界面可恢复，主进程致命异常退出后能识别未正常结束并查看录音恢复。旧版 preview.26 及更早不遵守锁，首次升级先退出它们。

最终包十阶段通过，`artifacts/public-beta/final-1789624386050/report.json`：19 项单元/协议、包与 ZIP 97 文件、不同目录单实例、真实 WASAPI 录音/renderer 故障/主进程致命异常及恢复、诊断脱敏、React 边界、布局/导航、中文路径录音编码重开和启动失败。原失败记录保留，所有测试已结束。原生模块未变化，未重复长测/物理设备/EBU/干净 Windows 项，邮件客户端实际发送及原生故障弹窗人工验收未做。

入口 `dist-trace/preview.27/win-unpacked/Trace.exe`；ZIP `Trace-0.1.0-preview.27-Windows-x64.zip`，SHA256 `2f52741def982df648b1a1501bf47a0bf34df8b6decc92dbdc6e954bc84fa90c`。PB1 已提交 3b9e2c1，PB2 作为完整阶段另存。用户只要求前两步，PB3–PB5 尚未启动；当前无工程阻塞，下一任务为用户试用反馈。

## 历史：PB1 已开发验证，继续 PB2

用户授权先推进单实例与故障诊断/反馈，收件邮箱已提供。PB1 在引擎/存储初始化前取得同配置目录单实例锁；重复启动、唤回、真实录音不中断与重启保存均通过，见 [60](../60-PB1-PB2-SUPPORT.md)。当前仅开发构建改变，preview.26 旧包保留。下一步 PB2，有界诊断/非正常退出与界面恢复/手动导出/邮件草稿，完成后打新包并复验。

## 历史：公开测试准备度评估，暂不直接开放下载

2026-09-17：基于 preview.26 / 66dbbdd 完成 [59 公开测试准备度评估](../59-PUBLIC-BETA-READINESS.md)。功能足够进入试用，但公测放行独立于 57 的专家评分。新复现 B01：两个隔离测试进程共享配置，A 保存退出确认=false 后，未改设置的 B 正常关闭将磁盘写回 true。报告 `artifacts/public-beta/instances-1789622598615/report.json`，测试已结束，未操作用户音频/配置。

公测前建议 PB1 单实例/共享数据保护 → PB2 故障提示与脱敏诊断/反馈 → PB3 干净 Windows/真实设备/测量范围/普通硬件 → PB4 用户任务与分发/源码材料 → PB5 邀请制试用。EXE 实测未签名；未发现 Trace 自有公开分发和对应修改源码入口。没有宣称当前存在具体安全漏洞，相关依赖审计仍待做。

本轮仅评估、隔离复现和文档同步，未改产品代码或重打包。当前运行版本仍为 preview.26；建议下一任务 PB1，尚未实施。真实 96k/EBU/混合 DPI/干净环境/独立用户专项保留待验。详见 59 的事实、推断与建议边界。

## 历史：preview.26 布局编辑入口反馈已交付

2026-09-17：用户无法发现布局编辑入口，本次将按钮改为“编辑布局 / 完成布局”，编辑时显示简短提示、标题拖动把手和分隔线手柄。“自定义 · 未保存”改为“自定义布局”，管理弹层区分自动保存与命名预设。布局存储和音频路径未变。详情、包哈希与验证见 [58](../58-LAYOUT-EDIT-FEEDBACK.md)。

类型检查、构建、打包界面四组实际流程（含六组尺寸/缩放、源/游标/选区保持、重启恢复）及包审计通过。八个 main/worker/preload JS 除版本号外与 preview.25 相同，native 字节相同。未重复长录音和硬件专项。前两份 UI 失败来自检查错层级的分隔线比例，保留原记录；修正检查对象后通过。

交付入口：`dist-trace/preview.26/win-unpacked/Trace.exe`，ZIP 同目录上一层 `Trace-0.1.0-preview.26-Windows-x64.zip`。旧包与配置保留，没有运行中的测试。下一步为用户复验布局编辑；本轮无工程阻塞。M12 原专家评分仍见 57，用户反馈不应被此前分数掩盖，未自动改分或扩展阶段。

## 历史：M7–M12 工程交付与原八维复评目标完成

2026-09-17：本轮目标已完成，最终交付 **Trace 0.1.0-preview.25**。计划内布局、频谱/声场、共轴 2D/3D、目标/事件/报告、外部导入及 A/B 参考均已实现并完成工程验证。原八维/原权重、0.5 主要粒度复评：**加权 8.6500，算术 8.6875**，均严格超过 8.5；证据、扣分原因和评分边界见 [57](../57-M12-FINAL-REVIEW.md)，逐项审计见 [56](../56-M12-COMPLETION-AUDIT.md)。分数是专家评估，不是算法精度百分比或用户验收。

**没有运行中的验证任务。** 原 exec 12679、runner 63964/app 66296 已结束，1800.128 秒 pass。120 次采样、29 次显隐、33 次 A/B、25 次报告生成、9 份导出、至少 10608 组参考频谱，无丢帧/仪器错误/hash 重试。实际 WAV 14,402,880 帧 / 300.060 秒 / 48k 双声道 PCM24 与清单/哈希一致，报告四文件/行数/末帧完整。报告 artifacts/m12/resources-1789606251763/report.json 与 recording-integrity.json。不要再等待或重启这项任务。

preview.24 的 40 阶段 / 204 JS 完整功能证据保留；原显隐计数失败及同包补验记录见 55。多格式/短 B/单声道/静音/独立范围的原生矩阵 4 项通过，reference-matrix-1789606680822。最后修正参考面板对不适用声道模式/静音的提示，以及动态悬停与旧绑定清除，独立渲染 4 项通过。

preview.25 相比 24 的全部 8 个 main/worker/preload JS 除版本字面量外完全一致，native 字节相同；界面收尾经三组参考 UI、包审计、真实录音/编码/重开、ZIP 97 文件及中文路径 9 阶段复验通过，artifacts/m12/feedback-final-1789608070776/report.json。资源证据来自 24 的等价音频/主控路径，未声称 25 重新跑了全部长测。交付审计 artifacts/m12/delivery-audit.json 验证了状态、hash、链接和用整数分数计算的严格评分阈值。

运行入口 dist-trace/preview.25/win-unpacked/Trace.exe。ZIP dist-trace/preview.25/Trace-0.1.0-preview.25-Windows-x64.zip，207,215,134 bytes；SHA256 185eb28d2ee2843fb783a4533b631494edbefe56737b587db1df3cfec90d1ec6。ASAR 1579e8bcb0566b2895c1dd8f89d4779054813090eaac58200e7503370aa4673c；Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。

原用户主观任务、EBU 官方素材、实际 96k 采集、物理驱动切换、真实混合系统 DPI、干净 Windows/VM 项继续独立待验；它们未被标为通过，也不宣称正式发布认证。后续先收集使用反馈与这些环境证据；配对持久化、更多制式/频带、多声道等另列范围。本轮不再自动扩展功能。旧包/录音/原失败记录保留，已按阶段本地提交，不推送远程。

## 历史：M12 A/B 已接入，preview.24 长资源门禁运行中

2026-09-17：ReferenceService、独立范围/时间映射、A/B 串行试听、监听增益恢复、双频谱、workspace v4 与统一原生两槽队列已接入。参考/播放关闭中的原文件持有纳入自动整理，释放后才允许清理；已修复选区释放会取消其他消费者的问题。参考数据独立转移，不进入 TraceState。实现与证据见 [55](../55-M12-REFERENCE-INTEGRATION.md)。

**同一 preview.24 包，40 阶段 / 204 JS 合并短门禁通过。** 原报告 artifacts/m12/final-1789605251771/report.json 在 35 阶段后因显隐脚本仍断言 7 个仪器失败；只改为实际 8 个，保留原报告。补全报告 artifacts/m12/final-tail-1789605705613/report.json 核对相同版本/ASAR/native，继承已通过部分，并完成显隐、旧导航、完整包、ZIP 97 文件和中文路径。不要把原报告状态改为 pass。

A/B 实际流程三组缩放通过，最大 FFT/平均窗 20 个新位置成对显示 p95 约 112 ms，低于预先固定的 200 ms 冷计算预算；旧缓存查询 100 ms 门槛不变。同文件同范围 I/TP 差值精确 0；48k/44.1k 已知增益、播放切换/各自音量/选区/越界、A 回听时清理 B 均通过。最小窗口补验 artifacts/m12/reference-1789605965070/report.json 无横向裁切。源码与说明中的 paired powers 使用 10 log10，不是幅度换算。

**唯一正在运行的长测：exec 12679，runner 63964，app 66296；artifacts/m12/resources-1789606251763/report.json。** 1800 秒、真实 GPU/捕获、最高 FFT/3D、持续新位置与 A/B、报告/复制/显隐/丢失恢复；已开始采样。先 poll 同一 handle 并核对 PID，不能因一次观察超时重启。最终短预检 60.062 秒已 pass（resources-1789606001381），exec 59241 已结束；原 19737 与最早失败也已结束。

包入口 dist-trace/preview.24/win-unpacked/Trace.exe；ASAR 1c25ee806d595900790fe1065930eeb0f91a5f12a4bb3cb6fd12918ed27d36d3，Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。ZIP 207,214,936 bytes，SHA256 a32d08fcd7a76edffbfa771888b99919b901dc76847ef72997d7ce795b3ee184。preview.22/23/24 均保留，长测期间不要覆盖 24。

下一步：收取 M12 长测，核对实际 WAV 帧/头/hash 与导出报告完整性。补参考的多种 B 格式、真正较短 B/单声道、不适用声道模式和异常恢复场景；目前参考 UI 主验证使用录音 A 与导入 WAV B，不能用导入四格式检查自动冒充全部参考矩阵。完成工程关口后按 37 原八维/原权重及 0.5 主要粒度复评，同时算术均分；两种未四舍五入值均需严格超过 8.5。未达到就按具体短板改进，尚未给最终评分。

整体目标 active，M12 未关闭；原人工/EBU/实际 96k/物理驱动/混合 DPI/干净 Windows 专项独立开放。没有外部阻塞；文件、原失败和旧包保留，按阶段本地提交，不推送远程。

## 历史：M12 外部导入已接通；下一任务 ReferenceService

2026-09-17：ImportService、AssetRepository、文件库/原生对话框/拖放已接通，外部 WAV/MP3/M4A/ADTS 使用既有文件历史、仪器、报告与导出。来源读取与清理有等待/代次，准备完成状态在持久化收尾后发布；REC 暂停/恢复、旧刷新淘汰、变化/缺失/重定位和引用归档已覆盖。详情见 [53](../53-M12-IMPORT-INTEGRATION.md)。

**开发构建 preview.23** 的导入 GUI **9 项通过**，报告 artifacts/m12/ui-1789601119342/report.json，packaged=false，main 构建 SHA256 941a02c51c071ab3a5648b24db9cff6d582c92ae58575e2e4249bb3abcb8d035。314 字符中文只读路径、四格式各自历史、报告 imported 标识、磁盘 File 拖放/假 File 拒绝、REC 排队、打开来源移走时失效、重启/同内容重新定位、缓存重建、引用移除与原文件/成品保留、最小窗口均通过。已查看实际文件库截图，修正空提示和目录说明。

针对性 JS **43 项**通过（artifacts/m12/targeted.log），其中 ImportService 11 项、referenceMath 3 项；类型检查和开发构建通过。报告真实原生缓存 **6 项**复验通过（artifacts/m11/native-1789601341496/report.json）。原有 61 条录音的搜索/筛选/重命名/导出设置/重启 **7 项**通过（artifacts/iteration/two-ui-1789601433169/report.json）。过去的测试等待/旧 API 表面断言/状态提前发布失败均已针对原因修正，不放宽音频或资源门槛。

**当前没有运行中的验证任务。** 完整可回退包仍为 preview.22；源码和打包配置已设为 preview.23，但尚未制作独立包。M12 尚未进行完整 DPI/压力/资源关口，也没有最终评分。M11 的已通过包、长测及原失败均保留。

**下一任务固定为参考服务与界面：**读 [54](../54-M12-REFERENCE-DESIGN.md)。referenceMath.ts 已验证范围、正负纳秒偏移、44.1/48k 映射、超过 JS 安全整数的帧与 A−B 差值；但目前没有 ReferenceService、参考 UI 或参考频谱数据流。必须实现独立 A/B 来源/范围/引用、晚到解析淘汰、源失效/清理等待、串行试听与音量恢复、共轴定位、频谱/统计对照。复用活动来源的仪器结果，仅补另一来源；原生全局任务槽只有两个，需显式协调/coalesce，不可吞 QUEUE_FULL。

ReferencePanel 规划为可显隐/停靠仪器，workspace 需迁移保留旧布局；大数组走独立转移流，不能回到 TraceState/回复缓存。M12 完整交付后再按 37 原八维和权重、算术均分复评到目标。整体目标 active；原人工/硬件/标准素材专项继续单独跟踪，没有当前外部阻塞。文件与旧包保留，按阶段本地提交，不远程推送。

## 历史：M11 工程关闭，继续 M12 准备服务与产品接入

2026-09-17：preview.22 的 **31 阶段 / 165 JS 短门禁及 1800.325 秒资源流程均通过**。资源流程 120 次采样、29 次显隐、34 次报告生成、12 份复制导出，无丢帧或仪器错误，本次 hash 重试计数为 0。总工作集峰值 804.05 MiB、主进程 416.47 MiB、报告 worker 103.08 MiB，尾段平均增长 9.81 MiB。原阈值未放宽。

事后确认真实录音 14,436,480 帧 / 300.760 秒 / 48 kHz 双声道 PCM24，格式、边界、SHA256 与清单一致；12 份报告各四文件齐全，历史 CSV 各 1600 条声道读数、末帧 384000，报告夹具源 hash 保持。证据 artifacts/m11/resources-1789595402067/report.json 与 recording-integrity.json。M11 工程关口关闭、待人工复验，见 [51](../51-M11-INTEGRATION.md)。原 exec **58609 已 exit 0**，runner 49212/app 55292 已结束；没有仍运行的长测，不再轮询或重复启动。

M11 实现提交 **1205754**，只读 hash 的有界重试提交 **268606e**；preview.21 偶发退出的原失败与根因未复现说明保留在 51。preview.22 的包/ASAR/hash 与前条记录一致，运行包未被后续源码覆盖。

M12 解码底座已提交 **069ac23**。资产持久化与导出宿主提交 **1ca70b3**，包括 ImportStore / ImportedDocument v1、窄 ExportRepository/ExportOwner 和解码缓存读取校验，存储 6 项、格式 2 项及受影响导出/另存 7 项共 15 项通过，类型检查通过。真实外部解码/清理/错序与坏缓存 7 项、导出宿主 4 项通过：artifacts/m12/import-1789597141912/report.json、artifacts/m12/export-1789597162259/report.json。WAV 样本/帧数与原率/声道保持，源文件只读且 hash 不变；导入模型不伪造 CaptureRegion。设计与限制见 [52](../52-M12-ASSET-REFERENCE-DESIGN.md)。这些代码尚未接入应用，不能称为已交付外部导入。

**下一任务 ImportService：**独立资产准备队列、取消/REC 暂停、源文件变化/缺失、重建/删除等待、原始 hash 与已准备 PCM 解析。随后组合录音/导入仓库，接入文件对话框/拖放/文件库与现有仪器、报告和导出，再做单份参考范围/偏移/频谱与统计/串行 A-B。M12 完成后按 37 原八维/原权重及算术均分复评到目标。

整体目标 active；M12 与最终评分未完成。原人工/EBU/真实 96k/物理驱动/混合 DPI/干净 VM 项继续单独跟踪，无外部阻塞。当前可运行完整包仍为 preview.22，M12 后续候选另建；文件/旧包/失败证据保留，按阶段本地提交，不推送远程。

## 历史：M11 短门禁通过，preview.22 资源流程运行中

2026-09-17：M10 工程关口已关闭；M11 已接通目标设置/范围带/超限标记、后台报告任务、整段/独立选区、事件定位、CSV/HTML 和复制导出。独立引用计数、取消后等待 worker 退出、录音优先和私有目录清理已接入。完整设计/失败/验证见 [51](../51-M11-INTEGRATION.md)。

preview.22 **31 阶段 / 165 JS 完整短门禁通过**：artifacts/m11/final-1789595075808/report.json。报告三组缩放各 10 项，四种封装整段/选区、两小时 72 万点报告、HTML 渲染、原 M8–M10 与包/ZIP/中文路径均通过。真实窗口目标/报告截图已查看。60.536 秒 GPU/录音转 LIVE/后台报告复制复验通过，报告 artifacts/m11/resources-1789595322682/report.json；exec 66330 已结束。

preview.21 原完整门禁失败于一次纯 hash worker 的 0xC0000005 退出，40 次相同文件交替检查和两版各两次完整流程均通过，底层原因未复现。preview.22 仅对这一明确退出码的只读 hash 增加一次新进程重试并留日志；不会重试写入/解码，不绕过真实 hash 比较。修复已提交 **268606e**。原报告及失败文件保留，细节见 51。

**唯一当前长测：** exec **58609**，runner **49212**，app **55292**；**artifacts/m11/resources-1789595402067/report.json**，1800 秒，不可变 preview.22。最高 FFT/3D、真实采集、GPU 丢失恢复、显隐和周期报告/复制；已产生真实采样。先 poll 同一 handle 并核对 PID，不因一次超时重复启动。

当前包入口 dist-trace/preview.22/win-unpacked/Trace.exe；ASAR 8f510eb26d325bf4f061bd53dfe03b4d93582568498827a36719781996558f8e；Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。ZIP 207,190,546 bytes，SHA256 aa8758146a155c7f1322ab8822ecb00dc6b9b25688d494902f252c46a2b42384。不得用后续源码覆盖正在测的包。

下一步：收取该长测并核对录音文件/报告输出，满足后关闭 M11 工程关口；M12 前置设计见 [52](../52-M12-ASSET-REFERENCE-DESIGN.md)，外部只读解码底座已独立验证（格式规则 2 项、实际 FFmpeg/精确清理 6 项），见 52；持久化/任务队列、导入 UI 和参考比较仍未接入。当前源码变化不在 preview.22 包内。然后完成 M12 和原八维复评。M11 未关闭、整体目标 active；原人工/EBU/真实 96k/物理驱动/混合 DPI/干净 VM 项继续独立开放，无当前外部阻塞。按阶段本地提交，不远程推送。

## 历史：M10 工程关闭，M11 任务服务与界面接入中

2026-09-17：preview.20 的 25 阶段短门禁及 **1800.335 秒 GPU 长测通过**，29 次显隐/强制 GPU 丢失恢复/录音转 LIVE 无错误或丢帧。总工作集峰值 802.94 MiB、主进程 418.95 MiB、平均增长 20.54 MiB，原阈值不变。事后 14,434,560 帧 / 300.720 秒 / 48 kHz 双声道 PCM24 的格式和 SHA256 与清单一致。M10 工程关口关闭，人工与原环境专项继续开放；详见 [49](../49-M10-3D-INTEGRATION.md)。

原 exec 10121 已 exit 0；报告 artifacts/m10/resources-1789591713041/report.json 与 recording-integrity.json。无需再等待或重启。preview.20 包保持不变；M11 的未提交源代码不在该包内。旧录音/包/失败证据保留。

[38](../38-DEVELOPMENT-PLAN.md) 更新为 v1.3，修正过期的 M8/M9 下一任务，明确 M11 → M12 → 原八维复评的开发目标、工作票、退出条件及证据要求。M11 核心已提交 7a2eab9；后台队列、独立租约、取消/重试、复制导出与目标/报告 UI 正在集成，尚未通过产品运行门禁，不能称 M11 完成。

下一步：完成 M11 实际窗口/原生 worker/整段与选区/取消和源清理/长文件检查，交付新候选；再推进 M12 与最终评分。整体目标 active，无当前外部阻塞；按阶段本地提交，不推送远程。

## 历史：M10 绑定前过期请求修复；M11 报告核心独立验证通过

2026-09-17：preview.19 长测在约 300 秒 REC → LIVE 后失败于 STALE_SPECTROGRAM_SOURCE。报告 artifacts/m10/resources-1789589444537/report.json 已终止 fail，原 exec 16703 已结束，不再轮询。此前只过滤绑定完成后的旧异常；本次请求在到达解析器时就已过期，尚未建立绑定。

preview.20 增加 SpectrogramContextChanged 类型，仅由应用解析器在来源/epoch/可见性确实不匹配时抛出。协议增加 cancelled 状态，前端按当前来源重试；真实原生/文件故障仍为 error，不按错误字符串一概忽略。确定性旧引用、60.402 秒 GPU 切换复测和 **25 阶段 / 151 JS 完整短门禁通过**，报告 artifacts/m10/final-1789591500935/report.json。

M11 独立核心已提交 **7a2eab9**：TargetSettings、按页原缓存遍历、连续事件合并和 HTML/摘要/历史/事件 CSV。目标规则 5 项及真实原生缓存报告 6 项通过，范围/单位/原始值/选区独立累计/完整性/转义/取消/源 hash/坏页均有证据，见 [50-M11-TARGET-REPORT-DESIGN](../50-M11-TARGET-REPORT-DESIGN.md)。产品报告界面、任务服务和目标线接入仍未做，不据此宣称 M11 完成。

**唯一当前长测：** exec **10121**，runner **42400**，app **79284**；**artifacts/m10/resources-1789591713041/report.json**。不可变 preview.20，1800 秒真实 GPU、最高 FFT/高细节、强制丢失恢复及录音转 LIVE；已经启动并有真实采样。先 poll 同一 handle 并核对 PID，不重复启动。短复测 31726 已结束通过；旧长测 16703 已结束失败。

当前包 ASAR 0bfc600d6121cd601f3c8600564b33d1c796bc79d4c70fa79029905a32e3b231，Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe；入口 dist-trace/preview.20/win-unpacked/Trace.exe。M11 独立核心尚无产品入口，不能将其说成已交付报告功能。

下一步收取长测并复核录音，满足后关闭 M10。继续 M11 后台任务、范围/来源租约、目标线/事件和报告界面；然后 M12 和原八维复评。M10 尚未关闭，整体目标 active；旧包/录音/失败证据保留，无外部阻塞。

## 历史：M10 3D 与降级已接入，preview.19 GPU 长测运行中

2026-09-17：M9 工程关闭记录已提交 **8499f92**。M10 已接入 2D/3D、相机预设/旋转/复位、显示高度/细节、共用时间刻度和原始点查；GPU 丢失/恢复、无 WebGL 的 2D 降级、REC 中图形故障均已实际验证。spectrogramSettings v2 向后迁移，显示选择不改变分析键。已修正零高度刻度命中、矮宽窗口投影/标签，以及 Windows 短暂文件锁造成设置保存打断业务的问题。设计见 48，当前验收与包身份见 [49-M10-3D-INTEGRATION](../49-M10-3D-INTEGRATION.md)。

**24 阶段短门禁 / 150 JS pass：** artifacts/m10/final-1789589279738/report.json。3D 三组进程缩放各 6 项、无 WebGL、真实独占文件锁、M9 旧流程、包/ZIP/中文路径全部通过；设置锁期间命令约 4 ms 返回，5 次后台重试后最新配置保存，录音继续。原失败报告保留，没有放宽数值或资源阈值。

**唯一当前长测：** exec **16703**，runner **49384**，app **63464**；**artifacts/m10/resources-1789589444537/report.json**。真实 GPU、1800 秒、FFT 16384 与高细节 3D；周期显隐并强制 GPU 丢失恢复，原内存/丢帧预算不变。已启动并产生实际采样。先 poll 同一 handle/核对 PID，不重复启动；preview.19 运行包保持不变。

下一步：收取 GPU 长测及录音最终文件完整性，失败则据实定位。通过后关闭 M10 工程关口并记录人工复验项，推进 M11 目标/事件/CSV-HTML 报告与 M12 外部导入/参考比较，再按原八维复评。当前没有外部阻塞；M10 长测未完成，M11/M12/最终评分未完成，目标 active。

ASAR 2aaf12362cac920dc2e039024b4104c74fc993c6e83bed89ec77d5d7d0cabb04；Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe；入口 dist-trace/preview.19/win-unpacked/Trace.exe。保留录音、旧包和失败证据；按阶段本地提交，不远程推送。原 EBU/真实 96k/物理驱动/混合系统 DPI/干净 VM/人工主观继续单独跟踪。

## 历史：M9 工程交付完成，M10 3D 原型已验证

2026-09-17：preview.17 的 19 阶段短门禁和 **1800.209 秒资源门禁均通过**，M9 工程关口关闭，人工与既有环境专项单独跟踪。29 次显隐，无声谱错误/丢帧，工作集增长约 0.87 MiB；录音 14,424,000 帧 / 300.50 秒，头/格式/hash 与清单一致，见 [47](../47-M9-PRESENTATION-PERFORMANCE.md)。原 exec 67230、runner 55868、app 65924 已结束，不再轮询或重启。

M10 已独立验证时频最大值网格、相机/投影反解、三角形拾取、GPU buffer 复用与上下文丢失/恢复。当前本机 WebGL 2 / RTX 4080 SUPER / ANGLE D3D11 可用；纯几何 4 项、实际图形 4 项通过，设计与预算见 [48-M10-3D-DESIGN](../48-M10-3D-DESIGN.md)。已有 SurfaceCanvas 尚未接入产品，不能当成完成 M10。

下一步固定为 M10 产品接入：扩展声谱图显示设置并迁移旧值，增加 2D/3D、相机预设/复位、高度/细节、共用刻度与原始点查；把 GPU 故障降级接入实际录音场景，再完成数值对照、交互、资源与独立包门禁。preview.17 保留不变。M10–M12 和最终复评仍未完成，目标 active；无当前外部阻塞，按阶段提交，保留文件/旧包/失败记录。

## 历史：preview.17 的 M9 专项通过，等待新资源门禁

2026-09-17：preview.16 已实际完成 **1800.258 秒 pass**，29 次显隐、无声谱错误/丢帧；WAV 14,434,560 帧 / 300.72 秒的头、格式和 hash 与清单一致，报告 resources-1789582017255/file-integrity.json。原 exec 7602 已结束，不再轮询。

preview.17 完成绘制前来源/epoch/analysisId/配置校验、错误重试、单声道说明，以及隐藏恢复后的查询续接。Canvas 在 layout effect 绘制，同源缩放保留正确坐标的已有图像。旧 500 ms 请求改为随时间轴快照触发并以 33 ms 补充检查。新增列只计算一次；原始块之外加入精确区间最大值结构，颜色使用复用表，均不改变原始 bin/dB。

**19 阶段短门禁 / 140 JS pass：** artifacts/m9/final-1789585180170/report.json。新 2D 多 DPI、WAV96/MP3/M4A/ADTS、单声道、快速换源/FFT、错误重试、固定缓存 GUI 和两小时文件优先查询通过。真实端到端查询至绘制 p95 **12.7 ms**；两小时文件取消宽视图后聚焦两秒 **27 ms**、缓存命中绘制 **6.7 ms**。完整范围、对照算法、缓存预算及候选 hash 见 [47-M9-PRESENTATION-PERFORMANCE](../47-M9-PRESENTATION-PERFORMANCE.md)。已查看 200% 进程缩放截图，原文件保持 hash。

**唯一当前长测：** exec **67230**，runner **55868**，app **65924**；**artifacts/m9/resources-1789585398846/report.json**，1800 秒、不可变 preview.17。已确认进程存活；约 330 秒已结束录音进入 LIVE，无错误/丢帧，继续检查原工作集/堆门槛和新增原始+派生缓存总量。先 poll 同一 handle 并核对 PID，不能因一次超时重启。

下一步：收取该长测及录音最终完整性，若通过则关闭 M9 工程关口并记录人工复验项；若失败保留报告并针对原因修复。当前 M9 功能/正确性/专项均已有证据，不重复重做已完成的 UI、缓存或格式工作。可独立准备 M10 的同数据 3D 渲染/相机/降级设计，M9 关口通过后再集成交付。M10–M12 和最终原八维复评尚未完成，目标 active；原硬件/标准素材/人工专项独立开放。

运行入口 dist-trace/preview.17/win-unpacked/Trace.exe；ASAR 020334198a05665eeabc41dc15433c960d5a177df40d811fee9fb5638cab1b88，Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。文件/旧包/失败证据保留，当前无外部阻塞；按阶段本地提交，不远程推送。

## 历史：M9 录音结束时的过期异常，preview.16 修复候选

2026-09-17：2D 接入已提交 **e7a9253**。preview.15 长测在约 300 秒录音结束/切回 LIVE 时失败于声谱错误计数，错误为 STALE_INSTRUMENT_SOURCE；报告 artifacts/m9/resources-1789580510557/report.json 已终止为 fail，原 exec 83274 不再运行，不能再称其为进行中。此前短门禁 14 阶段 pass 仍有效，但 M9 未关闭。

定位到 SpectrogramPresenter 的成功分支会检查绑定有效性，异常分支仅检查 requestId，导致旧来源的失败仍会被发布。当前修复候选同时检查异常所属绑定，结束录音前主动取消呈现，并将录音绑定有效期限制到原生 recording 阶段；仍属于当前来源的真实错误继续公开，不按错误码一概忽略。新增两个竞态用例；相关 33 项和类型检查通过。

preview.16 已通过 **60.055 秒切换复测**（resources-1789581266835）和 **14 阶段完整短门禁 / 134 JS**（artifacts/m9/final-1789581814528/report.json）。原生桥接的帧增长断言修正为在有界观察期等待下一音频包，仍要求真实帧数增加；不假设每次很快的瓦片计算期间必有新包到达。原失败报告保留。

**唯一正在运行的新长测：** exec **7602**，runner **56552**，app **64460**；**artifacts/m9/resources-1789582017255/report.json**，preview.16，1800 秒。已启动并得到实际采样；先 poll 同一 handle/核对进程，不重复启动。旧 83274 已失败结束，60 秒复现 60064 已通过结束。M9 录音资源采样进一步要求 writtenFrames 严格增加，原工作集/堆/缓存阈值不变。

新包 ASAR f5928bc93d615519cfe1b1633abe7ef2adedc7c4cf9d8262ecd54283674103a8；Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe；ZIP a7a96d1cb2ed0851e779c3497812951dffbd1a4d21eb5ccb7447f09c96cbecc1。入口 dist-trace/preview.16/win-unpacked/Trace.exe，长测期间保留不变。

下一批除收取长测外，优先补 M9 快速换源/改配置时的绘制前身份检查（避免依赖 effect 清空而出现一帧旧图）、当前错误的重试入口、单声道模式提示、平移/缩放连续性及 500 ms 更新延迟；然后补 2D 多格式/DPI/真实长文件矩阵。M9 未关闭，M10–M12 与最终评分目标保持 active。按阶段提交；原包/录音/失败证据均保留，无当前外部阻塞。

## 历史：preview.15 共轴 2D 短门禁通过，M9 长测运行中

2026-09-17：M9 的主进程来源解析、独立声谱数据流、点查询/取消、来源关闭等待，以及共轴 2D 面板已接通。workspace v3 保留旧布局并添加隐藏的声谱图；新增“时频检查”预设和独立 spectrogramSettings。实现、包身份、已验/待验范围见 [46-M9-2D-INTEGRATION](../46-M9-2D-INTEGRATION.md)。

**短门禁 14 阶段 pass：** artifacts/m9/final-1789580383517/report.json，132 JS、M9 原生 5 项、新 2D GUI 9 项、原 M8 三组缩放各 12 项、隐藏/最小化生命周期、旧导航、包/ZIP/中文路径重定位通过。已查看真实文件和录音截图。早期测试序列化/旧六仪器计数等失败报告保留；只改正确预期，未放宽数值或资源预算。新 2D 的完整 DPI/多格式/长文件矩阵尚未完成。

**唯一当前长测：** exec **83274**，runner **66576**，app **25380**；报告 **artifacts/m9/resources-1789580510557/report.json**。使用不可变 preview.15，1800 秒，最大频谱/声场/声谱设置、七仪器显示及周期显隐。已确认实际进程存活，约 210 秒仍 running、未报错；先 poll 同一 handle 并核对进程，不重复启动。M8 的旧资源任务已结束通过。

下一步：收取本长测，失败据实修复、保留原报告。独立推进 M9 的固定缓存 GUI、WAV/MP3/AAC 2D 边界、新仪器多 DPI、真实长文件与取消/坏块/缺口；特别测量当前 500 ms 实时视图请求的显示延迟、平移/缩放连续性及单声道模式提示，满足阶段预算后再关闭 M9。随后继续 M10–M12 和原八维复评；不能将本次接通或短门禁替代全目标完成。

运行入口 dist-trace/preview.15/win-unpacked/Trace.exe；包内 ASAR 655be571148ed3bc68dfc99b97759d60c753b0037779ac11a09a5a94589a9569，Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。长测期间不覆盖该包。文档/代码按本阶段本地提交，录音/旧包/失败证据保留；未远程推送。原 EBU/真实 96 kHz/物理驱动/混合系统 DPI/干净 VM/人工主观仍独立开放，无当前外部阻塞。

## 历史：M8 工程关口通过，继续 M9 完整服务与 2D

2026-09-17：唯一资源任务 artifacts/m8/resources-1789576099071/report.json 已结束，**1800.366 秒 pass**；runner 78012/app 61252 已退出，不再轮询或重复启动。120 次采样、29 次显隐，无丢帧或仪器错误，工作集增长 94.47 MiB < 原 128 MiB；事后 WAV 帧数/格式/hash 与清单一致（300.05 秒 PCM24）。完整工程交付及包身份见 [42](../42-M8-ACCEPTANCE.md)/[45](../45-VISIBILITY-AND-RESOURCE-GATE.md)。M8 工程关口关闭，人工与既有环境专项继续开放。

M8 关闭记录已提交 **59bd634**。M9 新实现 spectrogramSource/Service/View、过期块淘汰和独立测试入口：类型检查、编解码/存储/服务 **17 项**、实际原生链路 **5 项通过**；见 [43](../43-M9-SPECTROGRAM.md)、artifacts/m9/service-tests.log、artifacts/m9/native-service-1789578390972/report.json。真实 750 Hz 标定、解码局部坐标、实时/固定缓存同窗一致、REC 查询不阻断写盘均有证据。

**下一步固定为 M9 应用接入：**在 PlaybackService/main 解析当前来源和已验证内容键，增加白名单视口/原始点/取消接口，绑定关闭/清缓存/删除库记录的等待释放；REC 纳秒轴映射到当前原生段。然后接入 2D 面板、统一时间轴/选区/设置和 workspace 迁移，运行 GUI/长文件/资源/包门禁。当前服务尚未接入主进程命令或 2D 界面，不把 17+5 检查当成 M9 全阶段完成。

preview.14 包保持不可变；当前开发原生 hash 为 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe，与包不同。未重建包、未进行新的 M9 全 GUI/30 分钟测试。文件/旧包/失败记录保留，无当前外部阻塞；M12 和最终复评目标继续 active，按阶段本地提交，不远程推送。

## 历史计划入口：38 v1.2（2026-09-17）

用户要求将 Insight 2 建议落地为接下来的开发目标。本轮整理 [38-DEVELOPMENT-PLAN](../38-DEVELOPMENT-PLAN.md) 为统一执行入口：保留 M7–M12 的任务/依赖/退出条件，补齐原八维权重与复评依据、U1–U6 整体验收场景和最近一批 M8-R/M9 工作票。校正旧候选 preview.11、M9“待开始”和 M7 初始工作票的过期提示；01/02/05/07/37 已同步入口与当前边界。

本次为文档整理，无产品代码/依赖/算法/阈值变更，不重建运行包、不新启音频测试。已通过 7 份文档的 45 个相对链接、6 个阶段、13 个扩展验收编号、6 个用户场景、八维原分数与权重合计 100% 的一致性检查，以及 Git 差异/范围检查；原有长测继续使用下方同一任务，结果未出前 M8 保持工程验证中。M10–M12 与最终复评仍未完成；后续优先收取 M8 最终报告、继续 M9 来源与可视区实现。按已有阶段提交授权保存本轮文档，不远程推送。

## 历史：preview.14 可见窗口长测运行中，M9 原生接口与缓存已推进

2026-09-17：上一轮两项复测均已结束：preview.12 / 1800 秒仍因工作集增长失败；preview.13 / 600 秒诊断通过但不足以关闭 M8。新调查与改动见 [45-VISIBILITY-AND-RESOURCE-GATE](../45-VISIBILITY-AND-RESOURCE-GATE.md)。

找到测试启动器 windowsHide:true 与 --trace-test-visible 的冲突，旧长测实际长期隐藏。独立 40 次布局切换对照中，隐藏窗口诊断 GC 后约 3304 DOM 节点，可见窗口恢复到约 616。现在 UI 测试默认真实可见；产品也明确冻结隐藏/最小化的 React 呈现，同时持续采集/录音，恢复时应用最新状态。新增 DOM 文案、原生可见性和隐藏期间 DOM 不更新的检查。仅诊断实验触发过 GC，门禁中没有主动 GC 或放宽阈值。

**唯一当前长测：** exec **68283**，runner **78012**，app **61252**；artifacts/m8/resources-1789576099071/report.json，preview.14 不可变包，1800 秒可见工作台。先 wait/poll 同一 handle 并核对实际 PID；不要重复启动。已通过前 300 秒录音收尾，随后 LIVE；最近约 510 秒时没有丢帧或仪器错误。不能仅凭 resources-latest.json 的历史状态宣称完成。

preview.14 短门禁 **12 阶段通过**，artifacts/m8/final-1789576171939/report.json；隐藏/minimize/restore 录音生命周期 3 项、真实 M8 GUI 流程 12 项通过。当前包目录 dist-trace/preview.14；M8 仍等长测最终结论，尚未最终评分。

M9 新进展：native spectrogramTile 接口与 M8 共享最多两个任务名额，文件瓦片接口通过；C++ 15/15 CTest、原生桥接 8 项通过。SpectrogramStore 已实现单一计算队列、内存总量预算、磁盘校验/损坏隔离、取消不发布、拒绝链接缓存根；4 项新存储测试通过。尚未接入完整来源服务/显示聚合/2D 面板。M9 工作可以独立推进，但不能越过 M8 未关闭的发布门禁。

下一步：收取长测实际结果；若通过，完成 M8 关闭记录并继续 M9 的来源描述、可视区聚合与共轴 2D；若失败，保留证据继续定位。整个 M12+评分目标 active。代码按阶段提交，录音/旧包/失败记录保留，未远程推送。

## 历史：M8 长资源门禁未过，收取两个复测并继续定位

2026-09-16：M8 功能提交 **3a8bda1**、M9 独立数据底座提交 **06693b5**。preview.11 的 1800 秒检查已实际失败于工作集增长门槛，录音完整、droppedFrames/instrumentErrors 均为 0；不能以短门禁通过关闭 M8。完整排查和候选说明见 [44-M8-RESOURCE-INVESTIGATION](../44-M8-RESOURCE-INVESTIGATION.md)。

**两项仍运行的复测，先等待/检查，禁止重复启动：**
- preview.12 快照传递候选，1800 秒：exec **23741**，runner **7148**，app **48148**，artifacts/m8/resources-1789573295492/report.json。
- preview.13 叠加 Canvas 存储复用，600 秒诊断：exec **8696**，runner **71012**，app **6260**，artifacts/m8/resources-1789574225764/report.json。
两个任务都写 resources-latest.json；以各自目录和真实进程为准。10 分钟诊断通过也不能当成 30 分钟门禁通过。原失败为 resources-1789570665775/report.json，副本 resources-before-transfer.json。

当前源码候选 preview.13，保留 contextIsolation/sandbox/命令白名单。高频快照改为 preload 单次转移再在主世界分发；绘图仅在尺寸改变时重建 canvas backing store。功能和对应单元测试通过，但资源改善尚未证明；preview.12 早期总工作集反而较高，后续要按证据决定保留或回退候选，不调整验收阈值。没有在门禁中主动 GC。

M9 的 Native SpectrogramTile 与 log32 二进制编解码已独立验证（15/15 CTest、tile 20 场景、codec 3 项），文档 43；尚无原生瓦片 IPC、缓存存储服务或 2D 界面。M9 source firstFrame 为首列 FFT 结束帧，注意与 PCM 起点区分。

下一步：收取复测，定位渲染/传递/共享工作集增长，验证并保存有效修复，再关闭 M8；随后继续 M9–M12。目标仍 active，未进行最终评分；文件/旧包/失败记录均保留，不执行全量删除或远程推送。

## 历史：M8 功能与短门禁通过，30 分钟资源门禁运行中

2026-09-16：preview.11 已完成频谱/声场四来源接入、独立设置及 workspace v1→v2 迁移。实现、检查、包哈希见 [42-M8-ACCEPTANCE](../42-M8-ACCEPTANCE.md)；数值规范继续见 41。短门禁 11 阶段通过（105 JS、14/14 原生、7 个原生桥接、三组缩放各 12 个工作台流程、旧导航/三格式/中文路径），不能据此跳过长测。

**正在运行的具体任务：** tools/m8/resources.cjs，exec session **52421**，实际 application PID **73264**；runner PID/当前状态以 artifacts/m8/resources-latest.json 与进程核对为准。默认 1800 秒，前 300 秒 REC，随后 LIVE，每分钟显隐恢复；使用不可变的 preview.11 包。已观察到 645 秒时 droppedFrames=0、instrumentErrors=0、回放缓存守住容量。先 wait/poll 同一 handle；句柄缺失时核对 runner/application PID，不能仅凭一次超时重新启动。

当前生产包入口 dist-trace/preview.11/win-unpacked/Trace.exe；旧包、音频均保留。后续可以在资源门禁运行时推进 **M9.0 时频缓存与 2D 数据协议**，无需等待空转；Native/源代码后续变化不得冒充已测 preview.11 的相同构建。长测通过后补 M8 阶段关闭记录，失败则先修复相关问题。

总体目标仍是完成 M12、按 37 原八维/原权重复评并持续改进到均分严格超过 8.5，目标 active；尚未最终评分。用户主观与既有硬件/标准素材专项继续单独列明。本次仅在项目内工作，不进行全量删除或远程推送。

## 历史：M8 数值内核通过，继续接入来源与界面

2026-09-16：M7 已按阶段提交 **5189f6c**，基线保全提交为 **5c09c73**。用户持续开发目标保持 active，直到完成 M12 并按原八维/原权重复评、继续改进至均分严格超过 8.5；M7/M8 子任务不代表总目标完成。

M8 已建立 [41-M8-METERING](../41-M8-METERING.md) 与 native InstrumentAnalysis.h/.cpp：真实 PCM 上的周期 Hann、DC/Nyquist 正确缩放、线性功率平均、固定时间峰值保持、L/R/Mid/Side/Stereo 能量；相关度、功率平衡、确定性示波点。原生 CTest 14/14 通过，新增内核为 3370 个检查点（含逐点几何检查，不是 3370 个独立场景）；最大配置单次冷计算约 39.5 ms，不是 p95/整条链路指标。证据 artifacts/m8/core-build.log、instrument-results.log。上游 dsp_utils.cpp 的已有隐式数值转换警告保留，未放宽编译规则或数值容差。

**下一任务 M8.1/M8.2：**读取 41 的来源/队列方案，建立有界 PCM 窗口提供器及原生异步接口、JS 服务与严格 IPC，扩展 workspace 仪器注册（迁移已有四仪器布局及预设），实现频谱和声场面板。文件复用 WaveSequence/WavReader；固定缓存用 ReplayClip；实时/REC 需要有界 ROI 复制，不能每次拷整个 60 秒。REC 当前统一图轴可能用纳秒，必须转换到正确原生段的 PCM frame，并核验 nativeId/epoch；不能直接拿图轴数值索引音频。主进程录音观察持续，FFT 只能延后显示，不能阻塞录音。

目前仅有数值内核，尚无新仪器 IPC 或用户可见频谱/声场。build/trace-engine 已进入 M8 开发，不能拿当前开发 DLL 去冒充 M7 包的相同构建。可供用户运行的完整包仍为 preview.10，见 40 与 artifacts/m7/final-1789565860097。包内原生保持旧已测 hash；旧录音/缓存/包均保留。

M7 人工主观及既有 EBU/96k/物理驱动/真实混合 DPI/干净 Windows 专项保持开放；它们不阻止后续独立开发，也不等于已通过。阶段性提交以 Git log 为准，本轮没有远程推送。

## 历史：M7 工程交付完成，继续 M8.0

2026-09-16：用户已授权持续按 38 的阶段推进到 M12，之后按 37 原八维/原权重复评；同时报告算术均分，目标严格超过 8.5。未达到则基于实际短板继续迭代。保护录音和原始素材，不做全量删库，按阶段提交。目标保持 active。

M7 / preview.10 已完成仪器显隐、停靠/尺寸、最大化、设置、自定义预设与视觉统一，见 [39](../39-M7-WORKSPACE.md)/[40](../40-M7-ACCEPTANCE.md)。类型检查、相关 JS 97 项通过；最终独立包 10 阶段门禁通过，含三组进程缩放各 11 项工作台流程、旧导航 9 项、三格式/离线流程、97 文件 ZIP 比对与中文路径重定位。原生引擎 hash 与 preview.9 一致；不是新 DSP 或完整硬件验收。

当前包：dist-trace/preview.10/win-unpacked/Trace.exe；ZIP 同目录 Trace-0.1.0-preview.10-Windows-x64.zip。精确证据 artifacts/m7/final-latest.json，最终目录 final-1789565860097。旧包保留。基线已提交 5c09c73；M7 交付另作阶段提交，实际提交号以 Git log 为准。

下一任务 **M8.0**：固定频谱 FFT/幅度标定/hop、平均与峰值保持的时间窗，以及相关度/平衡/余辉语义；从原生完整音频/固定缓存/文件查询接入，不能读取画图 min/max 冒充 PCM。上游审计见 39：FFT 可复用，现成 Spectrum smoothing 依赖推送次数、Spectrogram 与显示强度耦合，不能直接作为 Trace 历史缓存。M8 开始前读 03/04/06 及 38 第 5 节，先建立参考数值和边界测试。

M7 工程通过，用户主观待复验；既有 EBU/96 kHz/物理驱动/真实混合 DPI/独立干净 Windows 门禁保持开放，不阻塞独立后续开发，不标为已验收。本轮测试使用独立配置及新素材目录；所有测试进程正常关闭。M12 未完成，尚未重新评分，不能将 M7 交付标为总目标完成。

## 历史：按 M7–M12 推进综合分析工作台

2026-09-16：用户要求将 Insight 调研建议落地为后续开发计划，现已建立 [38-DEVELOPMENT-PLAN](../38-DEVELOPMENT-PLAN.md) v1.0，作为下一轮产品目标和阶段状态入口。阶段为 M7 可配置仪器工作台与视觉、M8 频谱/立体声声场、M9 共轴 2D 声谱图、M10 3D 声谱图、M11 目标/事件/报告、M12 外部文件/参考对比；新增 A15–A27 验收矩阵。所有阶段尚未开始实施，不能视为当前功能。

**下一任务：M7.0 仪器工作台架构与基线核对。** 先明确注册/布局/呈现状态/持久化边界，审计上游 DSP 复用，固定资源预算和隐藏/恢复语义，再进入 M7.1。任务清单见 38 第 13 节。沿用同窗口共轴、单/双声道、60 秒被动 PCM、三格式录音及历史重复性；换布局不改变 REC/监测/来源/游标。

本轮只新增计划及同步 01/07/08/13/37 索引，完成文档检查；未改业务代码、未运行音频测试、未重建包、未提交或推送。preview.9 现有工作区保留。36 中人工验收和素材/硬件专项继续跟踪；它们不阻止独立架构研究，也不能被新功能进度标为通过。

## 历史：Insight 2 与 Trace 同维度评估

2026-09-16：用户提出后续扩展 2D/3D 声谱图、声场、仪器显示/隐藏、自定义布局，并希望视觉向 Insight 2 靠近；本轮请求为先调研和评分。已阅读本地 11 个功能章节，核对本机 Insight 2.6.0.350、本地手册页脚 2.5.0、官方发行说明及现有 Trace 实现/截图。报告见 [37-INSIGHT2-COMPARISON](../37-INSIGHT2-COMPARISON.md)。

按“可定制综合音频测量工作台”同一目标评估：Insight 2 为 8.5/10，Trace preview.9 为 6.0/10；主观加权分，主要差距在仪器覆盖、布局和辅助判读，不代表录音完成度或算法精度。Trace 的统一时间轴、系统录音/缓存保存与文件可重复历史是保留优势。报告区分已确认功能、设计判断与未做实机验证的项目；未给性能/准确度编造分数。

建议后续先做仪器工作台架构与布局规格，再依次接入频谱/立体声声场、共轴 2D 声谱图、复用时频数据的 3D 视图，并扩展目标/报告。布局切换应保持来源、游标、录音和测量语义；沿用本机离线、单/双声道与被动 PCM 最多 60 秒的当前约束。多声道/对白/跨插件来源另行定范围。

本轮仅增加调研文档与接力记录，未改产品代码、未操作运行中的 Trace/DAW、未重建包、未提交/推送。preview.9 人工验收与专项门禁继续开放。下一任务是讨论并固化仪器工作台架构，报告中的阶段尚未实施。

## 历史：preview.9 三批迭代完成，待人工验收

2026-09-16：三批功能已实现，工程验证与 ZIP 重定位通过。运行 dist-trace/preview.9/win-unpacked/Trace.exe，或完整解压 dist-trace/preview.9/Trace-0.1.0-preview.9-Windows-x64.zip。人工验收清单及交付哈希见 [36-PREVIEW9-ACCEPTANCE](../36-PREVIEW9-ACCEPTANCE.md)，范围与过程见 [35-ITERATION-ACCEPTANCE](../35-ITERATION-ACCEPTANCE.md)。

验证：JS 92 项、原生 CTest 13 组、编码矩阵 54 项、最终运行门禁 19 阶段、中文路径重定位离线流程 8 项通过。精确缓存保存、独立分析、整份/选区保存、三格式和重启已实测。汇总 artifacts/iteration/delivery.json。此前门禁失败是旧脚本没有展开新的文件详情，已同步实际操作并续跑；仅在 native/main/ASAR 哈希相同的情况下复用了此前通过阶段，原失败记录保留。

本轮额外修复长 Windows 路径导致的缓存创建失败，真实原路径重开与长路径 I/O 回归通过。EBU 原始素材本机 HTTP 403、真实 96 kHz、物理驱动切换全矩阵、混合系统 DPI 与干净 VM 继续作为未通过的专项；不扩张工程验证或用户主观验收结论。

未重新提交或推送 Git，6e4053e / trace-preview.8-baseline 保留。下一任务：用户按 36 人工验收，并记录实际设备/格式与复现步骤；验收后再建立新的 Git 基线。

## 历史：按三批顺序迭代，交付人工验收版本

2026-09-16：用户已授权连续完成三批迭代。完整范围与进度见 [35-ITERATION-ACCEPTANCE](../35-ITERATION-ACCEPTANCE.md)。前两批实现与针对性验证已完成：当前相关 JS 57 项、长路径 Native I/O 1 项、原生 CTest 12/12，UI 9+7+5 项、真实三格式另存/缓存重建 4 项通过。完整清单和失败修复记录见 35，证据位于 artifacts/iteration。第三批缓存保存已实现并通过原生/服务/实际三格式保存和重启检查；当前在完成 preview.9 最终运行门禁与 ZIP 重定位验证。源代码功能已接通，交付尚未完成；截图已检查。第三批选择显式保存最近缓存/选区，所有批次完成并验证后交付运行包；不能将单批进展视为整体完成。基线标签保留；preview.9 运行目录已生成，最终打包验证进行中。

## 产品复核历史：preview.8

2026-09-16：用户要求完整复核产品。本轮检查基线 6e4053e 的实际实现和独立包交互，形成 [34-PRODUCT-REVIEW](../34-PRODUCT-REVIEW.md)。已复现分析取消后仍显示进行中、重新分析不更新当前视图、PCM16 文件顶部误显示 Float 32、选区缺少清除入口、实时页 Space 与播放按钮不一致、导出参数重开恢复默认值。另提出横向导航、缓存有效范围、文件管理与录音交付改进，均区分缺陷、交互缺口和新功能建议。

本轮只写复核文档，未改产品代码、未重建/替换运行包、未重新提交或推送。验证使用隔离配置、人工 8/120 秒及 PCM16 音频；截图通道两次超时，随后以实际 renderer DOM/状态完成交互检查，不宣称新像素级视觉验收。详见 34 中的 artifacts 路径。既有 EBU/96 kHz/物理设备/DPI/干净 VM 门禁继续开放。

下一任务建议：按 34 第一批修正分析状态/重试、格式信息、清除选区、横向导航和快捷键；当前请求为评审，以上尚未实施。

## 历史：preview.8 已获用户确认，建立 Git 基线

2026-09-16：用户试用后反馈当前暂无主观问题，要求提交 Git 作为版本基线。本次提交收纳此前完整 Trace 开发成果，本地基线标识为 trace-preview.8-baseline；版本保持 0.1.0-preview.8。范围与验收边界见 [33-BASELINE](../33-BASELINE.md)。

- 运行入口：dist-trace/preview.8/win-unpacked/Trace.exe；录音、缓存与编译/打包输出不纳入源码。
- 已有工程证据沿用下方 preview.8 完成记录；本轮执行提交内容、构建身份与 Git 检查，无业务代码改动，不重复音频长测。
- 下一任务：从本基线继续处理新需求或实际缺陷。用户当前主观复验已完成；EBU 官方素材、真实 96 kHz、物理设备切换等既有专项门禁继续开放。
- 历史条目中的“未提交/未推送”描述的是当时状态；本地提交以当前 Git 历史及基线标签为准。本次不执行远程推送。

## 历史：preview.8 历史拖动闪烁修复

2026-09-16：根据用户录屏，修正每次 seek 待新代次数据时清空读数/电平柱的问题。HistoryPresentation 保留上一完整呈现，接纳匹配来源、代次、窗口和序号的新快照后，数字/表头/时间位置/游标共同更新。动画帧合并指针请求，等待呈现不占住主命令队列；主进程在定位后及时发布只读快照。录音观察继续独立运行。真实故障、未就绪、缺口和静音不被掩盖，LUFS/TP 不插值或平滑。

入口：dist-trace/preview.8/win-unpacked/Trace.exe。详见 [32-PREVIEW8-SCRUB](../32-PREVIEW8-SCRUB.md)，逐帧证据与交付 hash 见 artifacts/scrub/delivery.json。原生引擎未修改；主进程快照发布与 renderer 已修改，不能复用 preview.7 的 main hash。

本轮通过：类型检查、构建、呈现/播放服务 17 项；文件正反向、45 ms 慢读取、真实内存缓存拖动均为 0 空白/空柱/忙状态闪烁，过程中的读数与独立缓存查询一致；工作台 9 项、走带/EOF 21 项、交互 9+1 项、续录/恢复/录音精度回归、包审核 4 项和独立包 8 项。旧录音 UI 用例仍检查按钮文字，已改为检查图标、可访问名称和按下状态后通过；失败原报告保留。

未重新进行 30 分钟实录及全编码/全 DPI 矩阵；本轮未改这些算法或布局。EBU 原始素材、真实 96 kHz、物理设备变化等既有专项门禁仍开放。提供已测可运行目录，未生成 ZIP。未提交/未推送。

下一任务：用户用原录屏中的拖动方式复验视觉连贯性；无当前代码阻塞。

## preview.7 历史记录

## 历史：preview.7 图标走带与中文实时

2026-09-16：LIVE 从来源栏移到底部“开始/停止监测”左侧，改名“实时”。走带采用相邻图标按钮，顺序为起点、终点、播放/暂停、录音/结束录音；保留悬停说明、焦点及活动状态。录音圆形切换为结束方块，播放三角形切换为暂停符号。

新增终点按钮与 End 快捷键：使用现有 playback.seek(totalFrames, resume=false)，精确定位当前文件/固定历史缓存末尾并保持暂停。录音中定位历史末尾不结束写入。Home/End 不抢占输入控件焦点。无已选历史/文件时，起点、终点禁用。

入口：dist-trace/preview.7/win-unpacked/Trace.exe。05/28 与应用帮助已同步，旧 FileTransport 未使用实现已移除。证据见 artifacts/transport/latest.json。当前无阻塞，下一任务是用户复验走带排列、状态图标与实时按钮位置；未提交/未推送。

本轮验证：类型检查、构建、工作台 9 项、文件回放 21 项（含 End/EOF 缓存一致性）、缩放/录音快捷键 9+1 项、包审核 4 项、独立包流程 8 项、尺寸/DPI/双屏恢复 10 项、git diff --check。采集/计量/回放引擎源码与原生模块保持 preview.4 基线；未重复完整数值与长录门禁。本轮提供已测可运行目录，未生成 ZIP。原有 EBU/真实 96 kHz/物理设备变化等专项验收仍开放。

## preview.6 历史记录

## 历史：preview.6 波形控件位置与图标

2026-09-16：时间窗、波形倍率已移至波形上方，与定位/选区同一行右侧。来源行三个按钮改为自绘 SVG 图标，分别以悬停说明和可访问名称表达「波形复位」「跟随游标」「循环」。复位沿用原显示完整时间范围的行为；跟随/循环保留开启高亮和 aria-pressed。

入口：dist-trace/preview.6/win-unpacked/Trace.exe。界面规范 05、使用指南 28 已同步；证据见 artifacts/icon-toolbar/latest.json。仅界面和版本标识改动，原生模块及主进程业务源码保持 preview.4 已验证基线。

本轮验证：类型检查、构建、工作台 9 项（图标/说明/位置/交互）、文件回放 20 项、缩放与状态恢复 9+1 项、包审核 4 项、独立包流程 8 项、六组尺寸/缩放及双屏恢复 10 项。未重复完整数值/长录门禁；本轮提供可运行目录，未生成新 ZIP。旧版证据保留在下面。

下一任务：用户复验控件位置及图标辨识度；EBU 原始素材、真实 96 kHz、物理设备切换等原有专项门禁仍开放。未提交/未推送。

## preview.5 历史记录

## 历史：preview.5 工具栏精简

2026-09-16：按用户截图，来源行操作区只保留并排的「全长」「跟随游标」「循环」三个按钮。删除前后浏览、加减缩放、起止输入及“设置选区”。LIVE、来源信息、拖动选区/把手、滑杆与滚轮保留。跟随和循环为可切换高亮按钮；先建立选区再启用循环。

当前运行入口：dist-trace/preview.5/win-unpacked/Trace.exe。使用指南 28 与界面规范 05 已同步。完整验证证据见 artifacts/toolbar/latest.json。

本轮按 UI 改动范围验证：类型检查、构建、工作台 9 项、文件交互 20 项、包审核 4 项、独立包流程 8 项、尺寸/DPI/窗口恢复 10 项；git diff --check 通过。产品源码改动只有 FileControls.tsx、styles.css 和 product.ts；原生模块及音频源码与 preview.4 hash 一致。本轮未重新运行完整音频数值/长录门禁，也未生成新的 ZIP；提供已测可运行目录。preview.4 全量与 ZIP 记录保留在下面，不能当作 preview.5 的新测试。

下一任务：用户复验精简后的三个按钮；原有 EBU、真实 96 kHz、物理设备变化等专项门禁保持开放。未提交/未推送。

## preview.4 历史记录

## 历史：preview.4 统一工作台

2026-09-16：统一窗口迭代已完成实现、最终组合门禁及 ZIP 重定位检查。入口 dist-trace/preview.4/win-unpacked/Trace.exe；详细交互、数据边界与验证见 [31-PREVIEW4-WORKBENCH](../31-PREVIEW4-WORKBENCH.md)。

## preview.4 最终交付证据

- 组合门禁：artifacts/workbench/gate-1789539668525/report.json，2 个顶层阶段通过，包含完整 feedback3 / feedback / M6 / M5 / M4 回归。
- 工作台实际交互：artifacts/workbench/ui-1789539669402/report.json，8 项；包括录音持续写入、LIVE 滑窗继续前进、静音定位、输出/历史故障及 EOF 恢复。
- 服务边界 10/10；原生 CTest 12/12，活动 freeze 与三档合成采样率并发录音历史通过。M4 20 项，54 项编码矩阵、65 秒实采缓存、尺寸/DPI 及保留的 30 分钟文件均通过。
- M6：artifacts/m6/gate-1789539776371/report.json；ZIP 解压至中文路径后的 8 项独立流程通过。
- ZIP：dist-trace/preview.4/Trace-0.1.0-preview.4-Windows-x64.zip；207080294 bytes；97 个文件逐一 hash 一致。
- ZIP SHA-256：779bce119c7f9967372ecb075c6b978929e0cfd6d15e16c46f38a44ec4117885
- native SHA-256：af6f94486db5aeeaba0d20f5a99b03081ab2729606ab0cc874a979ce74683847
- main SHA-256：e204ba2b9f583e88773812f2d4be570864515b51894d017b6861c0a765b3c174
- app.asar SHA-256：565228a9d44b9a709b53eb2adbdeb37efbf2e48eb79a22485a43d1464a529877
- 新包使用 0.1.0-preview.4，旧预览目录保持。源码未提交/未推送。

下一任务：用户实际复验统一时间轴、LIVE 返回与声音回听手感；原始 EBU、真实 96 kHz 捕获、物理设备变化、混合系统 DPI 和干净 VM 门禁仍开放。

## preview.3 历史记录

## 历史：preview.3（反馈 4–6）

2026-09-16：连续缩放、文字精简和监测关闭直接录音已实现并通过门禁，详见 [30-PREVIEW3-INTERACTION](../30-PREVIEW3-INTERACTION.md)。

- 当前入口：dist-trace/preview.3/win-unpacked/Trace.exe。
- ZIP：dist-trace/preview.3/Trace-0.1.0-preview.3-Windows-x64.zip；SHA-256 3d9cfbea1fa7894ec9cb00c10e2cd12a33aafd765fb12a98e9fd7448fd48e38b。
- 新门禁：node tools/feedback3/gate.cjs；当前报告 artifacts/feedback3/gate-1789535439551/report.json。
- 使用指南：28。monitoringRequested 与 active 分离，记录开关跨重启保存；显示设置版本 2，时间 5–60 秒、倍率 1–4 连续。
- 当前构建 native 15799e701bc79bb20cc906a6b97ba3b37a5dcf50ff41011264a8fad876c8957d；main 56e4536b1e50486a51cd2b76494d61a3879514617649818ebb711fe4896bb2be。
- 下一步：用户实际复验操作手感；原有 EBU / 96 kHz 等开放项不变。源码未提交、未推送。


## 历史：preview.2

2026-09-16：用户提出 60 秒 LIVE 回听、选区难发现及文件列表管理三项反馈。实现、针对性测试、最终组合门禁及 ZIP 中文路径重定位检查均已通过。详见 [29-PREVIEW2-FEEDBACK](../29-PREVIEW2-FEEDBACK.md)。当前新代码不再以 preview.1 的 hash 为准；下面的 M6 完成记录是前一版历史。

- 内存回听：ReplayBuffer / WaveSequence memory source / PlaybackService temporary；不写临时音频。
- 选区：刻度轴直接拖选、显式模式、原 Shift / 数值输入均保留。
- 文件：LibraryService 磁盘存在性、搜索、回收站、身份与占用保护；修正成品分析 exportId。
- 新输出：dist-trace/preview.2/win-unpacked/Trace.exe；旧版目录保持。
- 新门禁：node tools/feedback/gate.cjs，包含 UI 实机检查及 M6/M5 下层回归。
- 最新包：dist-trace/preview.2/Trace-0.1.0-preview.2-Windows-x64.zip（SHA-256 54640d196090d4efd95dc11c0548097bd90cf101ce288d8fdea019426e8497c6）。
- 最终状态以 artifacts/feedback/gate-latest.json、artifacts/m6/archive-latest.json 和 29 完成记录为准。

## preview.1 历史交付


更新：2026-09-16。**Trace 0.1.0-preview.1 已达到可人工验收的桌面开发预览。M0–M6 最小工程门禁已有证据；完整标准素材、硬件与用户验收仍开放。**

## 历史：preview.1 的接续入口

- 可直接运行：dist-trace/win-unpacked/Trace.exe，保留整个目录。
- 便携包：dist-trace/Trace-0.1.0-preview.1-Windows-x64.zip（207058037 bytes，约 197.5 MiB）。
- 操作与人工清单：[28-USER-GUIDE](../28-USER-GUIDE.md)；本次实现、验证边界、hash：[27-M6-DESKTOP](../27-M6-DESKTOP.md)。
- 下一任务是用户实际设备/工作流人工验收及开放门禁；根据实测缺陷做小步修复，不重复初始化项目。
- 当前不是“全部验收通过”的正式发布版。不要让缺失 EBU 素材阻止用户已授权的开发预览交付。

## 功能链

LIVE 未录音监测 → WAV/MP3/AAC 录音 → 后台成品 → FILE 回听/定位/循环 → 文件与选区独立统计 → 整段/选区导出、另存与恢复。

M6 新增显示/目标线设置、R/Escape、REC 概览浏览/跟随、FILE 跟随、原始 WAV 保留设置、窗口恢复、自有图标及独立便携包。切换 AAC 不再丢失保留选项。REC 概览只显示有限 M/S/I；完整历史在停止后 FILE 分析提供。

## 仓库和入口

- 实际 Git 根：外层 TraceDev 的 app；正式文档：app/docs。外层开工包仅作历史资料。
- 分支 recorder/dev，HEAD 仍为上游 Prism df0755b8caaaab85157ac51aefffca0526974fc1。
- Trace 工作未提交、未推送；大量源码/文档未跟踪。保留所有既有工作。
- 主进程/preload/React：src/trace；输出 out-trace。
- 原生：native/src/recorder；CMake：native/recorder；模块 build/trace-engine/Release/trace_engine.node。
- 构建原生：node tools/build-engine.cjs；应用：node tools/trace.cjs AppBuild。
- 开发运行：Trace.ps1 App；便携包：Trace.ps1 Package 或 node tools/trace.cjs Package。
- Trace 专用 electron-builder.trace.cjs；不运行上游带 VST/TUI 的 dist:win。
- M6 门禁：node tools/m6/gate.cjs。缺少相同 main/native 的 M5 报告时使用 --regression。
- 封装已验证目录：node tools/m6/archive.cjs；解压副本补验：node tools/m6/relocated-smoke.cjs。

锁定：Electron 40.8.3、electron-builder 26.8.1、React 19.2.4、TypeScript 5.9.3、libebur128 1.2.6、FFmpeg 9.0.1 Gyan essentials。未整体升级依赖。

## 数据与版本

- Session schema：2，兼容旧 v1；retention 可选状态及 removing/removed 资产记录见 04/27。
- RecordSettings version：**3**，新增 keepOriginal，缺省 true；旧 WAV 设置兼容。
- ExportRecord version：1；Session.exports 中每项有独立 exportId。
- analysisCacheKeyVersion：**3**，绑定 mediaIdentity、物理范围、实际 PCM 与原生 hash。
- 二进制页 schema：1；Media decodeRecipe version：1。
- 计量配置：**trace-meter-v4-ebur128-1.2.6-lra10hz-tpaligned**。
- M6 显示与保留策略没有改计量、TP/LRA 算法或容差。

## 最终本地证据

- M6：artifacts/m6/gate-1789490018985/report.json，7 个阶段通过。
- 原生 CTest：11/11；设置 3；保留 4；包审计 4；包实际流程 8；界面 10；长文件资源 3。
- M5/M4/M3/M2 回归：artifacts/m5/gate-1789489346567，当前 main/native hash 一致。
- 六组尺寸/缩放与双屏恢复：artifacts/m6/ui-1789490046198。
- 新数据目录/空工作目录/精简 PATH/模拟断网流程：M6 门禁目录中的 packaged-workflow.json。
- ZIP 完整性、97 文件 hash、中文路径重定位运行：artifacts/m6/archive-latest.json；最后运行报告为 artifacts/m6/package-latest.json。
- 30 分钟文件副本：artifacts/m6/resources-1789490115496，独立分析约 18.67 秒；主进程采样工作集峰值约 115.3 MiB（不含其他进程）。
- 完整包文件清单：artifacts/m6/package-audit-latest.json；源码和构建身份：artifacts/m6/checkpoint.json。
- ZIP SHA-256：6690a7acc661bd56abe420c5b40823e438e7ff1c7c1b9b3607e541e3b39afa77。
- native SHA-256：1826f6701223da3133e8ee91e21b18402234b51a53666495dea272d548ea8439。
- main SHA-256：b465f36e8d129605a1ba01abd284515fa7ef1c3bc1c017e6f8676e41bd8175f4。
- app.asar SHA-256：410f78080eaebfa6cb8709636c43148f388e0f84caa636eb0385c4ad48d2c820。

## 必须保留的前期事实

- M1：605.405 秒真实监测/最小化检查通过，未 REC 不写音频。
- M2：实录 1800.84 秒 / 86440320 帧 / 48 kHz 双声道 PCM24，独立重开通过。
- 长录音：artifacts/m2/long-1789459514556，SHA-256 a132fb7cdab79bfe6281a03fe3e14b3a7068859121fc11db1ea8fd1a396952df。不得机械重录或误删。
- 用户确认旧长测期间切换过声卡/DAW，不能直接归因程序。
- 用户截图 REGION_POSITION_OUT_OF_RANGE：Recorder 波形/帧数/QPC 分次发布竞态，已改原子发布并保留故障边界，见 23。新包包含该修复，原生快照回归通过。
- 同会话多区域重连/停止代次、跨率会话视图、恢复及逐资产削波计数：见 23/24。
- 文件设备呈现时钟、共享游标、稳定历史与选区统计：见 25。
- 本机普通 Media 回放有系统处理；本流 RAW 后数字回环相关性约 1，增益符合设置，标记差约 2 ms。未改全局音效。
- M5 编码、首尾填充、独立成品历史、父进程消失后关闭编码器、原子发布与另存：见 26。

## 未验证与下一任务

1. 原始 EBU WAV 测试集尚未取得，官方 ZIP 本次仍为 403。用户回答“本机暂无，继续开发”。18 个生成参考和 233 个 TP 组合不能代替。
2. 真实捕获 96 kHz、物理拔插/驱动格式变化全矩阵仍开放。需要用户实际硬件验收；不得把模拟注入视为物理测试。
3. 两台实屏均为 Windows 100% DPI；六组过程/渲染缩放已测，混合系统 DPI 实时跨屏仍待人工。
4. 包在本机隔离配置下通过；独立干净 Windows/VM 未测。全进程 CPU/RSS、低配机长期资源基准待补。
5. 人工评价声音、视觉、交互和常用 DAW 路由；预览修复按单一小任务和最小回归推进。
6. 只有用户授权后才提交/推送或开始正式发布流程；当前交付是本地开发预览。

## 执行环境与收尾

本任务 PowerShell 曾卡住；cmd.exe + 已有 Node 运行时可用。命令优先用项目脚本传复杂参数，避免 shell 引号/重定向问题。未修改 Windows/Codex 全局设置。

.tools、artifacts、build、out-trace、dist-trace，以及 resources/trace/runtime 和 licenses 是生成物，均已加入忽略。不提交个人录音、绝对路径清单或大缓存。自动测试窗口与子进程正常关闭；为人工验收启动的 Trace 窗口如仍在运行，应按用户工作窗口保留。
