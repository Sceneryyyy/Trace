# 26 · 三格式录音、导出与独立解码

2026-09-15。M5 已接通 MP3、AAC-M4A、AAC-ADTS 的录音预设、后台成品、整段/选区导出、回听/分析、取消重试和另存。完整组合门禁已通过；最终结果与当前运行文件绑定于 artifacts/m5/gate-latest.json 与 checkpoint.json；M3 原始 EBU 素材和 M6 发布验收仍开放。

## 格式与预设

- WAV 保留跟随来源以及 44.1/48/88.2/96 kHz，PCM16/24/F32。
- MP3 为 libmp3lame，44.1/48 kHz，128/192/256/320 kbps CBR，默认 192。
- AAC 为 AAC-LC，44.1/48 kHz，128/192/256 kbps 目标码率；默认 M4A，另提供 ADTS .aac。
- AAC 是目标平均码率；简单信号/静音的实际码率可能低于目标，不能把该行为标为固定 CBR。
- 压缩格式不显示 PCM 位深或 96 kHz 选项。
- recordSettingsVersion=2。旧 WAV 三字段设置保持原样兼容，压缩设置使用 format/bitrate/container 等字段；不会留下“24-bit MP3”含义。
- FFmpeg/ffprobe 仍为锁定的 9.0.1；启动任务核对二进制 SHA256，未升级依赖。

## 录音和导出链路

压缩录音在采集期间保存实际来源率的可恢复 float32 WAV。停止后生成用户选择的成品；原始 WAV 始终保留，LIVE 继续。多区域录音先创建固定率会话视图再编码，原始区域保留各自格式和缺口。

导出从有明确身份的 source/deliverable/recovered/session/export 来源读取，也可从已解码压缩成品再导出。选区按 [a,b) 原始帧裁取，重采样后精确核对实际帧数，再送编码器。WAV 整数输出仍使用原生统一量化器，保留削波计数。

主要模块：

| 模块 | 责任 |
| --- | --- |
| mediaTypes.ts / recordSettings.ts | 格式预设、严格参数验证、旧设置兼容 |
| mediaTasks.ts | 流式归一化、编码、重封装、解码、格式/帧数与 hash 核对 |
| mediaProcess.ts / media-runner.ts | 独立进程监督，进度转发、取消、主进程断开收尾 |
| exportTypes.ts / exportService.ts | 队列、持久化记录、发布、重试、解码缓存重建与另存 |
| fileJobs.ts / file-worker.ts | 后台哈希、量化、另存复制与校验 |
| renderer/ExportPanel.tsx | 导出设置、任务进度、取消/重试、成品回听/分析/另存 |
| renderer/RecordSettingsForm.tsx | WAV/MP3/AAC 录音设置 |

没有在捕获或渲染线程执行编码、磁盘扫描或 JS 回调。PCM 处理为分块流程；未录音 LIVE 仍不写音频。已录资产的格式转换和解码缓存是明确的后台文件任务。

## 首尾延迟和有效时间范围

本机探针没有用经验常数替代帧数核验：

- 源为 44100+137 帧时，MP3/M4A 解码各为 44237 帧；源为 48000+137 时各为 48137 帧。
- MP3 首包有 1105 skip samples，尾包有相应 discard padding；锁定 FFmpeg 的解码会处理这些信息。
- M4A 的 AAC-LC initial_padding 为 1024，首/尾包修剪信息使当前 FFmpeg 恢复精确逻辑长度。
- ADTS 本身不携带相同的首尾修剪信息。AAC 先编码成临时 M4A，读取本次编码的 initial_padding，再不重编码地封装为 ADTS；因此会话保存的是实测编码延迟和精确逻辑帧数。
- ADTS 解码缓存保留物理帧，decodeRecipe 保存 startFrame、frames、physicalFrames 和 endPaddingFrames。验证尾填充小于一个 AAC-LC 帧；播放和分析都使用逻辑有效范围。
- 同一 AAC 编码输入的 M4A 与映射后 ADTS PCM 已逐字节比较一致。成品的声道、采样率、实际解码帧数和原始输入身份独立验证。

