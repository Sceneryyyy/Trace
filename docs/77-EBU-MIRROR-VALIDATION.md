# 77 · EBU 镜像素材与 Trace 云端数值检查

2026-10-03。素材来源提交 `9c53e4a`，与本地发布准备 `2e26689` 合并为 `b83c9bd`。源码仍为 preview.31。本轮没有修改计量算法、协议或生成 Windows 包。

本文保留修复前的失败基线。后续 Meter v5 已修复 Max M，适用原始素材 68/68 通过；当前结果与复现入口见 [78](78-EBU-METER-RECALIBRATION.md)。

## 素材可用性

[EBU Loudness Test Set v5.0](../references/ebu-loudness-test-set-v5/README.md) 可用于私有研发中的数值回归。执行 `python3 references/ebu-loudness-test-set-v5/prepare.py` 成功：11 个分块、5 份 PDF、ZIP CRC、70 个 WAV 的大小/SHA-256 与原始 readme 均一致。

还原 ZIP 为 91,631,421 字节，SHA-256 为 `9cc500b4df83f7c21855c74dce795ef5209a752bf884253ae57d0ce512efb062`。额外核对独立的 [Gentoo Manifest](https://github.com/gentoo/gentoo/blob/4bdd05f7b96c71931660c4eb16df1dbcd973030e/media-libs/libebur128/Manifest)，大小、SHA-512 和 BLAKE2b 全部一致。这增加了文件身份的独立证据；本环境仍未直接下载官方 ZIP 作逐字节比较，也没有向 EBU 确认镜像维护者的分发许可声明。

70 个 WAV 全部通过实际音频格式/帧数与库存核对。单/双声道共 68 个；5.0/5.1 两个 case 6 超过当前 Trace 支持范围，没有截取声道或降混后宣称通过。原始 `seq-3341-6-6channels-WAVEEX-16bit.wav` 的 RIFF 长度声明为 11,520,068 字节，实际为 11,520,080，少记 12 字节；data 长度及库存/hash 一致。此原始多声道文件仅记录头部差异，未修改素材，也未测试 Windows 读取行为。

新增 `.gitattributes` 的 `export-ignore`，阻止内部 EBU 素材随 `git archive` 的发布源码 ZIP 分发。实际归档检查确认 EBU 目录被排除，Trace 源码仍保留；私有 clone/pull 继续能取得分块。官方权利和使用条款保持不变，测试结果注明 © EBU。

## 实际执行路径

Linux/GCC 14.2.0，使用 `native/portable/CMakeLists.txt` 构建 Release 的真实 `Trace::Meter`、本项目 vendored libebur128 及补丁，保留 `-fno-fast-math`。本轮原始素材检查未开 sanitizer；此前生成参考的 ASan/UBSan 证据仍属于 75 的独立检查。

隔离的测试探针通过 FFmpeg 将原始 PCM16/24 解码为 float32，保留原声道和采样率、不归一化、不改增益，然后分块喂入 Meter，观察实际发布读数、调用 `finish()` 并核对 EOF 帧数。每个适用 WAV 分别使用 2048 帧和循环 `[1,7,137,2048,509,31,4093]` 帧两种输入方式；68 个文件的全部发布读数与最终值逐项相同，实际/发布 EOF 都等于 WAV 帧数。

本路径验证的是原始素材进入 Meter 后的数值，未运行 Windows `WavReader`、分析缓存、addon、设备、实时 UI 或 FILE/选区/导出全链路。不能将云端探针当作 Windows 应用验收。

局部探针、完整 JSON、原始读数与日志保留在忽略目录 `artifacts/ebu-validation/`：`run.py`、`meter_probe.cpp`、`report.json`、`provenance.json`、`results-complete.log`、`momentary-diagnosis.json`。编译库在 `build/ebu-validation/`。正式可维护的原始素材 runner 尚未接入 CTest/CI，仓库现有上游 `test:lufsmeter-ebu` 不作为本次结果。

## 数值结果

© EBU。参考值与容差来自已取得的 Tech 3341/3342 November 2023 Table 1。没有放宽容差或删除失败。

| 范围 | 结果 |
| --- | --- |
| 70 个原始 WAV | 68 个适用；2 个多声道排除 |
| 适用文件结果 | 51 通过、17 失败 |
| 数值断言 | 112 项，80 通过、32 失败；每个恒定读数序列计一项，各实时 Max 分段分别计一项，含 4 个辅助校准文件 |
| 两种块大小的全部读数一致、EOF 帧数 | 136 项，全部通过 |
| Tech 3341 1–5、7–12 | 适用 M/S/I、Max S 与恒定读数通过，包括 case 10 的 20 个文件和 case 11 的 20 个实时分段 |
| Tech 3341 13 | 20 个 Max M 文件中 4 个通过、16 个失败；通过文件编号 1、6、11、16 |
| Tech 3341 14 | 20 个 Max M 实时分段中 4 个通过、16 个失败；同样只有分段 1、6、11、16 通过 |
| Tech 3341 15–23 | 9 项 TP 全部通过 +0.2/−0.4 dBTP 容差 |
| Tech 3342 1–6 | 6 项 LRA 全部通过 ±1 LU，包括两份真实节目 |
| 三份辅助正弦及单声道参考噪声 | I 与对应参考值通过 ±0.1 LU |

真实节目 case 7：I = −22.9870 LUFS、LRA = 5.0 LU；case 8：I = −22.9986 LUFS、LRA = 14.9 LU。原始 WAV 均为 48 kHz，这些结果不新增真实 96 kHz/跨率证据。

## 当前发现与下一步

失败集中在 **Max M 对时间偏移的响应**。case 13 的失败值约为 −23.216/−23.451 LUFS，预期 −23 ±0.1；case 14 对相应目标同样低读约 0.216–0.451 LU。`Meter::finishHop()` 每 10 ms 发布电平，但只在每十个 hop 时调用 `measureLoudness()`，因此当前公开 M 每 100 ms 更新，会错过偏移的 400 ms 测量窗口峰值。两种输入分块完全一致，排除外部喂块改变边界的解释。

进一步独立诊断使用**同一份 vendored libebur128** 每 10 ms 查询 M：失败的 case 13-3 得到 −22.9936 LUFS，case 14 全部 20 个分段误差约 +0.0064 LU，满足原容差。该诊断不是 Trace 修复后的通过证据，但表明素材可以揭示 Trace 查询/发布节奏的缺口。

后续应建立可维护的原始 WAV 数值 runner，再明确更密集的 M 查询、独立 Max M 统计与既有 100 ms 历史的关系；保留帧时间、EOF、长期内存和资源预算，并验证实际文件/实时路径。不要直接将一次 UI 刷新值视为区间最大值，也不要通过放宽容差关闭失败。当前 M3/A08 原始素材数值门禁仍开放；素材获取阻塞已解除。
