# 79 · Trace 独立工程

2026-10-03。按用户确认的顺序完成工程入口隔离、测试与 CI 迁移、FFT 本地维护、上游工程清理。源码仍为 **preview.31**，Meter v5 的算法、参考值、容差与产品范围保持。当前验证结果及提交见 [13](13-HANDOFF.md)。

## 独立化的边界

Trace 的安装、构建、测试、诊断与打包只使用本仓库的 Trace 源码和明确锁定的第三方依赖。无需检出 Prism、构建 `visualizer_dsp.node`，也不再构建 Prism 桌面程序、VST/AU 插件或 TUI。第三方库仍包括 Electron、React、libebur128、FFmpeg，以及保留来源与 GPL 许可的 FFT；工程独立化不改变这些许可义务。

| 范围 | 当前实现 |
| --- | --- |
| 包入口 | 根包 `trace`，主入口 `out-trace/main/index.js`；默认 `dev/build/start/preview/test/typecheck/dist` 均为 Trace |
| 普通安装 | `npm ci` 无根目录 native postinstall；Electron/esbuild 自身安装步骤保留 |
| Windows 原生 | `npm run install:trace-sdk` 独立下载固定 Electron 40.8.3 SDK；`build:trace-engine` 只构建 Trace CMake 目标 |
| 诊断 | `build:trace-diagnostics` 与 `trace:diagnostics` 构建/运行独立 Windows 捕获探针；真实音频夹具仍可供实机验收 |
| 应用测试 | 默认 51 份可移植测试；8 份 Trace 原生/FFmpeg 测试使用自身引擎或固定编码组件，旧 Prism 数值测试逐字归档为文本 |
| 原生数值 | 8 项可移植生成信号与 FFT 门禁；有私有素材时加原始 EBU WAV，共 9 项；Windows 对应共 19 项 |
| CI | 仅保留 Trace CI 与候选包工作流；Linux sanitizer 核心与原始 EBU 分开运行，Windows 构建独立诊断、引擎与候选包 |
| 边界检查 | `npm run check:independence` 检查源码导入、包/TS/CMake/测试/CI 入口及 FFT 文件身份 |

从目录中清理 311 份退役上游文件（53,989,426 字节），涵盖桌面源码、原 addon、插件、TUI、非 Trace 素材与脚本。保留 Trace、计量库、内部 EBU 素材、阶段证据、示例、品牌、用户资料与许可。原文件可从独立化之前的提交 `b1a16449832b5e2903640cb9dd1d2d59db30d77b` 追溯。

## FFT 与来源

`native/vendor/prism-fft` 只保留原 `DSP::FFT` 类和函数，算法、缩放与浮点逻辑不变。`SOURCE.json` 记录 Prism 固定提交 `df0755b8caaaab85157ac51aefffca0526974fc1`、原文件 SHA、提取范围与本地 SHA；`COPYING` 保留原 GPL 全文。新的独立 DFT 对照覆盖 512–16384 点、复数/幅度、噪声全频点、缓冲复用与越界保护。

[README-Prism](../README-Prism.md) 保留来源导航；[原 README 字节快照](../references/prism/README.original.txt) 和 [来源记录](../references/prism/SOURCE.json) 独立保存，历史图片与插件说明指向固定上游版本。随包许可证包含 FFT 的许可、来源和维护说明，并核对其文件身份。Trace 的根 GPL 许可与上游署名保留。

## 从零复现

普通源码安装不设置 Prism 跳过变量，也不需要退役目录。Linux 可检查应用和可移植 C++；Windows x64 构建实际桌面后端及包。

```sh
npm ci
npm run check:independence
npm run typecheck
npm test
npm run build
```

Windows 再执行：

```powershell
npm run install:trace-sdk
npm run build:trace-diagnostics
node tools/prefetch-ffmpeg.mjs
node tools/release/verify.cjs
node tools/package-trace.cjs
node tools/m6/package-audit.cjs
node tools/release/package-load-smoke.cjs
node tools/release/candidate.cjs
```

固定依赖以 `package-lock.json`、[当前工具链清单](../toolchain.trace.json) 和 `ffmpeg.lock.json` 为准。`toolchain.m0.json` 是 2026-09-15 的历史机器快照，不再作为当前安装清单。受代理限制的云环境需按其网络策略让 Electron 下载器使用代理（`ELECTRON_GET_USE_PROXY=1`）；这与项目源码依赖无关。

私有 checkout 执行 `python3 references/ebu-loudness-test-set-v5/prepare.py` 后，可配置 `TRACE_REQUIRE_EBU=ON` 的原生门禁。公开源码归档继续排除私有 EBU 包；缺素材时只注册生成信号，强制模式拒绝配置。原始素材通过分母固定为 68 个适用单/双声道 WAV，另外 2 个多声道仍排除，不记为通过。

旧 GitHub CI 的 EBU gate 达到 900 秒墙钟上限而失败；保留失败记录。现在 sanitizer 核心与原始 WAV 串开执行，原始 gate 的墙钟上限为 1800 秒。只调整运行时间预算，数值容差和单个探针限制没有放宽。

工程独立化与正式发布分别验收：实际设备、96 kHz 采集、长录音、GPU/DPI、签名、安全公告、FFmpeg 对应源码及用户测试继续按 [76](76-RELEASE-CHECKLIST.md) 跟踪。

