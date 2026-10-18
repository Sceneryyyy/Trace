# 06 · 模块接口与消息契约

2026-10-18 对照 preview.35 复核：UI88 只调整 renderer 的组织和动作入口，没有增加 IPC 命令或变更下表协议/数据版本。选中详情版本不发请求，显式查看/导出才绑定该 role/regionId/exportId；设置分类共用草稿并在应用时提交。操作说明与验证见 [28](28-USER-GUIDE.md)、[89](89-FRONTEND-SIMPLIFICATION-ITERATION.md)。下方 preview.34 增量保留。

2026-10-15 对照 preview.34 源码更新。唯一类型定义为 [shared.ts](../src/trace/shared.ts)，命令与参数校验为 [contracts.ts](../src/trace/contracts.ts)，状态控制器为 [main.ts](../src/trace/main.ts)。本文列出实际接线；完整类型以源码为准，早期拟定的 `selection.analyze`、`view.returnLive` 等不是现有命令。

preview.34：`TakeSummary.continuity` 新增可选值 `complete/gaps/estimated-silence/unknown`，复用既有来源质量判定以呈现列表警告。录音列表通过前端有界意图调度复用 `file.open` 与 `playback.play/pause`，以回复中的播放 ID、role/regionId/exportId 及请求代次核对来源；协议版本、命令白名单、会话与缓存格式不变。见 [87](archive/iterations/87-RECORDING-LIBRARY-ITERATION.md)。

## 版本与基本类型

| 协议/格式 | 当前版本与定义 |
| --- | --- |
| Request / Reply / native meter 的 protocolVersion | 1 |
| 计量算法 | Meter v5，见 [03](03-AUDIO-METERING.md) |
| 会话 | Session v2，兼容读取 v1，见 [04](04-DATA-FORMATS.md) |
| 磁盘分析缓存 | 二进制 schema v1；分析缓存 key v3 |
| 冻结内存历史 | ReplayFreeze 元数据 v3；quality v1，见 [ReplayBuffer.h](../native/src/recorder/ReplayBuffer.h) 与 [replaySaveTypes.ts](../src/trace/replaySaveTypes.ts) |
| 布局 / 声谱设置 | workspace v4 / spectrogramSettings v2，分别见 [39](archive/iterations/39-M7-WORKSPACE.md)、[49](archive/iterations/49-M10-3D-INTEGRATION.md)、[55](archive/iterations/55-M12-REFERENCE-INTEGRATION.md) |

帧数/位置用十进制非负整数字符串表示，原生为 uint64，TS 校验后转 BigInt。JSON 不使用 NaN/Infinity；Metric 的单位为 dBFS/dBTP/LUFS/LU，状态为 ready/silence/insufficient/gap/error。ready 的 value 必须有限，其他状态按指标语义使用 null。

实际设备格式字段为：

```typescript
type SourceFormat = {
  sampleRate: number;
  channelCount: number;
  containerBits: number;
  validBits: number;
  encoding: 'ieee-float' | 'pcm-int';
  channelMask: number;
  blockAlign: number;
};
```

设备枚举可返回 unsupported 的格式信息；采集/文件路径只支持经验证的单/双声道。不能把超出能力的多声道截成双声道后称为完整录音，也不能将设备源编码与成品的 `pcm16/pcm24/float32` 混为同一个字段。

## 请求与回复

以下形状与 shared.ts 一致；`Command` 和 `TraceState` 为该文件的类型：

```typescript
type Request = {
  protocolVersion: 1;
  requestId: string;
  expectedStateRevision: number;
  command: Command;
  payload: Record<string, unknown>;
};
type Reply = {
  requestId: string;
  ok: boolean;
  state: TraceState;
  data?: unknown;
  error?: { code: string; message: string };
};
```

回复始终带 state，控制版本在 `state.revision`；没有独立的 Reply.stateRevision、recoverable 或 affectedAssetId 字段。requestId 长 1–100，revision 为非负安全整数，请求顶层严格只含示例中的五个字段；payload 必须是普通对象且只含相应白名单字段。变更命令检查 expectedStateRevision；读取及部分取消/诊断命令的分类见 `isMutation()`，不能假定所有命令都串行或都检查 revision。

