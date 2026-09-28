# TRACE · Audio Recorder & Analyzer

**Trace 声迹 · 音频分析录音机**

Windows 系统声音录音、常驻电平/响度/波形、可重复文件历史与 WAV/MP3/AAC 输出。

本次统一 LIVE、历史和文件工作台，拖动游标查看历史时继续采集/录音；点击播放才发声。见 [preview.4 工作台](docs/31-PREVIEW4-WORKBENCH.md)。当前可运行目录为 dist-trace/preview.8/win-unpacked；preview.8 修复历史拖动时的读数/表头闪烁，按完整历史快照更新，并保留图标走带与中文实时入口。此前的 60 秒缓存、列表管理、连续缩放与直接录音均保留。

当前版本为 **0.1.0-preview.8 开发预览**。M0–M5 最小工程门禁已通过，M6 桌面交付检查见 [桌面预览记录](docs/27-M6-DESKTOP.md)。原始 EBU、真实捕获 96 kHz、物理设备变化和专项人工验收保持开放；用户当前主观复验暂未发现问题，已确认本版本作为 Git 基线。

## 使用

解压 dist-trace 中的 Windows x64 ZIP，运行 Trace.exe。保留完整目录，无需另装 Node/Electron/FFmpeg。

操作步骤和人工验收清单见 [使用指南](docs/28-USER-GUIDE.md)。可直接 REC 保存；同一工作台拖动查看历史，点击 LIVE 回到最新。停止录音后播放回听、选区循环和导出。

## 开发入口

在此目录运行 Trace.ps1，或用锁定的 Node 执行 tools/trace.cjs 的同名动作：

- Setup：恢复锁文件依赖、上游原生依赖和固定 FFmpeg。
- Engine：构建 Trace 原生引擎并运行 CTest。
- AppBuild：构建 Trace 主进程、worker 与界面。
- App：启动开发构建。
- Package：构建原生及应用，生成 Trace 专用 Windows x64 ZIP；加 --dir 只生成目录。
- Codecs：恢复并校验 FFmpeg/ffprobe。
- Check：项目既有类型和 JS 边界检查。

当前组合门禁：node tools/workbench/gate.cjs（包含 M6 / M5 回归）。运行前准备独立包；门禁按顺序测试，避免多个实音频用例相互干扰。

## 工程与证据

实际源码在 src/trace 和 native/src/recorder；主接力文档为 [13-HANDOFF](docs/13-HANDOFF.md)。录音/截图/cache 在 artifacts；构建在 build/out-trace/dist-trace；本地工具在 .tools，均不提交。

项目文档只维护本仓库的 `docs/`（外层路径为 `TraceDev/app/docs/`）。外层原始开工包的 `TraceDev/docs/` 已按用户要求删除，开发和上传 GitHub 时以本仓库为入口。

M1 605.405 秒未录音监测和 M2 1800.84 秒 / 86440320 帧实录已有证据。当前格式、独立文件历史、选区、编码与恢复检查见 docs/20–27。自动检查不等于用户人工验收。

## 版本和来源

精确依赖见 toolchain.m0.json、package-lock.json、native/vendor/libebur128/SOURCE.json、ffmpeg.lock.json。依赖工具只在项目缓存，不修改全局 npm 或系统设备格式。

Prism commit df0755b8caaaab85157ac51aefffca0526974fc1；保留上游 README/LICENSE。Trace 使用独立 electron-builder.trace.cjs，不使用带 VST/TUI 行为的上游 dist:win。用户已确认 preview.8 可作为本地版本基线，标识 trace-preview.8-baseline；范围与验收边界见 docs/33-BASELINE.md。本次不推送远程。
