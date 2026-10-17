# 13 · 当前状态与下一会话

更新：2026-10-17。默认开发分支 `recorder/dev`；源码仓库根为当前 checkout（本次云端 `/workspace/Trace`）。项目规则见 [AGENTS.md](../AGENTS.md)，全部资料见 [文档索引](README.md)。早期会话已移至 [交接历史](archive/13-HANDOFF-HISTORY.md)，其“下一步”和当时分支状态不代表当前待办。

## 2026-10-17 · preview.35 前端精简实施

用户已授权按 88 继续迭代。当前源码 preview.35，UI88-00～08 的 A/B/C 批本地实现与检查完成，UI88-09 的 clean 来源复验和完整双平台 CI 收尾中，见 [89](89-FRONTEND-SIMPLIFICATION-ITERATION.md)。设备摘要、仪器更多、单版本详情、报告三分区、分类设置、A/B/3D 高级区及任务/故障分层均已接入；协议、计量、依赖 pin、文件保护和 87 的列表行为保持。

已运行 portable 321/321、类型/构建、完整与生产 npm 零公告、独立工程、原 renderer 9、P0/P1 9、列表 13、新 frontend 11 组及 React selector。最终 clean 提交和新 CI 尚待记录；以下 bf42e6c/run 38744154945 是 preview.34 的旧证据，不能替代本轮。关于页与包版本统一为 preview.35，版本一致性由实际 UI 审计检查；根包 JSON 不直接导入 Trace 源码，以符合工程边界。

本地继续 `recorder/dev`，远程默认仍 `2277625`；本轮计划推送独立评审分支取得 CI，不自动合并。没有新安装包或 PDF，Windows 真实设备/听感/96 kHz/长录音/GPU/DPI/原生对话框/用户视觉仍待验。下节是规划阶段历史快照。

## 2026-10-17 · 下一版本前端精简调研与计划

后续用户已授权继续实现。规划文档已保存为 `69fdca5`；当前源码 preview.35，UI88-00～08 的 A/B/C 批本地实现与检查完成，正在完成 UI88-09 的完整双平台 CI。当前产品迭代过程、批次检查和边界见 [89](89-FRONTEND-SIMPLIFICATION-ITERATION.md)；下方“仅文档/未实现”为此前规划阶段快照，不代表最新工作状态。

用户要求先总结全前端冗余，再参考成熟同类项目形成下一版本迭代文档。本轮交付 [88](88-FRONTEND-SIMPLIFICATION-PLAN.md) 与 [来源清单](research/2026-10-17-frontend-simplification-sources.json)：核查 Audacity、Sonic Visualiser、REW、Insight 2、ocenaudio 共 9 份官方页面，实际查看 4 张官方示意图；两个 Audacity 图片请求 403，未声称查看。没有安装或运行这些产品，也没有性能/用户横评或复制外部代码/素材。

UI88-00～09 全部待实施：基线/原型 → 工作台/仪器 → 文件详情/成品/导出和报告 → 设置/A-B/3D/目标与故障提示 → 整体验收。建议目标 preview.35，当前包版本仍为 preview.34，基线 `2277625`。已发现 `src/trace/product.ts` 关于页版本仍为 preview.33，列入 00/09，未在仅文档任务中改代码。动作迁移、来源/选区/计量区别、三批顺序和验收指标见 88。

本轮仅文档与 JSON；检查来源哈希/JSON、文档链接、工作票与 diff，不运行新产品构建、音频或 Windows 门禁。既有 CI 仍绑定下方 `bf42e6c` / run `38744154945`；新版本尚无实现或通过证据。下一步是按 88 从 UI88-00 开始实现；本轮在文档交付后停止。L86、R83 历史完成状态及 76 实机/发布门禁不变。

## 2026-10-15 · 录音列表迭代

用户授权按同步任务单继续推进；当前源码 preview.34，L86-01～03 云端实现见 [87](87-RECORDING-LIBRARY-ITERATION.md)。紧凑录音/导入分类、单份详情、右侧栏/窄屏抽屉、选择/载入/回听区分、当前文件版本与游标/选区复用、有界最新播放意图、状态保留、查找/排序/定位与 50 行分页已接入。TakeSummary 新增可选 continuity，复用既有采集质量，不改 Meter v5、Session v2 或协议版本；依赖 pin 不变。

