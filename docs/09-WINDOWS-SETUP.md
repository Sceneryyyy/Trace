# 09 · Windows 开发与交付环境

2026-10-03 更新。所有命令在本仓库根执行。默认安装、构建、测试和分发入口均属于 Trace；当前工程无需构建 Prism addon。独立工程边界见 [79](79-TRACE-INDEPENDENT-PROJECT.md)，首次接入过程见 [16](16-M0-VALIDATION.md)，当前验证状态见 [13](13-HANDOFF.md)。源码版本仍为 preview.31，计量配置仍为 Meter v5。

## 工具与锁定记录

| 项目 | 当前要求与证据 |
| --- | --- |
| Windows | x64；真实 WASAPI、设备故障、原生 DLL 和分发验证需要 Windows |
| Node/npm | Windows 基线 Node 24.19.0、项目入口使用本地 npm 10.9.2；精确 M0 环境见 [toolchain.m0.json](../toolchain.m0.json) |
| MSVC / SDK | Visual Studio 2022 C++ x64 工具链与 Windows SDK；实际构建器见 `tools/build-engine.cjs`，历史版本见 toolchain |
| Python / CMake | Python 3.9+ 用于原始 EBU 素材检查，CMake 用于 Trace 引擎/测试构建；node-gyp 仅用于获取与校验锁定 Electron SDK |
| Electron /前端依赖 | 以 [package-lock.json](../package-lock.json) 为准；不能只依据上游 README 的 Node 18+ 说明选环境 |
| libebur128 | [native/vendor/libebur128](../native/vendor/libebur128) 的锁定源码与 [本地补丁记录](../native/vendor/libebur128/TRACE-PATCHES.md) |
| FFT | [native/vendor/prism-fft](../native/vendor/prism-fft) 的本地源码组件、来源与 GPL 许可；由 Trace 自身 CMake 编译 |
| FFmpeg / ffprobe | [ffmpeg.lock.json](../ffmpeg.lock.json) 固定 Windows 构建与校验；项目 `Codecs`/`Setup` 入口准备组件 |
| 声卡与设备 | 软件读取实际 mix format；验收 96 kHz 需要真实支持该格式的系统播放设备 |

`toolchain.m0.json` 是 2026-09-15 的环境快照，其中后续依赖的待定项不代表当前实现缺失。当前依赖与行为以锁文件、构建脚本和源码为准。各机器安装目录不同，普通 shell 找不到 `cl` 不等于未安装工具链。

## 准备与开发

```powershell
.\Trace.ps1 -Action Setup      # 安装锁定依赖、Electron/esbuild、Electron SDK 与编码组件
.\Trace.ps1 -Action Engine     # 构建 Trace 引擎/测试目标并自动运行 CTest
.\Trace.ps1 -Action Check      # 类型与 portable/native Trace 测试
.\Trace.ps1 -Action AppBuild   # 构建 Trace main/preload/renderer
.\Trace.ps1 -Action App        # 启动已构建的 Trace 应用
```

`Trace.ps1` 调用 `tools/trace.cjs`；系统编译工具需事先安装。Electron addon 必须匹配锁定 Electron 的架构与 ABI。`Setup` 获取依赖与 SDK，`Engine` 构建唯一的 Trace 原生 addon `trace_engine.node`。无需克隆、安装或编译上游工程。

也可逐项执行标准 npm 入口：

```powershell
npm ci
npm run check:independence
npm run install:trace-sdk
node tools/prefetch-ffmpeg.mjs
npm run build:trace-engine
npm run typecheck
npm test
npm run build
npm start
```

`npm ci` 不带项目级原生安装脚本；它安装锁文件声明的依赖。`install:trace-sdk` 下载 Electron 40.8.3 x64 的头文件与 `node.lib`，由 node-gyp 校验下载内容，保存到 `.tools/node-gyp/40.8.3/`，不编译 addon。`build:trace-engine` 经自身 CMake 构建引擎并运行 CTest；原有 `build:native`/`rebuild:native` 现在也指向同一 Trace 引擎。

`Engine` 已自动运行 CTest。仅需重跑该门禁时可单独执行：

```powershell
ctest --test-dir build/trace-engine -C Release --output-on-failure
```

