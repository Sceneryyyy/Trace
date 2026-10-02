# 09 · Windows 开发与交付环境

2026-10-02 更新。所有命令在本仓库根执行。Trace 已有完整源码和专用构建入口；首次接入过程见 [16](16-M0-VALIDATION.md)，当前状态见 [13](13-HANDOFF.md)。

## 工具与锁定记录

| 项目 | 当前要求与证据 |
| --- | --- |
| Windows | x64；真实 WASAPI、设备故障、原生 DLL 和分发验证需要 Windows |
| Node/npm | Windows 基线 Node 24.19.0、项目入口使用本地 npm 10.9.2；精确 M0 环境见 [toolchain.m0.json](../toolchain.m0.json) |
| MSVC / SDK | Visual Studio 2022 C++ x64 工具链与 Windows SDK；实际构建器见 `tools/build-engine.cjs`，历史版本见 toolchain |
| Python / CMake | node-gyp 兼容的 Python、CMake；Trace 引擎经 CMake 构建，上游 DSP 经 node-gyp 针对 Electron ABI 构建 |
| Electron /前端依赖 | 以 [package-lock.json](../package-lock.json) 为准；不能只依据上游 README 的 Node 18+ 说明选环境 |
| libebur128 | [native/vendor/libebur128](../native/vendor/libebur128) 的锁定源码与 [本地补丁记录](../native/vendor/libebur128/TRACE-PATCHES.md) |
| FFmpeg / ffprobe | [ffmpeg.lock.json](../ffmpeg.lock.json) 固定 Windows 构建与校验；项目 `Codecs`/`Setup` 入口准备组件 |
| 声卡与设备 | 软件读取实际 mix format；验收 96 kHz 需要真实支持该格式的系统播放设备 |

`toolchain.m0.json` 是 2026-09-15 的环境快照，其中后续依赖的待定项不代表当前实现缺失。当前依赖与行为以锁文件、构建脚本和源码为准。各机器安装目录不同，普通 shell 找不到 `cl` 不等于未安装工具链。

## 准备与开发

```powershell
.\Trace.ps1 -Action Setup      # 安装锁定依赖、Electron/esbuild、编码组件，构建上游 DSP
.\Trace.ps1 -Action Engine     # 构建 Trace 引擎/测试目标并自动运行 CTest
.\Trace.ps1 -Action Check      # 类型、采集能力、上游响度、portable/native Trace 测试
.\Trace.ps1 -Action AppBuild   # 构建 Trace main/preload/renderer
.\Trace.ps1 -Action App        # 启动已构建的 Trace 应用
```

`Trace.ps1` 调用 `tools/trace.cjs`；系统编译工具需事先安装。Electron addon 必须匹配锁定 Electron 的架构与 ABI。`Setup` 构建的上游 DSP 与 `Engine` 构建的 Trace 引擎是两个目标。

`Engine` 已自动运行 CTest。仅需重跑该门禁时可单独执行：

```powershell
ctest --test-dir build/trace-engine -C Release --output-on-failure
```

当前 CMake 注册 16 项，包含 preview.31 新增的 `trace-replay-quality`；此数量来自源码，最新 16 项全量 Windows 运行尚未执行，不能沿用旧 15/15 结论。可单独执行 `npm run test:trace`（portable）、`npm run test:trace-native`（Windows 原生）、`npm run test:trace-all`。测试分层以 `scripts/run-trace-tests.mjs` 为准。

默认 `npm run dev`/`build`/`dist:win` 属于 Prism。Trace 使用 `npm run build:trace`、`npm run start:trace` 和项目入口；不要将上游 VST/TUI 安装流程当作 Trace 分发流程。

## Windows 分发

```powershell
.\Trace.ps1 -Action Codecs
.\Trace.ps1 -Action Package
```

`Package` 重建 Trace 引擎及应用，再调用 `tools/package-trace.cjs`。输出目录、产品版本与组件由 [electron-builder.trace.cjs](../electron-builder.trace.cjs) 和 [src/trace/product.ts](../src/trace/product.ts) 定义；应用资源构建成功不等于分发、真实音频或干净系统验证通过。

同事内测 ZIP 的 R3 组装脚本为 `tools/package-internal-test-r3.cjs`，固定 preview.30 / InternalTest-r3；无后缀脚本固定 preview.28 / R1，`-r2` 固定 preview.29 / R2。这些脚本应在匹配的历史来源与素材下使用。preview.31 新候选入口已在 [76](76-RELEASE-CHECKLIST.md) 建立，匹配 PDF 已生成；本轮未构建 Windows 新包。新分发需同步来源提交、版本说明与校验，不能直接复用 R3 脚本或只改文件名。最近分发证据见 [69](69-INTERNAL-TEST-R3.md)；历史产物目录被 gitignore 排除，不随源码克隆提供。

## 云端检查与未验证边界

仅有 Linux 环境时，可运行：

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run test:trace
npm run build:trace
```

`tools/trace.cjs` 明确限制 Windows x64，不能在 Linux 使用它作为全套验收入口。可移植 C++ 可按 [75](75-CLOUD-RELEASE-PREPARATION.md) 使用 `native/portable` 的 CMake/CTest（可开启 TRACE_SANITIZE）；未运行 Windows 原生加载、真实采集、96 kHz 或打包时须记录未验证。

签名/公开发布、干净 Windows、硬件矩阵、官方 EBU 素材、工具链安全与真实包等剩余工作见 [当前交接](13-HANDOFF.md)。macOS 实施计划见 [70](70-MACOS-PORT-PLAN.md)。
