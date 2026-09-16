# 13 · 当前状态与下一会话

## 当前焦点：M10 3D 与降级已接入，preview.19 GPU 长测运行中

2026-09-17：M9 工程关闭记录已提交 **8499f92**。M10 已接入 2D/3D、相机预设/旋转/复位、显示高度/细节、共用时间刻度和原始点查；GPU 丢失/恢复、无 WebGL 的 2D 降级、REC 中图形故障均已实际验证。spectrogramSettings v2 向后迁移，显示选择不改变分析键。已修正零高度刻度命中、矮宽窗口投影/标签，以及 Windows 短暂文件锁造成设置保存打断业务的问题。设计见 48，当前验收与包身份见 [49-M10-3D-INTEGRATION](49-M10-3D-INTEGRATION.md)。

**24 阶段短门禁 / 150 JS pass：** artifacts/m10/final-1789589279738/report.json。3D 三组进程缩放各 6 项、无 WebGL、真实独占文件锁、M9 旧流程、包/ZIP/中文路径全部通过；设置锁期间命令约 4 ms 返回，5 次后台重试后最新配置保存，录音继续。原失败报告保留，没有放宽数值或资源阈值。

**唯一当前长测：** exec **16703**，runner **49384**，app **63464**；**artifacts/m10/resources-1789589444537/report.json**。真实 GPU、1800 秒、FFT 16384 与高细节 3D；周期显隐并强制 GPU 丢失恢复，原内存/丢帧预算不变。已启动并产生实际采样。先 poll 同一 handle/核对 PID，不重复启动；preview.19 运行包保持不变。

下一步：收取 GPU 长测及录音最终文件完整性，失败则据实定位。通过后关闭 M10 工程关口并记录人工复验项，推进 M11 目标/事件/CSV-HTML 报告与 M12 外部导入/参考比较，再按原八维复评。当前没有外部阻塞；M10 长测未完成，M11/M12/最终评分未完成，目标 active。

ASAR 2aaf12362cac920dc2e039024b4104c74fc993c6e83bed89ec77d5d7d0cabb04；Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe；入口 dist-trace/preview.19/win-unpacked/Trace.exe。保留录音、旧包和失败证据；按阶段本地提交，不远程推送。原 EBU/真实 96k/物理驱动/混合系统 DPI/干净 VM/人工主观继续单独跟踪。

## 以下为阶段历史

## 当前焦点：M9 工程交付完成，M10 3D 原型已验证

2026-09-17：preview.17 的 19 阶段短门禁和 **1800.209 秒资源门禁均通过**，M9 工程关口关闭，人工与既有环境专项单独跟踪。29 次显隐，无声谱错误/丢帧，工作集增长约 0.87 MiB；录音 14,424,000 帧 / 300.50 秒，头/格式/hash 与清单一致，见 [47](47-M9-PRESENTATION-PERFORMANCE.md)。原 exec 67230、runner 55868、app 65924 已结束，不再轮询或重启。

M10 已独立验证时频最大值网格、相机/投影反解、三角形拾取、GPU buffer 复用与上下文丢失/恢复。当前本机 WebGL 2 / RTX 4080 SUPER / ANGLE D3D11 可用；纯几何 4 项、实际图形 4 项通过，设计与预算见 [48-M10-3D-DESIGN](48-M10-3D-DESIGN.md)。已有 SurfaceCanvas 尚未接入产品，不能当成完成 M10。

下一步固定为 M10 产品接入：扩展声谱图显示设置并迁移旧值，增加 2D/3D、相机预设/复位、高度/细节、共用刻度与原始点查；把 GPU 故障降级接入实际录音场景，再完成数值对照、交互、资源与独立包门禁。preview.17 保留不变。M10–M12 和最终复评仍未完成，目标 active；无当前外部阻塞，按阶段提交，保留文件/旧包/失败记录。

## 以下为阶段历史

## 当前焦点：preview.17 的 M9 专项通过，等待新资源门禁

2026-09-17：preview.16 已实际完成 **1800.258 秒 pass**，29 次显隐、无声谱错误/丢帧；WAV 14,434,560 帧 / 300.72 秒的头、格式和 hash 与清单一致，报告 resources-1789582017255/file-integrity.json。原 exec 7602 已结束，不再轮询。

preview.17 完成绘制前来源/epoch/analysisId/配置校验、错误重试、单声道说明，以及隐藏恢复后的查询续接。Canvas 在 layout effect 绘制，同源缩放保留正确坐标的已有图像。旧 500 ms 请求改为随时间轴快照触发并以 33 ms 补充检查。新增列只计算一次；原始块之外加入精确区间最大值结构，颜色使用复用表，均不改变原始 bin/dB。

**19 阶段短门禁 / 140 JS pass：** artifacts/m9/final-1789585180170/report.json。新 2D 多 DPI、WAV96/MP3/M4A/ADTS、单声道、快速换源/FFT、错误重试、固定缓存 GUI 和两小时文件优先查询通过。真实端到端查询至绘制 p95 **12.7 ms**；两小时文件取消宽视图后聚焦两秒 **27 ms**、缓存命中绘制 **6.7 ms**。完整范围、对照算法、缓存预算及候选 hash 见 [47-M9-PRESENTATION-PERFORMANCE](47-M9-PRESENTATION-PERFORMANCE.md)。已查看 200% 进程缩放截图，原文件保持 hash。

