# Trace 声迹 · 开发入门

1. 在本仓库根检查 `git status --short --branch` / `git log`，遵守 [AGENTS.md](AGENTS.md)。
2. **先读 [当前交接](docs/13-HANDOFF.md) 和 [任务单](docs/07-BACKLOG.md)**；它们记录版本、实际评审分支、已完成范围与剩余工作。其余按 [任务阅读表](docs/README.md) 选择，不按编号通读文档。
3. preview.35 与文档归档已由 PR #3 合入默认 `recorder/dev`（`4d1fc0b`）；同步前仍先检查本地状态，干净且无分叉时使用 `git pull --ff-only origin recorder/dev`。
4. 历史实现/调研/审计已归档，只有定位回归、设计来源或旧包身份时才按文件读取；结束同步 07/13。

## 构建与检查

Windows 工具已就绪时，在 PowerShell 执行：

```powershell
.\Trace.ps1 -Action Setup
.\Trace.ps1 -Action Engine
.\Trace.ps1 -Action Check
.\Trace.ps1 -Action AppBuild
.\Trace.ps1 -Action App
```

Linux 云端按改动运行 `npm ci`、`npm run check:independence`、`npm run check:security`、`npm run typecheck`、`npm test`、`npm run build`。原生/EBU、Chromium 前端专项、工具链及 Windows 打包的真实命令与环境边界见 [09](docs/09-WINDOWS-SETUP.md)。文档变更只做必要的文档检查，不机械重跑产品测试。

工程为独立 Electron/React/TypeScript + C++ WASAPI/libebur128/固定 FFmpeg；无需重新克隆 Prism、新建第二层 app/ 或编译上游 addon。原始来源、许可保留；不可猜测或修改未提供的 vstdev 项目。
