# 70 · Trace macOS 移植实施方案

状态：**用户已选择方案一，实施方案已确定；尚未开始 Mac 开发或实机验证。** 记录日期：2026-09-24。对应 [ADR-012](11-DECISIONS.md)。本文件是后续工作的执行入口，不把计划中的命令、构建或验收写成已完成。

## 目标、范围与首发基线

在保留现有 Electron/React/TypeScript 界面、Trace 录音与分析语义、C++ 计量核心、libebur128 和文件格式的基础上，为 macOS 增加原生采集、输出、文件操作及分发实现。Windows 现有实现保持可独立构建和验收；Mac 的通过不代替 Windows 的硬件证据。

建议首个实机目标为 **macOS 14.2 或更新版本、Apple silicon arm64**。理由是 Apple 的 Core Audio taps 示例以 macOS 14.2 为前提，且上游 Prism 的现存 Mac 采集实现也按 14.2 检查。Intel x64、Universal 包和更早系统只在获得目标设备、需求与实测后另立范围，不将 Electron 自身支持的架构等同于 Trace 已支持的架构。实际最低系统版本、SDK/Xcode/Electron 组合要在 M-MAC0 锁定并记录；不为了消除单个编译错误升级整套依赖。

Mac 首发功能目标与 Windows 当前 Trace 对齐：选择系统输出来源，未录音持续监测；LIVE/REC/FILE、最多 60 秒内存缓存及显式保存、WAV/MP3/AAC、文件回放和共轴历史、故障与恢复。单/双声道，停止录音后回听；不扩展同录同播、虚拟设备、VST/AU 或云功能。WAV 跟随**实际、已验证**的采集率，目标覆盖可用设备上的 96 kHz；如果所选 Mac/设备/API 无法交付 96 kHz，记录为未满足的 Mac 验收项，不通过重标采样率或假升采样宣称通过。MP3/AAC 仍只提供 44.1/48 kHz 输出选项。

## 当前工程事实与移植边界

| 部分 | 当前位置与事实 | Mac 工作 |
| --- | --- | --- |
| Trace UI/控制器 | `src/trace/renderer/`、`src/trace/main.ts`；启动时加载 `trace_engine.node` | 保留工作流和白名单命令；替换平台路径、能力与权限状态；检查 Mac 窗口/快捷键/文件对话框 |
| 原生采集 | `native/src/recorder/Engine.cpp` 使用 WASAPI/COM/QPC；`Engine.h` 同时管理采集、分析、录音 | 抽出平台采集与时钟适配；Mac 后端使用 Core Audio taps；保留 Trace 的有界完整音频路径 |
| 原生回放 | `native/src/recorder/Playback.cpp` 使用 WASAPI 与输出时钟 | 增加 Core Audio 输出实现及实际呈现位置映射，保持 seek generation 和历史语义 |
| WAV/恢复 | `native/src/recorder/WavFile.cpp` 使用 `CreateFileW` 等 Windows 文件 API；`CaptureRecovery.h`、`addon.cpp` 也引用 Windows 头 | 将平台文件句柄、flush、原子发布/恢复操作隔离并补 Mac 实现；不重写 WAV 语义 |
| 计量、缓存、会话 | `Meter`、`FileAnalysis`、`Recorder`、`ReplayBuffer` 及 `src/trace/` 服务已经实现 Trace 规则 | 优先共用；在 Mac 编译/测试中逐项确认可移植性，数据或计量语义变化才升级相应版本 |
| 上游 Mac 采集 | `native/src/macos_capture.mm` 属 Prism 通用模块，不是 Trace 引擎；其队列满时弹出最旧块 | 仅作 Core Audio tap 生命周期参考；不可接入 Trace 录音 PCM 队列并声称无损 |
| 构建与媒体工具 | `native/recorder/CMakeLists.txt` 强制 Windows x64；`tools/build-engine.cjs` 固定 VS；`ffmpeg.lock.json` 为 `win32-x64`；Trace 包含 `.exe/.dll` | 增加独立 Mac 构建/锁定媒体二进制/打包配置；保持 Windows 路径原有行为 |

### 建议的接口切口