**唯一当前长测：** exec **67230**，runner **55868**，app **65924**；**artifacts/m9/resources-1789585398846/report.json**，1800 秒、不可变 preview.17。已确认进程存活；约 330 秒已结束录音进入 LIVE，无错误/丢帧，继续检查原工作集/堆门槛和新增原始+派生缓存总量。先 poll 同一 handle 并核对 PID，不能因一次超时重启。

下一步：收取该长测及录音最终完整性，若通过则关闭 M9 工程关口并记录人工复验项；若失败保留报告并针对原因修复。当前 M9 功能/正确性/专项均已有证据，不重复重做已完成的 UI、缓存或格式工作。可独立准备 M10 的同数据 3D 渲染/相机/降级设计，M9 关口通过后再集成交付。M10–M12 和最终原八维复评尚未完成，目标 active；原硬件/标准素材/人工专项独立开放。

运行入口 dist-trace/preview.17/win-unpacked/Trace.exe；ASAR 020334198a05665eeabc41dc15433c960d5a177df40d811fee9fb5638cab1b88，Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。文件/旧包/失败证据保留，当前无外部阻塞；按阶段本地提交，不远程推送。

## 以下为阶段历史

## 当前焦点：M9 录音结束时的过期异常，preview.16 修复候选

2026-09-17：2D 接入已提交 **e7a9253**。preview.15 长测在约 300 秒录音结束/切回 LIVE 时失败于声谱错误计数，错误为 STALE_INSTRUMENT_SOURCE；报告 artifacts/m9/resources-1789580510557/report.json 已终止为 fail，原 exec 83274 不再运行，不能再称其为进行中。此前短门禁 14 阶段 pass 仍有效，但 M9 未关闭。

定位到 SpectrogramPresenter 的成功分支会检查绑定有效性，异常分支仅检查 requestId，导致旧来源的失败仍会被发布。当前修复候选同时检查异常所属绑定，结束录音前主动取消呈现，并将录音绑定有效期限制到原生 recording 阶段；仍属于当前来源的真实错误继续公开，不按错误码一概忽略。新增两个竞态用例；相关 33 项和类型检查通过。

preview.16 已通过 **60.055 秒切换复测**（resources-1789581266835）和 **14 阶段完整短门禁 / 134 JS**（artifacts/m9/final-1789581814528/report.json）。原生桥接的帧增长断言修正为在有界观察期等待下一音频包，仍要求真实帧数增加；不假设每次很快的瓦片计算期间必有新包到达。原失败报告保留。

**唯一正在运行的新长测：** exec **7602**，runner **56552**，app **64460**；**artifacts/m9/resources-1789582017255/report.json**，preview.16，1800 秒。已启动并得到实际采样；先 poll 同一 handle/核对进程，不重复启动。旧 83274 已失败结束，60 秒复现 60064 已通过结束。M9 录音资源采样进一步要求 writtenFrames 严格增加，原工作集/堆/缓存阈值不变。

新包 ASAR f5928bc93d615519cfe1b1633abe7ef2adedc7c4cf9d8262ecd54283674103a8；Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe；ZIP a7a96d1cb2ed0851e779c3497812951dffbd1a4d21eb5ccb7447f09c96cbecc1。入口 dist-trace/preview.16/win-unpacked/Trace.exe，长测期间保留不变。

下一批除收取长测外，优先补 M9 快速换源/改配置时的绘制前身份检查（避免依赖 effect 清空而出现一帧旧图）、当前错误的重试入口、单声道模式提示、平移/缩放连续性及 500 ms 更新延迟；然后补 2D 多格式/DPI/真实长文件矩阵。M9 未关闭，M10–M12 与最终评分目标保持 active。按阶段提交；原包/录音/失败证据均保留，无当前外部阻塞。

## 以下为阶段历史

## 当前焦点：preview.15 共轴 2D 短门禁通过，M9 长测运行中

2026-09-17：M9 的主进程来源解析、独立声谱数据流、点查询/取消、来源关闭等待，以及共轴 2D 面板已接通。workspace v3 保留旧布局并添加隐藏的声谱图；新增“时频检查”预设和独立 spectrogramSettings。实现、包身份、已验/待验范围见 [46-M9-2D-INTEGRATION](46-M9-2D-INTEGRATION.md)。

**短门禁 14 阶段 pass：** artifacts/m9/final-1789580383517/report.json，132 JS、M9 原生 5 项、新 2D GUI 9 项、原 M8 三组缩放各 12 项、隐藏/最小化生命周期、旧导航、包/ZIP/中文路径重定位通过。已查看真实文件和录音截图。早期测试序列化/旧六仪器计数等失败报告保留；只改正确预期，未放宽数值或资源预算。新 2D 的完整 DPI/多格式/长文件矩阵尚未完成。

**唯一当前长测：** exec **83274**，runner **66576**，app **25380**；报告 **artifacts/m9/resources-1789580510557/report.json**。使用不可变 preview.15，1800 秒，最大频谱/声场/声谱设置、七仪器显示及周期显隐。已确认实际进程存活，约 210 秒仍 running、未报错；先 poll 同一 handle 并核对进程，不重复启动。M8 的旧资源任务已结束通过。

