# 07 · 当前任务单

更新：2026-10-21。本页仅保留待办与最近结项摘要；当前源码/分支/验证身份见 [13](13-HANDOFF.md)。原任务 ID、M0–M13 和阶段过程已保存为[归档快照](archive/snapshots/07-BACKLOG-before-archive-20261018.md)。

## 尚待推进

| 范围 | 下一动作与边界 |
| --- | --- |
| Windows / 用户复验 | 2026-10-21 用户确认人工听感通过，其余待验交由用户验证，收到反馈再改；本轮收尾，heartbeat 保持暂停。2026-10-19 首轮短流程与 Realtek 48 kHz 连续两小时录音/帧数/重开/文件校验完成，345601871 帧，固定 0.259 秒估算静音保留；RME 真实 96 kHz 短采集通过，见 [94](94-WINDOWS-FIRST-RETEST.md)。[76](76-RELEASE-CHECKLIST.md) 的其余采样率/长测、物理故障、working set/GPU/DPI 等保持待验，旧中断/失败证据保留 |
| 下一工程候选/发布 | 目标来源重建包、匹配手册/PDF、包审计/加载、manifest/校验；签名、首次下载、升级/回退与邀请测试。旧 preview.31 候选不能代替新源码包 |
| 组件安全与分发条款 | FFmpeg/LAME、Microsoft 组件安全/系统库例外及 GPL 分发条款复核；npm 零公告不代替这些项 |
| macOS | 已选方案一但尚未实现；有 Apple silicon 真机后按 [70](70-MACOS-PORT-PLAN.md) 的 M-MAC0/T00 验 tap/权限/时钟 |
| R83-09 / P2 | 批量 QC/报告及任务预设，尚未排期；REC 优先、有界任务、不自动修改音频 |
| R83-10 / P2 | 按应用录音与 Mac 各自独立评估；不得自动扩展当前 Windows 后端或替代 Mac 探针 |

## 最近已结项

| 工作票 | 状态 / 按需证据 |
| --- | --- |
| 设备摘要 / 统一保存设置 | 2026-10-19：设备名/硬件/声道/精度直显，采样率与格式只读；录音与保存并入设置分类，单一应用/取消草稿；portable 334/334、前端浏览器 11 组及实际 Electron 三格式设置/布局/重启通过 |
| 统计复位按钮位置 | 2026-10-19：从底部右端移至“实时”右侧、监测按钮左侧；原行为及禁用条件保持，AppBuild/typecheck 与实际 Electron 1024/1280/1600 布局通过 |
| 录音库目录识别 | 2026-10-19：跳过无会话清单的普通 WAV/空文件夹及非 Trace 清单，保留损坏 Trace 提示；portable 334/334、实际 Electron 识别/载入/定位/静音回放通过，见 [93](93-RECORDING-DISCOVERY-FIX.md) |
| 频谱低频连续性 | 2026-10-19：修复空像素列误绘为图底的低频梳齿；保留原始 FFT、悬停、真实零功率与窄峰，portable 333/333、实际 Electron 100%/150% 显示专项通过，见 [92](92-SPECTRUM-CONTINUITY-FIX.md) |
| 本地声谱图移植 | 2026-10-19：将 9 月 30 日频率投影、数值色阶、3D 取景移植至 preview.35，保留 UI88 与概览/游标；工程检查及实际 Electron/WebGL 专项通过，实机用户复验待做，见 [91](91-SPECTROGRAM-PORT-PREVIEW35.md) |
| UI88-00～09 | preview.35 云端实现及完整双平台 CI 完成，PR #3 已合入（`4d1fc0b`）；[89](89-FRONTEND-SIMPLIFICATION-ITERATION.md) |
| L86-01～03 | preview.34 录音列表云端完成、PR #2 已合入；[阶段记录](archive/iterations/87-RECORDING-LIBRARY-ITERATION.md) |
| R83-01～08 | P0/P1 云端完成，含资源/故障/FFT/复核；[阶段记录](archive/iterations/84-P0-P1-CLOUD-ITERATION.md) |
| 本轮文档 | 全量复核与归档/默认阅读精简完成；[归档索引](archive/README.md)；文档提交 `1ec9585` 已随 PR #3 合入，合并状态已同步 |

已结项功能不因记录归档而撤销；真实硬件/发布缺口按上表继续跟踪。后续新增工作先按用户方向更新本表，不自动启动 P2、自动连播、歌单或批量能力。
