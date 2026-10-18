<div align="center">

<img src="resources/trace/branding/leomoon-trace-v1.png" alt="LeoMoon 狮子月牙标识" width="96">

# LeoMoon · TRACE

**Trace 声迹 · 音频分析录音机**

Audio Recorder & Analyzer

让声音被看见，让灵感有迹可循。

[快速上手](docs/28-USER-GUIDE.md) · [内测版本说明](docs/archive/iterations/69-INTERNAL-TEST-R3.md) · [开发进度](docs/13-HANDOFF.md) · [文档索引](docs/README.md) · [许可与来源](#许可与来源)

</div>

Trace 是 LeoMoon 系列的桌面音频录音与分析工作台。它把系统声音采集、录音、历史回听和多种测量仪器放在同一个窗口，让你既能观察正在发生的声音，也能沿时间轴回到刚才的细节。

当前源码为 **0.1.0-preview.35**（工作台与前端精简，见 [89](docs/89-FRONTEND-SIMPLIFICATION-ITERATION.md)；完整 CI 与实机待验边界以交接为准），默认开发分支为 `recorder/dev`。preview.35 位于 `codex/frontend-simplification-20261017` / [PR #3](https://github.com/Sceneryyyy/Trace/pull/3)，截至 2026-10-18 尚未合入远程默认分支（preview.34）。已验证的 preview.31 独立工程通过完整 Windows/Linux CI，并生成 **Windows x64 私有工程候选**（来源提交 `2aee519`）；产物身份见 [当前交接](docs/13-HANDOFF.md)。历史同事内测交付包为 **0.1.0-preview.30 / InternalTest-r3**（来源提交 `9c1ee21`）。[新版 PDF 快速上手](output/pdf/LeoMoon-Trace-Quick-Start-preview.31-zh-CN.pdf) 已更新，界面插图明确使用云端模拟数据。macOS 移植方案已记录，当前分支的 Trace 音频后端仍为 Windows/WASAPI，Mac 采集实现与实机验收尚未完成。

![Trace preview.35 工作台：模拟信号界面示例](docs/assets/frontend-preview35/workbench.png)

上图为实际 React 界面与模拟信号，截图来源及验证边界见 [preview.35 插图说明](docs/assets/frontend-preview35/README.md)。

## 功能特点

- **系统声音录音**：选择 Windows 播放设备，捕获该设备输出的声音；支持 WAV、MP3、AAC。WAV 提供 16/24-bit PCM 和 32-bit float，压缩格式提供质量或码率选项。
- **留住刚才的声音**：监测时在内存中保留最多 60 秒历史，可定位回看与回听，或显式保存缓存及选区。无需提前开启录音；普通监测不会写入音频临时文件。
- **统一时间轴**：波形与响度历史共享游标，支持拖动定位、选区循环、跟随游标及波形复位。实时监测、历史查看和文件回听在同一工作台完成。
- **多仪器分析**：电平、Peak/RMS/True Peak，M/S/I 响度及 LRA，频谱、2D/3D 声谱图，以及立体声声场、相关度和平衡。
- **按任务组织界面**：选择要显示的仪器，编辑位置与尺寸，保存命名布局预设；从精简录音视图切换到完整分析工作台。
- **复核与导图**：持久化人工标记与评论，导出频谱/声谱 SVG、PNG 及来源元数据；报告增加时间加权响度分布、PLR/PSR，参考比较支持保守的等响度回听。
- **素材检查与参考比较**：导入外部音频，用 A/B 参考对比观察差异；设置响度目标，查看超限事件，导出 CSV/HTML 测量报告。
- **本地文件与诊断**：管理录音、原件与导出成品，提供单实例保护、脱敏诊断导出和邮件反馈入口。

## 设计理念与使用场景

**以时间轴串起听觉与测量。** 读数跟随正在查看的位置，帮助你把“听起来有什么问题”对应到“哪一段发生了什么”。监测与录音分开控制，仪器按任务配置，常用走带操作集中在底部。

适合游戏音效和交互声音检查、系统声音与灵感片段采集、配音及音乐素材的响度复核，以及与参考素材进行频谱和声场比较。

## 快速开始

1. 获取 **Windows x64 内测分发包**，完整解压后运行 `Trace.exe`。历史同事包见 [InternalTest-r3 分发说明](docs/archive/iterations/69-INTERNAL-TEST-R3.md)；新的 preview.31 私有工程候选身份与可用状态见 [当前交接](docs/13-HANDOFF.md)，分发包由维护者另行提供。
2. 选择系统播放设备，点击「开始监测」并播放声音，观察仪器；也可以直接点击录音按钮启动采集和录音。
3. 点击停止录音后，在波形上定位回听；切换「选区」后拖出范围，启用循环试听。
4. 点击「实时」回到最新声音。需要保留尚未录制的片段时，使用「保存缓存」。
5. 通过「仪器」选择显示内容，再进入「编辑布局」调整工作台并保存预设。

详细操作见 [用户指南](docs/28-USER-GUIDE.md)。内测分发包包含中文 PDF 快速上手手册，手册的适用版本与维护说明见 [用户手册记录](docs/archive/iterations/62-USER-MANUAL.md)。

### 当前验证边界

preview.35 最新源码验证见 [89](docs/89-FRONTEND-SIMPLIFICATION-ITERATION.md)：完整双平台 CI、两端 portable 各 321/321、Windows CTest 19/19 与原生/媒体 68/68 通过；前端使用实际 React 与模拟 IPC，实机项目仍待验。preview.34 录音列表迭代见 [87](docs/archive/iterations/87-RECORDING-LIBRARY-ITERATION.md)；preview.33 的历史代码/文档复核见 [85](docs/archive/iterations/85-CODE-DOCUMENT-REVIEW.md) 和 [当前交接](docs/13-HANDOFF.md)。下段是 preview.31 私有工程候选的历史验证身份；当前源码尚未生成新安装包。

本项目仍处于开发预览阶段。preview.31 独立工程的 [完整 CI](https://github.com/Sceneryyyy/Trace/actions/runs/38099859270)（`2aee519`）已成功：Windows CTest **19/19**、Trace 原生/FFmpeg 测试 **64/64**、两端可移植 JS **272/272**，Linux ASan/UBSan 的 8 项核心测试与 1 项原始 EBU 门禁、浏览器回归、类型与应用构建均通过；Windows 私有工程候选已生成，包审计及加载/重启通过。自建来源证明见 [81](docs/81-SELF-BUILT-FFMPEG.md)，本轮文件/故障复验见 [82](docs/archive/iterations/82-FILE-FAULT-TESTING.md) 和 [当前交接](docs/13-HANDOFF.md)。

完整与生产 npm 审计均已归零；固定 SDK/历史编码修复见 [80](docs/archive/iterations/80-RELEASE-DEPENDENCY-HARDENING.md)，新自建候选复验见 [81](docs/81-SELF-BUILT-FFMPEG.md)。自建 FFmpeg/LAME 的固定源码、构建脚本和实际报告已通过完整来源门禁，见 [81](docs/81-SELF-BUILT-FFMPEG.md)；组件安全与微软/GPL 系统库分发条款复核继续单列。独立干净 Windows、不同声卡/驱动、真实 96 kHz 等实机验收仍需补充，Windows 分发包尚未签名；macOS 采集、权限、打包与签名/公证尚未完成实机验证。正式发布门禁见 [76](docs/76-RELEASE-CHECKLIST.md)。

Meter v5 的适用 EBU 原始 WAV 已在 Linux 与 Windows 工程检查中通过 68/68；Windows 实际文件读取与原生分析已验证。响度索引和报告峰值修复见 [78](docs/archive/iterations/78-EBU-METER-RECALIBRATION.md)；真实设备、实时/选区/导出完整流程仍需实机验收。

## 开发入口

Trace 使用 Electron / React / TypeScript，Windows 音频后端使用原生 C++ / WASAPI，计量使用 libebur128，格式转换使用 FFmpeg。默认安装、类型检查、测试、应用构建与分发入口均属于 Trace；安装依赖不会构建 Prism addon。仍复用的 FFT 已作为带来源与许可记录的本地组件维护。独立工程边界见 [79](docs/79-TRACE-INDEPENDENT-PROJECT.md)，环境准备见 [09](docs/09-WINDOWS-SETUP.md)；[当前工具链清单](toolchain.trace.json) 记录固定依赖，[M0 记录](toolchain.m0.json) 保留早期验证快照。

安装锁定依赖并执行可移植检查：

```bash
npm ci
npm run check:independence
npm run check:security
npm run typecheck
npm test
npm run build
```

这些命令可在 Linux 云端运行；`npm run dev` 启动 Trace 开发界面。Windows 原生音频引擎与分发包另需系统 C++ 工具链。

在仓库根目录的 Windows PowerShell 中执行：

```powershell
.\Trace.ps1 -Action Setup     # 准备依赖、Electron SDK 与 FFmpeg
.\Trace.ps1 -Action Engine    # 构建 Trace 音频引擎
.\Trace.ps1 -Action Check     # 类型检查与针对性测试
.\Trace.ps1 -Action AppBuild  # 构建 Trace 应用
.\Trace.ps1 -Action App       # 启动开发构建
.\Trace.ps1 -Action Package   # 构建 Windows 分发包
```

构建所需的 Node、Python、Visual Studio C++ 等版本以工具链和项目文档为准；上述入口不会代替系统构建工具的安装。

单独准备 Electron SDK 使用 `npm run install:trace-sdk`，只获取头文件与链接库。Windows 原始 WASAPI 诊断使用 `npm run build:trace-diagnostics` 和 `npm run trace:diagnostics -- list`；该工具直接使用 Windows SDK，详情见 [09](docs/09-WINDOWS-SETUP.md)。

| 入口 | 内容 |
| --- | --- |
| `src/trace/` | Trace 界面、主进程与业务逻辑 |
| `native/src/recorder/` | 原生录音、缓存、计量与回放核心 |
| [产品需求](docs/01-PRODUCT.md) / [架构](docs/02-ARCHITECTURE.md) | 产品范围与技术约定 |
| [任务单](docs/07-BACKLOG.md) / [迭代计划历史](docs/archive/iterations/38-DEVELOPMENT-PLAN.md) | 当前待办与 M7–M12 原始范围 |
| [验收标准](docs/08-ACCEPTANCE.md) / [当前交接](docs/13-HANDOFF.md) | 验证证据、限制和下一任务 |

Trace 文档集中维护在 `docs/`，阅读顺序见 [文档索引](docs/README.md) 与 [开发入门](CODEX-START.md)。`recorder/dev` 为默认开发分支；macOS 路线见 [移植方案](docs/70-MACOS-PORT-PLAN.md)。上游复用起点以提交和来源记录追溯，不依赖本地是否存在 `main` 分支。

## 反馈

内测反馈请说明软件版本、Windows 版本、声卡/设备、复现步骤、预期与实际表现。可以从软件中导出脱敏诊断文件，经检查后附在邮件中发送至 **472841772@qq.com**；音频素材仅在你愿意分享时提供。

## 许可与来源

Trace 基于 [Boof2015/Prism](https://github.com/Boof2015/prism) 开发，复用起点为提交 `df0755b8caaaab85157ac51aefffca0526974fc1`。感谢 Prism 作者及相关开源项目。

项目保留 [GNU GPL v3 许可](LICENSE)、[第三方声明](THIRD_PARTY_NOTICES.md) 与 [上游原始 README](README-Prism.md)。详细来源与复用记录见 [来源清单](docs/archive/iterations/14-SOURCES.md)。上游 README 描述的是 Prism 的历史功能与构建流程，Trace 的功能及开发入口以本页和 `docs/` 为准。
