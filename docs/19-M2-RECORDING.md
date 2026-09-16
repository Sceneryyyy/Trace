# 19 · M2 连续录音实施记录

更新：2026-09-15。M2 录音链路已接通，最小工程门禁已通过（artifacts/m2/gate.json）。总项目目标未完成。

## 实现范围

| 层 | 实际代码 | 当前行为 |
| --- | --- | --- |
| WAV | WavFile.h/.cpp | 流式 16/24 PCM、float32，完整帧分段/头尾/恢复副本 |
| 录音 | Recorder.h/.cpp、Overview.h | 预分配独立队列、writer、take Meter、有界全长概览 |
| 采集接线 | Engine.cpp、addon.cpp | capture 先交录音分支，再交 LIVE 分析；边界确认与显式故障 |
| 会话 | recording.ts、recovery.ts | 原子清单、后台转换、检查点与连续分段核查 |
| 文件任务 | fileJobs.ts、file-worker.ts | 恢复独立进程；退出后确认；关闭应用等待任务 |
| 界面/协议 | main/preload/shared/contracts/renderer | REC、保存设置、文件列表、恢复、状态代次和幂等请求 |

### 音频与边界

原生 capture 不写盘、不调用 JS、不等待 writer。256 块 SPSC、每块最多 2048 帧；满队列拒绝覆盖。LIVE 和 take 各自拥有 Meter；REC 不重开采集 epoch，不纳入 REC 前音频。stop 的 endFrameExclusive=startFrame+实际完整写入帧数。部分磁盘写入只计完整帧。

WAV 使用 CREATE_NEW，固定转换缓冲，单段最多 2 GiB payload。PCM16/24 无抖动舍入、超幅饱和并计数；Float32 保持有限原始值，包括负零和超出 ±1。Float WAV 有 WAVEFORMATEX/fact；奇数 payload padding 正确。

Meter 配置更新为 trace-meter-v2-ebur128-1.2.6-histogram：停止时处理不足 10 ms 的真实尾帧，最终 M/S/I/LRA 对应真实 EOF；额外 64 帧只冲刷 TP 插值器，不增加音频帧数。文件成品需在 M3 重新分析；当前 REC 标记“源信号”。

### 存储、转换和恢复

唯一 take 目录内 session.json、journal.jsonl、audio/。JSON 使用十进制帧字符串和相对资产路径，写入完成后按流式 SHA256 标识内容。journal 有 prepared/begin/checkpoint/close，约每秒更新完整帧数和分段列表；目前事件尚未显式添加序号，此项保留在最终健壮性复核。

手动采样率先写 float32 源，再由固定 FFmpeg 9.0.1 转换。验证所有输出的采样率、编码、声道和总帧数（重采样比率误差不超过一帧）后才加入 deliverable；源保留，转换文件名独立。仍需在 M5 统一完善取消/失败重试及源保留策略。

恢复扫描连续编号源 WAV，按 journal 与实际完整帧检查；中间或检查点列出的分段缺失明确失败。截断日志尾行不覆盖上一个有效检查点。恢复输出新副本，报告未知尾部；原文件不修改。恢复任务被应用退出等待，后台进程正常退出才报告完成。

录音源失效、缺口、背压或写盘错误保留已写前缀并标故障。当前重启方式为手动重新监测/新 take；同会话跨采样率分段及统一时间线仍需后续完成，未声称自动续录。

## 已跑检查

| 检查 | 结果 / 证据 |
| --- | --- |
| Native core | 16 case，队列/时钟/解码/采样率/分块/内存边界 |
| WavFile | 7 case；44.1/48/88.2/96 kHz × 单/双声道 × 三种 WAV 共 24 组合 |
| Recorder | 6 case；pre-roll 排除、队列背压、部分写盘、缺口/重复 stop、EOF/TP、概览容量 |
| CTest | 3/3 target 通过 |
| 真实 N-API 三种 WAV | artifacts/m2/native-latest.json |
| 真实窗口录音 | artifacts/m2/ui-1789460630592/report.json；14 项通过 |
| 强制终止后恢复 | artifacts/m2/recovery-1789460638671；121440 帧恢复，原文件 SHA256 不变 |
| 参数/时间/会话/恢复库存 | 13/13；typecheck 通过 |
| FFmpeg 独立格式核查 | 96 kHz float32、44.1 kHz PCM24 的格式及 5001 帧已验证 |
| FFmpeg bootstrap | 固定归档/两个 exe 哈希，实际限定解压通过；Trace.ps1 Codecs |
| 截图 | recording.png / files.png 实际查看；颜色刻度及转换后时长显示已复核 |

已有失败与修复：

- Meter 静音 RMS 原先滑动减法留残值，M1 已改固定正数窗口重新求和，有静音和极低电平用例。
- 历史图表峰值颜色随条长缩放，现按固定刻度裁切，低电平不显示高电平红色。
- 转换列表原先用源帧数配目标率显示时长，现使用所选成品自己的帧数/采样率。
- 恢复原先仅按现存文件排序，现核对连续编号与检查点，不把缺失段拼接成完整录音。
- 自动 GUI 原先共用 userData，现按进程隔离。长测使用启动时的旧目录，未中途重启。

## 30 分钟门禁结果

- Electron tools/m2/long-record.cjs --trace-test，原 session 89098，exit 0。
- 实际录音 1800.84 秒 / 86440320 帧，48 kHz 双声道 PCM24；停止后 LIVE 继续。
- 目录 artifacts/m2/long-1789459514556；日志 .tools/m2-long-record.log。
- 0 队列丢帧，完整写入帧数等于接受帧数，起止边界差完全相等。
- verify-long.mjs 独立重开通过：ffprobe 采样率/编码/声道/帧数、RIFF 文件长度、源 SHA256 均一致；84945594 个全零帧及 1494726 个非零帧确认静音与测试音均保留。
- 源 WAV SHA256：a132fb7cdab79bfe6281a03fe3e14b3a7068859121fc11db1ea8fd1a396952df。
- 主进程私有内存第一采样 90376 KB、末次/最大 151860 KB；后段约 8 分钟稳定在 151 MB 附近。这里只报告本次实测，不声称所有进程或长录音恒定内存。
- gate.json 记录当前未提交源码、原生/应用二进制 hash 与测试证据。长测期间原生 DLL 未重建；最终原生三种 WAV 补验通过，最终 GUI 的持久化会话重开也通过。
- 新增分段验证曾把数字正则错误转义，实际重开测试发现有效会话被过滤。已修复，带分段的回归由 FAIL 转 PASS；原始失败保留于 .tools/m2-reopen-regression-before.log。

## 未验证与下一步

M2 最小关口通过后进入 M3 文件确定性历史。完整文件回放在 M4，不能将 ffprobe 重开解释为 Trace 内回放已经实现。

真实 96 kHz、系统格式重设/物理拔插、同会话跨率续录、长录音任意历史浏览、完整转换取消/重试及发布环境未验收。音频完整性问题仍是最终交付阻断；硬件缺失保持明确标签。