主进程在途请求最多 32 条且请求 JSON 合计最多 16 MiB；完成缓存只保留最近变更命令的结果，最多 256 条且合计 8 MiB。签名为 SHA-256，不保留原始 PNG/请求 JSON、旧 state 或读取/图表准备响应；重复变更附带当前 state。保留期内同一 requestId/签名重试不会重复执行，改签名会拒绝；在途读取也共享同一 Promise。超限返回 IPC_QUEUE_FULL。去重不跨淘汰或进程重启，持久化会话/任务恢复另行负责。

## 核心命令

`无`表示空 payload `{}`；下表的可选字段仍须遵守源码校验。

| 命令 | 实际 payload | 行为/约束 |
| --- | --- | --- |
| `state.get` / `devices.list` | 无 | 获取状态/设备；Device 为 id、label、isDefault、supported、format、error |
| `devices.select` / `live.start` | `{deviceId}` | 选择设备/启动监测；监测不写音频 |
| `live.stop` / `live.reset` | 无 | 停止/重置监测；活动录音期间拒绝 |
| `view.window` / `view.gain` | `{seconds}` / `{gain}` | 时间窗 5–60 秒，波形倍率 1–4，只改变显示 |
| `view.settings` / `view.theme` | DisplaySettings / `{theme}` | 显示设置/五套主题，不改变计算数据；主题见 [71](archive/iterations/71-INSTRUMENT-THEMES-PLAN.md) |
| `view.live` / `live.replay` | 无 | 跟随最新/固定实时缓存；健康采集不会因只读历史而重启 |
| `view.inspect` | 来源、epoch、measurementEpoch、位置/范围，可带 selectionEndFrame | 固定并定位已发布的 live/take 内存范围；完整字段见 contracts.ts |
| `record.configure` | RecordSettings | 配置录音格式/保留意图；录音进行时拒绝修改 |
| `record.chooseDirectory` / `record.capacity` | 无 | 主进程选择目录/查询容量；renderer 不提交路径 |
| `record.start` / `record.stop` | 无 | 使用已选设备、目录及设置；起止边界由引擎确认 |
| `record.openFolder` / `record.recover` / `retention.retry` | `{takeId}` | 打开所属目录/恢复录音/重试原件整理 |
| `cache.save` | `{playbackId,useSelection}` | 保存当前固定缓存或选区为新录音；范围质量由原生计算 |
| `analysis.start` / `file.open` / `export.describe` | `{takeId,role,regionId?,exportId?}` | role=source/deliverable/recovered/session/export；regionId 仅 source/recovered，export 需 exportId；路径由主进程解析 |
| `file.close` | 无 | 关闭文件上下文，恢复原监测意图 |
| `playback.play` / `pause` / `clearSelection` / `retryAnalysis` | `{playbackId}` | 绑定当前来源，旧播放 ID 拒绝；清选区同时清循环/独立分析 |
| `playback.seek` | `{playbackId,positionFrame,resume}` | 校验范围/代次；当前主进程使用静默定位，先释放输出再恢复监听 |
| `playback.volume` / `playback.follow` | `{playbackId,gain}` / `{playbackId,enabled}` | 输出增益 0–1 / 跟随；不改变测量值 |
| `playback.selection` | `{playbackId,startFrame,endFrame,loop}` | 半开帧范围，触发独立选区分析；REC 不发声回听 |
| `playback.window` | `{playbackId,startFrame,endFrame,pixelWidth}` | 共轴视窗，像素宽 1–2400；手动调整关闭跟随 |
| `metrics.query` | `{analysisId,positionFrame,requestGeneration}` | 返回实际电平/响度索引及整段统计 |
| `timeline.query` | `{analysisId,startFrame,endFrame,pixelWidth,requestGeneration}` | 有界波形与响度页；不是 assetId 查询，不回传整文件 |
| `export.start` | 来源字段 + `{preset,range?,saveCopy?}` | 严格 ExportPreset，半开选区；交付目录来自主进程对话框 |
| `export.configure` | ExportPreset | 保存最近导出参数 |
| `export.retry` / `openFolder` / `saveCopy` / `openDeliveryFolder` | `{exportId}` | 重试/打开成品目录/另存/打开已交付目录 |
| `job.cancel` | `{jobId}` | 按任务所有者路由分析或导出取消，保留源音频 |

