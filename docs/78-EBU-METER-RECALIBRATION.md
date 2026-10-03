# 78 · Meter v5：EBU 原始素材校准与密集响度索引

2026-10-03。用户要求修复并重新校准，直到通过率超过 99%。范围保持 Trace 已声明的单/双声道；使用与 [77](77-EBU-MIRROR-VALIDATION.md) 相同的 70 份原始素材、参考值及容差。源码产品版本仍为 preview.31；计量配置升级为 `trace-meter-v5-ebur128-1.2.6-lra10hz-msi100hz-tpaligned`，最新 Windows 包仍是旧版 R3。

## 问题与实际修复

77 的 17 个失败文件全部涉及 Max M。400 ms 的窗口定义正确，但每 100 ms 查询一次会漏过偏移窗口的最高值；低读约 0.216–0.451 LU，超过 ±0.1 LU 容差。

`Trace::Meter` 现每 10 ms 查询 M/S/I/LRA，并以同一个实际帧号发布电平与响度。FILE 的 `loudness.bin` 同步改为 stride=1（10 ms），报告从完整密集记录统计 Max M/Max S，历史表头查询恢复确切的密集索引。真实 EOF 单独完成不足一个 hop 的记录；TP 延迟及 1.5 s LRA/TP 零分析上下文继续按原规则排空，不增加音频帧。

所有校准检查使用 EBU 的原值：M/S/I ±0.1 LU、LRA ±1 LU、TP +0.2/−0.4 dBTP；原始 WAV 大小/SHA-256 均验证。PCM 增益、K 加权、I 的 400 ms/75% overlap/−10 LU 门限、LRA 内部 10 Hz 采样、TP 插值器与厂商源码保持原配置。

磁盘页 schema=1、记录大小和缓存 key version=3 保持，measurementConfigId 与引擎 hash 令旧缓存重建；验证器拒绝旧 v4 身份，也拒绝将旧 stride=10 的稀疏记录改标为 v5。Session schema=2、请求/快照形状与 ReplayFreeze v3/quality v1 保持。

## 有界呈现与资源

Meter 的密集响度环保留 6000 点，即最多 60 s；在分析对象初始化时一次分配，放在堆上以控制 Windows 栈占用。相比旧 600 点环，每个 Meter 增加约 0.33 MiB。原有 ReplayBuffer 的 6002 条完整计量记录继续复用。

LIVE 和固定内存历史的曲线仍最多 600 点，取真实桶末读数并合并桶内质量 flags，短暂的 Gap/Missing 不会因降采样消失。Replay 仅为这些显示点预留容量；选区/报告的统计继续使用完整音频或密集计量记录。文件曲线的最大返回点数仍由 AnalysisCache 的调用参数限制，精确表头与报告使用完整索引。

FILE 响度记录由每秒 10 条增加至 100 条，96 字节记录的 payload 约由每小时 3.46 MB 增至 34.56 MB（十进制，不含页头/尾页）；电平与波形记录数不变。原生页写入和报告 CSV 继续分块流式处理，报告事件预览最多 1000 条，未把长文件的所有读数驻留内存。长文件的磁盘/报告耗时需要 Windows 复验。

云端 Release 单进程基准分别处理四种采样率的 30 s 双声道合成 PCM。最终独占复测：修复前约 0.30/0.32/0.60/0.54 s；修复后约 0.80/0.87/1.63/1.69 s，对应处理耗时约音频时长的 2.7%–5.6%。这是计量核心的云端速度检查，未包含解码/磁盘/UI/WASAPI，也不是 Windows 应用 CPU 或实时 deadline 验收。最终基准原始日志在 `artifacts/ebu-recalibration/benchmark-before-final.txt` 与 `benchmark-final.txt`；CPU 争用时的旧测量另存为 `benchmark-final-contended.txt`。

## 可重复的原始素材门禁

新增 [原始素材 runner](../tools/metering/run-ebu-wav-tests.py)、[WAV probe](../test/native/ebu_wav_probe.cpp) 与共享 CMake 门禁。Python 3.9+ 标准库校验、还原原始素材并固定库存；缺文件/校验失败直接失败，不能留下旧 PASS 作为本轮证据。

Linux probe 使用明确标识的测试 PCM16/24 分块解码器，直接进入真实 Meter，不依赖 FFmpeg。Windows probe 则使用产品实际 `Trace::WavReader`，并以宽字符入口支持中文路径；本轮没有在 Windows 执行该路径。

私有 checkout 的云端入口（系统 cmake/ctest；本环境可用 `.tools/python-cmake/cmake/data/bin/` 下的同名程序）：

```sh
cmake -S native/portable -B build/trace-portable \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo -DTRACE_SANITIZE=ON -DTRACE_REQUIRE_EBU=ON
cmake --build build/trace-portable --parallel 2
ctest --test-dir build/trace-portable --parallel 2 --output-on-failure \
  --output-junit portable-results.xml
```

