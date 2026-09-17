# 06 · 模块接口与消息契约

M12 参考：reference.set/clear/activate/range/configure/retry 使用来源 ID、A/B 槽、十进制帧范围与有界纳秒偏移，禁止路径参数。TraceState.reference 仅含来源/分析摘要及差值；ReferencePacket 通过 trace:reference → preload 独立转移流发送，带版本/序号/配置键和各自真实查询位置，不保留过期数组。workspace v4、引用释放与原生两槽调度见 54/55。

M12：新增 imports.choose/refresh/cancel/prepare/relocate/clearCache/remove/removeExport/rename/openSource/openFolder/openRoot；通用命令仅接受 ID/选项/名称。TraceHostAPI/TraceAPI 增加 importFiles(File[])，preload 通过 webUtils 解析磁盘 File，经专用 trace:import-files 通道送入主进程；主窗口/mainFrame 和批量上限同时验证。TraceState 携带有限字段的 imports/importIssues，刷新与取消不等待 mutation 队列，读取回复不进入完成缓存。旧的快照/声谱数组转移语义保持。见 53。

M11：新增 targets.configure 与 report.prepare/get/cancel/retry/jump/open/export，严格 ID/范围/事件索引白名单，无来源或输出任意路径。TraceState 仅携带目标设置及有限任务摘要，report.get 按需获取结果、不进入命令回复缓存。AnalysisService 引用由 Set 改为计数，报告取消后须等 worker 退出才释放。完整 payload、取消及源清理契约见 [51](51-M11-INTEGRATION.md)。

preview.20：声谱包增加 cancelled，表示应用解析器确证原引用已不适用；前端重试当前来源。结构错误、原生/文件故障仍走 error。取消不以捕获错误字符串替代，见 49。

M10 / preview.19：spectrogram.configure 接受 settings v2，surface 仅影响显示，不改变 configKey。preferences.retry 仅重试当前设置快照，TraceState.preferencesError 单独表示设置持久化失败；不会触发采集恢复。before-quit 等待 PreferencesWriter.flush。测试窗口可明确禁用 WebGL，且仅在 --trace-test 与测试环境变量同时存在时生效。见 49。

M9 内部接口增量：SpectrogramService.query 接收内部来源、FFT/声道配置及可视区，返回有界 SpectrogramView；point 返回实际窗起止/bin/Hz/状态和值；cancel/close 抑制旧视口并等待释放。视图使用独立数组与覆盖掩码，原始点不返回像素汇总值。Native spectrogramTile 一次最多 64 列，与瞬时仪器共享两任务上限。具体类型和语义见 spectrogramSource.ts/spectrogramView.ts/spectrogramService.ts 与 43；renderer 白名单已增加 spectrogram.configure/query/point/cancel，query 只带来源引用与范围，point 绑定 queryId；大数组经独立 trace:spectrogram 流发布，新增 TraceAPI.onSpectrogram，不进入命令回复缓存。SpectrogramPresenter 负责请求/来源释放与旧回包淘汰，见 46/47。preview.17 包增加 configKey，FILE 引用可携 analysisId；绘制前比较来源/epoch/分析 ID/配置。时间范围改变可保留同来源、同配置、有实际坐标的旧分辨率图像。内部路径参数仍不暴露给界面。

M8：新增 instrument.configure，payload 仅为 {settings}，数值/枚举范围见 instrumentTypes.ts；前端不发送文件路径。MeterSnapshot 可携带 instruments（configKey、phase、经校验的 NativeInstrumentResult），文件与实时均按同一呈现上下文发布。旧代次/来源/设置回复不覆盖新状态。native instrumentAnalyze 为内部四来源异步接口，最多两个任务；见 41/42。

M7：协议 v1 白名单新增 workspace.configure，payload 仅允许 {workspace: WorkspaceState}。严格验证树深≤8、仪器叶子唯一/完整、分割比例 0.15–0.85、显示选项、预设 ID/名称/数量与序列化上限；不接收路径、设备、REC 或计算参数。TraceState 增加 workspace；该命令更新/保存布局，避免触发全局 busy 和历史重置。实际接口见 workspace.ts/shared.ts/contracts.ts，迁移规则见 39。

preview.4 实际契约见 shared.ts/contracts.ts 和文末补充。view.inspect/view.live 为协议 v1 白名单扩展；replayFreeze 元数据为 v2。历史来源不等于页面，见 31。

