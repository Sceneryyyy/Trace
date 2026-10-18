# 22 · 设备重设续录：时钟与时间映射基础

2026-09-15。本文保留时钟/映射基础阶段的设计与验证。自动重连、多区域 schema v2、会话视图及恢复已在后续接通，当前实现和门禁见 [23-M2-CONTINUATION](23-M2-CONTINUATION.md)。以下“下一步”描述是该基础阶段的历史交接。

## 当前新增能力

### 原生区域时钟

AudioBlock 保留原始 packet QPC 和 packet 内帧偏移。Recorder 根据实际成功写入的完整帧更新 startQpc100ns/endQpc100ns；部分写盘失败不把未写帧计入结束时间。

CaptureClock 提供帧到 QPC 的映射；设备空闲补齐的时间继续标 estimated，失去可信锚点返回未知。N-API 用 null 表示未知端点；开始/结束各自保留 estimated 标记。

native journal 的 prepared/begin/checkpoint/close 已有单调 seq。checkpoint/close 记录已写前缀的时钟和质量。正常完成的 Session.takes[0].clock 也持久化这组信息，domain 来自本次应用捕获实例。

GetBuffer 的 QPC 是 packet 首帧的 100 ns 时间，不是原始 QPC ticks；依据：[Microsoft IAudioCaptureClient::GetBuffer](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer)。

### 可重连故障分类

CaptureRecovery.h 仅把采集阶段的 device/resources invalidated、audio service stopped、buffer reset pending 归为可重连。E_POINTER、调用顺序错误及 analysis worker 错误不自动当成设备断开。

snapshot diagnostics 包含 sourceRecoverable/sourceErrorCode，供下一步控制器使用。当前并没有自动消费该标记启动重连。

### SessionTimeline

src/trace/sessionTimeline.ts 提供区域内源帧、已保存内容时间及跨区域缺口信息：

- 每个 region 保留自己的采样率、声道、帧边界、epoch 和 QPC domain。
- 内容时长使用有理数累计，避免按段反复取整引入漂移。
- 内容时间只包含实际保存音频；设备间隔另有 gapBeforeNs/overlapBeforeNs 和质量标记，未知为 null。
- 不跨 QPC domain 比较时钟；不跨 epoch 直接比较设备帧号。
- 同一内容位置的纳秒/源帧映射使用 BigInt，支持超过 JS 安全整数的起始帧。
- 文件列表已使用每个资产的实际采样率计算 durationNs，混合率标为“多采样率”。尚未准备统一会话视图时，不伪装成同率整段分析。

## 已验证

- Native CTest 8/8。新增加 4 个 region clock case，原有数值、录音、TP 与并行初始化检查仍通过。
- 96 kHz 部分写入夹具：只写入 500 帧，正确包含 packet 内 4800 帧偏移，结束 QPC 为实际可用前缀；时钟质量不误标。
- 原生估计静音时钟保留 estimated；失去时钟锚点不返回伪时间。
- 5 个时间映射 case：96→48 kHz、1000 个混合率短段、四种率的逐帧往返、未知时钟/重叠、非法边界。
- 同率/混合率文件摘要、恢复与协议检查合计 19/19 JS case 通过。
- 真实三 WAV 录音、UI 录音、重开、硬杀恢复、分析 UI 回归通过；严格的 Session 时钟字段最终短复验通过，UI 15 项通过，重开与类型检查通过。
- .tools/m2-region-*.log 保存当前记录；8/8 原生证据在 .tools/m2-region-clock.log。

以上 96→48 kHz 是确定性数据/时钟夹具，不是修改过系统混音格式的实机验收。

## 下一步控制器设计约束

下一次直接接区域生命周期，不重做上面的基础层：

1. 一次用户 REC 保持一个 session/take ID；每次重连创建新 native region ID、新 captureEpochId 和独立 WAV basename/journal，旧文件不覆盖。
2. 等旧 native Recorder 排空后再重开同一 deviceId。只有 sourceRecoverable 且用户仍要录音时自动重连；磁盘背压/写盘错误/程序故障应结束并保留前缀。
3. 所有异步重试带 intent generation。停止、退出或新会话必须使旧重试失效；重连中“结束录音”保持可用，不能后来自动重录。
4. 用户等待期间不写伪静音填缺口。新区域收到首帧后，用双方已写边界的原生时钟计算间隔；未知、估计、重叠分别保存。
5. 会话写入采用 schema v2，支持只读加载/迁移 v1。当前 save() 把所有 segment 的 rate/epoch 写成全局值，接多区域之前必须拆开。
6. 每个 region 分别保存格式、帧数、时钟、故障和 journal 路径；根事件日志与 native journal 分开，序号明确；原子 JSON 写入按 session 串行化。
7. 录音时长/全长概览跨区域继续增长；当前输入 Meter 在新 region 重置时必须标“当前连续段”，不能冒充整次录音 I。
8. 停止后生成固定分析率的“会话视图”，仅拼接已保存音频并标断点；对跨率/声道输入先流式转换到统一格式，再统一分析，不能平均各段 LUFS。原始段保留实际格式。
9. 同率分段需连续处理，不能在每个 2 GiB 文件边界重置 SRC/DSP。源、成品、恢复和会话视图要有明确身份。
10. 恢复要遍历各 region 的有效检查点与实际文件，不能用一个全局采样率修复所有段。旧区域已确认音频不能因当前段失败而丢失。
11. 必要测试：两次断开/不同率、重连中停止、旧异步重试晚到、源不支持/未回归、磁盘失败不自动续录、空段、硬杀恢复、QPC 未知/重叠、源/会话视图统计独立。
12. 可以用明确标识的注入故障与真实 WASAPI 重开验证控制器；不能把注入故障当实际驱动格式切换。不要修改 Windows 全局声卡格式。

M3 原始 EBU 素材门禁仍未关闭，M4–M6 未实现。总目标保持原范围。

## 基础阶段的收尾状态（历史）

artifacts/m2-regions/checkpoint.json 记录源码/二进制和真实证据，automaticContinuationImplemented=false。当前已完成时钟/映射基础及兼容性回归，尚未实现自动续录。M3 的旧 checkpoint 是此前 v4 数值/时间阶段记录；本轮只增加源时钟与显示时长，计量配置仍为 v4。
