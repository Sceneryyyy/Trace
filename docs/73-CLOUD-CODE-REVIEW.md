# 73 · 云环境代码审核（2026-10-02）

## 修复更新：七项已在源码修正，云端回归通过（2026-10-02）

用户随后授权云端修复和测试。本工作区已修复本报告五项问题，以及 68 的估计静音无提示和 72-R3 的首帧判定缺口；下面的审核正文保留原始发现时态。用户又授权本地 Git 提交，本轮修复、回归测试及审核文档作为提交 `2995174` 交付到 `recorder/dev`。该修复提交创建时未推送或打包；用户随后授权与文档整理一并推送，交付状态以 13 和 Git ref 为准，产品版本仍为 preview.31。

| 项目 | 最终变更 | 回归证据 |
| --- | --- | --- |
| 73-R1 | selector 对相等输出跨快照复用引用，仍重新执行捕获当前 props 的 selector | 真实 React + Chromium：原 HEAD 顶栏在 30 次相同快照上 render 30 次，修复后 0 次；值变化更新一次，props 改变读数正确，卸载后无更新 |
| 73-R2 | 新导出在 session/export.json 中保存来源 continuity；旧导出追溯来源/region/嵌套导出元数据，循环/缺失返回 unknown | 真实解析、哈希和回听测试；明确 mock 编码器驱动真实 publish，核对持久化字段及原件移除后的回听；报告使用当前导出质量，不被其他中断区域覆盖 |
| 73-R3 | ReplayBuffer 用预分配按帧标记保存质量；freeze v3 和 save 结果携带 quality v1，保存清单并重载；缺失旧质量标记 unknown | C++ 精确选区、环绕、冻结不可变、reset、发布前缀、旧数据/无效范围 10 组通过；真实 TS 保存→重载→回听→报告输入保留 estimated/gaps/unknown/complete |
| 73-R4 | 报告事件跳转先关闭输出，再静默 seek，恢复原监听意图 | 真实 main.dispatch + PlaybackService，播放中/已暂停跳转、跳出循环选区，断言 outputReady=false、位置及监听恢复 |
| 73-R5 | 抽取统一后台状态恢复，准备阶段纳入 finally，cache.save 同样覆盖暂停过程异常；管理/退出/录音时保持暂停 | 注入四个暂停阶段异常；真实 DeliveryService 在设备启动失败后完成新授权另存；正常录音不恢复后台；管理/退出不重启队列 |
| 68 估计静音提示 | LIVE/文件显示“包含估计静音”或“采集完整性未知”，用文字及 warning 样式 | deriveView 两来源四种质量状态通过 |
| 72-R3 首帧断言 | 只接受有限的 mark/paint 且 mark<paint，null 不能 PASS | null、缺失、NaN/Infinity、逆序/相同时间被拒绝；未运行完整 Windows theme-flow |

最终验证：`npm run typecheck`、`npm run test:trace` **233/233、0 fail/skip（47 文件，含新增 13 项跨模块回归和 1 项读数状态回归）**、`npm run build:trace` 全通过。`node tools/audit/snapshot-selector.cjs` 通过；`--baseline` 加载审核基线 `d2981fd` 的原始 hook，预期失败，实测 stable=30、chromeStable=30、stableAfterProps=10，证明反例确实能识别旧缺陷。新 C++ `replay_quality_tests` 在 Linux 直接编译运行，10 cases 通过。测试日志在 `artifacts/cloud-regression/logs/`；浏览器生成脚本和结果在同目录各 selector 子目录。

可重跑：`node --test test/cloud-review-regressions.test.mjs`；`node tools/audit/snapshot-selector.cjs`（需要 Chromium，可通过 TRACE_AUDIT_CHROMIUM 指定可执行文件）。C++ 可用 GNU C11 编译 libebur128，再用 C++17 链接 `test/native/replay_quality_tests.cpp`、ReplayBuffer.cpp、Meter.cpp、EburConstants.cpp 与 libebur128；该测试同时加入 Windows CMake/CTest。原有 replay_buffer/replay_save 测试增加质量断言，**Windows 文件保存/原生 addon 新代码尚未编译运行**。

