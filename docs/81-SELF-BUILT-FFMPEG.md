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

实际运行、EXE 哈希、重复构建与候选附件身份将在完成验证后记录于本文及
`docs/release/codec-verification.json`；未完成的运行不记为通过。