先用小幅重构把 `Engine` 中的设备枚举、采集与时钟、`Playback` 中的输出设备/呈现时钟，以及 WAV 底层文件操作设为平台适配点。适配器向共享核心交付统一的音频块与故障信息：来源/epoch、连续序号、首帧及帧数、真实采样率/声道、可用的设备帧位置和原生 host time、静音/断流/时间戳质量标志。Windows 的 QPC 与 Mac 的 host time **分别归一化到会话时间**，不把两者的原始 tick 当成同一时钟；无法证实的区间标为估计或缺口。录音写盘、计量、波形、回放历史和 renderer IPC 仍由同一 Trace 领域层管理。

采集回调只将数据复制到预分配块池并发布有界索引，不等待 JS、UI、磁盘或编码器。显示可丢弃过期快照；录音 PCM 的队列耗尽必须使 take 进入明确的缺口/故障状态，保留计数和恢复依据，不能像上游展示队列那样覆盖旧 PCM。无 REC 时不生成临时音频文件。Mac 的输出设备选择、默认设备变化及“系统音频”实际覆盖范围须由原型测定，不能把 tap 的来源标签直接等同 Windows 的播放端点 ID。

### 权限和平台行为

以 Apple 的 Core Audio taps 为主路径。Mac 构建需配置 `NSAudioCaptureUsageDescription`，在用户首次启用监测时处理系统音频录制授权；拒绝、撤销、设备失效及授权恢复均给出可操作状态。确认实际授权提示与系统设置入口后再定界面文案。录音机自身的 FILE 播放不得混入 LIVE/REC：优先验证 tap 排除本进程音频的能力与有效性；若做不到，保持“FILE 时暂停 LIVE、回到 LIVE 新 epoch”的现有规则，并实测切换边界。Core Audio taps 不能满足目标来源/设备语义时先记录反例和决策，再考虑 ScreenCaptureKit；不在第一阶段并行维护两个 Mac 采集后端。

## 分阶段执行与退出门槛

| 阶段 | 实施包 | 必须留下的证据与退出条件 |
| --- | --- | --- |
| **M-MAC0：设备与 API 原型** | 准备真实 arm64 Mac、Xcode/SDK；锁定版本。写独立最小 Core Audio tap 探针，枚举输出来源，采集播放→静音→播放、设备切换、权限拒绝/恢复、长时间空闲和 44.1/48/可用时 96 kHz；记录每块原始格式、帧数、时钟与异常。 | 有真实系统音频 PCM，时长/帧数/来源可核对，权限和失败可复现；明确 tap 能否实现所需“指定系统输出来源”。失败时保留报告，不进入“Mac 已支持”的表述。 |
| **M-MAC1：共享核心可编译** | 拆出 Windows 平台层；CMake 添加 arm64 Mac 目标和与当前 Electron 匹配的 N-API 模块；替换 `windows.h`/COM/Win32 文件操作的直接依赖。先让 WAV、Meter、Recorder、FileAnalysis 及原生数值测试在 Mac 编译运行。 | Windows 原生测试仍通过；Mac 上可加载 `trace_engine.node`，文件与计量测试通过；版本、构建命令和失败清单有记录。模拟输入仅证明核心，不算采集验收。 |
| **M-MAC2：LIVE/REC 完整链路** | 将 tap 包映射到 Trace epoch/帧时钟；接上完整 PCM 分发、LIVE 计量、60 秒以内缓存、take 写盘与 journal；补设备变化、拥塞和权限错误状态。 | 真机 LIVE 不写音频临时文件；30 分钟含静音录音可重开，文件头/实际帧数/清单一致；断流、队列满、设备变更与硬退出不会被标为完整。96 kHz 只在真实可用设备上验收。 |
| **M-MAC3：FILE、导入与三格式** | 接入 Mac 输出与呈现时钟；文件定位、循环、暂停和独立历史；提供锁定的 macOS FFmpeg/ffprobe arm64 构建与哈希、许可、能力校验；修正 `.exe` 假设。 | 同一文件同一帧读数重复；旧 seek 不能覆盖新游标；WAV/MP3/AAC 的录制、转码、重开、回放和成品独立分析通过；取消/失败不删除唯一源。 |
| **M-MAC4：界面与交付** | 权限说明、来源名称、错误/恢复、Mac 菜单和快捷键、窗口/缩放、文件选择；独立 Mac 打包配置、图标、应用内原生模块和媒体二进制。分发前完成 Developer ID 签名、hardened runtime 与 notarization。 | 新装 Mac 在普通用户权限下能启动、授权、监测、录音、回听和导出；包内架构/依赖/许可清单正确；签名、公证和实际安装证据单独记录。开发预览可单列未签名状态，不称正式发布。 |