下一步：收取本长测，失败据实修复、保留原报告。独立推进 M9 的固定缓存 GUI、WAV/MP3/AAC 2D 边界、新仪器多 DPI、真实长文件与取消/坏块/缺口；特别测量当前 500 ms 实时视图请求的显示延迟、平移/缩放连续性及单声道模式提示，满足阶段预算后再关闭 M9。随后继续 M10–M12 和原八维复评；不能将本次接通或短门禁替代全目标完成。

运行入口 dist-trace/preview.15/win-unpacked/Trace.exe；包内 ASAR 655be571148ed3bc68dfc99b97759d60c753b0037779ac11a09a5a94589a9569，Native 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。长测期间不覆盖该包。文档/代码按本阶段本地提交，录音/旧包/失败证据保留；未远程推送。原 EBU/真实 96 kHz/物理驱动/混合系统 DPI/干净 VM/人工主观仍独立开放，无当前外部阻塞。

## 以下为阶段历史

## 当前焦点：M8 工程关口通过，继续 M9 完整服务与 2D

2026-09-17：唯一资源任务 artifacts/m8/resources-1789576099071/report.json 已结束，**1800.366 秒 pass**；runner 78012/app 61252 已退出，不再轮询或重复启动。120 次采样、29 次显隐，无丢帧或仪器错误，工作集增长 94.47 MiB < 原 128 MiB；事后 WAV 帧数/格式/hash 与清单一致（300.05 秒 PCM24）。完整工程交付及包身份见 [42](42-M8-ACCEPTANCE.md)/[45](45-VISIBILITY-AND-RESOURCE-GATE.md)。M8 工程关口关闭，人工与既有环境专项继续开放。

M8 关闭记录已提交 **59bd634**。M9 新实现 spectrogramSource/Service/View、过期块淘汰和独立测试入口：类型检查、编解码/存储/服务 **17 项**、实际原生链路 **5 项通过**；见 [43](43-M9-SPECTROGRAM.md)、artifacts/m9/service-tests.log、artifacts/m9/native-service-1789578390972/report.json。真实 750 Hz 标定、解码局部坐标、实时/固定缓存同窗一致、REC 查询不阻断写盘均有证据。

**下一步固定为 M9 应用接入：**在 PlaybackService/main 解析当前来源和已验证内容键，增加白名单视口/原始点/取消接口，绑定关闭/清缓存/删除库记录的等待释放；REC 纳秒轴映射到当前原生段。然后接入 2D 面板、统一时间轴/选区/设置和 workspace 迁移，运行 GUI/长文件/资源/包门禁。当前服务尚未接入主进程命令或 2D 界面，不把 17+5 检查当成 M9 全阶段完成。

preview.14 包保持不可变；当前开发原生 hash 为 7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe，与包不同。未重建包、未进行新的 M9 全 GUI/30 分钟测试。文件/旧包/失败记录保留，无当前外部阻塞；M12 和最终复评目标继续 active，按阶段本地提交，不远程推送。

## 以下为阶段历史

## 后续计划入口：38 v1.2（2026-09-17）

用户要求将 Insight 2 建议落地为接下来的开发目标。本轮整理 [38-DEVELOPMENT-PLAN](38-DEVELOPMENT-PLAN.md) 为统一执行入口：保留 M7–M12 的任务/依赖/退出条件，补齐原八维权重与复评依据、U1–U6 整体验收场景和最近一批 M8-R/M9 工作票。校正旧候选 preview.11、M9“待开始”和 M7 初始工作票的过期提示；01/02/05/07/37 已同步入口与当前边界。

本次为文档整理，无产品代码/依赖/算法/阈值变更，不重建运行包、不新启音频测试。已通过 7 份文档的 45 个相对链接、6 个阶段、13 个扩展验收编号、6 个用户场景、八维原分数与权重合计 100% 的一致性检查，以及 Git 差异/范围检查；原有长测继续使用下方同一任务，结果未出前 M8 保持工程验证中。M10–M12 与最终复评仍未完成；后续优先收取 M8 最终报告、继续 M9 来源与可视区实现。按已有阶段提交授权保存本轮文档，不远程推送。

## 当前焦点：preview.14 可见窗口长测运行中，M9 原生接口与缓存已推进

2026-09-17：上一轮两项复测均已结束：preview.12 / 1800 秒仍因工作集增长失败；preview.13 / 600 秒诊断通过但不足以关闭 M8。新调查与改动见 [45-VISIBILITY-AND-RESOURCE-GATE](45-VISIBILITY-AND-RESOURCE-GATE.md)。

找到测试启动器 windowsHide:true 与 --trace-test-visible 的冲突，旧长测实际长期隐藏。独立 40 次布局切换对照中，隐藏窗口诊断 GC 后约 3304 DOM 节点，可见窗口恢复到约 616。现在 UI 测试默认真实可见；产品也明确冻结隐藏/最小化的 React 呈现，同时持续采集/录音，恢复时应用最新状态。新增 DOM 文案、原生可见性和隐藏期间 DOM 不更新的检查。仅诊断实验触发过 GC，门禁中没有主动 GC 或放宽阈值。

**唯一当前长测：** exec **68283**，runner **78012**，app **61252**；artifacts/m8/resources-1789576099071/report.json，preview.14 不可变包，1800 秒可见工作台。先 wait/poll 同一 handle 并核对实际 PID；不要重复启动。已通过前 300 秒录音收尾，随后 LIVE；最近约 510 秒时没有丢帧或仪器错误。不能仅凭 resources-latest.json 的历史状态宣称完成。

