# Trace 声迹 · 开发入门

2026-10-02 更新。本目录已经是完整源码仓库；默认开发分支为 `recorder/dev`。当前源码 preview.31，最近验证过的分发包 preview.30 / InternalTest-r3。版本与验证边界见 [当前交接](docs/13-HANDOFF.md)。

## 开始工作

1. 检查工作目录、`git status --short`、当前分支与提交，读取 [AGENTS.md](AGENTS.md)。
2. 读 [产品需求](docs/01-PRODUCT.md)、[架构](docs/02-ARCHITECTURE.md)、[任务单](docs/07-BACKLOG.md) 与 [当前交接](docs/13-HANDOFF.md)。其余资料按 [文档索引](docs/README.md) 选择。
3. 按 [Windows 开发环境](docs/09-WINDOWS-SETUP.md) 准备依赖与引擎；本仓库根即构建工作目录，无需重新克隆 Prism 或建立第二层 `app/`。
4. 根据任务实现、运行对应验证，更新相关契约与当前交接。历史记录不能替代本次版本的验证。

## Windows 构建入口

在仓库根目录的 PowerShell 执行：

```powershell
.\Trace.ps1 -Action Setup
.\Trace.ps1 -Action Engine
.\Trace.ps1 -Action Check
.\Trace.ps1 -Action AppBuild
.\Trace.ps1 -Action App
```

`Setup` 准备锁定依赖、Electron、FFmpeg 和上游 DSP；`Engine` 单独构建 Trace 音频后端。原生 CTest 与分发入口见 09。`package.json` 的默认 `dev`/`build` 属于上游 Prism；Trace 使用 `build:trace`/`start:trace` 及上述项目入口。

## Linux 云端可执行检查

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run test:trace
npm run build:trace
```

这组命令验证静态类型、可移植业务逻辑和应用资源，不能运行 Windows WASAPI、构建 Windows 原生引擎或验证分发包。最新云端证据见 [73](docs/73-CLOUD-CODE-REVIEW.md)；实机待办见当前交接。macOS 路线见 [70](docs/70-MACOS-PORT-PLAN.md)，当前分支没有完成 Trace 的 Mac 采集实现。

## 项目来源与约定

Trace 基于 Prism 提交 `df0755b8caaaab85157ac51aefffca0526974fc1` 复用开发；保留 [上游 README](README-Prism.md)、[许可](LICENSE) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。vstdev 仅作只读参考；历史只读核查见 [10](docs/10-VSTDEV-ALIGNMENT.md)，本次缺少本机路径时记录未重新对齐，保留已注明日期的历史结论。

可复用的实现、排错及交接指令见 [12](docs/12-CODEX-PROMPTS.md)。原先的文档开工包已完成接入，早期过程见 [交接历史](docs/archive/13-HANDOFF-HISTORY.md)。
