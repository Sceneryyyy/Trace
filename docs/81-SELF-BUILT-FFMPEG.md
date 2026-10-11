# 81 · 自建 Windows FFmpeg

2026-10-04。工作目标是用来源可追溯的自建编码组件替换 Gyan essentials，
保持 Trace 的现有音频功能。旧依赖候选及失败记录见 [80](80-RELEASE-DEPENDENCY-HARDENING.md)，
当前源码/候选身份以 [13](13-HANDOFF.md) 为准。

## 构建边界

媒体源码只有 FFmpeg 9.0.2 与 LAME 3.100，均下载官方固定归档并校验大小与 SHA-256。
无上游源码补丁。42 项外部库的旧配置由仅启用 libmp3lame 的配置替代；
Trace 实际导入分类器只接受 WAV、MP3、AAC LC 的单/双声道音频。

| 输入 | 固定身份 |
| --- | --- |
| FFmpeg | `946fcce07b6dcd0331c8cc609192aeff5e1924f8`，17,333,895 字节，SHA `0aa2b1de2a5698b20a23e93d539a9a8e82ca0117496c5bdf05d198805f42bb3b` |
| LAME | 3.100，1,524,133 字节，SHA `ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e` |
| MSVC / SDK | 编译器 19.44.35229；工具集 14.44.35207；SDK 10.0.26100.0 |
| GNU Make | MSYS2 4.4.1-2，519,783 字节，SHA `2408af61717dae87b00c855b132769a125c708907fc94a46bb16dae076113e5c` |
| Bash | MSYS2 5.3.20，实际 EXE/运行库与所用工具的哈希绑定构建锁 |
| CRT | 静态 `/MT`；Microsoft 编译器、头文件、SDK/CRT x64 库单列输入清单 |

完整参数与输入哈希在 [构建锁](../references/trace-ffmpeg/build-lock.json)，
实际许可、复现步骤与材料位置见 [来源说明](../references/trace-ffmpeg/README.md)。
MSYS2 只运行构建工具，不链接入 ffmpeg/ffprobe；程序导入的系统 DLL 按锁白名单验证。
关闭网络、自动外部依赖探测、视频编码与不使用的硬件加速。

保留的能力包括 WAV 16/24/float32 到 96 kHz、MP3、AAC LC 的 M4A 和 ADTS，
重采样、concat、segment、atrim/asetpts、pipe 进度与 JSON 探测。
JPEG/PNG 附图仍可被识别并忽略视频后导入音频。
手写 x86 汇编关闭，LAME 的编译器 SIMD 保留；离线一分钟转换另有速度/帧数检查。

## 来源门禁

源码清单 schema 2 验证实际 EXE/configuration、构建锁、脚本、构建报告、
工具哈希及六组系统输入目录哈希。它拒绝过期、缺失或改变的记录，
不能只改 `correspondingSourceComplete` 标志。旧 Gyan 清单 schema 1 继续保持不完整，
不将新的自建证据套用到旧二进制。

对应源码范围明确为 FFmpeg、LAME 和 Trace 构建脚本；Microsoft 系统库/CRT、
编译器及构建工具分类记录。构建/安装/包审计对这些输入有实际身份检查，
不将专有系统库声称为开源，也不将此工程门禁当作法律或安全认证。
组件公告、微软条款和 GPL 系统库例外的分发复核仍单列在 [发布清单](76-RELEASE-CHECKLIST.md)。

候选附件包含主源码、LAME 源码、项目源码中的精确脚本/锁、构建报告、
config.h/config.mak 和逐文件系统输入清单；许可原文保留原始字节。
源码缓存与配置附件的截断/改写、额外来源/外部库、意外 DLL、改变的脚本/SDK/EXE
均有拒绝路径及反例测试。

## 验证范围

Windows CI 使用实际生成的 EXE 调用生产 `probeImport`、`decodeImport` 和 `encodeMedia`，
检查分段帧数、AAC priming/尾部补齐、M4A/ADTS、18 组 WAV 精度/采样率/声道组合，
以及 JPEG/PNG 的 MP3/M4A 附图。另检查一分钟 96 kHz 双声道向 44.1/48 kHz 的
MP3/M4A 转换时间及解码帧数。

完整 Trace CI 仍须通过原生引擎、19 项 Windows CTest、Linux ASan/UBSan 与原始 EBU WAV、
浏览器、类型/构建、安全门禁、包审计/加载及同次 Linux 完整成功门禁。
这些离线测试不代替真实 WASAPI、驱动、96 kHz 设备与长录音验收。

## 2026-10-04 实际完成记录