preview.14 短门禁 **12 阶段通过**，artifacts/m8/final-1789576171939/report.json；隐藏/minimize/restore 录音生命周期 3 项、真实 M8 GUI 流程 12 项通过。当前包目录 dist-trace/preview.14；M8 仍等长测最终结论，尚未最终评分。

M9 新进展：native spectrogramTile 接口与 M8 共享最多两个任务名额，文件瓦片接口通过；C++ 15/15 CTest、原生桥接 8 项通过。SpectrogramStore 已实现单一计算队列、内存总量预算、磁盘校验/损坏隔离、取消不发布、拒绝链接缓存根；4 项新存储测试通过。尚未接入完整来源服务/显示聚合/2D 面板。M9 工作可以独立推进，但不能越过 M8 未关闭的发布门禁。

下一步：收取长测实际结果；若通过，完成 M8 关闭记录并继续 M9 的来源描述、可视区聚合与共轴 2D；若失败，保留证据继续定位。整个 M12+评分目标 active。代码按阶段提交，录音/旧包/失败记录保留，未远程推送。

## 以下为阶段历史

## 当前焦点：M8 长资源门禁未过，收取两个复测并继续定位

2026-09-16：M8 功能提交 **3a8bda1**、M9 独立数据底座提交 **06693b5**。preview.11 的 1800 秒检查已实际失败于工作集增长门槛，录音完整、droppedFrames/instrumentErrors 均为 0；不能以短门禁通过关闭 M8。完整排查和候选说明见 [44-M8-RESOURCE-INVESTIGATION](44-M8-RESOURCE-INVESTIGATION.md)。

**两项仍运行的复测，先等待/检查，禁止重复启动：**
- preview.12 快照传递候选，1800 秒：exec **23741**，runner **7148**，app **48148**，artifacts/m8/resources-1789573295492/report.json。
- preview.13 叠加 Canvas 存储复用，600 秒诊断：exec **8696**，runner **71012**，app **6260**，artifacts/m8/resources-1789574225764/report.json。
两个任务都写 resources-latest.json；以各自目录和真实进程为准。10 分钟诊断通过也不能当成 30 分钟门禁通过。原失败为 resources-1789570665775/report.json，副本 resources-before-transfer.json。

当前源码候选 preview.13，保留 contextIsolation/sandbox/命令白名单。高频快照改为 preload 单次转移再在主世界分发；绘图仅在尺寸改变时重建 canvas backing store。功能和对应单元测试通过，但资源改善尚未证明；preview.12 早期总工作集反而较高，后续要按证据决定保留或回退候选，不调整验收阈值。没有在门禁中主动 GC。

M9 的 Native SpectrogramTile 与 log32 二进制编解码已独立验证（15/15 CTest、tile 20 场景、codec 3 项），文档 43；尚无原生瓦片 IPC、缓存存储服务或 2D 界面。M9 source firstFrame 为首列 FFT 结束帧，注意与 PCM 起点区分。

下一步：收取复测，定位渲染/传递/共享工作集增长，验证并保存有效修复，再关闭 M8；随后继续 M9–M12。目标仍 active，未进行最终评分；文件/旧包/失败记录均保留，不执行全量删除或远程推送。

## 以下为阶段历史

## 当前进度：M8 功能与短门禁通过，30 分钟资源门禁运行中

2026-09-16：preview.11 已完成频谱/声场四来源接入、独立设置及 workspace v1→v2 迁移。实现、检查、包哈希见 [42-M8-ACCEPTANCE](42-M8-ACCEPTANCE.md)；数值规范继续见 41。短门禁 11 阶段通过（105 JS、14/14 原生、7 个原生桥接、三组缩放各 12 个工作台流程、旧导航/三格式/中文路径），不能据此跳过长测。

**正在运行的具体任务：** tools/m8/resources.cjs，exec session **52421**，实际 application PID **73264**；runner PID/当前状态以 artifacts/m8/resources-latest.json 与进程核对为准。默认 1800 秒，前 300 秒 REC，随后 LIVE，每分钟显隐恢复；使用不可变的 preview.11 包。已观察到 645 秒时 droppedFrames=0、instrumentErrors=0、回放缓存守住容量。先 wait/poll 同一 handle；句柄缺失时核对 runner/application PID，不能仅凭一次超时重新启动。

当前生产包入口 dist-trace/preview.11/win-unpacked/Trace.exe；旧包、音频均保留。后续可以在资源门禁运行时推进 **M9.0 时频缓存与 2D 数据协议**，无需等待空转；Native/源代码后续变化不得冒充已测 preview.11 的相同构建。长测通过后补 M8 阶段关闭记录，失败则先修复相关问题。

总体目标仍是完成 M12、按 37 原八维/原权重复评并持续改进到均分严格超过 8.5，目标 active；尚未最终评分。用户主观与既有硬件/标准素材专项继续单独列明。本次仅在项目内工作，不进行全量删除或远程推送。

## 以下为阶段历史

## 当前进度：M8 数值内核通过，继续接入来源与界面

2026-09-16：M7 已按阶段提交 **5189f6c**，基线保全提交为 **5c09c73**。用户持续开发目标保持 active，直到完成 M12 并按原八维/原权重复评、继续改进至均分严格超过 8.5；M7/M8 子任务不代表总目标完成。

