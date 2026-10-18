# Trace 文档归档索引

这里保存历史证据，**默认不读取**。当前状态/待办只看 [13](../13-HANDOFF.md) / [07](../07-BACKLOG.md)，现行规范按[任务阅读表](../README.md)选择。定位到具体问题、任务 ID、版本或旧包后，只读对应文件；不要递归展开本目录。

## 本轮归档与验证

2026-10-18 按用户要求归档与精简：71 份已完成阶段的计划/调研/实施/审计/分发说明迁入 `iterations/`，5 份精简前的现行文档存入 `snapshots/`。保留原编号、日期、失败、验收边界和上轮尚未提交的修订；正文只重写因迁移而改变的本地相对链接。原件/新位置及链接调整前后 SHA-256 见 [manifest.json](manifest.json)。

现行主目录由 89 份 Markdown 减至 18 份；默认开工从 AGENTS＋01/02/07/13 改为 AGENTS＋13/07，由 709 行 / 85221 UTF-8 字节降至 119 行 / 12512 字节，字节量减少 85.3%。这是文本体积测量，不是 tokenizer 实测 token 数。

迁移/链接/内容保全、机器 JSON/包依赖路径与 Git 空白检查结果记录在 manifest 的 `validation`；归档时未改产品代码、未重跑产品/音频/Windows/完整 CI；其后文档提交 `1ec9585` 已由 PR #3 合入 `recorder/dev`（`4d1fc0b`），当前交付状态见 [13](../13-HANDOFF.md)。上轮文档复核 90 与其 JSON 是归档前的 dated snapshot，里面的旧路径/计数按本 manifest 对照，不重写历史机器证据。

`docs/release/`、`docs/research/`、`docs/assets/`、`docs/distribution/` 与旧 PDF/第三方来源保持原位。它们是按需证据；保持路径可避免改动打包输入、哈希记录或来源身份。

## 精简前的完整现行文档

| 原文 | 完整快照 |
| --- | --- |
| `docs/01-PRODUCT.md` | [01-PRODUCT](snapshots/01-PRODUCT-before-archive-20261018.md) |
| `docs/02-ARCHITECTURE.md` | [02-ARCHITECTURE](snapshots/02-ARCHITECTURE-before-archive-20261018.md) |
| `docs/05-UI-UX.md` | [05-UI-UX](snapshots/05-UI-UX-before-archive-20261018.md) |
| `docs/07-BACKLOG.md` | [07-BACKLOG](snapshots/07-BACKLOG-before-archive-20261018.md) |
| `docs/13-HANDOFF.md` | [13-HANDOFF](snapshots/13-HANDOFF-before-archive-20261018.md) |

更早交接见 [13-HANDOFF-HISTORY.md](13-HANDOFF-HISTORY.md)。

## 阶段资料：按编号定位

| 范围 | 内容 |
| --- | --- |
| 10/12/14/16–27 | 初始对齐、开工模板、研究来源与 M0–M6 |
| 29–38 | 早期交互、评估与 M7–M12 结项计划 |
| 39–58 | 仪器/频谱/声场/声谱图/报告/导入/参考的设计及验收 |
| 59–69 | 公测评估、支持、品牌、手册、三轮旧内测包及独立审计 |
| 71–75、77–78、80、82–88、90 | 主题/云端/EBU/工具链阶段、调研、P0/P1、列表/前端旧规划、文档复核 |