协议 v1 产品目标。实际唯一类型定义为 src/trace/shared.ts，白名单校验为 contracts.ts，状态控制器为 main.ts。M1/M2 已实现部分见文末；FILE/回放/选区/导出表项仍是后续实施契约。

## 基础类型

```typescript
type U64Text = string; // JSON 十进制非负整数；原生 uint64，TS 校验后 BigInt
type ViewMode = 'LIVE' | 'REC' | 'FILE';
type MetricState = 'ready' | 'silence' | 'insufficient' | 'gap' | 'error';
type Metric = { value: number | null; unit: 'dBFS' | 'dBTP' | 'LUFS' | 'LU'; status: MetricState };
type SourceFormat = {
  sampleRate: number;
  channelCount: 1 | 2;
  encoding: 'pcm-int' | 'ieee-float';
  containerBits: number;
  validBits: number | null;
  channelLabels: string[];
};
type Request<T> = {
  protocolVersion: 1;
  requestId: string;
  command: string;
  expectedStateRevision: number;
  payload: T;
};
type Reply<T> =
  | { requestId: string; ok: true; stateRevision: number; data: T }
  | { requestId: string; ok: false; stateRevision: number; error: RecorderError };
type RecorderError = {
  code: string;
  message: string;
  recoverable: boolean;
  affectedTakeId?: string;
  affectedAssetId?: string;
};
```

`sampleRate` 必须为实际支持的正整数；声道数超过 2 时在进入该类型前返回不支持，不截成双声道。`ready` 数值必须有限；静音和无效状态使用 null。格式能力由引擎提供，前端不可硬编码全部可能组合并假装可用。

## 命令表

| 命令 | 参数 | 成功返回/约束 |
| --- | --- | --- |
| `devices.list` | 无 | 稳定 deviceId、标签、默认标记、实际格式或明确查询失败 |
| `live.start` | deviceId | epochId、actualFormat；不创建音频文件 |
| `live.stop` | epochId | 停止常驻监测；REC 中拒绝，先结束录音 |
| `live.reset` | epochId | 新 live 测量周期；REC 中首版拒绝 |
| `record.start` | deviceId、outputPresetId、目标目录句柄、命名参数 | takeId、segmentId、actualStartFrame；LIVE 采集不中断 |
| `record.stop` | takeId | actualEndFrameExclusive、源资产状态、exportJobId 可空 |
| `file.open` | assetId 或文件对话框授权句柄 | 资产信息、可播放范围、分析状态；仅非 REC |
| `playback.play` | assetId、positionFrame、generation | 实际起播位置、generation |
| `playback.pause` | generation | 最后呈现的文件帧；冻结表头 |
| `playback.seek` | assetId、positionFrame、generation、resume | 新代次定位；仅最新代次有效 |
| `playback.volume` | gain 0..1 | 不改变文件测量和导出音量 |
| `timeline.query` | assetId、startFrame、endFrame、pixelWidth、requestGeneration | 指定分辨率波形页、有效范围；不回传整段文件 |
| `metrics.query` | assetId、positionFrame、requestGeneration | 最近的不晚于该位置的索引和实际索引时间 |
| `selection.analyze` | assetId、startFrame、endFrameExclusive | 独立 analysisJobId，边界变化取消旧结果 |
| `export.start` | sourceAssetId、选区可空、outputPreset、目标句柄 | jobId、resolvedOutputFormat |
| `job.cancel` | jobId | 取消状态；不删除源文件 |
| `view.returnLive` | deviceId | 停止文件输出、重开 live epoch |

同一 `requestId` 的重试不得重复创建 take 或重复关闭文件。控制器保存最近已完成结果；跨进程重启后由 session/take 状态恢复，不靠内存去重假装恰好一次。连续 stop 返回同一终止边界。非法状态转移返回 `INVALID_STATE`，不能隐式重录。

## 原生音频块契约

音频块仅在音频工作线程内部传递，不作为 renderer IPC 高频载荷。块含：bufferId、epochId、sequence、firstFrame、frameCount、formatId、可空设备位置/QPC、flags、PCM 区域引用。所有权由池和引用计数或等价机制管理；WASAPI ReleaseBuffer 后的数据必须已经复制到本模块拥有的区域。

