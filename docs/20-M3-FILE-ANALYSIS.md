# 20 · M3 文件分析与确定性历史

2026-09-15。文件分析后端和应用入口已接通。**正式 M3 门禁尚待原始 EBU 素材验证。** 当前结果是工程进展，不是完整产品验收。

## 行为

录音文件列表可分别分析 source、deliverable、recovered。分析对象是各文件真正保存的 PCM；整数舍入或手动采样率转换后的文件不复用录音输入 Meter。多段同格式 WAV 按声明顺序连续送入一个 Meter。跨采样率输入明确拒绝，等待会话视图转换实现。

分析在独立进程运行，PCM 分块读取；原生只保留固定缓冲、Meter 和待写页。开始录音前暂停当前分析，结束录音后重新启动同一个任务。用户取消不删除音频，只清理该任务拥有且通过路径检查的临时缓存。

## 数据布局

schemaVersion=1，little-endian。每页固定为 64-byte header + 1024 条记录，尾页不足部分清零；CRC32 覆盖整页，CRC 字段计算时置零。

| 位置 | 头字段 |
| --- | --- |
| 0 | TRPAGE01，8 字节 |
| 8 / 12 / 16 / 20 / 24 | schema / kind / recordBytes / count / stride，uint32 |
| 28 | CRC32 |
| 32 / 40 | 首/末索引帧，uint64 |
| 48–63 | 保留零 |

| 流 | 记录大小 | 内容 |
| --- | --- | --- |
| levels.bin | 128 | 10 ms 末帧、flags、声道、min/max、各声道 Peak/RMS/TP |
| loudness.bin | 96 | 100 ms 索引、flags、M/S/前缀 I/LRA/Max TP |
| wave-0…5.bin | 40 | 起止帧、各声道 min/max、flags；基于 10 ms 的 10…1000000 倍聚合 |

Metric 为 double value + uint32 status + 4 字节零。status 依次 ready/silence/insufficient/gap/error；非 ready 的存储值为零，协议输出 null。JSON 的帧数始终为十进制字符串。

manifest.json 记录实际率/声道/帧数、流信息、最终统计、内容 hash、引擎 hash 和计量配置。完整验证后才把 pending 目录发布到 cacheKey 目录。文件头和每条记录的索引帧均被校验，不仅检查文件是否存在。

## 查询与生命周期

- cacheKey 包括按顺序排列的源 SHA256、原生二进制 SHA256、schema 和 measurementConfigId。
- 缓存重用前验证源内容与页；查询时再次校验所读页。坏缓存隔离到 corrupt 目录后重建，音频不变。
- 进程退出后才返回成功；取消/失败清理仅限该任务 UUID 对应、realpath 位于指定 cacheRoot 内的 pending 目录。
- 只缓存最近 8 页。指标按实际文件位置查询最近的不晚于该位置的索引，不从当前位置重新累计 I。
- 波形按所需列数合并极值；响度只取实际索引，不线性插值 LUFS。查询保留末尾有效索引，空范围两图均为空。
- 前端查询附 requestGeneration，后端原样关联；真正的 seek/播放器代次在 M4 实现，不能把该关联字段当成已完成回放。
- AnalysisService 单并发，待处理任务最多 8、近期任务最多 64；仅保存一个活动查询缓存。
- 队列/阶段变化推进控制 revision；连续进度使用单独 state eventSequence，避免进度导致所有用户操作过期。

## 实际命令

先执行 Engine、AppBuild，再按需要运行：

- node tools/m3/run.cjs ui
- node tools/m3/run.cjs integration
- node tools/m3/run.cjs recovery
- node tools/m3/query-boundaries.mjs
- node --test test/trace-contracts.test.mjs test/recording-service.test.mjs test/recovery-inventory.test.mjs

run.cjs 会保留控制台日志，并检查测试报告状态。UI 用测试目录/进程隔离设置；夹具音频使用已有测试资产的只读硬链接，录音创建新 take。集成测试包含 30 分钟文件的离线分析，不是再次录制 30 分钟。