M8 已建立 [41-M8-METERING](41-M8-METERING.md) 与 native InstrumentAnalysis.h/.cpp：真实 PCM 上的周期 Hann、DC/Nyquist 正确缩放、线性功率平均、固定时间峰值保持、L/R/Mid/Side/Stereo 能量；相关度、功率平衡、确定性示波点。原生 CTest 14/14 通过，新增内核为 3370 个检查点（含逐点几何检查，不是 3370 个独立场景）；最大配置单次冷计算约 39.5 ms，不是 p95/整条链路指标。证据 artifacts/m8/core-build.log、instrument-results.log。上游 dsp_utils.cpp 的已有隐式数值转换警告保留，未放宽编译规则或数值容差。

**下一任务 M8.1/M8.2：**读取 41 的来源/队列方案，建立有界 PCM 窗口提供器及原生异步接口、JS 服务与严格 IPC，扩展 workspace 仪器注册（迁移已有四仪器布局及预设），实现频谱和声场面板。文件复用 WaveSequence/WavReader；固定缓存用 ReplayClip；实时/REC 需要有界 ROI 复制，不能每次拷整个 60 秒。REC 当前统一图轴可能用纳秒，必须转换到正确原生段的 PCM frame，并核验 nativeId/epoch；不能直接拿图轴数值索引音频。主进程录音观察持续，FFT 只能延后显示，不能阻塞录音。

目前仅有数值内核，尚无新仪器 IPC 或用户可见频谱/声场。build/trace-engine 已进入 M8 开发，不能拿当前开发 DLL 去冒充 M7 包的相同构建。可供用户运行的完整包仍为 preview.10，见 40 与 artifacts/m7/final-1789565860097。包内原生保持旧已测 hash；旧录音/缓存/包均保留。

M7 人工主观及既有 EBU/96k/物理驱动/真实混合 DPI/干净 Windows 专项保持开放；它们不阻止后续独立开发，也不等于已通过。阶段性提交以 Git log 为准，本轮没有远程推送。

## 以下为阶段历史

## 当前进度：M7 工程交付完成，继续 M8.0

2026-09-16：用户已授权持续按 38 的阶段推进到 M12，之后按 37 原八维/原权重复评；同时报告算术均分，目标严格超过 8.5。未达到则基于实际短板继续迭代。保护录音和原始素材，不做全量删库，按阶段提交。目标保持 active。

M7 / preview.10 已完成仪器显隐、停靠/尺寸、最大化、设置、自定义预设与视觉统一，见 [39](39-M7-WORKSPACE.md)/[40](40-M7-ACCEPTANCE.md)。类型检查、相关 JS 97 项通过；最终独立包 10 阶段门禁通过，含三组进程缩放各 11 项工作台流程、旧导航 9 项、三格式/离线流程、97 文件 ZIP 比对与中文路径重定位。原生引擎 hash 与 preview.9 一致；不是新 DSP 或完整硬件验收。

当前包：dist-trace/preview.10/win-unpacked/Trace.exe；ZIP 同目录 Trace-0.1.0-preview.10-Windows-x64.zip。精确证据 artifacts/m7/final-latest.json，最终目录 final-1789565860097。旧包保留。基线已提交 5c09c73；M7 交付另作阶段提交，实际提交号以 Git log 为准。

下一任务 **M8.0**：固定频谱 FFT/幅度标定/hop、平均与峰值保持的时间窗，以及相关度/平衡/余辉语义；从原生完整音频/固定缓存/文件查询接入，不能读取画图 min/max 冒充 PCM。上游审计见 39：FFT 可复用，现成 Spectrum smoothing 依赖推送次数、Spectrogram 与显示强度耦合，不能直接作为 Trace 历史缓存。M8 开始前读 03/04/06 及 38 第 5 节，先建立参考数值和边界测试。

M7 工程通过，用户主观待复验；既有 EBU/96 kHz/物理驱动/真实混合 DPI/独立干净 Windows 门禁保持开放，不阻塞独立后续开发，不标为已验收。本轮测试使用独立配置及新素材目录；所有测试进程正常关闭。M12 未完成，尚未重新评分，不能将 M7 交付标为总目标完成。

## 以下为历史计划与交付记录

## 当前目标：按 M7–M12 推进综合分析工作台

2026-09-16：用户要求将 Insight 调研建议落地为后续开发计划，现已建立 [38-DEVELOPMENT-PLAN](38-DEVELOPMENT-PLAN.md) v1.0，作为下一轮产品目标和阶段状态入口。阶段为 M7 可配置仪器工作台与视觉、M8 频谱/立体声声场、M9 共轴 2D 声谱图、M10 3D 声谱图、M11 目标/事件/报告、M12 外部文件/参考对比；新增 A15–A27 验收矩阵。所有阶段尚未开始实施，不能视为当前功能。

**下一任务：M7.0 仪器工作台架构与基线核对。** 先明确注册/布局/呈现状态/持久化边界，审计上游 DSP 复用，固定资源预算和隐藏/恢复语义，再进入 M7.1。任务清单见 38 第 13 节。沿用同窗口共轴、单/双声道、60 秒被动 PCM、三格式录音及历史重复性；换布局不改变 REC/监测/来源/游标。

本轮只新增计划及同步 01/07/08/13/37 索引，完成文档检查；未改业务代码、未运行音频测试、未重建包、未提交或推送。preview.9 现有工作区保留。36 中人工验收和素材/硬件专项继续跟踪；它们不阻止独立架构研究，也不能被新功能进度标为通过。

