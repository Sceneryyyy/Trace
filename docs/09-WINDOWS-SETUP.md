# 09 · Windows 开发与交付环境

2026-09-15 已完成 Windows 构建，精确版本、失败恢复和实际命令见 16-M0-VALIDATION.md、toolchain.m0.json 与 Trace.ps1。本文件其余部分保留开工时的设置背景，区分“已经从上游核对的命令”和“后续需要建立的脚本”，不把文档步骤写成已验证环境。

## PC 准备项

| 项目 | 开工选择 | 检查方式 |
| --- | --- | --- |
| 系统 | Windows x64；具体 Windows build 在 M0 记录 | 系统信息与 PowerShell |
| Codex | 使用用户 PC 已有的可工作入口 | 用它打开解压目录并发送 README 的指令 |
| Git | 可用的 Git for Windows | `git --version` |
| Node/npm | 首先读取锁文件/engines；Node 22.x、至少 22.12 可作为验证起点 | `node --version`、`npm --version`；最终精确版本由 M0 锁定 |
| 原生构建 | Visual Studio Build Tools，Desktop development with C++、MSVC x64、Windows SDK | 检查实际安装组件与构建日志；普通 shell 找不到 cl 不等于未安装 |
| Python | 与 node-gyp 版本兼容；Python 3.12 可作为起点 | `py -0p`、`py -3.12 --version`，不存在就记录而不是伪造路径 |
| CMake | 使用需要 CMake 的依赖/上游目标时配置；上游文档写 3.22+ | `cmake --version`；桌面 addon 主路径是 node-gyp |
| FFmpeg/ffprobe | M5 必需，选定可用 Windows x64 构建并保存版本/构建参数/hash | 查询 codecs/encoders，不只检查 exe 存在 |
| 音频设备 | 至少一个可用系统播放设备；要验收 96 kHz 需实际支持该格式 | 软件读取真实 mix format，手工记录设备配置 |

Prism README 的 Node 18+ 描述不能单独作为所有当前依赖的最低版本依据；以锁定提交的锁文件和实际依赖 engines 为准。不要在首日无条件换最新 Node/Electron/CMake。不存在的工具可以列出安装缺项，但不能通过关闭安全机制或清空系统目录解决构建。

## 新仓库接入

若本包解压目录中尚无实际代码，在其 `app/` 子目录建立新 clone。以下命令只适用于确认 `app/` 不存在或为空的情形，先检查，不能对已有用户仓库照抄执行：

```powershell
git clone --no-checkout https://github.com/Boof2015/prism.git app
git -C app checkout -b recorder/dev df0755b8caaaab85157ac51aefffca0526974fc1
git -C app status --short
```

先读实际仓库的 README、AGENTS/作用域规则、package.json、package-lock.json、native/binding.gyp 和 postinstall 脚本，再运行依赖安装。M0 之后把本包 AGENTS 与上游已有规则合并，docs/examples/references 接入同名位置；遇冲突保留原件并登记映射。以 `app/` 为今后的 Git 根，保留 upstream 地址/提交信息，远程推送仍按用户授权执行。

本包 README 保存为代码仓库的 `CODEX-START.md`，不要覆盖上游 README。完成接入后在 13 记录代码根与文档根，并让用户以后打开代码根继续。

## 已核对的上游脚本

在 `app/` 作为工作目录执行。这里只确认脚本在指定提交存在，没有宣称运行成功。

```powershell
npm ci
npm run rebuild:native
npm run typecheck
npm run test:capture-support
npm run dev
```

`npm ci` 可能执行上游 postinstall，先核对该脚本。Electron 的原生模块必须针对对应 Electron 版本和 x64 ABI 构建；系统 Node 下加载成功不等于 Electron 可加载。上游 `rebuild:native` 已带 Electron target，优先核实它而不是随意拼一个不同版本的 rebuild 命令。

按任务再执行已存在的 `npm test`、`npm run test:lufsmeter-native`、`npm run test:lufsmeter-ebu -- <素材目录>`。记录上游基线失败，不把全部失败归给本次改动。`npm run build` 只代表应用资源构建，不等于已经通过真实音频或安装验证。

上游 `dist:win` 会涉及 TUI、插件资源和安装器操作。它不能直接作为本产品最终分发流程；M6 建立只含桌面录音机、音频 DLL、所需编码器和许可说明的打包目标。

## 将来需要建立的命令

建议 M0/M1 建立 `test:recorder`，M2 建立 `test:recorder-files`，M4 建立 `test:recorder-playback`，M6 建立 `dist:recorder:win`。这些名称当前只是任务建议，首次执行前必须检查是否已实现，并在 13 填入真实命令。不要让 Codex 运行不存在的 script 后把错误当成环境损坏。

libebur128 采用锁定源码/版本的可重复构建；不要假定已找到可兼容所有运行库的现成 DLL。FFmpeg 的库/子进程、架构、编码器能力同样在 M5 固定。需要编译器设置调整时只影响本项目。

## 构建证据和交付

将依赖精确版本、node/npm/Python/MSVC/SDK、Electron ABI、libebur128 revision 和 FFmpeg build 记录到版本控制的清单；将个人机器绝对路径保留在本机说明或脱敏记录。锁文件、编译选项和测试命令一起维护。

首版先验证便携桌面包，再按需要加入安装器；包在目标机器必须不依赖源码目录、开发环境 PATH 或联网下载。签名、自动更新、公开发布和 VST/AU 安装不属于第一天的任务。

本机没有 96 kHz 设备时，可完成格式与离线样本测试，但 A02 的 96 kHz 实机项保持未运行，后续接实际设备补齐。