## 标准复核发现的 LRA 问题

公开标准依据：

- [EBU Tech 3341, November 2023](https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3341.pdf)
- [EBU Tech 3342, November 2023](https://tech.ebu.ch/files/live/sites/tech/files/shared/tech/tech3342.pdf)

Tech 3342 的短时分布要求至少 10 Hz；文件分析参考还说明需要末尾分析上下文。旧 libebur128 1.2.6 内部 LRA 是 1 Hz，旧 wrapper 只给 TP 64 个零帧，没有完整的 LRA 尾部上下文。

新增测试先复现了两个失败：LRA 0.0 对参考 3.009767 LU，EOF LRA 1.8 对参考 4.727904 LU。修正 histogram 内部步长和 finish 的 1.5 秒分析上下文后，原 0.21 LU 容差通过。参考分布来自 10 Hz S 序列的独立门限/分位数计算，不读取被测试的 LRA 结果。

当前统一配置 trace-meter-v3-ebur128-1.2.6-lra10hz-eof：

- 不把上下文写为真实音频；frame、M/S/I/RMS/Peak 仍固定在真实 EOF。
- 最终 LRA 和 TP 包括各自所需分析上下文。
- 查询错误明确失败，不产生正常静音读数。
- 旧配置缓存自动失效。依赖本地最小补丁有 SHA256 和来源记录，原许可保留。

## 当前证据与范围

| 检查 | 结果 |
| --- | --- |
| 原生 CTest | 5/5，52 case |
| 生成标准参考 | 18/18，未放宽容差 |
| 缓存集成 | 19 项，包括重复位置、独立前缀 I、坏页重建、取消、源 hash |
| 实际窗口 | 10 项，包括源/成品分开、自动重建、录音优先、取消 |
| JS 边界 | 14/14，含 renderer 路径拒绝、uint64、查询上限 |
| 真实 WAV 与恢复 | v3 三种 WAV 短录音通过；硬杀恢复原文件 hash 不变 |
| 长文件 | 1800.84 s / 86440320 帧，v3 分析约 21.932 s |
| 长文件查询 | 4 页 / 311552 字节，约 6.504 ms；worker 峰值 RSS 94498816 字节 |

生成参考是按公开数字定义实现的 3341-1…5、9、12、15…19、3342-1…4 与两项独立 LRA 回归。其中 TP 覆盖 44.1/48/88.2/96 kHz。它们不是下载的 EBU WAV；真实节目/官方素材未运行的状态不变，不宣称完整 EBU Mode 合规。

原始失败和通过记录见 .tools/m3-reference-before.log、m3-reference-after.log、m3-v3-*.log、artifacts/m3/*-latest.json。查询末尾遗漏的失败保存在 .tools/m3-query-boundaries-before.log。

## 开放项

原始 EBU 素材下载仍受站点/网络限制；用户确认本机暂无。M3 正式门禁保持未关闭。

M4 的文件输出时钟、定位、暂停与循环，M5 的三格式导出，M6 的桌面包均未实现。M2 的同会话跨率重设/续录仍是前置开放要求。不得用上述查询测试冒充声画同步或完整人工验收。

## 本轮收尾

最终 AppBuild/typecheck、真实窗口 10 项、EOF/空范围专门回归通过。artifacts/m3/checkpoint.json 保存当前源码和二进制 hash，milestoneGatePassed=false；它是进度快照，不能用作原始素材验收已通过的证据。

后续还要扩展 TP 单窗口时间归属与滤波延迟的独立夹具；当前整体 TP 数值、分块一致性、末尾峰值通过，不代表每个 10 ms 边界的时间归属已完全验证。原始 EBU ZIP 的正常浏览器直连也报 ERR_BLOCKED_BY_CLIENT；未改浏览器安全设置或绕过限制。

## v4 后续修正

TP 单窗口时间归属已通过独立卷积参考发现并修复，当前配置升级 v4。详情见 21；本文件上面的 v3 性能与测试是历史记录，当前构建应以 v4 的新报告为准。原始 EBU 素材门禁仍未完成。