仅复测原始素材：`ctest --test-dir build/trace-portable -R '^ebu_wav$' --output-on-failure`。报告在该 build 目录的 `ebu-wav-results.json`，记录实际 Git 状态、配置 ID、probe hash、测试源码 hash、各 WAV hash、参考/实测值和排除范围。

Windows 继续执行 `npm run build:trace-engine` 或 `Trace.ps1 -Action Engine`；私有素材存在时，18 项 CTest 中包括 `trace-ebu-wav` 和 `trace-meter-cadence`。新的 Trace CI 强制 Linux 原始素材门禁，保留 JUnit 和数值 JSON；便于重现完整 sanitizer 检查，portable job 允许 30 分钟。本次提交未附远程 Actions 完成证据；状态以对应 SHA 的工作流记录为准。

公开发布源码 ZIP 继续通过 export-ignore 排除内部 EBU 素材。未带素材的公开源码只注册生成信号测试，不宣称原始素材通过；`TRACE_REQUIRE_EBU=ON` 在素材缺失时拒绝配置。

## 结果与范围

© EBU。Release 原始 WAV 的 **68/68 适用文件通过，100%**；112 项数值断言、204 项两种输入分块/真实 EOF/每个实际索引一致性断言全部通过。原先失败的 case 13 的 20 个文件及 case 14 的 20 个分段全部满足 ±0.1 LU，TP 15–23、真实节目 I/LRA 和辅助校准素材保持通过。

两种喂入方式分别为 2048 帧，以及循环 `[1,7,137,2048,509,31,4093]` 帧；比较全部发布记录及最终值，而非仅比较摘要。70 个原始 WAV 中的 5.0/5.1 两个 case 6 继续明确排除，没有新增多声道支持；本轮适用率为 68/70，分母未因失败而调整。

[新增原生回归](../test/native/meter_cadence_tests.cpp) 的 85 项检查覆盖四种采样率的全部 20 种起点偏移、实时连续 Max M、两种喂入方式的全部字段逐项一致、部分 EOF、重复历史定位、60 s 窗口、600 点/容量与短缺口 flags 保留。[缓存/报告回归](../test/meter-cache-cadence.test.mjs) 直接运行真实 AnalysisCache 和 buildReport，验证两页密集索引、中间峰值、重复定位、部分 EOF、报告最大值及目标失败判断、旧缓存拒绝。

辅助 LRA 独立参考原先在一次 100 ms push 后读取最新快照；更密集的发布使其受 TP 前视影响而落在边界前 10 ms。现改为从实际发布帧号选取确切的 100 ms 端点，保留原生成信号、EOF 范围、参考分位数计算和 0.21 LU 容差。最初的两项参考失败与修正后 Release 18/18 结果均保留在本地日志，不作为修改算法或放宽门槛的理由。

最终 ASan/UBSan 原始素材复跑通过（712.00 s）：68/68、112/112 数值、204/204 一致性均通过。另七项生成信号 CTest 已在最终 Meter 修复下通过；探针重构曾遗漏正常返回值，sanitizer 检出后修复并单独复跑原始素材，因此记录为七项通过加一项成功复跑，不把此前整轮失败写成一次 8/8。应用 typecheck、portable 246/246（51 文件，0 fail/skip）、build:trace 通过；工作流 actionlint、79 份 Markdown 的本地链接检查通过。实际源码归档无私有素材时注册七项生成信号门禁，强制原始素材模式正确拒绝配置。

修复提交 `f42aba71d69d3ecd55346b0df071a4d81b0930ba` 的干净 checkout 又完成一次 Release 原始素材门禁（80.25 s），同样 68/68、112/112、204/204 全部通过。报告 sourceDirty=false；记录的 Meter、配置、FILE writer、厂商库、probe 与 runner 的 hash 均核对一致。报告副本为 `artifacts/ebu-recalibration/ebu-wav-committed.json`；此后仅文档提交没有改变该数值测试的源码。

最终结果也同步在 [当前交接](13-HANDOFF.md)。云端日志在忽略目录 `artifacts/ebu-recalibration/`，77 的旧失败日志保留。原始节目仅为 48 kHz；四种采样率的新增证据来自生成信号。Windows addon、实际文件缓存写入/读回、实时设备、选区/导出全链路及新分发包仍待实机验证。本轮通过的是适用素材的计量核心数值门禁，正式 EBU Mode 的界面/全标准及发布门禁仍单列。

## 独立化之后的入口

上述验证数目是 Meter v5 修复时的历史证据。2026-10-03 工程独立化新增 FFT 门禁后，有私有 EBU 素材时为 9 项 portable / 19 项 Windows CTest；默认 JS 测试与原生 addon 均使用 Trace。CI sanitizer 核心先跑、原始 WAV 单独跑，portable job 45 分钟、原始 gate 墙钟上限 1800 秒；原始参考、容差和 68 文件分母保持。当前复现与新证据见 [79](79-TRACE-INDEPENDENT-PROJECT.md) 和 [13](13-HANDOFF.md)。