队列消费者归还块后才可复用；清空/停止时等待受控回收，不让播放线程继续引用销毁的 decoder 缓冲。队列只保留索引/引用，不能在 capture thread 无界扩容。异常路径须覆盖停止时仍有块、设备拔出、写盘线程退出和重复关闭。

## 事件

```typescript
type MeterSnapshot = {
  protocolVersion: 1;
  eventSequence: number;
  sourceKind: 'live' | 'take' | 'file';
  sourceId: string;
  epochId: string;
  playbackGeneration: number | null;
  positionFrame: U64Text;
  sampleRate: number;
  levelIndexFrame: U64Text;
  loudnessIndexFrame: U64Text;
  channels: Array<{ samplePeak: Metric; rms: Metric; truePeak: Metric }>;
  momentary: Metric;
  shortTerm: Metric;
  integratedToCursor: Metric;
  wholeFileIntegrated: Metric | null;
  loudnessRange: Metric;
  continuity: 'complete' | 'estimated-silence' | 'gaps' | 'unknown';
};
```

`positionFrame` 表示当前上下文的位置；`levelIndexFrame` 和 `loudnessIndexFrame` 分别公开 10 ms 电平与 100 ms 响度的实际索引位置，不能用一个索引字段混合两种步长，也不能误称每个采样点都有独立 LUFS。文件事件还需资产版本/hash 关联；新文件的事件不能写入上个文件的面板。

其他事件：`state.changed`、`source.formatChanged`、`source.discontinuity`、`record.segmentClosed`、`record.failed`、`asset.ready`、`analysis.progress`、`export.progress`。事件带状态版本、来源 ID 和有序序号。`stateRevision` 只在控制状态或配置改变时递增，不因每次音频快照递增；否则正常查询会不断被误判为过期。UI 丢掉过期快照；控制器状态是权威，不让三个 React 组件各自推断录音状态。

## 错误与生命周期

稳定错误码至少包括 `DEVICE_UNAVAILABLE`、`UNSUPPORTED_FORMAT`、`ENCODER_UNAVAILABLE`、`DISK_FULL`、`DISK_BACKPRESSURE`、`CAPTURE_GAP`、`ANALYSIS_GAP`、`CORRUPT_CACHE`、`STALE_REQUEST`、`INVALID_STATE`。技术细节写日志，用户文案见 05。

打开文件、定位、查询波形与分析均可取消。generation 只在相应上下文递增，不用系统时间拼伪序号。开始新 REC 不复用旧 takeId；关闭窗口先结束录音并落实文件状态，后台编码的退出策略要显示给用户。

参数校验和状态机测试属于 M1/M4；实际测试 ID 见 A10、A11、A13。

## M1/M2 实际接线

shared.ts 当前实现 state.get、devices.list、live.start/stop/reset、view.window、record.configure/chooseDirectory/start/stop/openFolder/recover。目录由主进程对话框授权，renderer 仅提交预设或 takeId，不提交任意绝对文件路径。

record.start 创建 take 并在原生就绪后返回；第一音频块的实际 startFrame 通过后续 NativeRecordSnapshot 确认，不能把 armed 阶段的 UI 请求时间当开始帧。record.stop 等待原生排空，返回 endFrameExclusive、writtenFrames 与分段；转换/哈希仍可处于后台 processing。

控制器用串行 mutation 队列和 requestId 的运行中/已完成结果缓存（256 项），重复 start 不生成第二个 take。stateRevision 只随状态/设置变化；音频快照另有 eventSequence，前端拒绝旧状态事件。

恢复前核对连续源分段和 journal 的最后有效检查点；不同位置未知尾部使用 null/unknownTail。后台恢复进程正常退出后发布结果，应用退出等待录音排空和文件任务。后续 M3/M4 将扩充资产与定位代次，不能用当前 take 全長概览冒充 FILE 历史缓存。

## M3 实际接线

- analysis.start：takeId + role（source/deliverable/recovered/session），可带 regionId；多区域原始/恢复分析需要选择区域。regionId 仅允许 source/recovered，返回 jobId。主进程解析已拥有的资产路径。
- job.cancel：jobId；等待所属进程退出后清理本任务临时缓存，不删音频。
- metrics.query：analysisId + positionFrame + requestGeneration；返回实际电平/响度索引和整段统计。
- timeline.query：analysisId + startFrame/endFrame + pixelWidth + requestGeneration；像素列 1–2400，返回同轴波形与实际响度索引。