## 以下为计划确立前的调研与交付记录

## 当前调研：Insight 2 与 Trace 同维度评估

2026-09-16：用户提出后续扩展 2D/3D 声谱图、声场、仪器显示/隐藏、自定义布局，并希望视觉向 Insight 2 靠近；本轮请求为先调研和评分。已阅读本地 11 个功能章节，核对本机 Insight 2.6.0.350、本地手册页脚 2.5.0、官方发行说明及现有 Trace 实现/截图。报告见 [37-INSIGHT2-COMPARISON](37-INSIGHT2-COMPARISON.md)。

按“可定制综合音频测量工作台”同一目标评估：Insight 2 为 8.5/10，Trace preview.9 为 6.0/10；主观加权分，主要差距在仪器覆盖、布局和辅助判读，不代表录音完成度或算法精度。Trace 的统一时间轴、系统录音/缓存保存与文件可重复历史是保留优势。报告区分已确认功能、设计判断与未做实机验证的项目；未给性能/准确度编造分数。

建议后续先做仪器工作台架构与布局规格，再依次接入频谱/立体声声场、共轴 2D 声谱图、复用时频数据的 3D 视图，并扩展目标/报告。布局切换应保持来源、游标、录音和测量语义；沿用本机离线、单/双声道与被动 PCM 最多 60 秒的当前约束。多声道/对白/跨插件来源另行定范围。

本轮仅增加调研文档与接力记录，未改产品代码、未操作运行中的 Trace/DAW、未重建包、未提交/推送。preview.9 人工验收与专项门禁继续开放。下一任务是讨论并固化仪器工作台架构，报告中的阶段尚未实施。

## 当前交付：preview.9 三批迭代完成，待人工验收

2026-09-16：三批功能已实现，工程验证与 ZIP 重定位通过。运行 dist-trace/preview.9/win-unpacked/Trace.exe，或完整解压 dist-trace/preview.9/Trace-0.1.0-preview.9-Windows-x64.zip。人工验收清单及交付哈希见 [36-PREVIEW9-ACCEPTANCE](36-PREVIEW9-ACCEPTANCE.md)，范围与过程见 [35-ITERATION-ACCEPTANCE](35-ITERATION-ACCEPTANCE.md)。

验证：JS 92 项、原生 CTest 13 组、编码矩阵 54 项、最终运行门禁 19 阶段、中文路径重定位离线流程 8 项通过。精确缓存保存、独立分析、整份/选区保存、三格式和重启已实测。汇总 artifacts/iteration/delivery.json。此前门禁失败是旧脚本没有展开新的文件详情，已同步实际操作并续跑；仅在 native/main/ASAR 哈希相同的情况下复用了此前通过阶段，原失败记录保留。

本轮额外修复长 Windows 路径导致的缓存创建失败，真实原路径重开与长路径 I/O 回归通过。EBU 原始素材本机 HTTP 403、真实 96 kHz、物理驱动切换全矩阵、混合系统 DPI 与干净 VM 继续作为未通过的专项；不扩张工程验证或用户主观验收结论。

未重新提交或推送 Git，6e4053e / trace-preview.8-baseline 保留。下一任务：用户按 36 人工验收，并记录实际设备/格式与复现步骤；验收后再建立新的 Git 基线。

## 以下为迭代过程记录

## 当前焦点：按三批顺序迭代，交付人工验收版本

2026-09-16：用户已授权连续完成三批迭代。完整范围与进度见 [35-ITERATION-ACCEPTANCE](35-ITERATION-ACCEPTANCE.md)。前两批实现与针对性验证已完成：当前相关 JS 57 项、长路径 Native I/O 1 项、原生 CTest 12/12，UI 9+7+5 项、真实三格式另存/缓存重建 4 项通过。完整清单和失败修复记录见 35，证据位于 artifacts/iteration。第三批缓存保存已实现并通过原生/服务/实际三格式保存和重启检查；当前在完成 preview.9 最终运行门禁与 ZIP 重定位验证。源代码功能已接通，交付尚未完成；截图已检查。第三批选择显式保存最近缓存/选区，所有批次完成并验证后交付运行包；不能将单批进展视为整体完成。基线标签保留；preview.9 运行目录已生成，最终打包验证进行中。

## 产品复核历史：preview.8

2026-09-16：用户要求完整复核产品。本轮检查基线 6e4053e 的实际实现和独立包交互，形成 [34-PRODUCT-REVIEW](34-PRODUCT-REVIEW.md)。已复现分析取消后仍显示进行中、重新分析不更新当前视图、PCM16 文件顶部误显示 Float 32、选区缺少清除入口、实时页 Space 与播放按钮不一致、导出参数重开恢复默认值。另提出横向导航、缓存有效范围、文件管理与录音交付改进，均区分缺陷、交互缺口和新功能建议。

本轮只写复核文档，未改产品代码、未重建/替换运行包、未重新提交或推送。验证使用隔离配置、人工 8/120 秒及 PCM16 音频；截图通道两次超时，随后以实际 renderer DOM/状态完成交互检查，不宣称新像素级视觉验收。详见 34 中的 artifacts 路径。既有 EBU/96 kHz/物理设备/DPI/干净 VM 门禁继续开放。

