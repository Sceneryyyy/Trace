# Trace 声迹 · 开发入门

2026-10-15 更新。本目录已经是完整源码仓库；默认开发分支为 `recorder/dev`。当前源码 preview.34（[录音列表迭代](docs/87-RECORDING-LIBRARY-ITERATION.md)）；来源 `2aee519` 的 preview.31 私有工程候选已由完整 CI 生成，preview.30 / InternalTest-r3 保留为历史同事内测交付包。版本、产物身份与验证边界见 [当前交接](docs/13-HANDOFF.md)，独立工程边界见 [79](docs/79-TRACE-INDEPENDENT-PROJECT.md)，自建组件原始证明见 [81](docs/81-SELF-BUILT-FFMPEG.md)，上一轮文件/故障与工具更新复验见 [82](docs/82-FILE-FAULT-TESTING.md)。

## 开始工作

1. 检查工作目录、`git status --short`、当前分支与提交，读取 [AGENTS.md](AGENTS.md)。
2. 读 [产品需求](docs/01-PRODUCT.md)、[架构](docs/02-ARCHITECTURE.md)、[任务单](docs/07-BACKLOG.md) 与 [当前交接](docs/13-HANDOFF.md)。其余资料按 [文档索引](docs/README.md) 选择。
3. 按 [Windows 开发环境](docs/09-WINDOWS-SETUP.md) 准备依赖与引擎；本仓库根即构建工作目录，无需重新克隆 Prism 或建立第二层 `app/`。
4. 根据任务实现、运行对应验证，更新相关契约与当前交接。历史记录不能替代本次版本的验证。

依赖、编码与下载回归修复已交付到 `recorder/dev`；自建 FFmpeg 已接入；完整 CI 与新候选绑定 `2aee519`，证据见 [82](docs/82-FILE-FAULT-TESTING.md)。preview.34 列表源码 `bf42e6c` / PR #2 的完整两端 CI 已通过；PR #2 已合入远程默认分支 `recorder/dev`，合并提交 `ba461e5`。最新源码及证据以 [87](docs/87-RECORDING-LIBRARY-ITERATION.md) 与当前交接为准。下一会话的同步检查、证据位置和云端/实机后续顺序见 [接力说明](docs/13-HANDOFF.md#下一会话接力)。忽略目录里的原始日志不会随 clone 下载，可从已提交的验证摘要和 Actions 继续核查。

## Windows 构建入口

在仓库根目录的 PowerShell 执行：

```powershell
.\Trace.ps1 -Action Setup
.\Trace.ps1 -Action Engine
.\Trace.ps1 -Action Check
.\Trace.ps1 -Action AppBuild
.\Trace.ps1 -Action App
```

`Setup` 准备锁定依赖、Electron SDK 和 FFmpeg；`Engine` 构建 Trace 音频后端并运行原生 CTest。默认 `dev`、`build`、`test`、`dist` 均属于 Trace；`build:trace`/`start:trace` 保留兼容入口。单独获取 SDK 使用 `npm run install:trace-sdk`，无需编译上游 addon。原生 CTest、SDK-only WASAPI 诊断与分发入口见 [09](docs/09-WINDOWS-SETUP.md)。

preview.31 的 [完整 CI](https://github.com/Sceneryyyy/Trace/actions/runs/38099859270)（`2aee519`）已通过 Windows CTest 19/19、实际 Trace 原生/FFmpeg 测试 64/64、两端 portable JS 272/272、Linux ASan/UBSan 核心 8 项与原始 EBU 1 项，以及浏览器回归、类型与应用构建。候选生成、包审计和加载/重启也已成功。真实 WASAPI 采集、声卡矩阵、长录音与正式发布验收继续单列，不能沿用历史 R3 或无声卡包启动替代。

## Linux 云端可执行检查

```bash
npm ci
npm run check:independence
npm run check:security
npm run typecheck
npm test
npm run build
```

这组命令验证工程依赖边界、静态类型、可移植业务逻辑和应用资源；`npm ci` 安装声明的依赖，不构建本项目或上游的原生 addon。可移植 C++、FFT 与原始 EBU 素材检查使用 `native/portable`，命令见 [09](docs/09-WINDOWS-SETUP.md)。Windows WASAPI、原生引擎加载与分发包须另验；最新本轮结果以 [87](docs/87-RECORDING-LIBRARY-ITERATION.md) 和当前交接为准。macOS 路线见 [70](docs/70-MACOS-PORT-PLAN.md)，当前分支没有完成 Trace 的 Mac 采集实现。

## 项目来源与约定

Trace 基于 Prism 提交 `df0755b8caaaab85157ac51aefffca0526974fc1` 复用开发；保留 [上游 README](README-Prism.md)、[许可](LICENSE) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。vstdev 仅作只读参考；历史只读核查见 [10](docs/10-VSTDEV-ALIGNMENT.md)，本次缺少本机路径时记录未重新对齐，保留已注明日期的历史结论。

可复用的实现、排错及交接指令见 [12](docs/12-CODEX-PROMPTS.md)。原先的文档开工包已完成接入，早期过程见 [交接历史](docs/archive/13-HANDOFF-HISTORY.md)。