协议/语义已同步 03/04/05/06。每个 96 kHz live/frozen 对象增加最多约 5.49 MiB 的预分配质量环，60 秒上限不变；PCM、Meter 算法和磁盘分析缓存版本不变。旧内存保存缺少质量计数时显示 unknown，不推断其真实采集过程。旧普通录音按已有区域字段判定；无法精确定位历史普通录音的估计区间时，导出选区保守继承来源区域质量。

下一步仍需在 Windows 重编译 Trace 原生引擎并运行 CTest/native、主题 flow 及真实设备验收。真实 YouTube 录音、拔设备、96 kHz/磁盘拥塞、GPU/DPI、安装包和首帧无闪烁没有获得新的通过记录。首帧断言缺口已修复，不等于应用首帧显示已验收。发布前需确认新 addon 协议、质量保存链路和新增内存占用在实机正常。

## 结论与基线

审核 `Sceneryyyy/Trace` 的 `recorder/dev@d2981fd0634f7427e63ccf8237ea28d0a61bf47d`，产品源码为 preview.31。开始时工作区干净。本轮覆盖 Trace 自有业务、renderer、原生音频核心及开发/验证入口，确认五项 P2，并复核两项已有未关闭问题。优先修复完整性信息传递（R2/R3）和失败路径恢复（R5），然后统一播放控制（R4）及修正订阅（R1）。

当前可运行检查全部通过，但没有覆盖下面的跨模块反例。这份审核不能替代 Windows 实机采集验收，也不能证明没有其他缺陷。本轮只新增审核文档、接力记录和被忽略的本地审核夹具，未修改产品、已有测试、依赖锁文件或版本；未提交、推送或打包。

| 编号 | 严重度 | 已确认问题 | 用户影响 |
| --- | --- | --- | --- |
| R1 | P2 | 快照 selector 对新快照忽略相等结果 | 无变化的顶栏等仍随 30 Hz 快照重渲染，增加界面负担 |
| R2 | P2 | 导出来源缺少采集完整性 | 有中断/估计静音的原件，导出回听快照却标为 complete |
| R3 | P2 | 内存缓存保存不传递估计静音质量 | 保存后变成完整新录音，文件分析无法识别此前补零 |
| R4 | P2 | 报告事件跳转不释放暂停输出 | 播放已暂停但按钮仍为暂停，监听仍停着，需额外一次点击 |
| R5 | P2 | 录音启动失败漏恢复 DeliveryService | 后续后台“另存”持续 pending，正常等待不能恢复 |

P2 表示需要修正的具体功能/性能问题；本轮没有足够证据宣布新的 P0/P1、实际丢音或崩溃。

## R1：相等的 selector 结果在新快照上仍产生新引用

位置：`src/trace/renderer/snapshotStore.ts:32`；调用方 `renderer/viewModel.ts:83`、`renderer/App.tsx:210`。

`useSnapshotSelector()` 只有在 `cache.current.input === input` 且 `equal()` 为真时才复用输出。每次发布都是新快照对象，即使选出的格式、错误、录音状态等完全相同，也重新返回 selector 创建的对象。`useSyncExternalStore()` 依据对象引用判断更新，因而 `useChromeFlags()` 的 `chromeEqual()` 无法阻止 App 更新。文件内“只在 slice 改变时重渲染”的注释与实际行为不符。

复现：在 headless Chromium 中加载仓库真实 React、React DOM 和 snapshotStore，Probe 选择 `{active}` 并比较 active。初始 active=true 后，再用不同快照对象发布 30 次相同 active，结果为 `before=2, after=32, extraRenders=30`。测试没有 StrictMode，逐次用 flushSync 固定更新边界。它证明订阅缺陷，尚未测量真实工作台掉帧、CPU 或 GPU 开销。

建议：当输出相等时跨快照复用输出引用，同时保持 selector 对当前 props 的更新语义。验证应覆盖“新快照/相同结果不 render”和“结果变化、selector 闭包变化能更新”，再在 Windows 实时监测中量帧时间。