两项 query 不要求控制 revision 匹配。状态另带 eventSequence，进度不倒退；playbackGeneration 仍待 M4。录音前暂停分析，停录后同一任务重新开始或重用已验证缓存。被查询的页损坏时进入受控重建，连续失败后保留错误，避免无限循环。

这是文件历史查询和后台任务，不是 FILE 音频呈现/seek 已完成的声明。

## M2 多区域增量

currentRecord 表示用户级录音意图，包含 phase、durationNs、regionCount 和 retryError；它在设备重连期间仍存在。NativeRecordSnapshot 对应一个连续区域。recordingView 提供纳秒时间轴的有界波形、响度、gapFrames 和声道数，不能按当前设备采样率解释其位置。主进程拒绝 REC/重连期间手动切换/停止/重置 LIVE。截图中的 REGION_POSITION_OUT_OF_RANGE 已定位到原生发布竞态，修复及 RECORD_SNAPSHOT_FAILED 的受控失败语义见 23。

## WAV 精度增量

NativeRecordSnapshot.segments 可带 clippedSamples，TakeSummary 带当前资产的 clippedSamples 与 sourceClippedSamples。file-worker 的 quantize 是内部任务，renderer 不获得文件路径、PCM 或通用转换接口。完整语义见 24。

## M4 实际命令与状态

file.open 接受 takeId/role/可选 regionId；file.close 返回 LIVE。playback.play/pause/seek/volume/selection/window 均绑定当前 playbackId，非法范围拒绝，renderer 不提交路径。PlaybackView 保留播放意图、视窗与选区；快照公开实际呈现帧、原生 generation/clock/padding 和 rawModeApplied。历史异步查询核对文件身份、输出代次和视窗代次。选区 AnalysisJobView 带 selectionRange，文件列表整段统计忽略选区任务；缓存键版本 2。见 25。

## M5 实际契约

export.start 使用 takeId/role/可选 regionId 或 exportId、可选 range 和严格输出 preset；export.retry/openFolder/saveCopy 只接受 exportId。另存路径只能来自主进程文件对话框。file.open/analysis.start 支持 role=export 与 exportId。job.cancel 按已拥有的任务 ID 路由。录音设置版本 2 支持 MP3/AAC，旧 WAV 三字段仍兼容。成品逻辑范围通过 decodeRange 映射，分析键版本 3 包含 mediaIdentity；见 26。

## M6 新增命令与状态

- view.settings：严格校验 targetEnabled、targetLufs（-60..0）、waveGain（1/4/16），持久化到显示设置；只影响画图。
- playback.follow：校验 playbackId 与 enabled。手动 playback.window 关闭跟随；播放头越出窗口时，在启用跟随的情况下移动共享窗口。
- retention.retry：按 takeId 重试用户已请求的原始文件整理，不改变录音保留意图。
- app.info / app.quit：本地产品诊断与正常退出；app.info 是只读命令。测试根目录和窗口覆盖只在 --trace-test 下启用。
- MeterSnapshot.timelineWindow：REC 概览可视范围使用 timelineRate = 1e9 的时间坐标；录音的实际 writtenFrames、设备帧与时钟继续由原生提供。

协议主版本保持 1，recordSettingsVersion 升至 3；计量算法、二进制页和 analysisCacheKeyVersion 均未因 M6 显示设置改变。

## preview.2 接口增量

新增 live.replay（空 payload）、library.refresh（空 payload）、library.remove（takeId，另可带 exportId）。全部经白名单、参数及 revision 校验；移除命令由主进程展示范围确认，renderer 不能提供任意路径。

PlaybackView.temporary 标明内存历史，AnalysisRole 不扩展为伪文件；临时 PCM 不通过 IPC。Native replayFreeze/playbackReplayOpen/replayView/replayAnalyze 只处理原生冻结缓存，选区任务串行并忽略旧上下文结果。Native LIVE diagnostics 增加 replayFrames 与 replayCapacityFrames。协议主版本 1、Meter v4、Session 2、磁盘分析缓存 key 3 均保持。

## preview.3 参数与采集状态