下一任务建议：按 34 第一批修正分析状态/重试、格式信息、清除选区、横向导航和快捷键；当前请求为评审，以上尚未实施。

## 以下为评审前基线与开发记录

## 当前焦点：preview.8 已获用户确认，建立 Git 基线

2026-09-16：用户试用后反馈当前暂无主观问题，要求提交 Git 作为版本基线。本次提交收纳此前完整 Trace 开发成果，本地基线标识为 trace-preview.8-baseline；版本保持 0.1.0-preview.8。范围与验收边界见 [33-BASELINE](33-BASELINE.md)。

- 运行入口：dist-trace/preview.8/win-unpacked/Trace.exe；录音、缓存与编译/打包输出不纳入源码。
- 已有工程证据沿用下方 preview.8 完成记录；本轮执行提交内容、构建身份与 Git 检查，无业务代码改动，不重复音频长测。
- 下一任务：从本基线继续处理新需求或实际缺陷。用户当前主观复验已完成；EBU 官方素材、真实 96 kHz、物理设备切换等既有专项门禁继续开放。
- 历史条目中的“未提交/未推送”描述的是当时状态；本地提交以当前 Git 历史及基线标签为准。本次不执行远程推送。

## 以下为提交前开发与验证记录

## 当前焦点：preview.8 历史拖动闪烁修复

2026-09-16：根据用户录屏，修正每次 seek 待新代次数据时清空读数/电平柱的问题。HistoryPresentation 保留上一完整呈现，接纳匹配来源、代次、窗口和序号的新快照后，数字/表头/时间位置/游标共同更新。动画帧合并指针请求，等待呈现不占住主命令队列；主进程在定位后及时发布只读快照。录音观察继续独立运行。真实故障、未就绪、缺口和静音不被掩盖，LUFS/TP 不插值或平滑。

入口：dist-trace/preview.8/win-unpacked/Trace.exe。详见 [32-PREVIEW8-SCRUB](32-PREVIEW8-SCRUB.md)，逐帧证据与交付 hash 见 artifacts/scrub/delivery.json。原生引擎未修改；主进程快照发布与 renderer 已修改，不能复用 preview.7 的 main hash。

本轮通过：类型检查、构建、呈现/播放服务 17 项；文件正反向、45 ms 慢读取、真实内存缓存拖动均为 0 空白/空柱/忙状态闪烁，过程中的读数与独立缓存查询一致；工作台 9 项、走带/EOF 21 项、交互 9+1 项、续录/恢复/录音精度回归、包审核 4 项和独立包 8 项。旧录音 UI 用例仍检查按钮文字，已改为检查图标、可访问名称和按下状态后通过；失败原报告保留。

未重新进行 30 分钟实录及全编码/全 DPI 矩阵；本轮未改这些算法或布局。EBU 原始素材、真实 96 kHz、物理设备变化等既有专项门禁仍开放。提供已测可运行目录，未生成 ZIP。未提交/未推送。

下一任务：用户用原录屏中的拖动方式复验视觉连贯性；无当前代码阻塞。

## preview.7 历史记录

## 当前焦点：preview.7 图标走带与中文实时

2026-09-16：LIVE 从来源栏移到底部“开始/停止监测”左侧，改名“实时”。走带采用相邻图标按钮，顺序为起点、终点、播放/暂停、录音/结束录音；保留悬停说明、焦点及活动状态。录音圆形切换为结束方块，播放三角形切换为暂停符号。

新增终点按钮与 End 快捷键：使用现有 playback.seek(totalFrames, resume=false)，精确定位当前文件/固定历史缓存末尾并保持暂停。录音中定位历史末尾不结束写入。Home/End 不抢占输入控件焦点。无已选历史/文件时，起点、终点禁用。

入口：dist-trace/preview.7/win-unpacked/Trace.exe。05/28 与应用帮助已同步，旧 FileTransport 未使用实现已移除。证据见 artifacts/transport/latest.json。当前无阻塞，下一任务是用户复验走带排列、状态图标与实时按钮位置；未提交/未推送。

本轮验证：类型检查、构建、工作台 9 项、文件回放 21 项（含 End/EOF 缓存一致性）、缩放/录音快捷键 9+1 项、包审核 4 项、独立包流程 8 项、尺寸/DPI/双屏恢复 10 项、git diff --check。采集/计量/回放引擎源码与原生模块保持 preview.4 基线；未重复完整数值与长录门禁。本轮提供已测可运行目录，未生成 ZIP。原有 EBU/真实 96 kHz/物理设备变化等专项验收仍开放。

## preview.6 历史记录

## 当前焦点：preview.6 波形控件位置与图标

2026-09-16：时间窗、波形倍率已移至波形上方，与定位/选区同一行右侧。来源行三个按钮改为自绘 SVG 图标，分别以悬停说明和可访问名称表达「波形复位」「跟随游标」「循环」。复位沿用原显示完整时间范围的行为；跟随/循环保留开启高亮和 aria-pressed。

入口：dist-trace/preview.6/win-unpacked/Trace.exe。界面规范 05、使用指南 28 已同步；证据见 artifacts/icon-toolbar/latest.json。仅界面和版本标识改动，原生模块及主进程业务源码保持 preview.4 已验证基线。

