# 14 · 来源、核查范围与证据边界

初始核查日期：2026-09-14，以下链接与源码观察为复用起点的依据。2026-10-02 补充：Trace 现有实现以源码、[03–06 的契约](06-CONTRACTS.md) 和 [当前交接](13-HANDOFF.md) 为准；examples/ 已同步当前字段但不附媒体，早期预算仍为设计参考。官方 API/标准资料本身不证明软件已经通过验收。

## 一手来源

| 来源 | 直接支持的内容 |
| --- | --- |
| [Prism 指定提交 package.json](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/package.json) | Electron/React/TS、node-gyp、构建/测试/分发脚本与许可标识 |
| [Prism README](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/README.md) | 系统采集、开发入口及插件/TUI 的现有范围 |
| [Prism Windows capture](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/native/src/windows_capture.cpp) | GetMixFormat、GetBuffer、显示队列覆盖、空闲补零；是本轮 M0 风险判断的源码依据 |
| [Prism native build](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/native/binding.gyp) | 原生源码清单和目标平台构建配置 |
| [Prism audioClipLibrary](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/src/main/audioClipLibrary.ts) | 该上游提交片段导出的时间上限、16-bit WAV 与整段构造 |
| [Microsoft GetMixFormat](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-getmixformat) | 共享模式实际混音格式；浮点格式和设备有效精度的区别 |
| [Microsoft GetBuffer](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer) | 帧数、静音/不连续标志、设备位置、100 ns QPC 时间、释放要求 |
| [Microsoft Loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording) | 系统播放端点 loopback 的范围和 shared mode |
| [EBU Tech 3341](https://tech.ebu.ch/publications/tech3341) | EBU Mode 计量定义和测试参考 |
| [EBU Loudness Test Set](https://tech.ebu.ch/publications/ebu_loudness_test_set) | 数值验收素材及对应说明 |
| [libebur128](https://github.com/jiixyj/libebur128) 与 [头文件](https://github.com/jiixyj/libebur128/blob/master/ebur128/ebur128.h) | 统一响度/True Peak API、histogram 模式与历史配置；当前锁定来源与补丁见 [TRACE-PATCHES](../native/vendor/libebur128/TRACE-PATCHES.md) |
| [FFmpeg codecs](https://ffmpeg.org/ffmpeg-codecs.html) | AAC/LAME 编码器的码率、质量等选项 |
| [FFmpeg LAME 采样率列表](https://www.ffmpeg.org/doxygen/8.0/libmp3lame_8c_source.html) | MP3 最高 48 kHz 的所选编码器能力 |
| [Microsoft AAC encoder](https://learn.microsoft.com/en-us/windows/win32/medfound/aac-encoder) | Windows 内置 AAC 编码器的输入采样率/样本格式要求 |
| [Electron Native Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) | Electron 目标 ABI、原生模块重建及 Windows 加载注意事项 |
| [Codex AGENTS.md 官方文档](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | 根目录项目指令、作用域与按层读取；本包把长文档分开维护 |
| [Insight 2 Levels](https://s3.amazonaws.com/izotopedownloads/docs/insight200/en/levels/index.html)、[Loudness](https://s3.amazonaws.com/izotopedownloads/docs/insight200/en/loudness/index.html)、[History](https://s3.amazonaws.com/izotopedownloads/docs/insight200/en/history/index.html) | 面板、计量和响度历史的行为参考；不是本产品录音时间轴的现成实现 |

## 已观察与推断

Prism 源码存在队列满后弹出旧块、GetBuffer 时间戳参数为空、轮询空闲补零，这是代码观察。“需要建立独立持续录音通道和可信时间映射”是基于需求的工程判断。此观察针对指定上游提交，不代表 Trace 独立采集引擎仍使用同一录音路径。后续 Windows 证据见 16–69 的对应阶段；preview.31 最新改动的云端验证与实机边界见 [73](73-CLOUD-CODE-REVIEW.md)。

2026-09-15 已完成同级 VSTDev 的有限只读对齐，见 10；没有移植其代码或执行其构建/部署。Prism 的本机源码和采集诊断证据见 16。

原调研快照保留于 [RESEARCH-v0.3](../references/RESEARCH-v0.3.md)。快照中的设计概述由当前详细设计补充；原厂来源随版本可能改变，实施时保存实际锁文件/源码 revision 和构建结果。