完整 [CI 37217397928](https://github.com/Sceneryyyy/Trace/actions/runs/37217397928)，来源 `f33d74da18d29902e260443f01eb0be24255ed49`，attempt 1，Windows/Linux 均 success。
Windows CTest **19/19**（172.96 s）、原生/媒体 **52/52**（9 文件）、两端 JS **263/263**，
均 0 fail/skip；Linux ASan/UBSan 核心 **8/8**（177.00 s）和原始 EBU **1/1**（410.81 s），
真实 React selector、9 项模拟 IPC 浏览器回归、类型/构建及当前安全门禁全部通过。

Windows 本次从源码重新构建，实际报告与提交的构建报告逐字节相同，安装校验通过。
三次独立 Windows 编译的 EXE 哈希完全一致（两次试构建及本次完整 CI）：

| 程序 | 大小 | SHA-256 |
| --- | --- | --- |
| ffmpeg.exe | 3,096,064 字节 | `c647e20c508af6421efb3c78b59e2a693f7b905c6a27384282ad76b5ad37d5ee` |
| ffprobe.exe | 2,859,520 字节 | `73337f082639e4f3f867a50fc69ec681ed81cdc8faf5df5d8fed4f677530bef5` |

31 项工具文件哈希与 6,684 个编译器/SDK 文件（1,515,178,411 字节）的清单根绑定构建锁。
动态导入只有 bcrypt、KERNEL32、PSAPI、SHELL32 系统 DLL；没有 MSYS2、MinGW、VC 动态 CRT。
引擎自身的 VC DLL 仍按原有独立包审计记录。

一分钟 96 kHz 双声道生成信号编码并解码：44.1 kHz MP3/M4A 分别 **773/1137 ms**，
48 kHz MP3/M4A 分别 **715/1133 ms**，实际解码帧数均与对应 60 s 帧数一致。
这是托管 Windows 的离线转换观察，不是声卡实时 deadline 或整机资源验收。

同次 Linux 完整成功门禁、ZIP 内容校验、5 项包审计、加载/重启、clean-checkout、
完整对应源码门禁和候选上传均通过。新私有 [工程候选](https://github.com/Sceneryyyy/Trace/actions/runs/37217397928/artifacts/11309181720)，ID `11309181720`，
归档 **173,879,193 字节**，GitHub 附件 SHA-256 `a5afb238df3664fa1c36e2a711a57d3d10e46fdabe7bc4c18f17e0a8767a180e`。
这个 digest 不是内含应用 ZIP/JSON 的 hash。候选内部材料由本次 CI 校验并打包；
本地读取了完成日志和附件元数据，未读取附件 payload 或数值 JSON。

试构建失败保持原结果：首轮缺 Make；第二轮 GNU tar 的 Windows 路径误解析；
第三轮已生成相同 EXE，但 PNG→M4A 测试素材封装缺维度且附件跨盘路径失败。
素材现直接写入标准 covr/APIC 元数据，随后四种附图的真实导入全部通过；
归档提取固定用 native tar，附件路径归入同盘输出。未改原音频样本、计量或数值容差。

可克隆的提交、源码/日志哈希、运行及附件元数据见 [完整验证记录](release/codec-verification.json)。
旧 Gyan 依赖证据保留 [dependency-verification.json](release/dependency-verification.json)，
不回写成自建程序验证。

## 2026-10-11 文件/故障复验与工具身份更新

[完整 CI 38099859270](https://github.com/Sceneryyyy/Trace/actions/runs/38099859270)，代码 `2aee519b575acdc8cdd954634084c2bb282b063f`，严格安装并完成实际测试。
同 pin 的源码编译在 37878086505 / 37879668339 成功；本次是否命中构建缓存
见验证 JSON 的 `codecBuildReused`，命中后仍核对 EXE/配置/工具及完整来源报告。
GitHub Windows 镜像只改变 `msys-2.0.dll`，其哈希从
`957d880559f0bfe7406a4cb27724610e7ce2f367030e299373d7ef37fbbb51b3`
更新为 `47d652c7cba30eb294eb7ee10bbfefdcc46342ddf47b4c09ad58a2185b36ad2c`；
其余 30 个工具、工具版本及六组系统输入目录相同。构建 lock/report 重新固定；
实际安装报告 SHA `e305461d392c76fec8c7355194c2fbd6b1fd4b579c862f4f5cd7bdb01fa0d047`
匹配当前 pin，原两 EXE、config.h/config.mak、源码和 recipe 哈希保持。
旧 pin 的 Windows 失败与主动取消的 Linux 保留，不放宽验证或倒改 10 月 4 日结果。

本轮两端 JS 272/272、Windows 原生/媒体 64/64、CTest 19/19、Linux sanitizer
8 + 原始 EBU 1、三格式及新候选通过。可读取的实际摘要来自 GitHub CI 注解，
包含真实测试/EBU/构建/产物记录与哈希；分块收齐并核对完整 JSON SHA。
EBU 原生源码的 Windows 实际文件 hash 对应 Git 的 LF→CRLF 文本 checkout，
验证 JSON 同时保留 blob hash、实际 hash 与限定转换，Linux 则逐字节相同。
Azure 日志/附件 payload 未读取。
新候选、工具变化、实际 MP3 帧数与旧代码反例见 [82](82-FILE-FAULT-TESTING.md)
及 [验证 JSON](release/file-fault-verification.json)。上节附件及数值仍是旧运行身份。