## R2：导出回听把未知的完整性默认成 complete

位置：`src/trace/exportService.ts:190`；默认值 `playbackService.ts:257`；原件判定 `recording.ts:47`。

`ExportService.resolveNow()` 对媒体和解码缓存做路径、帧数及 SHA256 校验，然后返回 `AnalysisSource`，但不返回 `continuity`。`PlaybackService.sample()` 将未定义的 continuity 默认为 complete。若导出来自多采集区、中断或估计静音原件，编码与文件校验成功并不说明采集过程完整；此处丢失的是来源质量元数据。

复现：为单区段中断原件构造导出记录及真实本地文件/SHA256，由真实 ExportService.resolve 解析，再交给真实 PlaybackService.sample（原生播放和分析边界使用明确 mock）。输出为 `original=gaps, exportSource=null, playback=complete`。夹具字节不是有效 WAV，此复现只验证文件身份与来源元数据路径，没有执行真实解码、计量或编码。

`main.ts:335` 的报告输入仍从原录音 document 独立判断完整性，因此不要把本问题夸大为“所有导出报告都显示通过”；当前具体风险是回听快照与报告对同一来源给出不一致的质量状态。

建议：解析导出来源时传递可追溯的原采集质量，考虑 region、选区和“导出再导出”。媒体完整可读与原采集完整应保留各自含义，不能用哈希验证代替采集完整性。补含中断、估计静音及正常原件的导出回听/报告一致性检查。

## R3：保存缓存没有携带范围内的质量信息

位置：`src/trace/recording.ts:168`、`:178`；协议 `replaySaveTypes.ts:2`–`:4`；原生 `native/src/recorder/ReplaySave.cpp:20`；临时回听 `playbackService.ts:68`。

采集引擎会生成带 EstimatedSilence 的补零块（Engine.cpp:241、:264），ReplayBuffer 的历史保留 WavePoint.flags。但 ReplaySaveIdentity/ReplaySaveResult 均没有估计帧数、质量区间或时钟可信度。原生 saveReplay 只读 PCM 写 WAV，没有从 clip.history 汇总这些标记。RecordingService.writeReplay 将新 region 初始化为 `estimatedFrames='0'`、时钟 estimated=false，成功后只填帧数、状态和 clippedSamples；document.hasDiscontinuities 固定为 false。

所以含估计静音的缓存一经保存，会失去此前可识别的质量信息。重新分析只能测量补零后的样本，无法推断哪些 0 来自真实静音。`makeReportInput()` 依赖保存后的 region，`reportBuilder.ts:73` 阻止非完整来源显示 pass 的保护也随之失去依据。临时 openReplay 同样不设置 continuity，会走 complete 默认值。

复现：真实 RecordingService.saveReplay 配合明确的 native writer mock，写出最小文件并验证保存文档为 estimatedFrames=0、continuity=complete。这个复现证明当前保存协议/赋值行为，**没有模拟真实 EstimatedSilence 采集**；“含估计块也无法区别”由 Engine → ReplayBuffer → ReplaySave 的静态链路确认。

建议：让冻结缓存与保存结果携带选区范围内的采集质量，准确汇总到新录音及 origin；保留重新计量从新文件 0 帧开始的既有语义。区分选区落在正常区和含估计帧区，不能把整个历史的总量套给任意选区。再验证保存、重载、回听和报告的一致性。

## R4：报告事件跳转绕过常规暂停/恢复监听流程

位置：`src/trace/main.ts:423`；常规 seek 对照 `main.ts:583`；输出状态 `playbackService.ts:146`；按钮 `renderer/App.tsx:177`、`:285`。

正在播放文件时点击报告中的事件，report.jump 直接 `playback.seek(..., false)`。seek 把 phase 设为 paused 并让原生输出暂停，却保持 outputReady=true；此分支未调用 PlaybackService.pause 来关闭输出，也未 resumeInput。自动收尾仅处理 ended/failed（main.ts:203），不会处理该 paused 状态。