本轮验证：类型检查、构建、工作台 9 项（图标/说明/位置/交互）、文件回放 20 项、缩放与状态恢复 9+1 项、包审核 4 项、独立包流程 8 项、六组尺寸/缩放及双屏恢复 10 项。未重复完整数值/长录门禁；本轮提供可运行目录，未生成新 ZIP。旧版证据保留在下面。

下一任务：用户复验控件位置及图标辨识度；EBU 原始素材、真实 96 kHz、物理设备切换等原有专项门禁仍开放。未提交/未推送。

## preview.5 历史记录

## 当前焦点：preview.5 工具栏精简

2026-09-16：按用户截图，来源行操作区只保留并排的「全长」「跟随游标」「循环」三个按钮。删除前后浏览、加减缩放、起止输入及“设置选区”。LIVE、来源信息、拖动选区/把手、滑杆与滚轮保留。跟随和循环为可切换高亮按钮；先建立选区再启用循环。

当前运行入口：dist-trace/preview.5/win-unpacked/Trace.exe。使用指南 28 与界面规范 05 已同步。完整验证证据见 artifacts/toolbar/latest.json。

本轮按 UI 改动范围验证：类型检查、构建、工作台 9 项、文件交互 20 项、包审核 4 项、独立包流程 8 项、尺寸/DPI/窗口恢复 10 项；git diff --check 通过。产品源码改动只有 FileControls.tsx、styles.css 和 product.ts；原生模块及音频源码与 preview.4 hash 一致。本轮未重新运行完整音频数值/长录门禁，也未生成新的 ZIP；提供已测可运行目录。preview.4 全量与 ZIP 记录保留在下面，不能当作 preview.5 的新测试。

下一任务：用户复验精简后的三个按钮；原有 EBU、真实 96 kHz、物理设备变化等专项门禁保持开放。未提交/未推送。

## preview.4 历史记录

## 当前焦点：preview.4 统一工作台

2026-09-16：统一窗口迭代已完成实现、最终组合门禁及 ZIP 重定位检查。入口 dist-trace/preview.4/win-unpacked/Trace.exe；详细交互、数据边界与验证见 [31-PREVIEW4-WORKBENCH](31-PREVIEW4-WORKBENCH.md)。

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

## 当前焦点：preview.3（反馈 4–6）

2026-09-16：连续缩放、文字精简和监测关闭直接录音已实现并通过门禁，详见 [30-PREVIEW3-INTERACTION](30-PREVIEW3-INTERACTION.md)。

- 当前入口：dist-trace/preview.3/win-unpacked/Trace.exe。
- ZIP：dist-trace/preview.3/Trace-0.1.0-preview.3-Windows-x64.zip；SHA-256 3d9cfbea1fa7894ec9cb00c10e2cd12a33aafd765fb12a98e9fd7448fd48e38b。
- 新门禁：node tools/feedback3/gate.cjs；当前报告 artifacts/feedback3/gate-1789535439551/report.json。
- 使用指南：28。monitoringRequested 与 active 分离，记录开关跨重启保存；显示设置版本 2，时间 5–60 秒、倍率 1–4 连续。
- 当前构建 native 15799e701bc79bb20cc906a6b97ba3b37a5dcf50ff41011264a8fad876c8957d；main 56e4536b1e50486a51cd2b76494d61a3879514617649818ebb711fe4896bb2be。
- 下一步：用户实际复验操作手感；原有 EBU / 96 kHz 等开放项不变。源码未提交、未推送。

## 以下为前版记录


## 当前反馈迭代：preview.2

2026-09-16：用户提出 60 秒 LIVE 回听、选区难发现及文件列表管理三项反馈。实现、针对性测试、最终组合门禁及 ZIP 中文路径重定位检查均已通过。详见 [29-PREVIEW2-FEEDBACK](29-PREVIEW2-FEEDBACK.md)。当前新代码不再以 preview.1 的 hash 为准；下面的 M6 完成记录是前一版历史。

- 内存回听：ReplayBuffer / WaveSequence memory source / PlaybackService temporary；不写临时音频。
- 选区：刻度轴直接拖选、显式模式、原 Shift / 数值输入均保留。
- 文件：LibraryService 磁盘存在性、搜索、回收站、身份与占用保护；修正成品分析 exportId。
- 新输出：dist-trace/preview.2/win-unpacked/Trace.exe；旧版目录保持。
- 新门禁：node tools/feedback/gate.cjs，包含 UI 实机检查及 M6/M5 下层回归。
- 最新包：dist-trace/preview.2/Trace-0.1.0-preview.2-Windows-x64.zip（SHA-256 54640d196090d4efd95dc11c0548097bd90cf101ce288d8fdea019426e8497c6）。
- 最终状态以 artifacts/feedback/gate-latest.json、artifacts/m6/archive-latest.json 和 29 完成记录为准。

## preview.1 历史交付


更新：2026-09-16。**Trace 0.1.0-preview.1 已达到可人工验收的桌面开发预览。M0–M6 最小工程门禁已有证据；完整标准素材、硬件与用户验收仍开放。**

## 现在从这里开始

- 可直接运行：dist-trace/win-unpacked/Trace.exe，保留整个目录。
- 便携包：dist-trace/Trace-0.1.0-preview.1-Windows-x64.zip（207058037 bytes，约 197.5 MiB）。
- 操作与人工清单：[28-USER-GUIDE](28-USER-GUIDE.md)；本次实现、验证边界、hash：[27-M6-DESKTOP](27-M6-DESKTOP.md)。
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
