# 02 · 现行架构与模块边界

2026-10-18。工程为独立 Electron / React / TypeScript + C++ WASAPI / libebur128 / 固定 FFmpeg；默认安装、构建、测试、CI 不编译 Prism addon。FFT 为 `native/vendor/prism-fft/` 的固定来源本地组件。构建入口见 [09](09-WINDOWS-SETUP.md)，独立工程边界见 [79](79-TRACE-INDEPENDENT-PROJECT.md)。历史路线与阶段过程见[归档快照](archive/snapshots/02-ARCHITECTURE-before-archive-20261018.md)。

## 数据路径与线程

系统播放端点 → 原生采集/时钟 → 有界完整音频分发 → 独立计量与录音写盘。原文件/成品 → 独立文件分析 → 历史缓存/仪器查询；Playback 以实际呈现位置查询同一文件历史。Renderer 只接收快照与有界数组流，不中转录音 PCM。

| 执行位置 | 责任与约束 |
| --- | --- |
| Renderer | React/Canvas、布局、共用游标与交互；不访问设备/磁盘/编码器，不保留全量 PCM |
| preload | 白名单 IPC、来源/数量/参数校验、订阅清理；不暴露通用 shell/文件系统 |
| main | 状态、设备与服务生命周期、文件授权/对话框、任务调度；不扫描整段音频 |
| native capture | 实际 device frame/QPC/epoch，预分配缓冲；不等待 UI/磁盘/编码器，不做 JS 回调或无界分配 |
| native analyzer / writer | 完整计量与流式源写盘各有边界；录音 PCM 不复用可覆盖显示队列 |
| native playback | 以 WASAPI 实际呈现时钟驱动位置，seek generation 拒绝旧结果；不靠 UI 定时器推进音频 |
| file/report/media worker | 分块分析、报告和编码，有界并发、取消/恢复，REC 优先 |

采集/播放线程仍位于 main 加载的 `trace_engine.node` 内，不声称实时引擎已进程隔离。编码监督进程、file/report worker 由 main 持有 Windows Job Object，发任务前建立所有权，完成时等待释放；异步 worker 还监听 IPC disconnect。WAV 后处理不绕过媒体 supervisor。

## 生命周期与有界状态

- Device/CaptureClock 绑定真实格式、位置和 epoch；重开不可跨 epoch 比较设备帧。实际精度不由内部 float32 推断。
- LIVE/take 独立累计；REC 不重启健康采集，停止 REC 保留 LIVE 意图。只读历史与发声输出分离，输出停止后恢复原监测请求。
- 采集/写盘背压显式标缺口或失败并保留可恢复前缀；显示允许合并，音频与持久化历史不能静默丢弃。不能以扩大显示队列替代录音路径。
- 未录音 PCM/质量缓存最多 60 秒，仅显式保存缓存才写文件。文件/成品/选区各自绑定真实内容及解码范围；数据语义见 [03](03-AUDIO-METERING.md)/[04](04-DATA-FORMATS.md)。
- 仪器显隐/停靠/主题不控制音频生命周期；隐藏/最小化降低呈现成本，大数组走独立有界流，旧来源/代次不能覆盖新视图。
- 文件维护先释放播放、报告、参考和分析消费者；来源整理必须等待核验，不能删除唯一可恢复文件。
- NativeAnalysisQueue 两项执行/四项等待只用于分析；捕获/写盘不进入该队列。导入最多四项准备，取消共享分析须等最后引用释放。
- userData 规范化后、引擎/录音库初始化前取得单实例锁。诊断最多 128 条固定字段，界面恢复不重启录音；正常退出有界排空服务。

## 代码与契约入口

| 区域 | 路径/入口 |
| --- | --- |
| 应用与协议 | `src/trace/main.ts`、`preload.ts`、`shared.ts`、`contracts.ts`；实际命令见 [06](06-CONTRACTS.md) |
| 文件/回听/报告/参考 | `src/trace/` 内 SessionStore、PlaybackService、ImportService、AssetRepository、ExportService、DeliveryService、ReportService、ReferenceService |
| 界面 | `src/trace/renderer/`，当前交互见 [05](05-UI-UX.md) |
| 原生与数值 | `native/src/recorder/`、`native/recorder/`、`native/portable/`、`native/vendor/` |
| 检查与工具 | `test/`、`scripts/run-trace-tests.mjs`、`tools/`；按改动风险选择 [08](08-ACCEPTANCE.md) 的检查 |

Mac 后端需按 [70](70-MACOS-PORT-PLAN.md)/[ADR-012](11-DECISIONS.md) 的真机探针与平台边界推进，现有 Windows 证据不自动适用。