界面播放按钮用 outputReady 判定播放/暂停，故此时已无声音却仍显示暂停；系统监听仍未恢复。再次点击先执行 pause/关闭输出，再点一次才重新播放。正常 playback.seek 分支先 pause，再 seek/resumeInput，行为不同。

复现：bundle 实际 main.dispatch，仅把 Electron 启动和设备边界替换为 mock，配合真实 PlaybackService。先播放，再发 report.jump，回复成功且结果为 `phase=paused, outputReady=true, active=false`，不符合自动结束处理条件。未运行真实 WASAPI 输出或完整 Electron 工作台。

建议：把事件跳转复用正常 seek 的输出释放和监听恢复流程，或者定义并统一“跳转后继续播放”的产品语义。覆盖播放中跳转、已暂停跳转、跨循环选区跳转，并断言按钮和监听状态。

## R5：设备启动异常后后台另存没有恢复

位置：`src/trace/main.ts:560`、`:562`、`:645`–`:647`；队列门控 `deliveryService.ts:26`–`:29`。

record.start 在启动设备和进入 RecordingService.start 之前，暂停 retention、deliveries、exporter、analyses。如果设备此时不可用，startDevice 抛错；尚未进入会触发 syncRecordingState 的录音服务。catch 释放 capture、恢复 analyses/exporter/retention，却遗漏 deliveries.resume。

DeliveryService.paused 继续为 true。之后 observe 或用户计划新的后台另存都只调用 pump，pump 因 paused 直接返回。任务可停在 pending，直到成功录音等其他动作间接执行 syncRecordingState 或重启。导出编码恢复不代表最终复制交付恢复。

复现：实际 main.dispatch 配合服务边界 mock，engine.start 抛 DEVICE_UNAVAILABLE。返回失败，同时 `deliveryPaused=true, deliveryResumes=0`。DeliveryService 的 paused 门控为源码确认；本次没有模拟真实设备拔出。cache.save 的暂停步骤也在其 try/finally 之外，建议同时审查暂停阶段自身抛错的恢复覆盖。

建议：统一管理这一组后台服务的暂停/恢复，用覆盖完整准备阶段的 finally 恢复非录音状态，尊重 exiting/managingLibrary。反例要包括设备启动失败、暂停过程中失败，及失败后新任务可以实际完成另存。

## 既有问题复核

1. **估计静音没有界面提示（P2，68 的已有问题）**：`renderer/viewModel.ts:41` 仍只对 gaps 生成“音频有中断”，estimated-silence 为空。因此即使原件正确带着估计标记，用户也看不到对应提示。这与 R2/R3 的元数据丢失不同，应同时解决。
2. **主题首帧测试允许缺失 paint 仍 PASS（P2，72 的 R3）**：`tools/themes/theme-flow.cjs:90` 仍允许 paint===null；下一行宣称首帧前已应用。缺失观察不能证明无闪帧。此次只复核源码，未在 Linux 宣称 Windows 主题 flow 已通过。

此前 72 的 R1/R2 修复已在当前基线，不应与本报告 R1/R2 混用编号；引用时带上文档号。

## 审核范围与验证证据

| 范围 | 本轮检查 |
| --- | --- |
| IPC/应用生命周期 | 白名单、请求校验、串行 mutation、设备切换、监听/录音/回听互斥、后台任务与退出路径 |
| 录音/缓存/存储 | 采集区段、估计帧/缺口、内存冻结保存、session timeline、恢复、保留策略、路径/文件身份 |
| 媒体/分析 | worker 生命周期/心跳、取消、流式编码/解码、帧裁剪、独立计量缓存、导出、交付、导入 |
| 报告/参考/声谱 | 来源和分析身份、报告范围/完整性、事件定位、参考切换、声谱分块/代次 |
| 界面 | 快照订阅、指标读数状态、播放操作、时间轴、目标摘要、主题与 Surface 渲染 |
| 原生核心 | Engine/Recorder/CaptureClock/ReplayBuffer/Meter/Playback 静态检查；可移植算法专项编译运行 |

Trace 目录约一万行，是本轮主要范围。上游 Prism 的其他产品功能、完整依赖供应链和外部服务不在此范围；没有以 npm 默认上游构建代替 Trace 构建。

