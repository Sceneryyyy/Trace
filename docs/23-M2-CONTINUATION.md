# 23 · 同会话续录与录音快照一致性

2026-09-15。M2 设备重设开放项已接通自动续录、多区域会话、会话视图和恢复。本文记录实现与最小工程门禁；真实驱动格式切换/拔插和原始 EBU 素材验收仍开放。

## 实现范围

- 一次 REC 保持一个 session/take ID；重连后建立新的 native region ID、capture epoch、WAV basename 和独立 journal。
- 只有原设备的可重连采集故障触发重试。旧录音排空后重开原 deviceId，等待采用 500 ms 至 5 s 退避；不静默切换端点。磁盘背压、写盘错误和程序故障终止当前会话。
- 停止/退出递增 intent generation，晚到的重连结果不能启动录音；重连期间“结束录音”保持可用。
- 等待重连期间不写填充音频。每区域保存实际采样率、声道、完整帧数、QPC 两端及 estimated 标记；未知时钟、缺口和重叠单独记录。
- REC 全长概览使用实际已保存内容的纳秒时间轴；断点有标记。跨区域时表头明确为当前连续段 I/Max TP，停止后的会话视图分析覆盖所有已保存音频。
- 不修改 Windows 全局声卡格式。本轮真实采集为本机 48 kHz；96→48→44.1 kHz 的格式变化通过明确标识的夹具验证。

## 代码与数据

| 模块 | 责任 |
| --- | --- |
| sessionStore.ts | schema v2、v1 内存归一化、按会话串行原子 JSON 保存、根事件日志 |
| sessionTimeline.ts | 各区域帧/内容纳秒的 BigInt 有理数映射，缺口与重叠质量 |
| recording.ts | 用户录音意图、区域生命周期、重试代次、停止/退出与恢复 |
| recordingDisplay.ts | 有界全长波形/响度概览，严格核对点所在区域的边界 |
| wavPostprocess.ts | 流式区域规范化、会话视图、指定 WAV 成品 |
| Recorder.cpp | 独立写盘、实际写入前缀、计量及原生时钟的一致快照 |

schema v2 的 regions 保留各自的 format、frames、start/endFrame、clock、error、encoding、journalFile。原始/恢复资产带 regionId；每个 segment 使用本区域采样率和 epoch。全局 captureEndFrame 不跨 epoch 伪造连续帧号，内容时长由各区域精确累计。

资产 role 为 source、recovered、session、deliverable。多区域 source/recovered 分析必须明确 regionId；文件列表提供连续段选择，session 可统一分析全部已保存内容。派生资产被替代时保留实际文件，并从当前可用目标中排除 superseded 项。

会话视图固定为手动目标率或初始来源率、最大源声道数、float32。先把每个区域的连续源分段交给同一次 FFmpeg 转换，再拼接规范化文件；2 GiB 文件边界不重置 SRC。单声道转双声道各乘 0.70710678 保持总能量。会话缺口不插入伪静音，viewParts 保存实际输出帧映射。原始文件始终保留。

需要手动采样率时额外生成所选 PCM16/24 或 float32 成品。成品独立检查格式/完整帧数并建立分析身份。流式转换临时目录在确认实际路径和任务归属后清理。

恢复逐个区域读取 journal 和真实 WAV，按该区域格式生成恢复副本；核查已确认帧数不缩水。超过 checkpoint 的尾部不伪造结束 QPC。多区域恢复后可生成新的会话视图，原文件哈希不变。

## 截图异常的根因与修复

用户截图显示主进程 REGION_POSITION_OUT_OF_RANGE，经 RecordingDisplay → SessionTimeline 抛出。

原 Recorder 写盘线程先在一个 mutex 临界区推进 Meter/波形，再在另一个临界区发布 writtenFrames；QPC 又是独立更新。snapshot() 因此可能取得“新波形 + 旧帧数/时钟”。严格区域映射发现越界，而主进程定时器没有错误边界，最终弹出 Electron 未捕获异常对话框。

修复将成功写入块对应的 Meter、波形/响度、writtenFrames、clippedSamples、estimatedFrames 和 QPC 两端放在同一个临界区内发布。磁盘写入仍在锁外；采集生产者仍只写预分配有界队列，不取得此锁。波形不通过裁剪或丢点掩盖错误。

主进程轮询同时有受控异常处理：保存诊断，停止当前 take，保留实际已写音频，明确标记失败；不复用无效显示数据。重新连接后可以继续录音，同类错误再次发生也会重新显示。此保护不把不一致数据算作正常录音。

计量数值配置保持 trace-meter-v4-ebur128-1.2.6-lra10hz-tpaligned；没有修改计量算法。原生二进制 hash 改变会让旧文件缓存独立失效。

## 最小门禁与证据

实际命令：

```text
node tools/build-engine.cjs
node tools/trace.cjs AppBuild
node tools/m3/continuation-gate.cjs
```

- Native CTest 9/9：原有音频/文件/数值回归保留，新增并发快照测试。
- 修复前并发基线在 44.1/48/96 kHz 三组均失败：12252、12166、4824 次不一致。日志 .tools/recorder-snapshot-before.log。
- 修复后同一测试读取 382380、605193、834947 次，三组均 0 次不一致；帧数与重新读取 WAV 一致。日志 .tools/recorder-snapshot-after.log 及 build/trace-engine/Testing/Temporary/LastTest.log。
- JS 27 个边界/生命周期检查：跨率三段、手动 PCM 成品、迟到重连、停止、磁盘失败、错误 epoch/device、区域准备失败、显示故障保留文件。
- 真实 WASAPI + 明确注入的失效：连续三轮，每轮 12 项，包括三段同会话、原始/会话视图独立分析、重连中停止。
- 主进程故障注入：越界被捕获、失败文件保留、错误可见、重新连接、重复故障、后续录音。
- 两区域实录硬杀恢复、96 kHz 单声道 + 48 kHz 双声道混合恢复夹具、旧单区域恢复均覆盖；恢复不改原始文件。
- UI 录音 15 项、重开、M3 文件分析 UI 10 项纳入回归。

统一结果在 artifacts/m2-regions/continuation-gate-latest.json，各次报告和日志另存 gate-* 目录。脚本逐项核对退出码、报告时间和 status；某个 Electron 子测试 exit 0 但报告 fail 时，门禁必须失败。

保留此前失败记录：wasapi-1789473649621 的新区域超时、recovery-1789472755320 的 seed 超时，以及先前文件分析按钮暂不可用。快照竞态已独立复现；修复后的多轮应用回归用于验证当前行为，不声称已证明每个旧超时只有同一个原因。

## 未验收与后续

- 实机 96 kHz、物理拔插、驱动主动格式变化仍未验收；注入失效不是这些硬件场景的替代。
- 手动率整数成品的削波计数已在后续补齐，见 24；保留本文快照修复阶段的原始测试计数。
- 原始 EBU WAV 测试集未取得。用户允许继续开发；18 个生成参考测试和 233 个 TP 时间组合不替代原始素材。
- 后续推进 M4 FILE 输出、呈现时钟、seek/暂停/循环和选区统计。M5 三格式成品与 M6 桌面交付仍未完成；全项目目标保持开放。

后续状态：M4 已接通并通过最小工程门禁，见 25；本文件保留此前 M2 阶段的实现与验证记录。
