# 13 · 当前状态与下一会话

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
