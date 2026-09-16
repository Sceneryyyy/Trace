> 原始开工说明存档。M0 已执行，当前代码根就是本目录。继续开发以 [当前接力](docs/13-HANDOFF.md) 和 [Trace 入口](TRACE-README.md) 为准。

# Trace 声迹 · Codex 开工包

版本：1.1 · 2026-09-15。用途：在 Windows PC 上启动开发。包内是设计、接口和任务文档，尚无可运行的录音机，也没有 Windows 实测成绩。

产品名称已确认：英文 **Trace**，中文 **声迹**；界面品牌展示 **TRACE**，英文副标题 **Audio Recorder & Analyzer**，中文完整展示 **Trace 声迹 · 音频分析录音机**。

## 怎样开始

1. 解压本包到独立目录，例如 `D:\Dev\audio-recorder-kickoff`，用 PC 上的 Codex 打开这个目录。
2. 如果 vstdev 在本机，向 Codex 提供它的路径；只用于读取现有约定。没有路径也可以先验证录音机基础链路。
3. 把下面的开工指令完整发给 Codex。首次目标是 M0 和 M1：环境、复用验证、未录音实时监测。
4. M0 会在本包的 `app/` 子目录建立真正的代码仓库，并把项目指令和设计文档接入该仓库。之后用 Codex 打开 `app/` 继续开发。

当前设计默认 Windows x64、一个系统播放设备、单/双声道、停止录音后回放。后三项是工程默认值，不是虚构的用户确认。格式已经确认：WAV、MP3、AAC 都保留；只有 WAV 要求支持 96 kHz。

## 发给 Codex 的第一条指令

```text
请按这个开工包实际推进 Trace 声迹桌面音频录音机，不要只输出方案。
命名已确认：Trace／声迹，界面品牌 TRACE，英文副标题 Audio Recorder & Analyzer。

先读 AGENTS.md、docs/01-PRODUCT.md、docs/02-ARCHITECTURE.md、
docs/07-BACKLOG.md、docs/09-WINDOWS-SETUP.md、docs/13-HANDOFF.md。
本包目前只有文档，没有可执行应用；不能声称原生录音或计量已验证。

先执行 M0，成功后继续 M1。默认在当前目录的 app/ 创建独立代码仓库，
优先检出文档指定的 Prism 提交进行复用验证，保持本包和用户已有文件完整。
若当前目录已经是录音机代码仓库，直接复用，不再创建第二层 app/。
仓库已有内容时先读取 git status 和适用的 AGENTS.md，再选择隔离分支或目录。
不要把本项目写进 vstdev，也不要覆盖它的设置、SDK、插件目录或构建产物。

若我提供了 vstdev 路径，按 docs/10-VSTDEV-ALIGNMENT.md 只读对齐开发约定。
找不到时标为“未对齐”，继续可独立完成的工作，不凭项目名假定 JUCE/CMake。

M0 通过后，将本包 AGENTS.md 与 app/ 已有规则合并，将 docs/、examples/、
references/ 接入 app/ 同名目录；遇到同名文件保留原件并记录映射，不覆盖未知内容。
把本开工入口保存为 app/CODEX-START.md，保留上游 README 和许可文件。
后续以 app/ 为代码仓库根，以其中的设计文档为唯一维护副本。

必须做到：REC 关闭也可实时显示电平、响度和滚动波形；
采集、完整音频分析和写盘不能依赖界面刷新；WAV 跟随系统真实采样率到 96 kHz；
MP3/AAC 保留 44.1/48 kHz 输出；回放表头属于正在听的文件，跳转不重复累计 I。

先给出简短的本次执行清单，然后检查环境、读取实际构建脚本并动手。
用真实命令、退出码、设备格式和测试结果报告进度；没有运行的测试明确写未运行。
已有授权范围内的常规实现选择自行处理；出现阻塞时完成独立工作并说明精确缺项。
结束前更新 docs/13-HANDOFF.md，留下当前提交、验证结果和下一条可执行任务。
```

## 文档入口

| 文件 | 解决的问题 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Codex 每次工作的项目规则与完成标准 |
| [01-PRODUCT](docs/01-PRODUCT.md) | 已确认需求、工程默认值、首版边界 |
| [02-ARCHITECTURE](docs/02-ARCHITECTURE.md) | 技术路线、进程/线程、模块责任与依赖方向 |
| [03-AUDIO-METERING](docs/03-AUDIO-METERING.md) | 音频时间、静音、LUFS/TP、历史回放的精确定义 |
| [04-DATA-FORMATS](docs/04-DATA-FORMATS.md) | 会话、音频、缓存、编码及恢复规则 |
| [05-UI-UX](docs/05-UI-UX.md) | Insight 2 风格布局、状态、交互和错误文案 |
| [06-CONTRACTS](docs/06-CONTRACTS.md) | 前端与音频引擎的命令、事件、数据协议 |
| [07-BACKLOG](docs/07-BACKLOG.md) | 可逐个交给 Codex 的任务及依赖 |
| [08-ACCEPTANCE](docs/08-ACCEPTANCE.md) | 可以复现和判定通过的测试清单 |
| [09-WINDOWS-SETUP](docs/09-WINDOWS-SETUP.md) | PC 环境、构建命令、原生模块和交付步骤 |
| [10-VSTDEV-ALIGNMENT](docs/10-VSTDEV-ALIGNMENT.md) | 与旧项目的只读对齐清单；当前资料缺口 |
| [11-DECISIONS](docs/11-DECISIONS.md) | 已作出的架构选择及改变它们的条件 |
| [12-CODEX-PROMPTS](docs/12-CODEX-PROMPTS.md) | 实现、续接、排错和复核指令 |
| [13-HANDOFF](docs/13-HANDOFF.md) | 预填的项目现状、待办和接力记录 |
| [14-SOURCES](docs/14-SOURCES.md) | 官方依据、源码核查范围与证据边界 |
| [15-VALIDATION-REPORT](docs/15-VALIDATION-REPORT.md) | 本开工包自身的检查结果，区别于软件验收 |

`examples/` 提供会话及格式预设样例；`references/RESEARCH-v0.3.md` 保存之前的调研快照。发生差异时，当前需求和本包的详细设计优先于调研快照。

vstdev 仅保存在用户 PC 本地 Git，未上传 GitHub；本轮未取得其路径与历史文档。因此本包没有宣称已复刻其技术栈；已准备可在本机完成的对齐步骤。这不妨碍先做 M0 的环境与复用验证。