代码 `bf42e6c` 的 [完整 CI 38744154945](https://github.com/Sceneryyyy/Trace/actions/runs/38744154945) 成功：两端 portable 321/321；Windows CTest 19/19、原生/媒体 68/68；Linux ASan/UBSan 核心 8/8 + 原始 EBU 1/1。两端适用 EBU 68/68、112 数值及 204 一致性检查通过，sourceDirty=false。13 组新列表浏览器及原 renderer/P0-P1、React selector、独立 I 对照与安全门禁成功；来源树、分片校验及完整范围见 [验证 JSON](release/recording-library-verification.json)。5000 条模拟元数据始终只挂载 50 行；快照/报告位于忽略目录 artifacts/library，源码保留检查入口。没有新安装包，Windows 实机回听/快速切换/监测与 A/B、DPI/原生对话框及用户视觉反馈仍待验。

用户随后明确授权合并；[PR #2](https://github.com/Sceneryyyy/Trace/pull/2) 已于 2026-10-15 15:05:39 UTC 合入 `recorder/dev`，合并提交 `ba461e599bfb3d3f246d5bce6de7022c4e807464`，保留原提交历史。本地已快进同步。合并前 PR HEAD 为 `5db06b4`、默认分支为 `6b37ed4`；合并内容树与最终 PR HEAD 一致（`8b0c6fd83f5ac9884fe68b7e0bae0aa738729bc8`）。`5db06b4` 相对已验证代码 `bf42e6c` 仅增交接文档；本次合并及随后文档同步不代表新增音频测试或实机验收。调研基线 `6b37ed4` / preview.33 和四个项目的固定来源保留在 [86](86-RECORDING-LIST-RESEARCH.md)。

## 2026-10-15 · 正式合并

用户已明确授权正式合并。[PR #1](https://github.com/Sceneryyyy/Trace/pull/1) 已由草稿转为就绪并合入 `recorder/dev`，合并提交 `2454bad17d7d00ead556704385114bc646aa9dd2`，保留全部原提交历史。合并时评审分支 HEAD 为 `457d29b`、默认分支原 HEAD 为 `2ed9f7d`，GitHub 确认无冲突；合并内容树与 `457d29b` 一致。以下保留各轮测试及分发身份；合并和本次交接文档更新不代表新增实机验收或安装包。

## 2026-10-15 · 代码与文档复核

当前源码 preview.33；用户要求完整复核并即时修复，范围、反例与修复见 [85](85-CODE-DOCUMENT-REVIEW.md)。本轮修复录音冻结质量、元数据/诊断写入及缓存误删边界、监测/参考选区恢复、复核与 REC 准备竞态、IPC 资源、选区报告、匹配音量及 PNG/CSV/生产 CSP 输出边界；补齐旧 WAV 后处理及文件/报告 worker 的进程所有权，修复强退后继续写盘；同步陈旧文档入口。原始计量和既有协议版本保持，新依赖版本未升级。

代码 `1c00c07` 的 [完整 CI 38671033132](https://github.com/Sceneryyyy/Trace/actions/runs/38671033132) 已成功：两端 portable 307/307，Windows CTest 19/19、原生/媒体 68/68，Linux ASan/UBSan 核心 8/8 + 原始 EBU 1/1；两端原始 EBU 68/68，112 项数值及 204 项一致性检查通过。CI 合并提交 `9a87e20` 与交付代码 Git tree 相同，两端 sourceDirty=false。独立 I 对照、实际 React selector 及 9 + 9 项模拟 IPC 浏览器检查通过；已校验分片注解，附件 payload 未读取。来源/计数/校验见 [本轮验证 JSON](release/code-review-verification.json)。已通过 [PR #1](https://github.com/Sceneryyyy/Trace/pull/1) 正式合入默认分支 `recorder/dev`，合并身份见顶部。未建立 preview.33 安装包；当前候选仍为下表 preview.31。下方 10-11 记录属于上一轮源码验证，不代表本轮通过。

## 2026-10-11 · P0/P1 上一轮迭代

按用户要求顺序完成 83 的 R83-01～08，所有云端可完成内容已交付，到此停止迭代。源码 preview.32，代码 `4fd9401` 已推到 [草稿 PR #1](https://github.com/Sceneryyyy/Trace/pull/1)（`codex/p0-p1-cloud-20261011`）；该阶段提交时本地继续在 `recorder/dev`，远程默认分支当时尚未合入该 PR；现已合并，见顶部。

[完整 CI 38160177617](https://github.com/Sceneryyyy/Trace/actions/runs/38160177617) 全成功：Linux / Windows portable 286/286；Linux ASan/UBSan 8/8 + 原始 EBU 1/1；Windows CTest 19/19、native/媒体 67/67，两平台原始 EBU 68/68、sourceDirty=false。CI 临时合并提交 `b31fcb9` 与代码 `4fd9401` 的 Git tree 相同。独立 I 对照 8/8、浏览器交互、18 组实际长文件基线全通过；详细范围/数值见 [84](84-P0-P1-CLOUD-ITERATION.md)，固定来源/摘要/附件身份见 [验证 JSON](release/p0-p1-cloud-verification.json)。附件 payload 下载 HTTP 403，未在本地读取；实际 CI 分片注解已校验，成功步骤与本地记录分别标明证据范围。

本轮包括进程树/慢检查点故障收尾、有界性能诊断、FFT 复用、声谱金字塔与持久预算、显示平滑/倾斜、等响度回听、人工标记/双图导出、分布/PLR/PSR。Meter v5 与缓存计量语义不变；InstrumentSettings 升级 v2 并迁移 v1。最后文档提交不代表新增测试。下方 preview.31 分发包是上一候选，本轮未建立 preview.32 包。

下一阶段：真实 Windows 声卡/96 kHz、两小时录音、慢盘/满盘/断电、设备重连、GPU/DPI、回听与原生保存对话框验收，仍按 76 单列；不能因本轮 CI 成功关闭。R83-09/10 保留 P2，本轮不推进。

## 源码与分发身份

| 项目 | 当前记录 |
| --- | --- |
| 源码 | `0.1.0-preview.35`；前端精简见 [89](89-FRONTEND-SIMPLIFICATION-ITERATION.md)；录音列表见 [87](87-RECORDING-LIBRARY-ITERATION.md)；计量配置已升级 Meter v5，EBU 修复见 [78](78-EBU-METER-RECALIBRATION.md)；云端发布准备见 [75](75-CLOUD-RELEASE-PREPARATION.md) |
| Git | `Sceneryyyy/Trace`，默认 `recorder/dev`；preview.35 前端精简实现及 CI 收尾见 89；preview.34 代码 `bf42e6c` / CI `38744154945` / PR #2 已合入（`ba461e5`），见 87；preview.33 代码 `1c00c07` / CI `38671033132`，复核见 85；上一轮 P0/P1 `4fd9401`（评审分支 `codex/p0-p1-cloud-20261011`）；上一轮文件/故障修复 `2aee519`；保留提交身份及合并历史。自建编码组件 `f33d74d`；此前依赖/编码/下载修复 `3d63d8f` / `ef51603` / `6835af9`；独立化历史为 `a986a0d` / `ab466d8` / `db005b5`；最后文档提交不算新音频测试，远程身份以 Git 为准 |
| 仪表主题 | 实现 `2938c8e`、审计修复 `c67e9e9` 等已于 2026-09-30 合入 `recorder/dev`；用户已验收开发构建并接受 71-D5 差异 |
| 当前工程候选 | Windows x64 preview.31，文件/故障修复来源 `2aee519`；[CI 38099859270](https://github.com/Sceneryyyy/Trace/actions/runs/38099859270) 全部成功，私有附件 `11688230696`，未签名 |
| 历史同事内测包 | Windows x64 preview.30 / InternalTest-r3，来源 `9c1ee21`，包名/校验见 [69](69-INTERNAL-TEST-R3.md) |
| preview.31 分发 | 私有工程候选含该候选的应用、项目源码、PDF、校验及验证记录；无声卡 CI 加载/重启已通过。PDF 插图为云端模拟界面，实机/公开发布门禁仍开放；preview.28 PDF 和 R3 为历史快照 |
| macOS | [70](70-MACOS-PORT-PLAN.md) 方案已记录；当前分支的 Trace 后端仍为 Windows/WASAPI，Mac 实现/实机验收未完成 |

## 2026-10-11：GitHub 录音与分析仪器调研

在当前源码 `2ed9f7d` 上完成用户要求的外部项目调研和源码对照，见
[83](83-GITHUB-AUDIO-PROJECT-RESEARCH.md) 与
[固定来源清单](research/2026-10-11-github-audio-projects.json)。筛选 11 个项目，另核查
Sonic Visualiser 两个实现库；只核查 README/源码/许可，没有运行竞品或跨引擎数值测试。

该调研是实施前快照。用户随后授权按顺序完成 P0/P1，当前实现与验证见本页顶部及 84，R83-09/10 仍为 P2。源码观察已补充内核对照和完整长文件矩阵，不再作为未经实测的收益结论。

## 上一轮：文件与故障测试扩展，完整 CI 与新候选通过

本轮修复 MP3 声明长度与实际内容不符仍被接受、owner 标记部分写入残留，
POSIX 子进程忽略 SIGTERM 时取消不退出，以及 Windows 路径别名阻止正常缓存重读。
读取时先解析根目录，同时保留 UUID 子目录链接和归属检查。新增 16 组 CBR/VBR MP3、
真实损坏/截断文件、缓存变化、worker 异常和三处 ENOSPC 注入。
浏览器回归默认截图移到忽略目录；更新手册须显式 --capture-docs，脏工作区使
CI 摘要失败。
实现及复现见 [82](82-FILE-FAULT-TESTING.md)，可克隆证据见
[file-fault-verification.json](release/file-fault-verification.json)。

最终代码 `2aee519b575acdc8cdd954634084c2bb282b063f` / [完整 CI 38099859270](https://github.com/Sceneryyyy/Trace/actions/runs/38099859270)，attempt 1：

| 范围 | 实际结果 |
| --- | --- |
| Linux | portable **272/272（54 文件、0 fail/skip）**；ASan/UBSan 核心 8/8 + 原始 EBU 1/1，JUnit 记录分别 266/744 s；实际浏览器回归、类型/构建与完整/生产安全门禁通过 |
| Windows | 锁定工具链、自建 FFmpeg 安装及实际报告一致；CTest **19/19**；原生/媒体 **64/64（11 文件、0 fail/skip）**；portable 272/272；类型/构建与安全门禁通过 |
| 新文件/故障 | 9 项真实 codec 用例 + 3 项真实导入 ENOSPC 注入通过；16 组 MP3 的声明裁剪帧数与分段解码完全一致；现有 WAV/附图/三格式/双 AAC 封装保持通过 |
| 候选 | 同次 run/HEAD/attempt 的完整 Linux 成功门禁、ZIP、5 项包审计、加载/重启、clean-checkout、完整来源和上传通过 |
| 本地辅助 | Linux 系统 FFmpeg 7.1.5 与同源码 Linux 9.0.2 辅助构建的媒体/磁盘用例各 12/12，真实 CRC/non-CRC LAME 文件验证通过；272 项 portable、类型/构建、122 文件/575 导入边界通过；四项问题的复现证据保留 |

新私有 [trace-windows-candidate](https://github.com/Sceneryyyy/Trace/actions/runs/38099859270/artifacts/11688230696)，ID `11688230696`，
归档 `173915167` 字节，GitHub 附件 digest `sha256:c7e67a9bb7735efca61ac121fab7daf142d9a8e17a23863fca60a899ca8b42fd`。
它是附件归档身份，不是内含 ZIP/JSON hash。本地读取 GitHub API 中的实际 CI 摘要注解和附件元数据，
没有下载/读取 Azure 日志或附件 payload；包内部校验由本次成功 CI 执行。候选文档为生成时
快照，最新交接与试验边界以本页、76/82 为准。

10 月 9 日实时 npm 审计新增 source-map-js high 1，仅修补 1.2.1→1.2.2；
新锁 `17ce7b17ef9ce0821c8025284884e32550ed020f4752f6b39d37108cf8b545df`
的完整/生产审计均为零。直接依赖、Meter v5、Session v2、缓存 key v3、
EBU 容差和 FFmpeg/LAME recipe/EXE/config pin 保持。GitHub 镜像仅更新
MSYS 构建运行库 DLL，重新固定该工具及关联 lock/report，实际重建报告已严格匹配；
其余 30 个工具和六组系统输入保持。本次命中固定构建缓存（`codecBuildReused=true`），来源编译记录来自
此前已通过严格安装的同 pin 构建；本次缓存再次经过完整安装身份核验，不能代替实际文件测试。
先前 run 37876369232 因
CRC Xing 偏移复核而主动取消；其结果没有带入最终证明。37876605731 / 37877327686 的 Windows 被旧
MSYS 哈希 pin 阻止、Linux 主动取消，故障与诊断身份保留在验证 JSON。37878086505 的 Windows 原生/媒体 63/64，
独立诊断 37879668339 找到缓存路径别名错误；这些失败同样保留，不复用为通过。38098647365 虽然全部检查与候选成功，
Linux 浏览器回归却改写已提交的文档截图；最终 sourceDirty=true，不能作为
最终干净源码证明。新提交修复输出位置及脏源码门禁，并完成完整复验。
真实录音/慢盘/满盘/断电/驱动/96 kHz/GPU、监督进程自身强杀收尾、签名和用户
验收仍单列；本轮不关闭这些实机门禁。

## 前一轮：自建 FFmpeg 与完整来源门禁已交付，新候选复验通过

默认组件已替换为 Trace 自建 FFmpeg 9.0.2 + LAME 3.100，源码无补丁，工具/SDK、
脚本、实际配置与两 EXE 固定。三次独立 Windows 编译输出哈希完全一致。
完整来源门禁验证实际构建报告与提交的 pin，候选附带两份官方源码、项目构建脚本、
报告、配置和逐文件系统输入清单。来源完整性的范围是 FFmpeg/LAME/Trace recipe；
Microsoft 编译器/CRT/SDK/系统 DLL 单列版本、哈希及条款复核，不声称这些专有库开源。

[完整 CI 37217397928](https://github.com/Sceneryyyy/Trace/actions/runs/37217397928)，代码 `f33d74da18d29902e260443f01eb0be24255ed49`，attempt 1：

| 范围 | 当轮结果 |
| --- | --- |
| Linux | JS 263/263；ASan/UBSan 核心 8/8（177.00 s）、原始 EBU 1/1（410.81 s）；浏览器、类型/构建和安全门禁通过 |
| Windows | 实际源码构建/锁定安装；CTest 19/19（172.96 s）、原生/媒体 52/52（9 文件）、JS 263/263，均 0 fail/skip |
| 媒体 | 生产三格式、双 AAC 封装、分段/帧数/延迟、18 组 WAV、JPEG/PNG 的 MP3/M4A 附图通过；一分钟 96 kHz 离线转换 715–1137 ms，帧数一致 |
| 新候选 | 同次 Linux 完整成功门禁、ZIP、5 项包审计、加载/重启、clean-checkout、完整来源与最终上传均通过 |
| 云端本地 | 263/263 JS、16 项来源/发布反例、类型/构建、121 文件/573 导入边界、安全门禁和两份来源归档校验通过 |

私有 [trace-windows-candidate](https://github.com/Sceneryyyy/Trace/actions/runs/37217397928/artifacts/11309181720)，ID `11309181720`，归档 `173879193` 字节，
GitHub 附件 digest `a5afb238df3664fa1c36e2a711a57d3d10e46fdabe7bc4c18f17e0a8767a180e`。此 digest 不是内含 ZIP/JSON 的 hash；
本地读取完成日志及附件元数据，未读取 payload/数值 JSON，包内核验由本次 CI 执行。
候选内文档为生成时快照，当前状态见本页、76/81 与 [codec-verification.json](release/codec-verification.json)。

完整 npm 公告仍为 0。旧 Gyan 的八项未知基础库/生产者资料缺口通过替换二进制解决，
不将旧清单改成完整。组件公告/安全、微软/GPL 系统库分发条款、真实声卡/驱动/96 kHz、
长测、GPU/DPI、签名与独立用户验收仍按 [76](76-RELEASE-CHECKLIST.md) 单列。
复现与试构建失败证据见 [81](81-SELF-BUILT-FFMPEG.md)，原计量容差与 Meter v5 保持。

## 前一轮：发布依赖与云端复验（Gyan 候选）

依赖修复 `3d63d8f`、编码回归修复 `ef51603` 与下载修复 `6835af9` 已交付到 `recorder/dev`。固定
Electron/SDK **42.11.10**、builder **26.15.3**、node-gyp **13.1.0**、下载器
**5.1.0**；完整与生产 npm 审计均 **0**（原 17 high / 1 critical）。实时审计
已加入两端 CI、Windows 验证及候选门禁。实现及范围见 [80](80-RELEASE-DEPENDENCY-HARDENING.md)，
可克隆的提交/日志 SHA/附件元数据见 [依赖验证记录](release/dependency-verification.json)。

| 验证范围 | 当轮结果与身份 |
| --- | --- |
| 云端本地 | 新锁安装 316 包；Electron 42 headless 图标生成、类型/构建、JS 258/258、边界 121 文件/573 导入；提交后安全门禁、7 项格式/时序及 11 项发布/下载反例通过 |
| 完整 CI | [`37164188081`](https://github.com/Sceneryyyy/Trace/actions/runs/37164188081)，代码 `6835af9`，attempt 1，两个 job 均 success；不沿用旧工具链结果 |
| Linux | JS 258/258；ASan/UBSan 核心 8/8（316.75 s）与原始 EBU 1/1（815.40 s）；真实 React 订阅及 9 项模拟 IPC 浏览器回归、类型/构建通过 |
| Windows | 独立 SDK/诊断/引擎；CTest 19/19（220.47 s，实际 WavReader 原始素材）；原生/媒体 48/48（9 文件）、JS 258/258，均 0 fail/skip；实际 WAV/MP3/AAC 及生产导入/分块/导出含 M4A/ADTS 通过 |
| 新候选 | 同次 run/HEAD/attempt 的 Linux 完整成功门禁、ZIP 内容、5 项包审计、原生加载及主题重启持久化、clean-checkout、最终生成/上传均通过；实际 CRT 14.44.35112 x64 与 DLL hash 已从完成日志留存 |
| 来源 | 固定 Gyan FFmpeg 9.0.2 的 ZIP CRC/两 EXE/config；已校验 FFmpeg 9.0.2 主源码及 LAME 3.100 官方源码/许可，候选生成器附带两份归档与来源清单 |

私有附件 [trace-windows-candidate](https://github.com/Sceneryyyy/Trace/actions/runs/37164188081/artifacts/11289018197)，ID `11289018197`，
归档 244,857,038 字节，GitHub 所报归档 SHA-256
`166ac58b6926fe5d3e325d85b8cc8cbf04260ec8f3b3fdb28df895ee3d8f9c2e`。这是 GitHub 附件归档 digest，不能当成包内 ZIP/JSON 的 hash。
已读取完成 job 日志和附件元数据；此前 Azure blob CONNECT 403 后，本轮未
重试附件 payload，也未读取内部数值 JSON。包内审计及校验由当前成功 CI 执行。
候选内 Markdown 为生成时阶段快照，最新状态以本交接/76/80 和验证记录为准。

第一轮 `37143481325` 的 Windows 19 CTest/JS 通过，但新增三格式用例发现
有效周期 WAV 的探测误判，native 44/47；Windows failure 保留，随后取消 Linux
后按新提交完整重跑。另在真实生产回归修复 AAC 尾块与 ADTS 延迟读取；有效
帧范围和 EBU 数值容差保持，失败/修复详情见 80。

第二轮 `37162767474` 的两端测试、包审计与加载通过，但最终源码下载触发
Node Undici 内部断言，未上传新候选。下载改为保持代理/TLS 的原生 HTTPS
流后，大小/hash、重定向与超时门禁均通过，最终完整 CI 和候选已复验成功。

**当时 Gyan 静态 FFmpeg 对应源码未齐备**：已取得 37 条发布者版本记录，尚缺八项
基础库版本、完整传递依赖/许可、生产者补丁及精确构建/工具链资料。公开通用
构建脚本也未能绑定到本发布二进制。`correspondingSourceComplete:false` 与
`releaseReady:false` 保持；需要发布者资料，或另行建立拥有完整来源的 codec 构建。
真实设备/96 kHz、三分钟在线视频、长测/GPU/DPI、签名与用户验收见 [76](76-RELEASE-CHECKLIST.md)。

## 历史：独立化完成记录（旧工具链）

2026-10-03 按用户指定顺序完成 Trace 专用入口、测试/CI 迁移、FFT 本地维护及退役上游清理。复现与来源见 [79](79-TRACE-INDEPENDENT-PROJECT.md)，可审查的提交/日志 SHA/产物元数据见 [验证记录](release/independence-verification.json)。根包及默认安装、构建、测试、诊断、打包均只使用 Trace 与锁定第三方依赖，无需检出或构建 Prism。已删除退役桌面、原 addon、插件、TUI 等 311 文件（53,989,426 字节）；FFT 原算法、固定来源、hash、署名及 GPL 全文保留，历史源码仍可从 Git 追溯。

| 验证范围 | 最终结果及身份 |
| --- | --- |
| 从零安装 | 全新源码归档、空 node_modules、普通 `npm ci` 安装 445 包；无 Prism 跳过变量，不禁用安装脚本；typecheck、51 文件 246/246 JS、默认构建通过。之后新增两项 CI 门禁用例，当前 JS 为 248/248 |
| 依赖边界 | `check:independence` 通过：120 源文件、570 导入；跨上游路径与未声明包反例正确拒绝；普通公开归档无需私有素材也能独立编译 |
| 本地原生 | Release 8 个生成 gate + 原始 WAV gate 通过；干净提交 `a986a0d` 原始 gate 79.51 s，68/68 适用 WAV、112/112 数值、204/204 分块/帧数/EOF 一致性；源码 hash 与最终代码一致。ASan/UBSan 生成 gate 8/8，274.90 s；独立 FFT 对照 1590 项 |
| 最终 Linux CI | `db005b5` / run `37104992986`：JS 248/248，ASan/UBSan 核心 8/8（317.88 s）及原始 WAV 1/1（814.75 s），类型/构建、真实 React selector 与 9 项模拟 IPC Chromium 回归通过 |
| 最终 Windows CI | 同次 run：独立 SDK 和诊断编译、CTest 19/19（251.28 s，含实际 WavReader 原始 WAV）、实际原生/FFmpeg 43/43（7 份 N-API + 1 份 FFmpeg 用例文件）、JS 248/248、类型/构建通过；JS 均 0 fail/skip |
| 候选包闭环 | 严格核对同次 run、HEAD、attempt 的 Linux 完整成功后，ZIP 内容、5 项包审计、自身原生模块加载与主题重启持久化通过，clean-checkout 保护保留；最终候选生成及附件上传成功 |

私有候选可从 [GitHub Actions 附件](https://github.com/Sceneryyyy/Trace/actions/runs/37104992986/artifacts/11267953983) 获取：`trace-windows-candidate`，ID `11267953983`，GitHub 附件归档大小 212,794,813 字节，归档 SHA-256 `bc7b385c33aa9a81c4fd1537a707089a7265950a4f7892b69688a2771e4bf658`。这个 hash 是 GitHub 附件归档的 digest，不是内含应用 ZIP 或数值 JSON 的 hash。已读取完成态 job 日志和附件元数据；云端代理拒绝 Azure 附件 blob 的 CONNECT（403），没有下载/读取附件 payload。包内部的校验与 manifest 由成功的候选生成步骤产生。

两次发现并修复的 CI 问题保留原失败：`37101564015` 的 Windows 固定 FFmpeg 地址 404，改为同发布者固定版本镜像，实际 ZIP/两 EXE 字节与原锁完全一致；`37103351961` 最后附件生成因图标改写 tracked 源文件而失败，构建图标现写入忽略目录 `build/trace-icons/`，品牌与算法未变。旧原始 WAV gate 的 900 秒超时则通过核心与原始测试串开、墙钟上限 1800 秒解决；数值标准、单探针限制未放宽。

计量配置仍 Meter v5，产品 preview.31。70 个原始 WAV 均保留完整性；68 个单/双声道适用文件为通过分母，两个 5.0/5.1 文件仍排除。公开源码归档继续排除私有 EBU 素材，缺素材的强制模式拒绝配置。独立化完成时有 18 个受影响包（17 high / 1 critical）；后续已修至完整/生产审计均 0，见 80，生产依赖审计不能单独证明 Electron 运行时安全。

工程独立化目标已达成。正式发布、物理设备/96 kHz、三分钟在线视频操作、长测/GPU/DPI、签名、安全修复、FFmpeg 对应源码及用户验收按 [76](76-RELEASE-CHECKLIST.md) 继续跟踪。本节保留独立化阶段证据；当前依赖与自建组件状态以顶部及 81 为准。

## 下一会话接力

当前源码 preview.35，前端精简本地实现完成，完整 CI 收尾见顶部与 89；以下列表 preview.34 代码 `bf42e6c` / PR #2 已合入 `recorder/dev`（`ba461e5`），完整 CI 已成功，最新交接为文档增量；实现/本轮验证以顶部及 87 为准。上一轮复核代码为 `1c00c07`（preview.33），[CI 38671033132](https://github.com/Sceneryyyy/Trace/actions/runs/38671033132) 已全成功，实际测试提交/内容树及最终证据见顶部与 85。preview.31 私有工程候选继续绑定 `2aee519` / run `38099859270`；后续文档提交不算新的音频、Windows 或候选运行。

| 接力材料 | 位置与用途 |
| --- | --- |
| 当前入口/固定工具链 | [开发入门](../CODEX-START.md)、[09](09-WINDOWS-SETUP.md)、[81](81-SELF-BUILT-FFMPEG.md)；toolchain.trace.json 当前，M0 清单历史 |
| 可克隆证据 | [recording-library-verification.json](release/recording-library-verification.json) 与 87 为当前列表迭代；[code-review-verification.json](release/code-review-verification.json) 与 85 为当前复核；[p0-p1-cloud-verification.json](release/p0-p1-cloud-verification.json) 为上一轮 P0/P1；[file-fault-verification.json](release/file-fault-verification.json) 为 preview.31 文件/故障复验；[codec-verification.json](release/codec-verification.json) 为此前自建证明；[dependency-verification.json](release/dependency-verification.json) 为旧 Gyan 工具链证明；[independence-verification.json](release/independence-verification.json) 为旧工具链独立化证明 |
| 远程原始证据/附件 | 顶部 Actions run、完成 job 日志与私有候选；下载后按内部 manifest/SHA256SUMS 核验，GitHub 归档 digest 单独记录 |
| 本云端原始材料 | 忽略目录 artifacts/library/、artifacts/review-20261015/、artifacts/file-faults/、artifacts/codec-build/、artifacts/release-security/ 与 artifacts/independence/；原始日志、公开来源归档、同步收据不会随 clone 下载 |
| 私有 EBU | 执行 `python3 references/ebu-loudness-test-set-v5/prepare.py` 还原/核验；公开源码归档排除原始素材，强制门禁缺素材必须失败 |

先检查目录、分支、远程提交与未提交修改。PR #1、preview.34 的 PR #2 均已合入 `recorder/dev`；从默认分支继续开发，并核对顶部合并与 CI 身份。保留本地后续提交；默认分支干净且无本地分叉时才执行 `git switch recorder/dev`
和 `git pull --ff-only origin recorder/dev`。有分叉保留两边历史，不 reset 覆盖。
仅更新文档检查链接/diff；依赖、音频或构建变化时重新取得相应实际门禁。

下一工作顺序（按用户最新方向更新）：

1. UI88-00～08 的 A/B/C 批已完成本地实现和检查，按 89 收尾 UI88-09：固定 clean 提交、新 Windows/Linux CI、证据/文档及待验清单。不要重新执行已完成的基线/规划，不把 preview.34 CI 计入新版本。继续收集 Windows 视觉与回听反馈；不扩展连播、歌单、拖动排序或批量任务。R83-09/10、组件安全/微软及 GPL 系统库分发条款仍单列。
2. Windows 实机到位，按 76 的 WIN/FLOW/DEV/METER 跑三分钟视频、真实采集、录音/回听/缓存/选区/导出、96 kHz、长测与 GPU/DPI。
3. 发布门禁关闭后处理签名、下载首次启动、独立用户和邀请测试。当前附件保持私有工程候选身份。

维护 FFT 时同步来源/hash/许可及数值对照；图标输出保持 build/trace-icons/。
WAV 路由与 AAC 帧范围修复不更改 Meter v5；原始 EBU 强制范围仍为 68 个适用
单/双声道文件，两个多声道不计入通过分母。

## 历史云端发布准备（独立化之前）

用户授权完成可独立执行的发布准备并提交本地 Git。交付见 [75](75-CLOUD-RELEASE-PREPARATION.md)，下一环境门禁见 [76](76-RELEASE-CHECKLIST.md)。

- 新增 Trace CI（recorder/dev）与候选附件工作流；证据绑定提交、Windows/native、EXE/ASAR 和 ZIP 内容。工作流随本次 GitHub 同步提交；远程运行结果需按实际提交 SHA 查询，不复用为本地或实机通过证据。
- 打包运行库改为发现 VS2022/x64 CRT，保留实际版本/hash，去掉固定开发机路径。
- 退出超时等待最多 250 ms 诊断写入，超时不被迟来的正常退出覆盖；真实 before-quit 编排及重启反例通过。
- 3D 投影游标三角与 2 CSS px 标记完成，实机 WebGL/DPI 尚未验。
- 修补兼容依赖，npm 公告受影响包 31→15（14 high/1 critical）。锁定 Electron/打包原生链升级需 Windows 复验，正式发布仍阻塞；生产依赖审计 0 不代表 Electron 运行时安全。
- preview.31 八页 PDF 与插图更新；插图使用当前 React + 模拟 IPC/读数，明确标注来源，保留旧 PDF/包身份。

## 上一轮代码修复

[73](73-CLOUD-CODE-REVIEW.md) 的五项问题与两项已有缺口已在 `2995174` 修复：

- selector 跨快照复用相等输出，避免顶栏随音频快照重渲染。
- 导出保存并继承原采集完整性；旧导出通过元数据追溯，缺失/循环来源为 unknown。
- 固定内存缓存及选区保存携带按帧质量；ReplayFreeze v3 / quality v1，保存、重载、回听和报告保留 estimated/gaps/unknown。
- 报告事件跳转释放输出并恢复原监听意图，保持静默定位。
- 录音/缓存准备失败统一恢复后台服务，包括另存；退出、维护、活动录音状态保持暂停。
- 显示估计静音/未知完整性提示；主题首帧缺失 paint 不再被计为通过。

上述修复当时保持 Session v2、Request v1、Meter v4、磁盘分析缓存 key v3；新增质量字段向旧记录兼容。本次 EBU 修复升级 Meter v5，其余协议版本保持。具体类型与边界见 [03](03-AUDIO-METERING.md)、[04](04-DATA-FORMATS.md)、[05](05-UI-UX.md)、[06](06-CONTRACTS.md)。

## 历史检查范围（独立化之前）

75 发布准备阶段的云端检查：typecheck、portable **243/243（50 文件，0 fail/skip）**、build:trace 通过；当时六项可移植 C++ CTest 在 ASan/UBSan 下 6/6；真实 React selector 和模拟 IPC 的五主题/质量/读数/键盘/取消恢复通过。新增两份工作流 actionlint 通过；PDF 8 页/8 书签/4 链接、字体/文字/页面边界与渲染通过。当前依赖公告记录绑定锁文件，见 [security-baseline](release/security-baseline.json)。本次 v5 的检查见下节，不复用旧结果。

`2995174` 提交前云端最终检查：`npm run typecheck`、`npm run test:trace` **233/233（47 文件，0 fail/skip）**、`npm run build:trace` 通过。真实 React + Chromium 订阅专项中，相同 30 次快照的额外 render 为 0，props/值变化仍更新；新增可移植 C++ ReplayQuality 10 cases 通过。业务回归含真实 DeliveryService 失败后另存、保存→重载→回听→报告质量链路。审计阶段其他 C++ 数值检查与具体证据见 73；本地日志在忽略目录 `artifacts/cloud-audit/`、`artifacts/cloud-regression/`。

该历史修复阶段尚未执行 Windows 全量 CTest/native、WAV 写盘质量日志及真实设备资源验收；未运行完整主题 flow、真实首帧、YouTube 三分钟、物理拔插/96 kHz、磁盘拥塞、GPU/DPI、退出看门狗实机故障收尾或 preview.31 分发包。新增按帧质量环每对象最高约 5.49 MiB，需要实机资源检查。历史 Windows 通过记录仅适用于各自的源码和包。

## 上一轮文档整理（已提交推送）

已按用户要求盘点所有受版本控制的说明文档，清理兼容入口 `TRACE-README.md`、开工包自检 15 和已被后续提交替代的临时交接 65；保留来源、许可、阶段设计/数值证据及发布校验。重写开发入口/环境/当前接口，勘误分支、版本、提交时态和过度的性能验收结论，建立文档索引。清理范围与检查结果见 [74](74-DOCUMENTATION-CLEANUP.md)，由 `37cd0ef` 提交并与 `2995174` 一起推送；当时未构建新包。

## 历史 EBU 素材取得、修复与同步

### 2026-10-03 EBU 素材到位

按用户要求将此前下载的 EBU Loudness Test Set v5.0 原始 ZIP 的全部数据、五份官方 PDF、版本/来源说明和 SHA-256 清单保存到私有仓库的 [references/ebu-loudness-test-set-v5](../references/ebu-loudness-test-set-v5/README.md)，在 `recorder/dev` 提交并推送。常规 Git 上传返回 401，GitHub Blob API 单文件上传返回大小限制（422），因此 ZIP 以 11 个最多 8 MiB 的分块受普通 Git 版本控制，不需要 Git LFS。其他获授权云端 Codex 可直接 pull 后执行 `python3 references/ebu-loudness-test-set-v5/prepare.py`，离线校验、还原并解压。还原 ZIP 为 91,631,421 字节，含 70 个 WAV；ZIP 和解压副本留在忽略的 `artifacts/` 下。

此次验证为 ZIP/PDF SHA-256、ZIP CRC、70 个 WAV 与库存清单一致及仓库解压路径；未运行应用构建、计量/原生测试或 Windows 实机验收。素材下载阻塞已解除，但 M3/A08 的适用原始素材数值门禁仍开放。现有 `test:lufsmeter-ebu` 只测上游 Prism addon 的 TP 15–23，不等于 Trace 引擎全部 M/S/I/LRA/TP 验收。下一会话可使用原始素材建立 Trace 引擎的数值证据，不应把“素材取得”记为“EBU 合规通过”。

素材仅限私有内部研发测试，保留 EBU 原始条款，不随应用包或公开 Release 分发。本次没有调整音频算法、产品版本或构建配置。

### 2026-10-03 本会话复验

已按用户命令切换 recorder/dev 并尝试 `git pull --ff-only`；本地 `2e26689` 与远程 `9c53e4a` 分叉，因此保留两边并完成本地合并 `b83c9bd`，解决 07/13 文档冲突。`prepare.py` 已成功运行，独立 Gentoo Manifest 的大小/SHA-512/BLAKE2b 也全部匹配。详细证据见 [77](77-EBU-MIRROR-VALIDATION.md)。

使用真实 Trace Meter 的 Linux Release 探针测试原始 WAV：68 个适用文件中 51 通过、17 失败，2 个多声道排除。112 项数值断言中 32 项失败，均为 3341 case 13/14 的 Max M 低读约 0.216–0.451 LU；两种输入分块的全部读数一致、EOF 帧数正确（136 项通过）。TP 15–23、两份节目的 I/LRA 与其余适用数值通过。同一底层库每 10 ms 查询 M 的独立诊断通过，指向 Trace 每 100 ms 查询 M 时漏过偏移窗口最大值。未改计量算法，不能记为 EBU 合规通过。新增 export-ignore 并实际检查源码归档排除内部素材；本轮未推送。

上述失败是修复前的基线；原始 WAV runner 与 Max M 修复已在下节完成。77 的材料核验只包含 Meter，未验 addon/WavReader/UI/WASAPI。

### 2026-10-03 Meter v5 修复与重新校准

用户要求持续修复到通过率超过 99%。保持既有单/双声道范围，真实 Meter 每 10 ms 查询完整响度，并将 FILE 缓存、精确历史定位、报告最大值同步到同一密集索引；原始 PCM、libebur128、参考值与容差没有调整。结果与复现入口见 [78](78-EBU-METER-RECALIBRATION.md)。

- 原始素材 Release：**68/68 适用 WAV 通过（100%）**，112/112 数值、204/204 两种分块/真实 EOF/实际索引一致性断言通过。原来的 17 个失败文件已修复。70 个原始 WAV 均验证完整性；其中两个 5.0/5.1 文件仍超出产品范围，适用覆盖率为 68/70，不能把它们算作通过。
- 计量配置 `trace-meter-v5-ebur128-1.2.6-lra10hz-msi100hz-tpaligned`；schema=1/key v3 保持，通过配置身份及 native hash 重建旧缓存，拒绝伪装成 v5 的旧 stride=10 缓存。源码仍 preview.31，未生成新 Windows 包。
- 60 s 密集响度环保留 6000 点并在初始化时一次分配；LIVE/Replay 显示最多 600 点并保留桶内短缺口 flags。每 Meter 增加约 0.33 MiB，Windows 资源与回调 deadline 尚未验证。
- 新增 85 项原生 cadence 检查已在 Release 与 ASan/UBSan 下通过；覆盖四种采样率、全部起点偏移、连续 Max M、逐读数分块一致、部分 EOF、重复定位与历史容量。辅助独立参考 18/18 通过；LRA 参考观察器改为实际 100 ms 帧号，保留原信号、分位数计算及原容差。
- 应用 typecheck、portable **246/246（51 文件，0 fail/skip）**、build:trace 通过；新增真实 AnalysisCache/buildReport 回归验证密集缓存的两页定位、中间峰值与旧缓存拒绝。两份工作流 actionlint 通过。
- 最终 ASan/UBSan 原始素材复跑通过（712.00 s），68/68 文件、112/112 数值、204/204 一致性断言通过。原生七项生成信号 CTest 已在最终修复下通过；八项门禁全部完成通过证据来自七项通过加一项成功复跑，不能写成一次整轮 8/8。初次旧 LRA 观察器失败和探针重构漏返回值的失败日志均保留。
- 最终单进程 Release 基准处理 30 s 双声道 PCM，四种采样率耗时约 0.80/0.87/1.63/1.69 s；只验证云端计量核心，不能作为 Windows 应用 CPU/deadline 证据。实际源码归档排除私有素材，缺素材时不注册原始 gate，强制模式正确失败；79 份 Markdown 本地链接无缺失。

原始 WAV runner 已接入 Linux/Windows CTest：私有 checkout 为 8 项 portable / 18 项 Windows 原生测试，CI 强制取得素材；公开源码归档继续排除私有 EBU 数据。Linux 使用明确标识的测试 PCM 解码器；Windows gate 已接入真实 WavReader 和 Unicode 路径入口，但本轮未运行 Windows。云端证据在忽略目录 `artifacts/ebu-recalibration/`；旧失败基线仍在 77 的目录。最终提交后的 clean Release 原始素材报告绑定实际 commit 与源码 hash。

### 2026-10-03 文档更新与 GitHub 同步

用户授权更新文档并将今天的修改推送至 GitHub。最终 Release 原始素材门禁在干净提交 `f42aba71d69d3ecd55346b0df071a4d81b0930ba` 上再次通过（80.25 s）：68/68 文件、112/112 数值、204/204 一致性断言；报告确认 sourceDirty=false，且 Release/ASan/UBSan 的全部计量测试源码 hash 与当前文件一致。证据副本在 `artifacts/ebu-recalibration/ebu-wav-committed.json`，原始报告在 `build/ebu-validation/ebu-wav-results.json`。后续仅文档更新不算新一轮音频测试。

Git HTTPS 上传缺少可用凭据，接入已登录的 GitHub CLI 后仍返回 HTTP 401；GitHub Git Data API 的实际 blob 上传已验证可用。此次同步使用该 API 校验每个 blob/tree/commit 的 SHA，保留本地提交身份、双亲合并与素材历史；不强制覆盖远程分支。推送完成后核对远程分支 HEAD 与本地 HEAD 一致。远程 Actions 与 Windows 实机验收仍按各自证据范围记录。

## 后续应用与实机工作

Windows 工程编译、19 项 CTest、64 项原生/媒体、272 项 JS、无声卡包审计/加载/重启与最新 preview.31 私有候选已经通过本节顶部对应 CI，不需要以“尚未执行 Windows”重做这些记录。实际 Windows 设备上继续执行主题 flow 和严格首帧，再播放约三分钟在线视频，交叉操作监听/录音/回听/报告跳转/缓存及选区保存，保留设备与包身份。

待实机验收：实时采集及真实文件缓存/选区/导出完整链路、96 kHz/驱动矩阵、干净普通 Windows、物理 GPU/混合 DPI、实时帧时间与回调 deadline、长录音及看门狗故障收尾、3D 游标与色弱用户体验。工程原始 EBU WAV 与无声卡启动通过，不等于完整 EBU Mode 或物理设备/发布验收。完整 npm 公告已归零；自建 FFmpeg 来源已核验；正式发布还需组件安全与微软/GPL 系统库条款复核、签名及独立用户验收。PB3–PB5 见 [59](59-PUBLIC-BETA-READINESS.md)；Mac 下一步仍须 Apple silicon 真机执行 [70](70-MACOS-PORT-PLAN.md) 的 M-MAC0/T00 探针。