每阶段先完成实现与针对性检查，再更新本文件中的阶段结果和 `13-HANDOFF.md`。实际工作票使用 `07-BACKLOG.md` 的格式。阶段可按实测细分，但不得跨过 M-MAC0 的系统采集证据，仅因 Electron 窗口能在 Mac 打开就标“兼容”。

## 验收矩阵与不可替代证据

| 编号 | 场景 | 通过标准 |
| --- | --- | --- |
| MAC-A01 | 首次授权、拒绝、撤销、恢复 | 状态和操作明确；拒绝时无伪静音/伪录音 |
| MAC-A02 | 真实系统播放、静音、恢复，默认/指定来源，设备变化 | 来源与格式可信；帧/host time 连续性和缺口可核查；不误记自身 FILE 回放 |
| MAC-A03 | LIVE 30 分钟、窗口隐藏/低刷新、内存缓存 | 不写音频临时文件；缓存有界；计量/波形继续更新 |
| MAC-A04 | REC 30 分钟、写盘拥塞、硬退出恢复 | 实际帧数、WAV 头、清单和 journal 对齐；故障和尾部损失可见；唯一源保留 |
| MAC-A05 | 44.1/48 kHz 与可用设备 96 kHz，单/双声道 | 按设备真实格式测试；不可测项列为未验证；超出双声道拒绝而不截断 |
| MAC-A06 | WAV PCM16/24/float32、MP3、AAC/M4A/ADTS | 实际编码参数、容器、重开、导出及成品缓存核验 |
| MAC-A07 | FILE 播放、暂停、快速 seek、选区循环 | 呈现位置与共用游标对应；同位置历史稳定；旧代次回复无效 |
| MAC-A08 | Mac 包新装、签名/公证、升级/配置迁移 | arm64 真机验证；与 Windows 资产格式互读时保留原件，缓存按内容/版本重建 |

验收报告至少记 Mac 型号/芯片、macOS 版本、Xcode/SDK、Electron 与引擎构建、输出设备及实际格式、素材/命令、帧数/时长/哈希、通过或失败、未跑原因。便携测试和模拟采集不能替代真实 Core Audio、96 kHz 硬件、签名后安装测试。原始 EBU 数值夹具与 Windows 基线继续复用；Mac 新的算法偏差、缓存格式或数据协议变化需单独记录并决定版本迁移，不为“跨平台通过”放宽容差。

## 依赖、风险与首次开发任务

- **必备环境**：可使用的 Apple silicon Mac 与目标输出设备；Mac 上的 Xcode/SDK 和测试权限。Windows 主机可以完成接口设计及部分便携测试，不能替代原生采集、签名或公证验证。
- **最大不确定性**：Core Audio taps 对目标“系统输出来源”的覆盖、设备切换和时钟质量。M-MAC0 先解决这项；若不满足需求，提交带真实 PCM/来源/权限证据的 ADR 修订，比较 ScreenCaptureKit 的行为，再决定 Mac 采集后端。
- **构建供应链**：Mac 的 FFmpeg/ffprobe 不复用 Windows Gyan 包；分别锁定来源、版本、架构、配置、编码器、SHA-256 和许可。当前 `ffmpeg.lock.json` 是 Windows 清单，实施时应按平台拆分或扩展 schema，不覆盖其已验证记录。
- **发布范围**：首次可先交内部 arm64 开发包。Intel/Universal、旧系统、公网下载和 App Store 不自动纳入。对外分发时保留 Prism/FFmpeg/libebur128 等许可证与来源，并单独完成 Mac 签名/公证。

**下一任务 M-MAC0/T00**：在 Mac 真机上做只采集、不录盘的 Core Audio tap 探针；先填写机器/系统/SDK、权限、来源枚举和播放→静音→播放的实际帧时钟报告，再据此确定平台接口实现顺序。当前尚未获得上述 Mac 实测，所有 MAC-A 项均为未验证。

## 官方依据

- Apple：[Capturing system audio with Core Audio taps](https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps)（示例平台要求、使用说明与权限键）。
- Apple：[ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)（仅作为主路径不满足时的备选评估入口）。
- Apple：[Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)（分发签名、公证与 hardened runtime）。
- Electron Builder：[macOS configuration](https://www.electron.build/mac/)（后续打包配置与架构目标以实施时锁定版本为准）。
