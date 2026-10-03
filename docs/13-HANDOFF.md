# 13 · 当前状态与下一会话

更新：2026-10-03。默认开发分支 `recorder/dev`；源码仓库根为当前 checkout（本次云端 `/workspace/Trace`）。项目规则见 [AGENTS.md](../AGENTS.md)，全部资料见 [文档索引](README.md)。早期会话已移至 [交接历史](archive/13-HANDOFF-HISTORY.md)，其“下一步”和当时分支状态不代表当前待办。

## 源码与分发身份

| 项目 | 当前记录 |
| --- | --- |
| 源码 | `0.1.0-preview.31`；计量配置已升级 Meter v5，EBU 修复见 [78](78-EBU-METER-RECALIBRATION.md)；云端发布准备见 [75](75-CLOUD-RELEASE-PREPARATION.md) |
| Git | `Sceneryyyy/Trace`，默认 `recorder/dev`；保留提交身份及合并历史。工程独立化 `a986a0d`，下载/CI 修复 `ab466d8`，图标产物修复 `db005b5`；最后文档提交不算新音频测试，远程身份以 Git 为准 |
| 仪表主题 | 实现 `2938c8e`、审计修复 `c67e9e9` 等已于 2026-09-30 合入 `recorder/dev`；用户已验收开发构建并接受 71-D5 差异 |
| 当前工程候选 | Windows x64 preview.31，来源 `db005b5`；[CI 37104992986](https://github.com/Sceneryyyy/Trace/actions/runs/37104992986) 全部成功，私有附件 `trace-windows-candidate` 已生成，未签名 |
| 历史同事内测包 | Windows x64 preview.30 / InternalTest-r3，来源 `9c1ee21`，包名/校验见 [69](69-INTERNAL-TEST-R3.md) |
| preview.31 分发 | 私有工程候选含当前应用、项目源码、PDF、校验及验证记录；无声卡 CI 加载/重启已通过。PDF 插图为云端模拟界面，实机/公开发布门禁仍开放；preview.28 PDF 和 R3 为历史快照 |
| macOS | [70](70-MACOS-PORT-PLAN.md) 方案已记录；当前分支的 Trace 后端仍为 Windows/WASAPI，Mac 实现/实机验收未完成 |

## 当前：工程独立化已完成

后续云端发布依赖收尾已启动，见 [80](80-RELEASE-DEPENDENCY-HARDENING.md)：
当前源码锁定 Electron/SDK 42.11.10、builder 26.15.3、node-gyp 13.1.0 与
下载器 5.1.0，完整 npm 公告 18→0；FFmpeg 锁定 Gyan 9.0.2 并附已核验
主源码和 LAME 3.100 源码/许可；37 条发布者版本记录已归档，八项基础库版本、
完整传递来源/补丁/构建资料仍缺失。第一轮新 CI 发现并修复 WAV 探测与 AAC
有效帧范围问题，本地 JS 254/254、生产三格式及 AAC 双封装回归通过；新的
Windows/native/候选 CI 正在准备，
下方 `db005b5` 与 `eae33e5` 是独立化旧工具链的通过/交付身份。

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

工程独立化目标已达成。正式发布、物理设备/96 kHz、三分钟在线视频操作、长测/GPU/DPI、签名、安全修复、FFmpeg 对应源码及用户验收按 [76](76-RELEASE-CHECKLIST.md) 继续跟踪。本节是当前状态，下方阶段记录只保留当时证据。

## 下一会话接力

独立化实现、两次 CI 修复及验证文档已随 `eae33e592ae9d57bf5b6f2dfa4bf1faac7554fe1` 交付到 GitHub `recorder/dev`，当时已核对本地 HEAD、远程跟踪分支及 GitHub 分支完全一致，工作区干净。本次接力补充只更新文档；后续 checkout 的实际 HEAD 以 Git 为准。数值/Windows/候选验证仍绑定代码提交 `db005b5`，文档提交不改变候选身份，也不算新的音频测试。

| 接力材料 | 位置与用途 |
| --- | --- |
| 当前工程入口与复现 | [79](79-TRACE-INDEPENDENT-PROJECT.md)、[开发入门](../CODEX-START.md)、[Windows 环境](09-WINDOWS-SETUP.md)；当前工具链用 `toolchain.trace.json`，M0 清单是历史记录 |
| 可克隆的验证摘要 | [independence-verification.json](release/independence-verification.json)，包含源码/锁文件身份、测试范围、日志 SHA 和附件元数据 |
| 远程原始证据与候选 | 本节顶部的 Actions run 与私有附件；下载后按附件内 `manifest.json`、`SHA256SUMS.txt` 核对实际包，GitHub 归档 digest 单独记录 |
| 当前云工作区的完整本地证据 | 忽略目录 `artifacts/independence/`，包括 `ebu-wav-committed.json`、从零安装/本地原生日志、`ci-db005b-watch/` 完成日志；这些不会随 clone 下载 |
| 原始 EBU 素材 | 私有仓库 `references/ebu-loudness-test-set-v5/`；执行 `python3 references/ebu-loudness-test-set-v5/prepare.py` 离线还原并核验；公开归档不含素材 |

接力时先检查目录、分支与未提交修改；工作区干净且没有本地分叉时，再执行 `git switch recorder/dev` 和 `git pull --ff-only origin recorder/dev`。有分叉则保留两边历史，不能 reset 覆盖。按本次任务选择验证；仅更新文档检查链接与 diff，音频/构建/依赖有变化时重新运行对应门禁。

后续发布工作的顺序：

1. 只有云环境时，先处理 [安全基线](release/security-baseline.json) 的固定工具链公告和 FFmpeg 对应源码资料；依赖每次变更同步锁文件/SDK/清单，并重新取得同一源码提交的完整 CI 与候选证据。
2. Windows 实机到位后，按 76 的 WIN/FLOW/DEV/METER 复验三分钟在线视频、录音/回听/缓存/选区/导出及真实设备/96 kHz，再补长测、故障收尾、GPU/DPI 和资源记录。
3. 实机与依赖门禁关闭后，处理签名、下载后首次启动、独立用户和邀请测试，最后评估正式发布。preview.31 现有附件保持私有工程候选身份。

维护本地 FFT 时同步来源/hash/许可和独立数值对照；构建图标保持输出到 `build/trace-icons/`。旧 Prism 测试文本、退役工程及历史脚本保留追溯用途，当前默认构建和验收入口按 79 执行。

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

Windows 工程编译、19 项 CTest、43 项原生/FFmpeg、248 项 JS、无声卡包审计/加载/重启与 preview.31 私有候选已经通过本节顶部对应 CI，不需要以“尚未执行 Windows”重做这些记录。实际 Windows 设备上继续执行主题 flow 和严格首帧，再播放约三分钟在线视频，交叉操作监听/录音/回听/报告跳转/缓存及选区保存，保留设备与包身份。

待实机验收：实时采集及真实文件缓存/选区/导出完整链路、96 kHz/驱动矩阵、干净普通 Windows、物理 GPU/混合 DPI、实时帧时间与回调 deadline、长录音及看门狗故障收尾、3D 游标与色弱用户体验。工程原始 EBU WAV 与无声卡启动通过，不等于完整 EBU Mode 或物理设备/发布验收。正式发布还需处理 18 个受影响安全依赖、FFmpeg 对应源码、签名及独立用户验收。PB3–PB5 见 [59](59-PUBLIC-BETA-READINESS.md)；Mac 下一步仍须 Apple silicon 真机执行 [70](70-MACOS-PORT-PLAN.md) 的 M-MAC0/T00 探针。