`playback.seek.resume` 目前仍为必须的布尔参数，但 main 统一以 false 定位；参数存在不代表已实现连续发声 scrub。文件打开只建立只读数据上下文；按播放才暂停输入并按需打开输出，暂停/定位/播放结束恢复原监听意图。

## 扩展命令与载荷

| 范围 | 当前契约与详细记录 |
| --- | --- |
| 仪器/布局 | `instrument.configure {settings}`、`workspace.configure {workspace}`；树深≤8、叶子唯一、比例 0.15–0.85、数量/序列化上限由校验器限制；[39](archive/iterations/39-M7-WORKSPACE.md)、[41](archive/iterations/41-M8-METERING.md) |
| 声谱 | `spectrogram.configure/query/point/cancel`：配置、来源/范围、queryId+位置/频率、queryId；大数组走独立流，不进命令结果缓存；[43](archive/iterations/43-M9-SPECTROGRAM.md)、[46](archive/iterations/46-M9-2D-INTEGRATION.md)、[47](archive/iterations/47-M9-PRESENTATION-PERFORMANCE.md) |
| 偏好 | `preferences.retry {}` 仅重试当前设置持久化，不触发采集恢复；退出等待写入；[49](archive/iterations/49-M10-3D-INTEGRATION.md) |
| 目标/报告 | `targets.configure {settings}`；`report.prepare {playbackId,scope}`（whole/selection）；get/cancel/retry/export/open 只带 reportId，jump 加 index（0–999）；[51](archive/iterations/51-M11-INTEGRATION.md) |
| 导入 | `imports.choose/refresh/openRoot {}`；cancel/relocate/clearCache/remove/openSource/openFolder 带 assetId，prepare 加 acceptChanged，rename 加 name，removeExport 加 exportId；[53](archive/iterations/53-M12-IMPORT-INTEGRATION.md) |
| 参考 | `reference.set` 使用来源字段，clear/retry 无参数，activate 带 slot（a/b）及可选 atStart，range 带 slot/startFrame/endFrame，configure 带 linked/offsetNs（有界纳秒）；[54](archive/iterations/54-M12-REFERENCE-DESIGN.md)、[55](archive/iterations/55-M12-REFERENCE-INTEGRATION.md) |
| 文件库 | `library.refresh/pruneMissing/storage {}`、rename 的 takeId/name、clearCache 的 takeId、remove 的 takeId/可选 exportId；清理先释放消费者并由主进程确认 |
| 应用/诊断 | `app.info/quit/diagnostics/copyDiagnostics/exportDiagnostics/feedback/reloadUI {}`，configure 仅 confirmExitWhileRecording，rendererFault 仅 kind=react/script/promise；[60](archive/iterations/60-PB1-PB2-SUPPORT.md) |
| 隔离测试 | `support.testFault {kind}`（renderer/main/worker）、`test.window {mode}`（show/hide/minimize/restore）只在隔离测试入口启用，不作为生产能力 |

通用命令不接收任意路径。磁盘 File[] 通过 `TraceAPI.importFiles()` 由 preload 的 webUtils 转换，经专用 `trace:import-files` 通道发送；主窗口/mainFrame、文件数量≤4 和磁盘来源同时校验。最多等待 8 批，先校验再入队。这是授权文件导入通道，不是通用文件系统 API。

## 快照与呈现流

- `trace:state` / onState：TraceState，含 revision、独立 eventSequence、设备/监测意图、录音/播放/有限任务摘要及各项配置。
- `trace:snapshot` / onSnapshot：MeterSnapshot = NativeMeterSnapshot + eventSequence/stateRevision 和可选 recording/recordingView/playback/fileView/仪器数据。
- `trace:spectrogram` / onSpectrogram、`trace:reference` / onReference：独立有界数组流，带查询/来源/配置身份，经 preload 转移到 renderer，旧回包不得覆盖新呈现。