环境：Linux x86_64、Node v24.19.0、npm 11.9.0、g++ 14.2.0。`npm ci --ignore-scripts --no-audit --no-fund` 成功，跳过需要平台运行时的 postinstall；没有改变锁文件。

| 验证 | 结果 | 实际边界 |
| --- | --- | --- |
| npm run typecheck | 通过 | TypeScript 静态检查 |
| npm run test:trace | 219/219，0 fail/skip | portable 46 个测试文件 |
| npm run build:trace | 通过 | renderer/main/preload 构建，不包含 Windows 引擎 DLL/打包 |
| npm run test:capture-support | 3/3 | 平台能力元数据与 preload；不等于捕获成功 |
| trace_core_tests | 16/16 | PCM、队列、时钟、计量等可移植核心 |
| ebu_reference_tests | 18/18 | 生成参考信号；未运行官方 EBU WAV 文件 |
| tp_time_tests | 233/233 | TP 时间窗口、采样率/声道/块边界等 |
| meter_init_tests | 通过 | 32 并行生命周期、四种采样率、常量只初始化一次 |
| instrument_analysis_tests | 3736 checks 通过 | 可移植 instrument 算法；非硬件性能验收 |
| spectrogram_tile_tests | 20 cases 通过 | 可移植 tile 算法；非真实 GPU/DPI 验收 |
| 专项业务复现 | R2–R5 均符合断言 | 实际业务模块 + 明确 mock 的设备/Electron/分析边界 |
| React selector 复现 | 相同选择值额外 render 30 次 | headless Chromium，真实 hook；非完整应用截图验收 |

原生专项以仓库现有测试源码直接编译到 `/tmp/trace-review`，使用未改动的 Meter、EburConstants、libebur128，以及 InstrumentAnalysis、SpectrogramTile、dsp_utils。libebur128 用 GNU C11（其 M_PI 需要 GNU 定义），C++ 用 C++17；没有为了在 Linux 编译而修改产品源码。没有执行 Windows-only CMake 工程或把整套 native runner 标为通过。

本地证据（被 gitignore 排除，不进入源代码提交）：

- `artifacts/cloud-audit/reproduce.cjs`、`findings.json`：业务复现与结果。
- `artifacts/cloud-audit/selector.jsx`、`selector-runner.cjs`、`selector-result.json`：订阅复现。
- `artifacts/cloud-audit/logs/`：安装、类型、portable、构建、能力元数据及六组 C++ 检查日志。

重跑业务复现：从仓库根目录执行 `node artifacts/cloud-audit/reproduce.cjs`。它 bundle 实际源码到同一忽略目录，生成明确测试文件，不使用个人录音。订阅复现先用 esbuild bundle selector.jsx 为浏览器 IIFE 到 selector.js，再启动开启 9222 CDP 的 headless Chromium，运行 selector-runner.cjs；应从新的空白 page 开始。

## 审计结束时的实机待办与下一任务（修复前）

云环境没有 Windows WASAPI/真实声卡及可操作的 Trace 桌面。未做 YouTube 三分钟播放、真实 loopback 录音、拔设备、96 kHz、长录音磁盘拥塞、Windows 原生 DLL、真实 GPU/DPI 截图矩阵、退出 60 秒看门狗故障注入或 preview.31 安装包验证。没有新增这些项目的通过记录。

下一任务建议先处理 73-R2/R3/R5，补对应跨模块反例，再修 73-R4/R1 与已有估计静音提示、主题首帧断言。Windows 可用后，按用户最初场景播放约三分钟在线视频，在监听/录音/回听/报告跳转/保存缓存中交叉操作，并验证上述修复的真实设备行为。现有检查没有构建阻塞；完整实机验收的实际阻塞是当前只有 Linux 云环境。

2026-10-02 续接勘误：上述修复顺序是审计结束时的建议，R1–R5 及两项旧缺口现已修复，结果见本文顶部。下一任务为 Windows 原生/完整主题 flow 与真实设备复验，当前入口见 [13](13-HANDOFF.md)。