裁取使用 FFmpeg 的采样帧边界，时间戳重新从零开始；参考 [FFmpeg atrim](https://ffmpeg.org/ffmpeg-filters.html#atrim)。编码/封装选项依据 [FFmpeg codecs](https://ffmpeg.org/ffmpeg-codecs.html) 和 [formats](https://ffmpeg.org/ffmpeg-formats.html)，行为以本机锁定构建的实测为准。

ADTS 单独放到其他播放器可能仍有首尾填充，界面明确推荐 M4A 用于本地文件回听。Trace 会话中的有效范围不会靠循环/暂停重新累计，也不会把源 WAV 的历史贴到有损成品。

## 播放与缓存

WaveSequence 支持物理 PCM 中的逻辑范围，默认仍读全文件。PlaybackOptions/N-API 可传范围，逻辑位置 0 对应有效内容起点；不需要再复制一份裁去填充的完整 PCM。

AnalysisSource 增加 decodeRange 与 mediaIdentity；选区逻辑坐标先加解码原点，再送 FileAnalysis。**analysisCacheKeyVersion=3** 绑定压缩资产/解码配方身份，范围与实际 PCM hash 继续参与。二进制页 schema 仍为 1，计量配置仍为 v4。

成品在 Session.exports 的版本 1 记录中持久化，不挤进原 WAV 分段列表。AnalysisRole 的 export 配合 exportId 指向特定成品，多个导出不会被误拼成一个文件。FILE 标签和任务 ID 保留该身份。

解码缓存缺失/损坏时，从已核对 hash 的压缩文件重建，使用新的缓存文件名；原压缩文件不被覆盖。编码文件本身被替换时拒绝旧身份，避免继续使用旧读数。

## 发布、取消与恢复

- 每次尝试有独占的 .media-任务-尝试 目录及 owner.json；源文件和已有成品不覆盖。
- 完成编码、解码和核验后，将成品、解码缓存和 export.json 一起原子发布到 exports/任务ID。
- 取消在发布前生效；发布后文件保持可用。冲突/失败不会删除已有目标。
- 主进程不直接留下无人管理的编码器：media-runner 持有 FFmpeg/ffprobe，收到取消或父 IPC 断开会结束子进程。
- REC 优先会中断正在运行的导出，并在停录后以同一任务 ID 重跑；不是恢复编码器内部状态。
- 正常退出先停止后台任务并完成录音元数据，再把未完成自动成品保留为可重试状态。
- 主进程硬杀后，重开把未完成导出标为失败；重试只清理匹配 owner.json 的旧工作目录。
- 发布已完成、但 Session 保存中断时，可以从 export.json 恢复并验证实际成品。

另存通过用户选择的文件/目录进行。后台复制到同目录独占临时文件，核对 hash 后用 Windows MoveFileW 无覆盖发布。已有目标不会被替换；分段 WAV 另存到目录。用户原文件与内部成品保持独立。

## 当前验证

- 编码核心：52 组格式/采样率/声道/码率组合，以及取消和编码器 hash 拒绝，共 54 项。
- 导出服务：M4A/ADTS PCM 一致、逻辑播放范围、分析原点、损坏缓存重建、录音优先、取消重试、无覆盖、已发布清单恢复与重开。
- 实际 UI：WAV→MP3→回听→从压缩文件选区导出 ADTS、成品另存。
- 实际录音：MP3/M4A/ADTS 三个自动成品链路，源 float32 WAV 保留。
- 正常退出：压缩录音中退出能落实源文件，重开后重试自动成品。
- 硬杀：故意减慢测试编码器，结束主进程，确认监督进程/编码器均退出；重开重试后源 hash 不变。
- 跨 96→48 kHz 的压缩录音保留原始区域，并在全部关闭后生成一个 44.1 kHz 会话视图。
- M4/M3/M2 回归由组合门禁继续核对，不降低此前数值容差。

测试夹具可识别，编码结果与 Windows 实录分开报告。保存对话框 UI 测试使用本项目范围内的目标替身；文件复制、校验和发布是真实执行。

## 可重复命令

```text
node tools/build-engine.cjs
node tools/trace.cjs AppBuild
node tools/m5/gate.cjs
```

当前正式资料仍有原始 EBU WAV 与硬件范围缺口。M6 的完整交互、DPI、多显示器、桌面包与干净环境验证尚未完成；M5 通过不等于全项目完成。

## 当前收尾

原生 11/11、JS 39 项、编码矩阵 54 项、导出服务 11 项、手动导出 UI 6 项、三种压缩录音、正常退出和硬杀恢复均通过；M4/M3/M2 回归通过。最终 UI 补验明确等待新成品自己的 sourceId 和分析状态，避免将上一文件快照误作通过证据。源和原生/主进程/renderer hash 已写入 M5 checkpoint。

下一任务为 M6：桌面专用包、完整交互与 DPI/多显示器/干净环境验证。M3 原始 EBU 与未跑硬件场景不因此视为通过。