## 本地验证记录

全新源码归档从空 node_modules 普通安装成功（445 包），默认类型检查、246/246 可移植 JS（51 文件，0 fail/skip）、默认应用构建通过；独立性检查通过，跨上游目录与未声明依赖反例均拒绝。Release CMake 8 项生成信号加原始 WAV gate 全部通过；干净提交 `a986a0d` 的原始 gate 79.51 s，68/68、112/112 数值、204/204 帧数/分块/EOF；FFT 独立 DFT 对照 1590 项通过。忽略目录 `artifacts/independence` 保存 source tree、锁文件 SHA、安装/构建/测试日志、JUnit 和原始 WAV 数值报告。本地 ASan/UBSan 生成 gate 8/8（274.90 s）；公开归档无私有素材时独立构建成功，8 个生成 gate 已注册，FFT 门禁通过，强制 EBU 缺素材配置准确拒绝。最终远程验证见下节与 [验证记录](release/independence-verification.json)。

## 远程首次验证与固定下载地址修复

实现提交 `a986a0d` 的 [首轮 CI](https://github.com/Sceneryyyy/Trace/actions/runs/37101564015) 中，Linux 完整通过：8 个生成素材 sanitizer gate（317.19 s）、原始 EBU gate（814.60 s）、246 个 JS、类型/构建及两个真实 Chromium 回归。Windows 安装、独立性、Electron SDK 与诊断工具编译通过，随后固定 FFmpeg 原地址返回 404；尚未进入引擎/N-API/包验证，因此不算 Windows 完成。失败日志保留。

已实际下载同一发布者 GyanD/codexffmpeg 的固定 9.0.1 ZIP，111,253,802 字节、SHA-256、ZIP CRC 与两份 EXE 的 SHA 均匹配原锁；仅改为官方版本镜像，保留原地址及校验来源。没有更换编解码器版本或放宽完整性验证。后续 CI 两端并行检查，但候选打包必须等本次 run、HEAD 与 attempt 对应的 Linux job 成功；错误、取消、缺失/身份不符都拒绝打包。最终 Windows/候选结果见 13。

## 打包生成物的写盘边界

[第二轮 CI](https://github.com/Sceneryyyy/Trace/actions/runs/37103351961) 在 `ab466d8` 上通过 Windows CTest 19/19、实际原生/FFmpeg 43/43、两端 JS 248/248、Linux sanitizer 8 + 1、Chromium、候选 ZIP、5 项包审计及包启动/重启。最后附件生成严格拒绝 dirty checkout：图标生成器原先重写受版本控制的 PNG/ICO。

构建图标现输出到忽略目录 `build/trace-icons/`，Builder 资源与 EXE 图标补丁读取同一产物。源 LeoMoon PNG、渲染/缩放算法、dev 使用的 tracked 图标及清洁保护均保持。实际 Electron 40.8.3 headless 生成、256 PNG、ICO 六尺寸、ResEdit 解析和未改源码图标检查通过。最终远程候选已复验成功；第二轮失败仍单独保留，不改写其工作流结论。

## 最终独立工程验收

[`db005b5` 的完整 CI](https://github.com/Sceneryyyy/Trace/actions/runs/37104992986) 于 2026-10-03 全部成功：

| 门禁 | 结果 |
| --- | --- |
| 两端应用 | JS 各 248/248、0 fail/skip；类型与默认 Trace 构建通过 |
| Linux 数值 | ASan/UBSan 核心 8/8（317.88 s）+ 原始 WAV 1/1（814.75 s）；实际 React selector 稳定快照额外 render 0、模拟 IPC renderer 9 项通过 |
| Windows 原生 | 独立 SDK/诊断构建；CTest 19/19（251.28 s，实际 WavReader 原始 WAV）；43/43 原生/FFmpeg，7 份 N-API 用例文件 + 1 份 FFmpeg 用例文件 |
| 候选门禁 | 同次 run/HEAD/attempt 的 portable 成功才打包；ZIP 校验、5 项包审计、原生模块加载及主题重启持久化、clean-checkout、最终附件生成/上传均通过 |

工程独立化已完成。GitHub 私有附件 `trace-windows-candidate`（ID `11267953983`，212,794,813 字节）绑定 preview.31 与 `db005b5`，详见 [13](13-HANDOFF.md)。随包提供项目源码、PDF、验证记录、manifest 与校验。依赖及 GPL 许可义务保留；独立工程不等于免除第三方依赖。

[可审查的验证记录](release/independence-verification.json) 保存实现提交、最终 run/job IDs、完成态 job 日志 SHA、三份附件的 GitHub 归档 metadata、从零/本地计量证明及范围。完成日志已读取；云端代理 403 阻止 Azure 附件 payload 下载，未把归档 digest 当作内含 JSON 的 digest。68/112/204 精确计数来自本地干净提交报告，其计量测试源码 SHA 与最终代码一致；远程原始 WAV CTest 的强制适用分母/数值门禁通过。最后文档提交只记录这些证据，不算新音频测试。

正式发布仍需按 76 完成物理设备、实时/选区/导出全链路、96 kHz、三分钟在线视频、长录音、GPU/DPI、签名、依赖安全、FFmpeg 对应源码和用户验收；这些不再是脱离 Prism 工程构建的阻塞。
