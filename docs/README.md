# Trace 项目文档索引

更新：2026-10-15。当前源码 **preview.33**，默认开发分支 `recorder/dev`；本轮代码/文档复核见 [85](85-CODE-DOCUMENT-REVIEW.md)，P0/P1 实现及上一轮验证见 [84](84-P0-P1-CLOUD-ITERATION.md)。新源码继续在草稿 PR #1 评审，远程默认分支尚未合入。preview.31 私有工程候选（2aee519）、preview.30 / InternalTest-r3（9c1ee21）与旧 f33d74d 候选保持各自历史身份；本轮未建立新安装包。最新提交、验证与待验边界见 [13](13-HANDOFF.md)。PDF 插图仍为云端模拟界面。

先读 [项目首页](../README.md)、[用户指南](28-USER-GUIDE.md) 或 [开发入门](../CODEX-START.md)。当前状态、未验证项和下一任务统一写在 [13-HANDOFF](13-HANDOFF.md)。带日期的阶段记录只证明当时版本的结果；旧“当前/下一步”不能覆盖 13。

独立化、依赖、编码与下载回归修复已同步到 GitHub `recorder/dev`；新会话按 [接力说明](13-HANDOFF.md#下一会话接力) 核对实际分支、代码/候选身份、证据位置及后续工作顺序。

## 常用入口

| 文档 | 用途/状态 |
| --- | --- |
| [用户指南](28-USER-GUIDE.md) | 当前源码操作，包含主题、采集质量、复核标记/导图及等响度回听 |
| [源码开发入门](../CODEX-START.md) | 从现有仓库准备依赖和开始工作 |
| [项目约定](../AGENTS.md) | 开发、验证、来源与交接规则 |
| [Windows 环境](09-WINDOWS-SETUP.md) | 实际构建、测试和分发命令；Linux 可运行范围 |
| [任务索引](07-BACKLOG.md) | 当前待办与早期任务 ID |
| [当前交接](13-HANDOFF.md) | 源码/分发身份、最新验证、实机缺口 |
| [云端发布收尾](75-CLOUD-RELEASE-PREPARATION.md) | CI、打包、退出、依赖与新 PDF 的交付/阻塞 |
| [发布验收清单](76-RELEASE-CHECKLIST.md) | 私有工程候选与正式发布的 Windows/测量/安全/用户门禁 |
| [EBU 镜像数值检查](77-EBU-MIRROR-VALIDATION.md) | 完整性、独立 hash、真实 Meter 的通过/失败范围与 Max M 缺口 |
| [Meter v5 校准修复](78-EBU-METER-RECALIBRATION.md) | 10 ms 完整响度索引、68/68 原始 WAV、缓存/报告与验证范围 |
| [Trace 独立工程](79-TRACE-INDEPENDENT-PROJECT.md) | 专用入口、FFT 来源、清理边界、从零复现与 Windows CI 证据 |
| [发布依赖与源码收尾](80-RELEASE-DEPENDENCY-HARDENING.md) | 固定安全工具链、实时审计门禁、FFmpeg 主源码与静态依赖资料缺口 |
| [自建 Windows FFmpeg](81-SELF-BUILT-FFMPEG.md) | 两份官方源码、固定工具/SDK、构建与完整来源门禁；新候选复验通过 |
| [文件与故障测试](82-FILE-FAULT-TESTING.md) | 损坏/截断、16 组 MP3、取消/进程/worker、磁盘注入及安全修补；完整 CI/新候选已通过 |
| [GitHub 录音与仪器调研](83-GITHUB-AUDIO-PROJECT-RESEARCH.md) | 2026-10-11 外部项目/固定来源与当前源码对照；资源、故障、FFT/长文件缓存和仪器判读建议；P0/P1 已实施，见 84 |
| [文件/故障验证清单](release/file-fault-verification.json) | 当前 2aee519 的实际两端门禁、MP3 帧数、基线反例与新候选身份 |
| [自建与新候选验证](release/codec-verification.json) | 10 月 4 日 f33d74d 自建来源、重复构建、实际 EXE/报告及历史附件身份 |
| [独立工程验证清单](release/independence-verification.json) | 旧工具链独立化阶段的代码提交、CI 与候选元数据；当前复验见下项 |
| [历史依赖验证](release/dependency-verification.json) | 旧 Gyan 6835af9 完整 CI、依赖修复及旧附件证据 |
| [依赖安全盘点](release/security-baseline.json) | 锁文件绑定的零 npm 公告门禁、固定工具链、自建 codec 来源及独立安全/许可复核 |
| [文档清理记录](74-DOCUMENTATION-CLEANUP.md) | 本轮删除、归档、勘误与检查 |

## 现行需求、语义与契约

01–06 含早期设计与后续增量；已知冲突按当前用户要求、源码与注明日期的最新契约处理，不能把草案接口当成已实现。

| 文档 | 用途/状态 |
| --- | --- |
| [01 · 产品需求与范围](01-PRODUCT.md) | 当前规范/来源及历史证据边界 |
| [02 · 架构与模块边界](02-ARCHITECTURE.md) | 当前规范/来源及历史证据边界 |
| [03 · 音频、计量与时间规范](03-AUDIO-METERING.md) | 当前规范/来源及历史证据边界 |
| [04 · 会话、音频、缓存与恢复](04-DATA-FORMATS.md) | 当前规范/来源及历史证据边界 |
| [05 · 布局、状态与交互](05-UI-UX.md) | 当前规范/来源及历史证据边界 |
| [06 · 模块接口与消息契约](06-CONTRACTS.md) | 当前规范/来源及历史证据边界 |
| [08 · 验收计划与完成门槛](08-ACCEPTANCE.md) | 当前规范/来源及历史证据边界 |
| [10 · 与 VSTDev 的只读对齐](10-VSTDEV-ALIGNMENT.md) | 有日期的只读核查/门禁定义，当前结果见 13 |
| [11 · 架构决定记录](11-DECISIONS.md) | 当前规范/来源及历史证据边界 |
| [12 · Codex 工作指令](12-CODEX-PROMPTS.md) | 当前规范/来源及历史证据边界 |
| [14 · 来源、核查范围与证据边界](14-SOURCES.md) | 当前规范/来源及历史证据边界 |
| [18 · 里程碑最小门禁](18-MILESTONE-GATES.md) | 有日期的只读核查/门禁定义，当前结果见 13 |

## 阶段设计、验收与发布历史

保留数值定义、实现决策、失败反例、版本/哈希、用户反馈和复现方法。已完成的阶段不作为当前开发待办；尚未关闭的硬件/素材专项仍见 13。

### M0–M6：环境、采集、录音、分析、回放与三格式

| 文档 | 用途/状态 |
| --- | --- |
| [16 · M0 Windows 底座与采集诊断](16-M0-VALIDATION.md) | 历史设计/实施及本阶段证据 |
| [17 · M1 实时监测实现与门禁](17-M1-VALIDATION.md) | 历史设计/实施及本阶段证据 |
| [19 · M2 连续录音实施记录](19-M2-RECORDING.md) | 历史设计/实施及本阶段证据 |
| [20 · M3 文件分析与确定性历史](20-M3-FILE-ANALYSIS.md) | 历史设计/实施及本阶段证据 |
| [21 · TP 历史时间归属与 v4 计量](21-M3-TP-TIMING.md) | 历史设计/实施及本阶段证据 |
| [22 · 设备重设续录：时钟与时间映射基础](22-M2-REGION-TIMELINE.md) | 历史设计/实施及本阶段证据 |
| [23 · 同会话续录与录音快照一致性](23-M2-CONTINUATION.md) | 历史设计/实施及本阶段证据 |
| [24 · WAV 成品精度转换与削波报告](24-M2-WAV-PRECISION.md) | 历史设计/实施及本阶段证据 |
| [25 · 文件回放、呈现时钟与独立选区](25-M4-PLAYBACK.md) | 历史设计/实施及本阶段证据 |
| [26 · 三格式录音、导出与独立解码](26-M5-EXPORT.md) | 历史设计/实施及本阶段证据 |
| [27 · M6 桌面开发预览](27-M6-DESKTOP.md) | 历史设计/实施及本阶段证据 |

### preview.2–9：交互、基线与产品评估

| 文档 | 用途/状态 |
| --- | --- |
| [29 · preview.2 人工反馈改进](29-PREVIEW2-FEEDBACK.md) | 历史设计/实施及本阶段证据 |
| [30 · preview.3 缩放、界面精简与直接录音](30-PREVIEW3-INTERACTION.md) | 历史设计/实施及本阶段证据 |
| [31 · preview.4 统一工作台](31-PREVIEW4-WORKBENCH.md) | 历史设计/实施及本阶段证据 |
| [32 · preview.8 历史游标连续呈现](32-PREVIEW8-SCRUB.md) | 历史设计/实施及本阶段证据 |
| [33 · Trace preview.8 Git 基线](33-BASELINE.md) | 历史设计/实施及本阶段证据 |
| [34 · Trace preview.8 产品功能与易用性复核](34-PRODUCT-REVIEW.md) | 历史设计/实施及本阶段证据 |
| [35 · 三批产品迭代与人工验收](35-ITERATION-ACCEPTANCE.md) | 历史设计/实施及本阶段证据 |
| [36 · Trace preview.9 人工验收](36-PREVIEW9-ACCEPTANCE.md) | 历史设计/实施及本阶段证据 |
| [37 · Insight 2 调研与 Trace 同维度评估](37-INSIGHT2-COMPARISON.md) | 历史设计/实施及本阶段证据 |

### M7–M12：工作台、频谱/声场、声谱、报告、导入与参考

| 文档 | 用途/状态 |
| --- | --- |
| [38 · Trace 综合分析工作台迭代计划](38-DEVELOPMENT-PLAN.md) | M7–M12 已结项；保留计划范围和任务 ID |
| [39 · M7 仪器工作台架构与实施记录](39-M7-WORKSPACE.md) | 历史设计/实施及本阶段证据 |
| [40 · M7 / preview.10 交付与验收](40-M7-ACCEPTANCE.md) | 历史设计/实施及本阶段证据 |
| [41 · M8 频谱与声场数值规范](41-M8-METERING.md) | 历史设计/实施及本阶段证据 |
| [42 · M8 频谱与声场 / preview.14 工程验收](42-M8-ACCEPTANCE.md) | 历史设计/实施及本阶段证据 |
| [43 · M9 时频缓存与 2D 声谱图设计](43-M9-SPECTROGRAM.md) | 历史设计/实施及本阶段证据 |
| [44 · M8 资源增长排查](44-M8-RESOURCE-INVESTIGATION.md) | 历史设计/实施及本阶段证据 |
| [45 · 窗口可见性与资源验证修正](45-VISIBILITY-AND-RESOURCE-GATE.md) | 历史设计/实施及本阶段证据 |
| [46 · M9 共轴 2D 声谱图接入 / preview.15](46-M9-2D-INTEGRATION.md) | 历史设计/实施及本阶段证据 |
| [47 · M9 显示一致性与性能 / preview.17](47-M9-PRESENTATION-PERFORMANCE.md) | 历史设计/实施及本阶段证据 |
| [48 · M10 同数据 3D 声谱图设计](48-M10-3D-DESIGN.md) | 历史设计/实施及本阶段证据 |
| [49 · M10 3D 接入 / preview.20](49-M10-3D-INTEGRATION.md) | 历史设计/实施及本阶段证据 |
| [50 · M11 目标、事件与报告设计](50-M11-TARGET-REPORT-DESIGN.md) | 历史设计/实施及本阶段证据 |
| [51 · M11 目标、事件与报告接入](51-M11-INTEGRATION.md) | 历史设计/实施及本阶段证据 |
| [52 · M12 外部素材与参考比较设计](52-M12-ASSET-REFERENCE-DESIGN.md) | 历史设计/实施及本阶段证据 |
| [53 · M12 外部素材接入](53-M12-IMPORT-INTEGRATION.md) | 历史设计/实施及本阶段证据 |
| [54 · M12 单份参考比较设计](54-M12-REFERENCE-DESIGN.md) | 历史设计/实施及本阶段证据 |
| [55 · M12 参考比较接入](55-M12-REFERENCE-INTEGRATION.md) | 历史设计/实施及本阶段证据 |
| [56 · M12 完成审计与复评入口](56-M12-COMPLETION-AUDIT.md) | 历史设计/实施及本阶段证据 |
| [57 · Trace M12 工程交付与同维度复评](57-M12-FINAL-REVIEW.md) | 历史设计/实施及本阶段证据 |

### 后续反馈、品牌、文档、公测准备、审计与内测包

| 文档 | 用途/状态 |
| --- | --- |
| [58 · 布局编辑入口反馈](58-LAYOUT-EDIT-FEEDBACK.md) | 历史设计/实施及本阶段证据 |
| [59 · 公开测试准备度评估](59-PUBLIC-BETA-READINESS.md) | 历史设计/实施及本阶段证据 |
| [60 · PB1 单实例与 PB2 故障诊断](60-PB1-PB2-SUPPORT.md) | 历史设计/实施及本阶段证据 |
| [61 · LeoMoon 系列 / Trace 产品标识接入](61-LEOMOON-TRACE-BRANDING.md) | 历史设计/实施及本阶段证据 |
| [62 · 用户手册核对与 PDF 快速上手](62-USER-MANUAL.md) | preview.28 历史与 preview.31 新 PDF 的来源和 QA |
| [63 · 同事内测分发包](63-INTERNAL-TEST-DISTRIBUTION.md) | preview.28 / R1 分发校验快照 |
| [64 · 同事内测分发包 R2（preview.29）](64-INTERNAL-TEST-R2.md) | preview.29 / R2；逐帧重渲染结论已勘误 |
| [Trace 声迹 / Prism 前端代码质量审计报告](66-FRONTEND-AUDIT.md) | 2026-09-20 前端审计；selector 性能结论有后续勘误 |
| [Trace preview.29 全量代码质量审计](67-CODE-AUDIT-PREVIEW29.md) | preview.29 审计建议；后续结果见 68/73 |
| [68 · 2026-09-23 三批变更的独立复核](68-INDEPENDENT-CHANGE-REVIEW.md) | 独立反例；P1 与估计静音提示已修，CI/看门狗待验 |
| [69 · 同事内测分发包 R3（preview.30）](69-INTERNAL-TEST-R3.md) | 历史同事交付包 preview.30 / R3；不含 preview.31 修复，不等于新工程候选 |

## macOS、M13 与最新云端审核

| 文档 | 用途/状态 |
| --- | --- |
| [70 · Trace macOS 移植实施方案](70-MACOS-PORT-PLAN.md) | 待实施方案：需要 Apple silicon 真机完成采集探针 |
| [71 · 仪表主题色（M13）开发方案](71-INSTRUMENT-THEMES-PLAN.md) | 主题已合入；3D 三角、preview.31 PDF 与工程候选已完成，实机首帧/帧时间等仍待验 |
| [72 · M13 仪表主题独立审计](72-INSTRUMENT-THEMES-REVIEW.md) | R1/R2 已修；R3 断言已修，完整首帧专项仍待 Windows |
| [73 · 云环境代码审核（2026-10-02）](73-CLOUD-CODE-REVIEW.md) | 五项问题与两项旧缺口已在 2995174 修复，233 个 portable 回归通过 |

## 素材、示例、随包文案与历史存档

| 文档 | 用途/状态 |
| --- | --- |
| [现行数据示例](../examples/README.md) | Session v2 / RecordSettings v3 / ExportPreset；无真实媒体 |
| [preview.31 PDF](../output/pdf/LeoMoon-Trace-Quick-Start-preview.31-zh-CN.pdf) | 8 页当前快速上手，明确使用云端模拟界面插图 |
| [当前插图来源](assets/quick-start-preview31/README.md) | 真实 React + 模拟 IPC/读数，非 Windows 采集证明 |
| [Noto Sans SC 许可](assets/quick-start-preview31/NotoSansSC-OFL.txt) | 新 PDF 嵌入字体的 SIL OFL 1.1 |
| [preview.28 PDF](../output/pdf/LeoMoon-Trace-Quick-Start-preview.28-zh-CN.pdf) | 8 页历史快速上手，受版本控制，R3 仍沿用 |
| [手册截图来源](assets/quick-start-preview28/README.md) | preview.28 演示信号/隔离窗口，非当前实机验收 |
| [品牌素材来源](../resources/trace/branding/README.md) | 实际 PNG、生成过程、SHA256 与品牌归属 |
| [初始调研快照](../references/RESEARCH-v0.3.md) | 2026-09-14 方案 v0.3，仅保留历史设计依据 |
| [EBU Loudness Test Set v5.0](../references/ebu-loudness-test-set-v5/README.md) | 2026-10-03 已取得 70 个原始 WAV 的完整 ZIP、官方 PDF 与校验清单；仅内部测试；适用 Meter 数值 68/68 通过，完整验收见 76 |
| [会话交接历史](archive/13-HANDOFF-HISTORY.md) | 历史状态/提交/验证证据，当前待办只看 13 |

内测 TXT 输入文案固定 **preview.30 / InternalTest-r3**，不因当前指南更新而成为 preview.31 发布材料；已交付 ZIP 内容与哈希保持历史身份。

| 文档 | 用途/状态 |
| --- | --- |
| [00-开始使用.txt](distribution/internal-test/00-开始使用.txt) | R3 的随包说明/反馈/许可文案 |
| [02-内测试用清单.txt](distribution/internal-test/02-内测试用清单.txt) | R3 的随包说明/反馈/许可文案 |
| [03-已知限制与版本说明.txt](distribution/internal-test/03-已知限制与版本说明.txt) | R3 的随包说明/反馈/许可文案 |
| [04-问题反馈模板.txt](distribution/internal-test/04-问题反馈模板.txt) | R3 的随包说明/反馈/许可文案 |
| [05-许可与来源.txt](distribution/internal-test/05-许可与来源.txt) | R3 的随包说明/反馈/许可文案 |

## 上游与许可

这些材料保留上游身份和署名；Prism 的功能/构建指令不作为 Trace 当前入口。

| 文档 | 用途/状态 |
| --- | --- |
| [Trace 项目首页](../README.md) | 产品/源码/分发入口 |
| [上游 Prism README](../README-Prism.md) | 来源导航；原说明字节快照保存在 references/prism |
| [GNU GPL v3](../LICENSE) | 原始许可条款 |
| [第三方声明](../THIRD_PARTY_NOTICES.md) | 上游与依赖许可/来源 |
| [上游 DAW 插件说明](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/plugin/README.md) | Prism VST/AU/Standalone 的独立目标说明 |
| [本地 FFT 来源与许可](../native/vendor/prism-fft/README.md) | 固定来源的最小 FFT 组件；独立数值门禁 |
| [libebur128 本地补丁](../native/vendor/libebur128/TRACE-PATCHES.md) | 1.2.6 锁定来源、数值改动与版本证据 |

15（开工包自检）、65（临时未提交变更交接）和根目录 TRACE-README 兼容入口已被后续内容替代并删除，原件可从 Git 历史追溯；编号不重新排列。删除理由见 74。

- [84 · P0/P1 云端迭代](84-P0-P1-CLOUD-ITERATION.md)：实现、版本变化、资源基线与验收边界。

- [85 · 全量代码与文档复核](85-CODE-DOCUMENT-REVIEW.md)：问题、修复、反例回归和本轮验证。