NativeMeterSnapshot 公开 sourceKind/sourceId/epochId/measurementEpoch、active/error、`format: SourceFormat`、measurementConfigId、positionFrame/measurementFrames、levelIndexFrame/loudnessIndexFrame、continuity、各声道 Peak/RMS/TP、M/S/I/LRA/MAX TP、lraProvisional 和有界历史。采样率在 `format.sampleRate`，不是快照顶层 sampleRate；文件整段 I 在 `fileView.wholeFileIntegrated`，原生输出代次在 `playback.generation`，没有草案中的顶层 playbackGeneration。

Meter v5 的电平与完整响度记录均为 10 ms 实际索引；曲线呈现可降采样并保持有界，不代表每个采样点都有独立 LUFS。录音会话视图使用 `timelineRate=1e9` 的纳秒坐标；不能按当前设备采样率解释跨区域时间轴。控制 revision 不因每帧音频刷新而改变，呈现快照另有有序 eventSequence。FILE 按已呈现位置查询确定历史，循环不累加 I。

## 原生所有权、质量与恢复

音频块仅在工作线程内部传递，含帧位置、设备/QPC 时钟、标志及自有 PCM 区域。ReleaseBuffer 前复制到预分配池；消费者归还块后才复用。采集不等待 UI/磁盘/编码，不用可覆盖显示队列作为录音源。停止时等待受控排空与引用释放。

`record.start` 的 UI armed 时间不是采集起点；NativeRecordSnapshot 后续确认 startFrame，stop 排空后公开 endFrameExclusive/writtenFrames/segments，转换/哈希仍可能 processing。多区域 currentRecord 表示用户录音意图，重连期间持续存在，实际区域各有格式/帧时钟；见 [23](archive/iterations/23-M2-CONTINUATION.md)、[24](archive/iterations/24-M2-WAV-PRECISION.md)。

ReplayFreeze v3 的 quality v1 为 `{version:1,estimatedFrames,gapFrames,unknown}`，两项计数是十进制帧字符串，覆盖当前不可变冻结范围。replaySave 的可选 quality 只覆盖 startFrame/endFrame 选区，由原生对象计算；旧字段缺失兼容保存但标记 unknown。导出保留来源 continuity（complete/estimated-silence/gaps/unknown），旧导出只追溯元数据，不要求原 PCM 仍存在；媒体哈希通过不等于原采集完整。见 [73](archive/iterations/73-CLOUD-CODE-REVIEW.md)。

报告 jump 与普通 seek 均释放输出、恢复原监听意图、不自动发声。录音/缓存准备失败统一恢复后台服务，退出/文件库维护/活动录音时保持暂停。正常关闭等待录音收尾和文件任务，后台状态不能由 renderer 自行猜测；Windows 故障/退出专项仍按 [当前交接](13-HANDOFF.md) 跟踪。

## 2026-10-11 增量接口（preview.32）

见 [84](archive/iterations/84-P0-P1-CLOUD-ITERATION.md)。InstrumentSettings v2 严格迁移 v1（新增频率平滑与倾斜，保持 trace-spectrum-v1 分析身份）。Request v1 新增 reference.match(enabled)、markers.list/save/remove/jump、chart.prepare/save、report.markerJump；仍只有主进程解析内部来源/路径。marker v1 以 PCM/媒体/解码范围内容身份绑定。ReportResult v1 可携带 marker/distribution v1 增量数据；历史报告保留原字段，summary.csv 增加两个 JSON 列。spectral overview v1 使用独立有校验的文件，原始 tile v1 不变。性能诊断 v1 为增量诊断，原生分位数为微秒 log2 桶上界、TS 分位数为最近 2048 次窗口；不改变计量或录音数据协议。

2026-10-15：标记跳转、报告标记跳转和导图释放输出后恢复请求中的监测；选区同步 A/B 范围。复核暂停采用持有计数，录音准备/录音/库维护/退出时禁止恢复 retention。PNG 在解码前校验 IHDR 的固定 1000×620 尺寸。修复与证据见 [85](archive/iterations/85-CODE-DOCUMENT-REVIEW.md)。

file/report worker 的任务消息仅在进程所有权建立后发送；正常结果在所有权释放后返回。Windows 主进程持有 Job Object，硬退出时可终止阻塞原生文件 worker；异步 worker 同时监听 IPC disconnect。旧 WAV 后处理不再绕过媒体 supervisor。见 85。
