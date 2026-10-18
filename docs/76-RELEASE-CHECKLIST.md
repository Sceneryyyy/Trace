# 76 · Trace Windows 发布验收清单

2026-10-18 更新。本清单维护当前发布门禁；已生成的私有工程候选仍为 preview.31（`2aee519`），当前源码 preview.35 尚未生成新候选；历史 preview.30 / InternalTest-r3 保持原交付身份。支持范围先限定 Windows x64、单/双声道。macOS 单列 [70](70-MACOS-PORT-PLAN.md)。候选附件内清单为生成时的阶段快照，最终提交/CI/门禁状态见 [13](13-HANDOFF.md) 与 [81](81-SELF-BUILT-FFMPEG.md)；独立化证据见 [79](79-TRACE-INDEPENDENT-PROJECT.md)，先前云端记录见 [75](archive/iterations/75-CLOUD-RELEASE-PREPARATION.md)。

## 当前源码与下一候选的证据边界

preview.35 的源码 `3e665d9` / [CI 39035516698](https://github.com/Sceneryyyy/Trace/actions/runs/39035516698) 已完成完整双平台门禁，见 [89](89-FRONTEND-SIMPLIFICATION-ITERATION.md) 与 [frontend-verification.json](release/frontend-verification.json)。2026-10-18，PR #3 已合入 `recorder/dev`（`4d1fc0b`）；下述 preview.31 包审计/加载与附件不能作为 preview.35 分发证明。

下一候选需在选定的实际来源/ref 上重新生成，绑定同次 CI/run/attempt，重跑包审计与加载/重启，并配套该版本的说明、截图/PDF、manifest 和校验值。现有 PDF 仍为 preview.31，不能仅改名作为 preview.35 手册。以下表中“已通过”的云端项目只覆盖各处注明的来源，实机项目保持待验。

## 工程候选生成

核对选定来源已包含目标代码后（当前默认 `recorder/dev` 已含 preview.35），在该 ref 上手动执行 **Trace Candidate**，或在 Trace CI 手动勾选 `package_candidate`。它调用 Trace CI：Linux 与 Windows 并行检查；Windows 独立准备 Trace SDK/诊断、构建引擎并执行 CTest/native。生成候选前，脚本核对本次 run、提交及 attempt 的 Linux job 完整成功，然后打包、审计与验证包内运行库加载/主题重启。

本地 Windows 等价入口（锁定 VS2022/SDK/MSYS2 Bash、CMake/Python 已准备，见 81，干净 checkout）：

```powershell
.\Trace.ps1 -Action Setup
node tools/release/verify.cjs
node tools/package-trace.cjs
node tools/m6/package-audit.cjs
node tools/release/package-load-smoke.cjs
node tools/release/candidate.cjs
```

候选输出在 `dist-trace/candidate`；该目录必须为空才能生成，工具拒绝覆盖已有候选。若 VC143 CRT 不在可发现的 VS2022 目录，可将 TRACE_VC_REDIST_DIR 指向已核验的 x64 CRT 目录。记录实际选择的版本与 hash，不能把不同 DLL 当成旧机器已经验证的那一份。

候选包内 manifest 的 `engineering-candidate` 与 `signed:false` 保持真实身份。Actions runner 的包加载检查不要求声卡，不能替代原有 `tools/m6/package-smoke.cjs` 的音频流程或下面的实机门禁。

[10 月 4 日历史完整 CI](https://github.com/Sceneryyyy/Trace/actions/runs/37217397928)（`f33d74d`）已成功：Windows CTest 19/19、原生/媒体 52/52、两端 JS 263/263、Linux ASan/UBSan 核心 8 + 原始 EBU 1、实际浏览器、类型/构建、安全门禁，以及 ZIP、5 项包审计、加载/重启、clean-checkout 与最终候选上传通过。历史依赖修复见 [80](archive/iterations/80-RELEASE-DEPENDENCY-HARDENING.md)，本次自建与试构建失败见 [81](81-SELF-BUILT-FFMPEG.md)。

私有 [trace-windows-candidate](https://github.com/Sceneryyyy/Trace/actions/runs/37217397928/artifacts/11309181720)，ID `11309181720`，归档 `173879193` 字节，创建于 `2026-10-04T16:50:33Z`。GitHub 附件归档 SHA-256 `a5afb238df3664fa1c36e2a711a57d3d10e46fdabe7bc4c18f17e0a8767a180e`；它不是内含应用 ZIP/JSON 的 hash。本地读取了完成日志和元数据，未读取附件 payload；完整证据见 [自建验证记录](release/codec-verification.json)。

本轮文件/故障修复及 source-map-js 1.2.2 已由 [完整 CI 38099859270](https://github.com/Sceneryyyy/Trace/actions/runs/38099859270)
复验（`2aee519`）：两端 JS 272/272、Windows 原生/媒体 64/64，Windows
CTest 19/19 与 Linux sanitizer 8 + 1、三格式、实际故障反例与新候选均通过。
最新私有附件 ID `11688230696`，身份与证据见 [13](13-HANDOFF.md)、
[82](archive/iterations/82-FILE-FAULT-TESTING.md) 与 [file-fault-verification.json](release/file-fault-verification.json)。
前述 f33d74d 候选保留为上一轮自建证据，不能视作包含本轮修复。

## 必须关闭的发布门禁

| 门禁 | 操作与预期 | 当前状态 |
| --- | --- | --- |
| SEC | 完整和生产 `npm audit` 必须均为零；新固定 SDK 重建引擎、CTest/native、三格式及新候选必须通过；继续核对 FFmpeg 静态组件/VC 安全来源 | npm 18→0，已加入实时强制门禁；固定工具链、原生、双 AAC 封装及新候选完整复验已通过，见 80，自建来源/输出已核验，见 81；FFmpeg/LAME 与 Microsoft 组件安全、分发条款复核继续单列 |
| WIN | 未装开发工具的 Windows 11 x64 普通用户；中文/空格路径、断网，解压→启动→选设备→录音→回听→三格式导出→重启 | CI 候选加载/重启通过；普通用户干净 Windows 与真实音频流程未运行 |
| DEV | 内置输出、USB 声卡，真实 44.1/48/96 kHz；拔插、默认设备变化、修改格式、设备占用与睡眠恢复 | 未验证矩阵；96 kHz 文件不算采集 |
| FLOW | 播放约三分钟 YouTube；交叉进行 REC、静默历史查看、停止后回听、报告跳转、缓存/选区保存、另存。按钮与监听状态一致，来源质量贯穿保存/重载/报告 | 未运行 |
| DATA | 至少两小时实际使用/录音，检查帧数与重开；以隔离目录注入空间不足/只读、慢盘/队列拥塞、worker/进程退出及重启恢复 | 云端实际文件/容量、ENOSPC、worker/缓存反例（82）、慢检查点背压与 journal 边界（84）、进程所有权及有界元数据/缓存保护（85）已通过；最新双平台回归见 89；真实两小时录音、满盘/慢盘/断电及设备恢复仍待实机 |
| QUIT | 真实录音/编码时退出；慢任务、worker 卡住、支持日志不可写等情况；看门狗退出后可恢复，文件尾部未知时不标完整 | 云端编排/持久化与退出/取消（82）、监督进程强杀/拥有进程硬退出/进程树回收（84）、主进程 Job Object 约束文件/报告 worker 与旧 WAV 后处理（85）已通过；最新双平台回归见 89；真实录音/设备/断电后的收尾与恢复听辨仍待实机 |
| METER | 取得官方 EBU 原始素材并保留来源/hash；通过响度/LRA/TP 容差；跨率、实时/文件/选区/导出范围一致，EOF 不增加音频帧 | [78](archive/iterations/78-EBU-METER-RECALIBRATION.md)/[79](79-TRACE-INDEPENDENT-PROJECT.md)：Meter v5 的 68/68 适用 WAV、Windows 实际文件读取与原生文件分析已工程通过；真实设备/实时/选区/导出全链路待验 |
| GPU | 核显/普通独显，3D 故障降级与恢复；真实混合 DPI 跨屏；五主题冷启动/恢复的实际 paint、实时帧时间及资源增长 | 主题/显示及 preview.35 的 11 组前端、60 组合本地布局边界检查通过（89）；这些是模拟 IPC/浏览器几何检查，物理 GPU/系统 DPI 与实机 paint/帧时间仍未验证 |
| UX | 建议至少五名未参与开发的用户，无口头指导完成录音导出、保存缓存、布局、范围报告和 A/B；检查统计/来源/删除范围误判 | 未运行；人数是建议指标 |
| DIST | 签名、实际浏览器下载后的首次启动、手动升级/回退、配置迁移；版本下载页、SHA256、已知限制与反馈入口 | 未签名；公开分发未生成 |
| SRC | 下载处提供匹配程序的 Trace 项目源码及必要构建资料；核对 FFmpeg GPL/version3 静态构建和启用依赖的对应源码/许可 | 自建源码工程门禁已通过：匹配的项目脚本/锁、两份官方媒体源码、实际报告/配置/系统输入清单均附带；Microsoft 系统库例外与条款的分发复核仍单列，见 81 |
| BETA | 建议 10–20 人、约一周邀请测试；按问题单复验，没有未解决的丢音/损坏、静默测量错误或启动失败 | 尚未开展；按覆盖结果放行 |

## 每项证据应保留

提交 SHA、程序/ZIP SHA256、实际版本、Windows build、CPU/GPU/DPI、设备型号/驱动/mix format、素材来源/hash、步骤/命令、帧数/文件头/时长、预期/实际、通过/失败/未运行及原因。诊断和录音留在隔离目录；不把个人音频、私有路径或凭据提交源码。

自动 PASS 仅覆盖实际执行的检查。生成信号、虚拟设备、无声卡的包启动、旧版本包及未取得 paint 的记录不能代替对应实机门禁。短流程也不能替代两小时真实使用。

## 手动更新与回退说明

先停止录音，等待成品/另存完成并正常退出，再将新包解压到新目录；保留旧包与一份用户数据备份。在隔离配置验证新版读取旧记录及旧版回退后，才宣传兼容。记录 preview.26 及更早版本缺少单实例保护，避免与新版共用数据并发运行。

正式发布时，将本表每项绑定唯一候选的证据；未支持的范围从支持声明移除，不能将尚待验证写成“已保证”。本轮不以候选附件或云端测试数目自动放行。