view.window.seconds 为有限 number，5 ≤ seconds ≤ 60；view.gain 只接受 gain，1 ≤ gain ≤ 4。新增 devices.select，只接受 deviceId；监测关闭时仅选择来源，开启时切换实际监测。

TraceState.monitoringRequested 与 active 分开；record.start 不再要求监测已开启，但仍要求有效来源并完成目录选择。displaySettingsVersion 2 接受连续 waveGain，读取旧 ×16 时迁移到 ×4；RecordSettings version 3、Session 2、ReplayInfo 1、磁盘分析 key 3 和 Meter v4 均未改动。正常关闭会刷新尚未落盘的显示偏好。

## preview.4 统一工作台扩展

- view.inspect：sourceKind(live/take)、sourceId、epochId、measurementEpoch、positionFrame、startFrame、endFrame，以及可选 selectionEndFrame。首次固定缓存并验证来源；同一手势沿用快照和原坐标映射。整数范围、白名单与状态代次均校验。
- view.live：关闭历史上下文并跟随最新，健康采集不重启；非 REC 时可启动已关闭的监测。file.close 仍按原监测意图返回。
- file.open：只打开数据/分析上下文，不停止采集、不初始化输出。
- playback.play：仅非 REC，先暂停输入，按需打开输出。pause/seek 关闭输出、恢复原监测意图；seek 不自动发声。
- PlaybackView/FileView 增加 timeOffsetSeconds；PlaybackView 增加 outputReady。generation 为查看请求代次，diagnostics.nativeGeneration 为实际输出代次。
- replayFreeze(recording=false) 返回 version=2 和绑定的来源信息；replayRelease() 释放固定快照，未完成任务保留自己的共享引用。

## preview.8 呈现更新

协议 v1、file generation、音频/磁盘缓存语义不变。主进程在 seek / inspect 完成后触发只读历史快照，周期采样继续兜底；发布仍校验 sourceId、generation 与窗口。renderer 按同一身份验证并保留上一完整呈现，等待新快照不会占住主命令队列。录音观察与历史浏览持续并行。见 32。

## 三批迭代的前两批接口

新增 playback.retryAnalysis / playback.clearSelection（playbackId）；原位重试保留游标、选区和窗口，并换用新分析引用/代次。新增 AssetFormat 与 analysisError，文件元数据独立于输出 float PCM。

新增 library.rename（takeId/name）、library.storage（只读）、library.clearCache（takeId）、library.pruneMissing（空参数）；清理使用主进程范围确认。清缓存前核对成品 hash，缺失或变化的成品保留解码音频。维护期间释放分析引用并保护原始音频。

export.configure 持久化最近 ExportPreset；export.describe 返回逻辑来源说明；export.start 可带 saveCopy 布尔值，另存路径只由主进程目录对话框取得。ExportRecord 可选 delivery 状态；重启后的未完成交付转为失败，持久化记录本身不会触发新写入。录音优先暂停另存，继续时复用已授权目标、核对已有文件，禁止覆盖不同内容。export.openDeliveryFolder 按 exportId 打开已完成交付目录。

新增 record.capacity、app.configure（confirmExitWhileRecording）、app.diagnostics、app.copyDiagnostics。诊断只输出固定字段，不含个人路径、录音名称、设备标识或 PCM。录音中窗口关闭确认可配置；普通退出流程保持完整收尾。

Native LIVE diagnostics 与 RecordSnapshot 增加 replayStartFrame/replayEndFrame，范围与 freeze(true) 一致，不复制 PCM。RecordingView.inspectableRange 映射为会话纳秒。Native I/O 边界使用 Windows 扩展路径，元数据/缓存身份仍用原逻辑路径。协议主版本 1、Session 2、磁盘缓存键版本 3、Meter v4 均保持；均为可选字段和白名单扩展。

## preview.9 缓存保存

cache.save 只接受 playbackId 与 useSelection 布尔值。主进程校验当前固定缓存与范围，再选择已授权录音目录。Native replaySave 只在受信主进程接收路径，校验 sourceId、originFrame、frames、epochId、measurementEpoch 与当前冻结对象一致，持有不可变共享引用，在工作线程保存。

保存结果返回新 takeId，原历史上下文保持。新的源文件和压缩成品各自自动排入独立分析；旧播放 ID、超范围、任意路径及格式外字段均拒绝。该扩展不启动 REC，不重启健康监测，不改变 Meter v4 或二进制缓存格式。