当前 Windows CMake 注册 18 项基础测试；私有原始 EBU 素材齐备时，再注册 `trace-ebu-wav`，共 19 项，包含新增的 FFT 独立数值回归。[完整 CI](https://github.com/Sceneryyyy/Trace/actions/runs/37104992986)（`db005b5`）已实际通过 19/19，实际 Trace 原生/FFmpeg 测试 43/43、portable JS 248/248、类型与应用构建也通过，均无 fail/skip。该轮工作流与私有工程候选生成均成功。

可单独执行 `npm run test:trace`（portable）、`npm run test:trace-native`（Windows 原生）、`npm run test:trace-all`。native 层只测试实际 Trace API 与 FFmpeg；缺少引擎/编码组件时会明确跳过，在严格门禁中须设置 `$env:TRACE_REQUIRE_NATIVE='1'`，使缺失依赖直接失败。测试分层以 `scripts/run-trace-tests.mjs` 和 `test/trace-suites.mjs` 为准。

默认 `npm run dev`/`build`/`test`/`dist:win` 均属于 Trace。`build:trace`/`start:trace` 保留兼容入口；类型检查只覆盖 Trace 源码和自身构建配置，独立边界检查防止重新引入上游路径。

## Windows 原始 WASAPI 诊断

SDK-only 诊断工具保留设备枚举、包位置/标记检查与确定性播放夹具；它不加载任何 addon，也不链接 Prism 源码：

```powershell
npm run build:trace-diagnostics
npm run trace:diagnostics -- list
npm run trace:diagnostics -- raw --seconds 6 --fixture
```

可用 `--device-index 0` 指定枚举索引。源码位于 `tools/diagnostics/`，两个可执行文件 `trace-capture-probe.exe` 与 `trace-render-fixture.exe` 输出到 `build/trace-diagnostics/Release/`；包元数据报告保存在 `artifacts/diagnostics/`。夹具会在选定系统播放端点发出低幅测试音，须在 Windows 实机执行。旧 M0 的上游模式与 addon smoke 已退役，历史证据保留在文档与 Git 来源中。

独立诊断工具已在 Windows CI 编译通过；Actions runner 的编译/原生文件测试不执行真实播放端点采集，raw/list 实机运行仍须单独保留证据。

## Windows 分发

```powershell
.\Trace.ps1 -Action Codecs
.\Trace.ps1 -Action Package
```

`Package` 重建 Trace 引擎及应用，再调用 `tools/package-trace.cjs`。输出目录、产品版本与组件由 [electron-builder.trace.cjs](../electron-builder.trace.cjs) 和 [src/trace/product.ts](../src/trace/product.ts) 定义；应用资源构建成功不等于分发、真实音频或干净系统验证通过。

同事内测 ZIP 的 R3 组装脚本为 `tools/package-internal-test-r3.cjs`，固定 preview.30 / InternalTest-r3；无后缀脚本固定 preview.28 / R1，`-r2` 固定 preview.29 / R2。这些脚本应在匹配的历史来源与素材下使用。preview.31 的私有工程候选采用 [76](76-RELEASE-CHECKLIST.md) 的新流程与匹配 PDF；[完整 CI](https://github.com/Sceneryyyy/Trace/actions/runs/37104992986)（`db005b5`）在本轮 Linux sanitizer/原始 WAV 门禁成功后，已完成 ZIP、五项包审计、包加载/重启及候选附件生成。图标生成物写入忽略目录，候选工具的干净工作区检查保持严格；产物身份与完整结论见 [13](13-HANDOFF.md) 和 [79](79-TRACE-INDEPENDENT-PROJECT.md)。

新分发需同步来源提交、版本说明与校验，不能直接复用 R3 脚本或只改文件名。历史 R3 交付证据见 [69](69-INTERNAL-TEST-R3.md)；历史产物目录被 gitignore 排除，不随源码克隆提供。

## 云端检查与未验证边界

仅有 Linux 环境时，可运行：

```bash
npm ci
npm run check:independence
npm run typecheck
npm test
npm run build
```

`tools/trace.cjs` 明确限制 Windows x64，不能在 Linux 使用它作为全套验收入口。可移植 C++ 与原始 EBU 素材门禁使用自身 CMake：

```bash
cmake -S native/portable -B build/trace-portable -DCMAKE_BUILD_TYPE=RelWithDebInfo -DTRACE_SANITIZE=ON -DTRACE_REQUIRE_EBU=ON
cmake --build build/trace-portable --parallel 2
ctest --test-dir build/trace-portable --parallel 2 -E '^ebu_wav$' --output-on-failure
ctest --test-dir build/trace-portable -R '^ebu_wav$' --output-on-failure
```

私有完整 checkout 当前注册 9 项 portable CTest：8 项核心数值/边界回归（含 FFT）与 1 项原始 EBU WAV 门禁。Sanitizer 下将原始 WAV 单独运行，避免与其余测试争抢 CPU 导致超时。`TRACE_REQUIRE_EBU=ON` 会在缺少原始素材时失败；公开源码归档不包含私有 EBU 素材，不能报告该门禁已通过。门禁数量仅描述当前配置，本轮实际结果以 [79](79-TRACE-INDEPENDENT-PROJECT.md) 和 13 为准。未运行 Windows 原生加载、真实采集、96 kHz 或打包时须记录未验证。

签名/公开发布、干净 Windows 普通用户、硬件矩阵、真实设备/实时/选区/导出全链路与工具链安全等剩余工作见 [当前交接](13-HANDOFF.md)。Windows 实际文件读取、原生分析及候选包加载已通过上述 CI；包的实机录音流程仍需验证。macOS 实施计划见 [70](70-MACOS-PORT-PLAN.md)。
