# 07 · 当前任务单

更新：2026-10-18。本页仅保留待办与最近结项摘要；当前源码/分支/验证身份见 [13](13-HANDOFF.md)。原任务 ID、M0–M13 和阶段过程已保存为[归档快照](archive/snapshots/07-BACKLOG-before-archive-20261018.md)。

## 尚待推进

| 范围 | 下一动作与边界 |
| --- | --- |
| Windows / 用户复验 | 按 [76](76-RELEASE-CHECKLIST.md) 验真实采集/回听/快速切换与监测恢复、三分钟视频、96 kHz、长录音、慢盘/满盘/断电/设备恢复、GPU/系统 DPI/对话框及独立用户 |
| 下一工程候选/发布 | 目标来源重建包、匹配手册/PDF、包审计/加载、manifest/校验；签名、首次下载、升级/回退与邀请测试。旧 preview.31 候选不能代替新源码包 |
| 组件安全与分发条款 | FFmpeg/LAME、Microsoft 组件安全/系统库例外及 GPL 分发条款复核；npm 零公告不代替这些项 |
| macOS | 已选方案一但尚未实现；有 Apple silicon 真机后按 [70](70-MACOS-PORT-PLAN.md) 的 M-MAC0/T00 验 tap/权限/时钟 |
| R83-09 / P2 | 批量 QC/报告及任务预设，尚未排期；REC 优先、有界任务、不自动修改音频 |
| R83-10 / P2 | 按应用录音与 Mac 各自独立评估；不得自动扩展当前 Windows 后端或替代 Mac 探针 |

## 最近已结项

| 工作票 | 状态 / 按需证据 |
| --- | --- |
| UI88-00～09 | preview.35 云端实现及完整双平台 CI 完成，PR #3 已合入（`4d1fc0b`）；[89](89-FRONTEND-SIMPLIFICATION-ITERATION.md) |
| L86-01～03 | preview.34 录音列表云端完成、PR #2 已合入；[阶段记录](archive/iterations/87-RECORDING-LIBRARY-ITERATION.md) |
| R83-01～08 | P0/P1 云端完成，含资源/故障/FFT/复核；[阶段记录](archive/iterations/84-P0-P1-CLOUD-ITERATION.md) |
| 本轮文档 | 全量复核与归档/默认阅读精简完成；[归档索引](archive/README.md)；文档提交 `1ec9585` 已随 PR #3 合入，合并状态已同步 |

已结项功能不因记录归档而撤销；真实硬件/发布缺口按上表继续跟踪。后续新增工作先按用户方向更新本表，不自动启动 P2、自动连播、歌单或批量能力。