| 编号/文档 | 用途按原文日期解释 |
| --- | --- |
| [10-VSTDEV-ALIGNMENT](iterations/10-VSTDEV-ALIGNMENT.md) | 10 · 与 VSTDev 的只读对齐 |
| [12-CODEX-PROMPTS](iterations/12-CODEX-PROMPTS.md) | 12 · Codex 工作指令 |
| [14-SOURCES](iterations/14-SOURCES.md) | 14 · 来源、核查范围与证据边界 |
| [16-M0-VALIDATION](iterations/16-M0-VALIDATION.md) | 16 · M0 Windows 底座与采集诊断 |
| [17-M1-VALIDATION](iterations/17-M1-VALIDATION.md) | 17 · M1 实时监测实现与门禁 |
| [18-MILESTONE-GATES](iterations/18-MILESTONE-GATES.md) | 18 · 里程碑最小门禁 |
| [19-M2-RECORDING](iterations/19-M2-RECORDING.md) | 19 · M2 连续录音实施记录 |
| [20-M3-FILE-ANALYSIS](iterations/20-M3-FILE-ANALYSIS.md) | 20 · M3 文件分析与确定性历史 |
| [21-M3-TP-TIMING](iterations/21-M3-TP-TIMING.md) | 21 · TP 历史时间归属与 v4 计量 |
| [22-M2-REGION-TIMELINE](iterations/22-M2-REGION-TIMELINE.md) | 22 · 设备重设续录：时钟与时间映射基础 |
| [23-M2-CONTINUATION](iterations/23-M2-CONTINUATION.md) | 23 · 同会话续录与录音快照一致性 |
| [24-M2-WAV-PRECISION](iterations/24-M2-WAV-PRECISION.md) | 24 · WAV 成品精度转换与削波报告 |
| [25-M4-PLAYBACK](iterations/25-M4-PLAYBACK.md) | 25 · 文件回放、呈现时钟与独立选区 |
| [26-M5-EXPORT](iterations/26-M5-EXPORT.md) | 26 · 三格式录音、导出与独立解码 |
| [27-M6-DESKTOP](iterations/27-M6-DESKTOP.md) | 27 · M6 桌面开发预览 |
| [29-PREVIEW2-FEEDBACK](iterations/29-PREVIEW2-FEEDBACK.md) | 29 · preview.2 人工反馈改进 |
| [30-PREVIEW3-INTERACTION](iterations/30-PREVIEW3-INTERACTION.md) | 30 · preview.3 缩放、界面精简与直接录音 |
| [31-PREVIEW4-WORKBENCH](iterations/31-PREVIEW4-WORKBENCH.md) | 31 · preview.4 统一工作台 |
| [32-PREVIEW8-SCRUB](iterations/32-PREVIEW8-SCRUB.md) | 32 · preview.8 历史游标连续呈现 |
| [33-BASELINE](iterations/33-BASELINE.md) | 33 · Trace preview.8 Git 基线 |
| [34-PRODUCT-REVIEW](iterations/34-PRODUCT-REVIEW.md) | 34 · Trace preview.8 产品功能与易用性复核 |
| [35-ITERATION-ACCEPTANCE](iterations/35-ITERATION-ACCEPTANCE.md) | 35 · 三批产品迭代与人工验收 |
| [36-PREVIEW9-ACCEPTANCE](iterations/36-PREVIEW9-ACCEPTANCE.md) | 36 · Trace preview.9 人工验收 |
| [37-INSIGHT2-COMPARISON](iterations/37-INSIGHT2-COMPARISON.md) | 37 · Insight 2 调研与 Trace 同维度评估 |
| [38-DEVELOPMENT-PLAN](iterations/38-DEVELOPMENT-PLAN.md) | 38 · Trace 综合分析工作台迭代计划 |
| [39-M7-WORKSPACE](iterations/39-M7-WORKSPACE.md) | 39 · M7 仪器工作台架构与实施记录 |
| [40-M7-ACCEPTANCE](iterations/40-M7-ACCEPTANCE.md) | 40 · M7 / preview.10 交付与验收 |
| [41-M8-METERING](iterations/41-M8-METERING.md) | 41 · M8 频谱与声场数值规范 |
| [42-M8-ACCEPTANCE](iterations/42-M8-ACCEPTANCE.md) | 42 · M8 频谱与声场 / preview.14 工程验收 |
| [43-M9-SPECTROGRAM](iterations/43-M9-SPECTROGRAM.md) | 43 · M9 时频缓存与 2D 声谱图设计 |
| [44-M8-RESOURCE-INVESTIGATION](iterations/44-M8-RESOURCE-INVESTIGATION.md) | 44 · M8 资源增长排查 |
| [45-VISIBILITY-AND-RESOURCE-GATE](iterations/45-VISIBILITY-AND-RESOURCE-GATE.md) | 45 · 窗口可见性与资源验证修正 |
| [46-M9-2D-INTEGRATION](iterations/46-M9-2D-INTEGRATION.md) | 46 · M9 共轴 2D 声谱图接入 / preview.15 |
| [47-M9-PRESENTATION-PERFORMANCE](iterations/47-M9-PRESENTATION-PERFORMANCE.md) | 47 · M9 显示一致性与性能 / preview.17 |
| [48-M10-3D-DESIGN](iterations/48-M10-3D-DESIGN.md) | 48 · M10 同数据 3D 声谱图设计 |
| [49-M10-3D-INTEGRATION](iterations/49-M10-3D-INTEGRATION.md) | 49 · M10 3D 接入 / preview.20 |
| [50-M11-TARGET-REPORT-DESIGN](iterations/50-M11-TARGET-REPORT-DESIGN.md) | 50 · M11 目标、事件与报告设计 |
| [51-M11-INTEGRATION](iterations/51-M11-INTEGRATION.md) | 51 · M11 目标、事件与报告接入 |
| [52-M12-ASSET-REFERENCE-DESIGN](iterations/52-M12-ASSET-REFERENCE-DESIGN.md) | 52 · M12 外部素材与参考比较设计 |
| [53-M12-IMPORT-INTEGRATION](iterations/53-M12-IMPORT-INTEGRATION.md) | 53 · M12 外部素材接入 |
| [54-M12-REFERENCE-DESIGN](iterations/54-M12-REFERENCE-DESIGN.md) | 54 · M12 单份参考比较设计 |
| [55-M12-REFERENCE-INTEGRATION](iterations/55-M12-REFERENCE-INTEGRATION.md) | 55 · M12 参考比较接入 |
| [56-M12-COMPLETION-AUDIT](iterations/56-M12-COMPLETION-AUDIT.md) | 56 · M12 完成审计与复评入口 |
| [57-M12-FINAL-REVIEW](iterations/57-M12-FINAL-REVIEW.md) | 57 · Trace M12 工程交付与同维度复评 |
| [58-LAYOUT-EDIT-FEEDBACK](iterations/58-LAYOUT-EDIT-FEEDBACK.md) | 58 · 布局编辑入口反馈 |
| [59-PUBLIC-BETA-READINESS](iterations/59-PUBLIC-BETA-READINESS.md) | 59 · 公开测试准备度评估 |
| [60-PB1-PB2-SUPPORT](iterations/60-PB1-PB2-SUPPORT.md) | 60 · PB1 单实例与 PB2 故障诊断 |
| [61-LEOMOON-TRACE-BRANDING](iterations/61-LEOMOON-TRACE-BRANDING.md) | 61 · LeoMoon 系列 / Trace 产品标识接入 |
| [62-USER-MANUAL](iterations/62-USER-MANUAL.md) | 62 · 用户手册核对与 PDF 快速上手 |
| [63-INTERNAL-TEST-DISTRIBUTION](iterations/63-INTERNAL-TEST-DISTRIBUTION.md) | 63 · 同事内测分发包 |
| [64-INTERNAL-TEST-R2](iterations/64-INTERNAL-TEST-R2.md) | 64 · 同事内测分发包 R2（preview.29） |
| [66-FRONTEND-AUDIT](iterations/66-FRONTEND-AUDIT.md) | Trace 声迹 / Prism 前端代码质量审计报告 |
| [67-CODE-AUDIT-PREVIEW29](iterations/67-CODE-AUDIT-PREVIEW29.md) | Trace preview.29 全量代码质量审计 |
| [68-INDEPENDENT-CHANGE-REVIEW](iterations/68-INDEPENDENT-CHANGE-REVIEW.md) | 68 · 2026-09-23 三批变更的独立复核 |
| [69-INTERNAL-TEST-R3](iterations/69-INTERNAL-TEST-R3.md) | 69 · 同事内测分发包 R3（preview.30） |
| [71-INSTRUMENT-THEMES-PLAN](iterations/71-INSTRUMENT-THEMES-PLAN.md) | 71 · 仪表主题色（M13）开发方案 |
| [72-INSTRUMENT-THEMES-REVIEW](iterations/72-INSTRUMENT-THEMES-REVIEW.md) | 72 · M13 仪表主题独立审计 |
| [73-CLOUD-CODE-REVIEW](iterations/73-CLOUD-CODE-REVIEW.md) | 73 · 云环境代码审核（2026-10-02） |
| [74-DOCUMENTATION-CLEANUP](iterations/74-DOCUMENTATION-CLEANUP.md) | 74 · 项目文档审核与清理（2026-10-02） |
| [75-CLOUD-RELEASE-PREPARATION](iterations/75-CLOUD-RELEASE-PREPARATION.md) | 75 · 云端发布收尾与剩余阻塞 |
| [77-EBU-MIRROR-VALIDATION](iterations/77-EBU-MIRROR-VALIDATION.md) | 77 · EBU 镜像素材与 Trace 云端数值检查 |
| [78-EBU-METER-RECALIBRATION](iterations/78-EBU-METER-RECALIBRATION.md) | 78 · Meter v5：EBU 原始素材校准与密集响度索引 |
| [80-RELEASE-DEPENDENCY-HARDENING](iterations/80-RELEASE-DEPENDENCY-HARDENING.md) | 80 · 发布依赖与源码收尾 |
| [82-FILE-FAULT-TESTING](iterations/82-FILE-FAULT-TESTING.md) | 82 · 文件边界与故障注入 |
| [83-GITHUB-AUDIO-PROJECT-RESEARCH](iterations/83-GITHUB-AUDIO-PROJECT-RESEARCH.md) | 83 · GitHub 录音与音频仪器调研 |
| [84-P0-P1-CLOUD-ITERATION](iterations/84-P0-P1-CLOUD-ITERATION.md) | P0 / P1 云端迭代（2026-10-11） |
| [85-CODE-DOCUMENT-REVIEW](iterations/85-CODE-DOCUMENT-REVIEW.md) | 85 · 代码与文档复核（2026-10-15） |
| [86-RECORDING-LIST-RESEARCH](iterations/86-RECORDING-LIST-RESEARCH.md) | 86 · 录音列表调研与改版建议 |
| [87-RECORDING-LIBRARY-ITERATION](iterations/87-RECORDING-LIBRARY-ITERATION.md) | 87 · 录音列表迭代 |
| [88-FRONTEND-SIMPLIFICATION-PLAN](iterations/88-FRONTEND-SIMPLIFICATION-PLAN.md) | 88 · 下一版本前端精简迭代方案 |
| [90-WORK-DOCUMENTATION-REVIEW](iterations/90-WORK-DOCUMENTATION-REVIEW.md) | 90 · 全工作文档复核与同步 |
