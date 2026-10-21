# Trace 当前开发文档

**默认只读 [13 · 当前交接](13-HANDOFF.md) 与 [07 · 当前任务单](07-BACKLOG.md)**，再按本次任务查下表。不要按编号通读、递归读取归档，或为确认状态展开大份验证 JSON。

## 按任务读取

| 任务/问题 | 文档 |
| --- | --- |
| 需求或范围变化 | [01 · 现行产品需求](01-PRODUCT.md) |
| 跨模块、服务生命周期或线程 | [02 · 现行架构](02-ARCHITECTURE.md) |
| 音频、响度、帧/时钟、历史语义 | [03 · 音频与计量](03-AUDIO-METERING.md) |
| 文件、会话、缓存或恢复 | [04 · 数据与恢复](04-DATA-FORMATS.md) |
| 前端布局、状态与交互 | [05 · 现行 UI 约束](05-UI-UX.md)、[28 · 操作指南](28-USER-GUIDE.md) 的相关章节 |
| IPC、类型、消息/版本变更 | [06 · 接口契约](06-CONTRACTS.md) |
| 选择针对性测试/完成门槛 | [08 · 验收定义](08-ACCEPTANCE.md) |
| 环境、构建、前端/原生专项复现 | [09 · 开发环境](09-WINDOWS-SETUP.md)、[开发入门](../CODEX-START.md) |
| 改变架构决定 | [11 · ADR](11-DECISIONS.md) |
| macOS 后端 | [70 · 待实施方案](70-MACOS-PORT-PLAN.md) |
| 打包、实机/用户或公开发布 | [76 · 发布门禁](76-RELEASE-CHECKLIST.md) |
| 维护工程边界/FFT 来源 | [79 · 独立工程](79-TRACE-INDEPENDENT-PROJECT.md) |
| 构建/复核媒体组件 | [81 · 固定 FFmpeg 构建](81-SELF-BUILT-FFMPEG.md)、[组件来源](../references/trace-ffmpeg/README.md) |
| 最近 preview.35 实现/验收细节 | [89 · 前端迭代](89-FRONTEND-SIMPLIFICATION-ITERATION.md) |
| 本地声谱图移植 / 频谱低频修复 | [91 · 声谱图移植](91-SPECTROGRAM-PORT-PREVIEW35.md)、[92 · 频谱连续性](92-SPECTRUM-CONTINUITY-FIX.md)；最新本地包以 13 为准 |
| 录音库误收普通 WAV 文件夹 | [93 · 目录识别修复](93-RECORDING-DISCOVERY-FIX.md) |
| Windows 首轮实机 / 两小时长测 | [94 · 实机与稳定性记录](94-WINDOWS-FIRST-RETEST.md)，运行/完成状态以 13 为准 |
| 示例、第三方许可 | [examples](../examples/README.md)、[第三方声明](../THIRD_PARTY_NOTICES.md) |

## 证据与历史：按需检索

- 最新机器证据为 [frontend-verification.json](release/frontend-verification.json)。先看 13/89 的摘要，仅在核对 CI 来源、具体步骤或哈希时查询对应 JSON 字段。
- `release/` 其他 JSON、`research/` 来源清单、`assets/` 图片来源，以及历史随包 TXT/旧 PDF 保留原位与原身份；不列为开工必读，不因目录存在而通读。
- 已完成阶段、旧计划、审计、调研、内测包与历次交接统一在[归档索引](archive/README.md)。原编号保持，用文件名/问题定位后只读对应文件；不得把旧“当前/下一步/待实施”当作新任务。
- 不清楚某个旧路径移到哪里时，查询[归档路径映射](archive/manifest.json) 的单个条目。主目录没有为每份旧文档保留重复跳转页。
