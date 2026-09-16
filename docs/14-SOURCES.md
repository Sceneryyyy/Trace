# 14 · 来源、核查范围与证据边界

核查日期：2026-09-14。本包中的模块名、任务编号、缓冲预算、UI 布局和缓存结构是本项目设计建议。官方资料支持 API/标准/工具事实，不证明本软件已经实现或通过验收。

## 一手来源

| 来源 | 直接支持的内容 |
| --- | --- |
| [Prism 指定提交 package.json](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/package.json) | Electron/React/TS、node-gyp、构建/测试/分发脚本与许可标识 |
| [Prism README](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/README.md) | 系统采集、开发入口及插件/TUI 的现有范围 |
| [Prism Windows capture](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/native/src/windows_capture.cpp) | GetMixFormat、GetBuffer、显示队列覆盖、空闲补零；是本轮 M0 风险判断的源码依据 |
| [Prism native build](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/native/binding.gyp) | 原生源码清单和目标平台构建配置 |
| [Prism audioClipLibrary](https://github.com/Boof2015/prism/blob/df0755b8caaaab85157ac51aefffca0526974fc1/src/main/audioClipLibrary.ts) | 当前片段导出的时间上限、16-bit WAV 与整段构造 |
| [Microsoft GetMixFormat](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-getmixformat) | 共享模式实际混音格式；浮点格式和设备有效精度的区别 |
| [Microsoft GetBuffer](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer) | 帧数、静音/不连续标志、设备位置、100 ns QPC 时间、释放要求 |
| [Microsoft Loopback](https://learn.microsoft.com/en-us/windows/win32/coreaudio/loopback-recording) | 系统播放端点 loopback 的范围和 shared mode |
| [EBU Tech 3341](https://tech.ebu.ch/publications/tech3341) | EBU Mode 计量定义和测试参考 |
| [EBU Loudness Test Set](https://tech.ebu.ch/publications/ebu_loudness_test_set) | 数值验收素材及对应说明 |
| [libebur128](https://github.com/jiixyj/libebur128) 与 [头文件](https://github.com/jiixyj/libebur128/blob/master/ebur128/ebur128.h) | 统一响度/True Peak API、histogram 模式与历史配置；实施时仍需锁定 revision |
| [FFmpeg codecs](https://ffmpeg.org/ffmpeg-codecs.html) | AAC/LAME 编码器的码率、质量等选项 |
| [FFmpeg LAME 采样率列表](https://www.ffmpeg.org/doxygen/8.0/libmp3lame_8c_source.html) | MP3 最高 48 kHz 的所选编码器能力 |
| [Microsoft AAC encoder](https://learn.microsoft.com/en-us/windows/win32/medfound/aac-encoder) | Windows 内置 AAC 编码器的输入采样率/样本格式要求 |
| [Electron Native Modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules) | Electron 目标 ABI、原生模块重建及 Windows 加载注意事项 |
| [Codex AGENTS.md 官方文档](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | 根目录项目指令、作用域与按层读取；本包把长文档分开维护 |
| [Insight 2 Levels](https://s3.amazonaws.com/izotopedownloads/docs/insight200/en/levels/index.html)、[Loudness](https://s3.amazonaws.com/izotopedownloads/docs/insight200/en/loudness/index.html)、[History](https://s3.amazonaws.com/izotopedownloads/docs/insight200/en/history/index.html) | 面板、计量和响度历史的行为参考；不是本产品录音时间轴的现成实现 |

## 已观察与推断

Prism 源码存在队列满后弹出旧块、GetBuffer 时间戳参数为空、轮询空闲补零，这是代码观察。“需要建立独立持续录音通道和可信时间映射”是基于需求的工程判断。尚未在 Windows 跑出的性能、录音完整性或误差没有被当成事实。

2026-09-15 已完成同级 VSTDev 的有限只读对齐，见 10；没有移植其代码或执行其构建/部署。Prism 的本机源码和采集诊断证据见 16。

原调研快照保留于 [RESEARCH-v0.3](../references/RESEARCH-v0.3.md)。快照中的设计概述由当前详细设计补充；原厂来源随版本可能改变，实施时保存实际锁文件/源码 revision 和构建结果。
