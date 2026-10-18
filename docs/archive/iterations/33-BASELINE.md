# 33 · Trace preview.8 Git 基线

日期：2026-09-16
产品版本：0.1.0-preview.8
分支：recorder/dev
基线标签：trace-preview.8-baseline
上游起点：Prism df0755b8caaaab85157ac51aefffca0526974fc1

## 用户确认

用户在试用当前版本后反馈“暂时没啥主观问题了”，并要求提交 Git 作为版本基线。此记录确认当前主观体验可作为后续迭代起点；下述专项工程验收继续保留。

## 纳入范围

- Trace Electron/React 桌面界面、原生 WASAPI 采集与计量、录音、60 秒内存历史、统一时间轴、走带与历史拖动连续呈现。
- WAV/MP3/AAC 文件处理、独立文件/选区分析、导出、恢复和文件列表管理。
- 构建与验证工具、测试、需求/设计/接力文档、示例、自有图标、锁文件及依赖来源/许可。
- 原生 libebur128 来源及本地改动记录保留。

录音、录屏、运行时缓存、测试产物、开发工具缓存、编译输出、便携软件包和分发 DLL 暂存目录由 .gitignore 排除。提交不包含个人绝对路径或凭据。

## 验证状态

preview.8 的逐帧拖动、呈现/播放服务、工作台、走带/EOF、直接录音、续录/恢复/录音精度及独立包检查已通过，详见 [32-PREVIEW8-SCRUB](32-PREVIEW8-SCRUB.md) 与 [13-HANDOFF](../../13-HANDOFF.md)。

本次 Git 基线整理只更新文档并检查提交范围，不重复音频实录。未把用户的主观复验扩大解释为原始 EBU 官方素材、真实 96 kHz 捕获、物理驱动切换、混合系统 DPI 或干净 VM 的专项通过记录。

## 重建与后续迭代

开发入口见 [Trace 首页](../../../README.md) 与 [09-WINDOWS-SETUP](../../09-WINDOWS-SETUP.md)。当时的交付目录为 dist-trace/preview.8/win-unpacked，产物不进入 Git；当前源码和已验证分发包见 [当前交接](../../13-HANDOFF.md)。

本地查看基线：git show trace-preview.8-baseline。后续修改从该基线向前提交；主观反馈和实际测试证据继续分开记录。此次操作仅创建本地提交和标签，远程发布另行处理。
