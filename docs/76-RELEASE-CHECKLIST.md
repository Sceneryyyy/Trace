# 76 · Trace Windows 发布验收清单

2026-10-03。本清单适用于 preview.31 私有工程候选；历史 preview.30 / InternalTest-r3 保持原交付身份。支持范围先限定 Windows x64、单/双声道。macOS 单列 [70](70-MACOS-PORT-PLAN.md)。候选附件内清单为生成时的阶段快照，最终提交/CI/门禁状态见 [13](13-HANDOFF.md) 与 [80](80-RELEASE-DEPENDENCY-HARDENING.md)；独立化证据见 [79](79-TRACE-INDEPENDENT-PROJECT.md)，先前云端记录见 [75](75-CLOUD-RELEASE-PREPARATION.md)。

## 工程候选生成

选择 `recorder/dev` 手动执行 **Trace Candidate**，或在 Trace CI 手动勾选 `package_candidate`。它调用 Trace CI：Linux 与 Windows 并行检查；Windows 独立准备 Trace SDK/诊断、构建引擎并执行 CTest/native。生成候选前，脚本核对本次 run、提交及 attempt 的 Linux job 完整成功，然后打包、审计与验证包内运行库加载/主题重启。

本地 Windows 等价入口（VS2022/CMake/Python 已准备，干净 checkout）：

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

升级前的 [完整 CI](https://github.com/Sceneryyyy/Trace/actions/runs/37104992986)（`db005b5`）已成功：Windows CTest 19/19、实际 Trace 原生/FFmpeg 43/43、两端 portable JS 248/248、Linux ASan/UBSan 核心 8 项与原始 EBU 1 项、浏览器回归、类型与应用构建全部通过；ZIP、五项包审计、包加载/重启及最终私有候选附件也已完成。后续工具链与 codec 必须用新 CI 复验，见 80。历史图标清洁检查失败及修复证据见 [79](79-TRACE-INDEPENDENT-PROJECT.md)。

GitHub 私有附件 `trace-windows-candidate` 的 ID 为 `11267953983`，大小 `212794813` 字节，创建于 `2026-10-03 07:25:32 UTC`；GitHub 所报附件归档 SHA-256 为 `bc7b385c33aa9a81c4fd1537a707089a7265950a4f7892b69688a2771e4bf658`。这是 Actions 附件归档身份，不能当成包内 ZIP 或 manifest 的 hash。云端代理对附件存储目的地返回 403，本地未下载或读取附件内部文件；工作流日志与 GitHub 元数据已确认生成及验证成功，记录见 [独立工程验证清单](release/independence-verification.json)。

## 必须关闭的发布门禁

| 门禁 | 操作与预期 | 当前状态 |
| --- | --- | --- |
| SEC | 完整和生产 `npm audit` 必须均为零；新固定 SDK 重建引擎、CTest/native、三格式及新候选必须通过；继续核对 FFmpeg 静态组件/VC 安全来源 | npm 18→0，已加入实时强制门禁；固定工具链完整复验见 80，静态 FFmpeg 依赖精确来源/安全核查仍阻塞 |
| WIN | 未装开发工具的 Windows 11 x64 普通用户；中文/空格路径、断网，解压→启动→选设备→录音→回听→三格式导出→重启 | CI 候选加载/重启通过；普通用户干净 Windows 与真实音频流程未运行 |
| DEV | 内置输出、USB 声卡，真实 44.1/48/96 kHz；拔插、默认设备变化、修改格式、设备占用与睡眠恢复 | 未验证矩阵；96 kHz 文件不算采集 |
| FLOW | 播放约三分钟 YouTube；交叉进行 REC、静默历史查看、停止后回听、报告跳转、缓存/选区保存、另存。按钮与监听状态一致，来源质量贯穿保存/重载/报告 | 未运行 |
| DATA | 至少两小时实际使用/录音，检查帧数与重开；以隔离目录注入空间不足/只读、慢盘/队列拥塞、worker/进程退出及重启恢复 | 未运行最新实机长测 |
| QUIT | 真实录音/编码时退出；慢任务、worker 卡住、支持日志不可写等情况；看门狗退出后可恢复，文件尾部未知时不标完整 | 云端编排/持久化反例通过；实机收尾未验 |
| METER | 取得官方 EBU 原始素材并保留来源/hash；通过响度/LRA/TP 容差；跨率、实时/文件/选区/导出范围一致，EOF 不增加音频帧 | [78](78-EBU-METER-RECALIBRATION.md)/[79](79-TRACE-INDEPENDENT-PROJECT.md)：Meter v5 的 68/68 适用 WAV、Windows 实际文件读取与原生文件分析已工程通过；真实设备/实时/选区/导出全链路待验 |
| GPU | 核显/普通独显，3D 故障降级与恢复；真实混合 DPI 跨屏；五主题冷启动/恢复的实际 paint、实时帧时间及资源增长 | 云端显示回归通过；物理验证缺失 |
| UX | 建议至少五名未参与开发的用户，无口头指导完成录音导出、保存缓存、布局、范围报告和 A/B；检查统计/来源/删除范围误判 | 未运行；人数是建议指标 |
| DIST | 签名、实际浏览器下载后的首次启动、手动升级/回退、配置迁移；版本下载页、SHA256、已知限制与反馈入口 | 未签名；公开分发未生成 |
| SRC | 下载处提供匹配程序的 Trace 项目源码及必要构建资料；核对 FFmpeg GPL/version3 静态构建和启用依赖的对应源码/许可 | 项目归档、FFmpeg 9.0.2 主源码、LAME 3.100 官方源码/许可和 37 条发布者版本记录已核验；八项基础库版本、完整传递来源/补丁/构建资料仍缺失，完整对应源码门禁未关闭 |
| BETA | 建议 10–20 人、约一周邀请测试；按问题单复验，没有未解决的丢音/损坏、静默测量错误或启动失败 | 尚未开展；按覆盖结果放行 |

## 每项证据应保留

提交 SHA、程序/ZIP SHA256、实际版本、Windows build、CPU/GPU/DPI、设备型号/驱动/mix format、素材来源/hash、步骤/命令、帧数/文件头/时长、预期/实际、通过/失败/未运行及原因。诊断和录音留在隔离目录；不把个人音频、私有路径或凭据提交源码。

自动 PASS 仅覆盖实际执行的检查。生成信号、虚拟设备、无声卡的包启动、旧版本包及未取得 paint 的记录不能代替对应实机门禁。短流程也不能替代两小时真实使用。

## 手动更新与回退说明

先停止录音，等待成品/另存完成并正常退出，再将新包解压到新目录；保留旧包与一份用户数据备份。在隔离配置验证新版读取旧记录及旧版回退后，才宣传兼容。记录 preview.26 及更早版本缺少单实例保护，避免与新版共用数据并发运行。

正式发布时，将本表每项绑定唯一候选的证据；未支持的范围从支持声明移除，不能将尚待验证写成“已保证”。本轮不以候选附件或云端测试数目自动放行。
