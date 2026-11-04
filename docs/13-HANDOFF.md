# 13 · 当前交接

更新：2026-11-04。后续 agent 先读本页和 [07](07-BACKLOG.md)，其余按任务读取 [文档索引](README.md)；不要遍历归档或整份验证 JSON。源码根为本 checkout，规则见 [AGENTS.md](../AGENTS.md)。

## IT1 GitHub 预发布已发布（2026-11-04）

用户授权将测试包发布到 GitHub。已发布 [Trace preview.35 · Internal Test 1](https://github.com/Sceneryyyy/Trace/releases/tag/v0.1.0-preview.35-it1)，Release ID `433497209`，tag `v0.1.0-preview.35-it1` 指向原程序基线 `3cbb4ce1be74922e3ed0deb45f20091bc10092a2`，`prerelease=true`、`draft=false`，未设为最新正式版。

附件为原 IT1 完整测试包及其 `.sha256.txt`；174241738 字节，SHA256 `2e2548e16ae2cc41ce9bfa0ad204ce0e60184c4ec607bf3e9e85aac5d756bb11`，GitHub 返回的附件大小/摘要与本地一致。没有重新打包或改写 10 月 28 日的交付身份。Release 包含使用步骤、变更、验证边界、已知限制和反馈入口；公开仓库的附件可公开下载，但仍只标记为预发布测试构建，不代表正式发布门禁关闭。未发送邀请，下一步由用户安排测试者并回收反馈。此前“未公开发布”表述保留为当时历史状态。

## 功能冻结，进入小范围正式内测 IT1（2026-10-28）

用户确认冻结本轮功能并推进已知问题处置、验证分工和可追溯测试包。程序基线固定 `3cbb4ce1be74922e3ed0deb45f20091bc10092a2`，preview.35 / Internal Test 1。只按反馈处理缺陷，不自动启动新功能或长测。heartbeat 保持暂停。

交付目录 `dist-trace/internal-test-1-20261028/`；程序 ZIP SHA256 `23559f67dbf4d464918b50984d393fbf504797a95e80ebe0bb80cc0c44defa0c`。独立构建目录 `dist-trace/preview.35-internal-test-1/win-unpacked/Trace.exe`。重新 AppBuild/打包，portable 334/334、两套类型检查、包审计 5/5、加载/重启 3/3、实际短录/回听/导出/重开 8/8、ZIP 110 文件逐项核验通过；原生引擎沿用此前哈希，源码未变，没有重编原生引擎或重复两小时。匹配项目源码/FFmpeg/LAME 源码、清单/校验值与脱敏摘要随包。

详见 [95](95-INTERNAL-TEST-1.md)，测试者从 [开始说明](internal-test/START-HERE.md) 进入；已知质量限制、用户设备矩阵、反馈模板均已落地。历史估算静音、资源变化及首次 CDP 失败继续保留；其他硬件验收交用户，未知不计通过。干净 Windows 首轮通过前不扩大邀请；未签名，不代表公开测试或正式发布。未发送邀请/公开发布，下一步由用户安排测试者并回收反馈。

完整交付包 `dist-trace/Trace-preview.35-IT1-Test-Kit.zip`，SHA256 `2e2548e16ae2cc41ce9bfa0ad204ce0e60184c4ec607bf3e9e85aac5d756bb11`，174241738 字节；23 个条目逐项校验通过。源码仅提交内测安排与材料，程序/源码归档及测试录音均不提交 Git。本文档提交与程序基线分开记录，不能因后续 HEAD 改变重写已交付的包身份。

## 本地增量提交交付（2026-10-21）

用户已授权按需提交及推送本轮本地增量，目标为 `origin/recorder/dev`。按功能拆分频谱/声谱显示、录音库识别、设备摘要与统一设置、打包修正、稳定性工具与验收记录；本地录音、构建包和 acceptance 原始产物不纳入源码提交，旧同步前 stash 继续保留。提交前重新运行 portable 334/334、前端与 Node 两套 TypeScript 类型检查、变更 JS 脚本语法及 diff 空白检查，均通过。未重启硬件长测或重新构建产品包；既有包的来源/hash 保持原记录，源码提交不改变包身份。下方“未提交/推送”均为当时历史状态，当前交付以 Git 分支记录为准。

## 本轮收尾，等待用户反馈（2026-10-21）

用户确认“人工听感通过，其他待验证交由用户验证，收到反馈再改吧”。人工听感记为用户验收通过；未补充具体设备、素材或逐项听测记录，不扩大验收范围。其余未覆盖项目保持待验，由用户后续验证；本轮不再主动追加测试或修改，收到反馈后按实际问题推进。heartbeat `trace` 保持 PAUSED。既有估算静音、资源变化和失败证据继续保留，不视为全部发布门禁关闭。详情见 [94](94-WINDOWS-FIRST-RETEST.md)。

## 两小时实机长测完成（2026-10-19 19:14）

`artifacts/acceptance/machine-1792400235856/report.json` 与 `reopen-verification.json` 均通过：10 分钟监测无写盘、Realtek 48 kHz 双声道 WAV24 连续 7200.038979 秒，accepted/written/start-end/reopened 均 345601871 帧，正常停止/重启分析/定位及 RIFF/ffprobe/SHA256/静音与测试音检查完成。19:10:17 程序正常收尾，19:14 独立校验完成。heartbeat `trace` 已暂停，无残留测试程序、未提交/推送。

限制：录音固定 12431 帧（0.258979 秒）估算静音，continuity 正确为 estimated-silence，不能称逐帧实采；239 个录音样本 droppedFrames/timestampErrors/overlapEvents 均 0。进程树 private 约 446–527 MiB、首/末约 516/451 MiB，句柄 2367→2368，未见持续私有增长；working set 586→909 MiB 上升，未声称所有资源稳定。详细证据/原始失败保留见 [94](94-WINDOWS-FIRST-RETEST.md)。关闭本环境的两小时录音/重开子项，DATA 物理故障与设备/听感/更多 GPU/DPI 门禁仍开放；RME 真实 96 kHz 短采集已过，但不代表 96 kHz 长测。

## 重启后恢复：连续两小时长测启动记录（2026-10-19 16:57，已完成）

用户已明确“重启完成，继续测试”。旧恢复录音再次实际重开、全分析与三点定位通过；新的唯一运行目录 `artifacts/acceptance/machine-1792400235856/`，启动于 16:57:15，10 分钟 Realtek 48 kHz 预检后完整录音 7200 秒，预计 19:08 后收尾。日志 `artifacts/acceptance/machine-resumed-console.log`，资源 `process-resources.json`；heartbeat `trace` 已 ACTIVE，每 15 分钟安静检查并最终校验/回填。旧 39 分钟不累计为连续两小时。

重启后 RME 当前真实 mix format 为 96 kHz；短采集 1381440 帧、WAV24 头/ffprobe/hash 与实际来源一致，录音估算帧 0、无录音缺口；`artifacts/acceptance/rme-1792400210927/source-verification.json`。设备矩阵只补上该短采集，不代表真实 44.1 kHz、96 kHz 长测/切换/拔插等通过。详情 [94](94-WINDOWS-FIRST-RETEST.md)。

**暂停安全方式已修正并实测**：在当前运行目录创建 `pause-request.json`，控制器按秒检查并正常停止 REC、完成文件/重开检查后返回 paused。`machine-1792400221173/report.json` 验证写入/接收/重开均为 157078 帧。不得再终止控制 Node 进程，否则 Windows 可能连带终止录音进程。未修改产品包，无提交/推送。

## 之前按用户要求暂停的记录（2026-10-19 15:15）

用户要求停止两小时测试、检查当前情况、重启后继续。heartbeat `trace` 已 PAUSED，测试进程均停止。停止控制 Node 时 Windows 连带终止其子进程，未能正常 REC 收尾；已说明操作失误，原始文件保留并通过产品恢复流程另存。恢复 112628058 帧 / 2346.417875 秒（39 分 6.4 秒），超过最后观察已写帧；文件头/ffprobe/帧数/SHA256/静音与测试音校验通过。`artifacts/acceptance/machine-1792391147536/report.json` 为 paused，未知尾部 true，take recovered/gaps，不得改为连续两小时 PASS。详情见 [94](94-WINDOWS-FIRST-RETEST.md)。录音期间 droppedFrames=0，进程树 private 约 428–437 MiB，无持续增长趋势，仅覆盖本段。

下一步等待用户重启后明确恢复。先重开本段恢复音频，再新建独立目录重新做连续两小时，旧 39 分钟只作阶段证据；不得在暂停期间自动重启。未提交/推送。

## 首轮 Windows 实机复验与长测启动记录（历史过程，现已暂停）

用户结束本轮界面调整并选择完整 2 小时验证。使用下节 `device-settings` 包，在独立目录完成真实录音/三格式/缓存/60 秒历史/300 次 seek/多轮循环/数字回环/故障恢复/WebGL 专项，详情及本地报告路径见 [94](94-WINDOWS-FIRST-RETEST.md)。strict native/media 68/68、CTest 19/19；最大设置实际 paint 213 次，p95 82.8 ms；回环时钟偏差 2.1782 ms。修改仅验证工具和文档，没有替换产品包或提交/推送。

首次监测预检约 5 分钟 CDP 超时，证据保留；旧导航脚本因 `.asset-format` 已移除而未完整通过。当前长测 `artifacts/acceptance/machine-1792391147536/` 于 14:25:47 重启，10 分钟无写盘监测 + 7200 秒真实 Realtek 录音，预计 16:36 后收尾；`progress.json`、`process-resources.json`、`artifacts/acceptance/machine-console.log` 为运行证据。尚未完成，不能写 DATA 已关闭。自动 heartbeat `trace` 每 15 分钟安静检查，结束校验文件并回填文档、停用自身；下一 agent 不要重复启动长测或关闭该实例。真实 96 kHz、物理设备故障/断电/满盘、干净 Windows、物理 DPI 和听感仍未验。

## 最新本地验证构建：设备信息与统一录音设置（2026-10-19）

上下文左侧入口直接显示所选设备端点名、硬件名、声道和采集精度，点击仍进入采集设备选择。右侧录音格式与采样率改为只读信息；来源率与录音目标不同时分开标注，未就绪不造数。移除顶部独立录音保存按钮，保存表单并入“设置与帮助 → 录音与保存”，统一草稿/应用按钮；切分类保留草稿、关闭丢弃参数草稿，目录选择保留立即生效。录音中锁定录音表单，显示设置仍可使用。先前首次录音提示现在打开统一设置中的录音分类。

- 新入口 `dist-trace/preview.35-device-settings/win-unpacked/Trace.exe`，保留完整目录；含此前所有本地修复，仍为 preview.35 未提交增量。ZIP 150231078 字节，SHA-256 `c6436276e1a2294a6f2750f1dbcff6cb7bf6d5c504e9e3a8b017ba179b76a46e`，110 个文件与目录逐一 hash 一致。来源哈希及范围见同目录 `LOCAL-VALIDATION.json`。
- 已跑 typecheck/AppBuild、portable 334/334、实际 React/Edge 前端浏览器 11 组；实际 Electron 开发程序和新包均通过 4 组：真实设备元数据/1024/1280/1600 布局、分类草稿/MP3 应用/未应用 AAC 取消、AAC ADTS/WAV float 与头部同步、重启保存且不启动监测。最终包报告 `artifacts/m9/device-settings-1792388699853/report.json`，已查看头部及保存分类截图。
- 新包审计 5/5、实际启动/主题重启、差异空白检查通过。`artifacts/frontend/browser-report.json` 为模拟 IPC 前端报告；`artifacts/m9/device-settings-build.log`、`device-settings-portable.log`、`device-settings-package.log` 为构建日志。使用说明已更新并同步包内 README，目录与 ZIP 一致。
- 无工程阻塞。本次未修改音频/录音协议或后端，未重复 native/media/CTest/真实 REC、96 kHz 和长测。UI 探针最初未等待应用全部完成就重开、以及 AAC 选择器引号错误已修正重跑，未放宽产品检查。未改用户设置/旧包、未提交/推送/签名或触发远程 CI。
- 下一步用户退出旧程序后运行本页新入口，确认自己的设备名/详情、只读格式/采样率及统一录音设置，并继续真实录音与素材专项验收。

## 前一版本地验证构建：统计复位按钮移位（2026-10-19）

按用户截图，将底部右端“重新开始本轮响度统计”图标移至“实时”右侧、开始/停止监测左侧；仅调整 JSX 次序，原命令/禁用条件/提示/样式保持。包含下方录音目录、频谱和声谱图修复。

- 新运行入口 `dist-trace/preview.35-transport-reset/win-unpacked/Trace.exe`，保留完整目录；版本仍 preview.35，旧验证包目录保留。
- 同目录 ZIP 为 150229965 字节，SHA-256 `6ddd4cfb09c97c5af3cf4afeb632687627b9d6d55f2d09d0af2f0622184f8b7c`；`LOCAL-VALIDATION.json` 记录来源文件哈希与检查范围，`SHA256SUMS.txt` 保存 ZIP 校验。
- 已跑 typecheck/AppBuild、实际 Electron 1024/1280/1600 宽度：复位图标唯一且直接跟随实时、与监测同排、无横向溢出，待机禁用正确；已查看 1024 截图。报告 `artifacts/m9/transport-reset-1792388059066/report.json`。新包审计 5/5、实际加载/主题重启通过。
- 小布局变更未新增机械测试，未重复 portable/native/media/音频验收；上轮 portable 334/334 是移位前结果。无工程阻塞；未改变音频逻辑，未提交/推送或签名。
- 下一步用户正常退出旧程序后运行新入口确认按钮位置，并继续同一录音目录/实际素材验收。

## 前一版本地验证构建：录音库目录识别修复（2026-10-19）

修复选择混合用途录音目录时普通子文件夹被误列为损坏录音：仅普通、非链接会话清单进入读取，跳过无清单目录与可解析的非 Trace 清单，保留损坏 Trace 提示。未改动/删除用户文件。包含本页下方的频谱修复与声谱图移植，详见 [93](93-RECORDING-DISCOVERY-FIX.md)。

- 新程序 `dist-trace/preview.35-library-fix/win-unpacked/Trace.exe`；ZIP 在同目录，150229952 字节，SHA-256 `186e5c25cd653bd8aea9253ef721e00621f2e78f6cb861543f85ea5df93bc767`。110 个 ZIP 文件与应用目录逐一校验一致，身份及来源哈希见 `LOCAL-VALIDATION.json`。
- 已跑：typecheck/AppBuild、录音/恢复针对性 9/9、portable 334/334；开发程序及实际新包各通过目录识别、有效录音分析/定位、静音实际回放时钟/暂停、文件内容不变 4 组；新包审计 5/5、启动/主题保存重启及差异空白检查通过。
- 无工程阻塞。使用独立合成目录和静音回放，未在用户桌面写入/清理文件；不代表真实个人素材听感或设备/长录验收。原生代码未改，未重复 CTest/native/media 专项。未提交/推送、未签名、未触发远程 CI。
- 下一任务：正常退出旧程序后运行新目录程序，使用同一录音目录复验列表：普通 WAV 目录消失，真实 Trace 录音仍可载入/回听；外部 WAV 通过导入使用。随后继续频谱/声谱图和真实录音链路验收。

## 前一版本地验证构建：频谱低频连续性修复（2026-10-19）

已修复用户截图低于 300 Hz 的梳齿：对数轴无 FFT 点落入的像素列改为相邻线性功率插值，不再误绘至图底；保留密集区峰值、真实零功率/静音、原始 FFT 及悬停读数。包含下方声谱图三项移植，详见 [92](92-SPECTRUM-CONTINUITY-FIX.md)。

- 新程序：`dist-trace/preview.35-spectrum-fix/win-unpacked/Trace.exe`；ZIP 在同目录，150229853 字节，SHA-256 `1536f1bcb1b2e6b6fc1c65fd03c75aae9ae5b37a056407f98ae32dca1bb4cfa2`。ZIP 110 个文件逐一校验一致，来源/哈希见 `LOCAL-VALIDATION.json`。版本仍 preview.35，目录区分本地增量。
- 本次已跑：typecheck/AppBuild、针对性 13/13、portable 333/333；实际原生 FFT + Electron canvas 合成噪声，100%/150% 光栅倍率的 20–300 Hz 连续性、原始悬停及 PCM hash 通过；新包审计 5 项、实际加载/主题重启、差异空白检查通过。
- 原生/媒体/EBU 与声谱图专项是同日上一轮结果，本次未重复；真实 WASAPI/素材听感、系统混合 DPI、96 kHz 实录和长测仍待验。无工程阻塞。未关闭/覆盖用户正在运行的旧包，未提交/推送、未签名或触发远程 CI。
- 下一任务：用户正常退出旧程序后运行新目录中的程序，用同一素材和 FFT 16384 复验低频曲线、当前/平均/保持与原始频点读数；继续下方实际录音/回听和三格式复验。

## 前一版本地验证构建：声谱图三项优化已移植（2026-10-19）

基于 `d268e5b` 的 preview.35 本地未提交增量：Mel 风格频率投影、纵向 dBFS 色阶和 3D 随布局取景已移植，保留新版时间窗/视角/高级区、概览和游标。下方云端身份表仍描述已提交来源，不能把本轮本地包当作云端已测树。

- 可运行：`dist-trace/preview.35/win-unpacked/Trace.exe`，保留完整目录；ZIP：`dist-trace/preview.35/Trace-0.1.0-preview.35-Windows-x64.zip`，150229851 字节。
- ZIP SHA-256：`383b51291c0ec9acf297ecb02e6a4f09a330e72fb9e45572258c142afb1b11d8`；110 个 ZIP 文件与应用目录逐一 hash 一致。来源文件及 exe/asar/native 哈希记录于同目录 `LOCAL-VALIDATION.json`。
- 已跑：typecheck/AppBuild、portable 330/330、严格 native/media 68/68、CTest 19/19（含原始 EBU）；实际 Electron 色阶/频率/控件/3D 点查 8 组、实际 GPU 五布局、包审计 5 项、包加载/主题重启、独立工程门禁和差异空白检查通过。
- 没有工程阻塞。编码器本机源码重建被锁定编译器差异拒绝后，采用既有 CI 附件的同哈希组件并完成现行安装校验；打包版本及项目内 npm 调用已修正，见 [91](91-SPECTROGRAM-PORT-PREVIEW35.md)。
- 未跑真实 WASAPI/听感、96 kHz 实录、两小时录音、物理设备故障、系统混合 DPI/GPU 长测、干净 Windows。未签名、未生成新 PDF、未提交/推送或触发远程 CI；旧 stash 完整保留。
- 下一任务：用户运行本地新构建，复验实际素材、2D/3D 布局/色阶/拾取，以及监测→REC→停止→回听→三格式导出/重开与返回 LIVE；根据反馈修复，再按 76 推进专项和下一候选。

## 身份与同步

2026-10-19 本地同步：已从 origin 获取远程分支，并将本地 `recorder/dev` 从 `d2981fd` 快进至 `d268e5b217f4afdb82bff4ae034d434420ebe5e6`（64 个提交），与 `origin/recorder/dev` 一致。同步前的 15 个已跟踪文件修改及 7 个未跟踪文件已完整保存在 Git stash `837f14e7884c74c2a52b4a65f623b340d8fc2a7c`，名称 `local-before-github-sync-20261019`；未重新应用，避免旧声谱图修改混入最新源码。恢复前应先比较新旧实现及归档路径，不直接 pop。本次仅同步与补记，已核对远程 ref、源码树一致性和备份；未安装依赖、构建、运行产品/音频测试或打包，既有本地生成物不代表 preview.35。没有同步阻塞；下一任务按用户需要准备匹配最新源码的 Windows 构建及实机复验。本段为本地未提交记录，未推送。

| 项目 | 当前记录 |
| --- | --- |
| 源码 | `0.1.0-preview.35`，产品来源 `3e665d92f0fc95b245956347fad56e0b43707107`；实现与验收范围见 [89](89-FRONTEND-SIMPLIFICATION-ITERATION.md) |
| 分支/PR | [PR #3](https://github.com/Sceneryyyy/Trace/pull/3) 已于 2026-10-18T08:13:45Z 合入 `recorder/dev`，合并提交 `4d1fc0b89b4b1522f019490d86c42106a8a4acf3`；PR head=`1ec9585`。PR #1/#2 亦已合入，本地已快进同步 |
| 工作区 | 文档复核、71 份阶段归档与入口精简提交 `1ec9585` 已推送并合入；本次合并状态补记为文档增量，最终提交以 Git log 为准。产品代码未改，先查 git status/log 再同步 |
| 工程候选 | Windows x64 preview.31 / `2aee519` / CI `38099859270`，私有附件 `11688230696`，未签名；不是 preview.35 包 |
| 历史交付 | preview.30 / InternalTest-r3 来源 `9c1ee21`；PDF/截图各保留原版本，本轮未生成新包或 PDF |

默认开发分支 `recorder/dev` 已包含 preview.35 与文档归档。同步前检查本地修改/分叉，干净且无分叉时使用 `git pull --ff-only origin recorder/dev`；不能 reset 覆盖用户工作。

## 最近交付与验证

UI88-00～09 云端内容完成：上下文摘要/设备模态、仪器更多菜单、单版本详情、报告三分区、分类设置、A/B/3D 高级区、目标与故障分层；L86 列表规则、文件保护及既有计量语义保留。

[完整 CI 39035516698](https://github.com/Sceneryyyy/Trace/actions/runs/39035516698) 已成功：Linux/Windows portable 各 321/321；Windows CTest 19/19、原生/媒体 68/68；Linux ASan/UBSan 核心 8/8＋原始 EBU 1/1；两端适用 WAV 68/68、数值 112/112、一致性 204/204，两个多声道排除。实际 PR 测试提交 `11831764ebad1fb0be9aa6cfb2fb36e88b08b507` 与交付源码树相同（`b0d76559b16f355776f68003c5ffa9d1f63c9f7e`），两端 sourceDirty=false。

前端实际 React/模拟 IPC：frontend 11、library 13、renderer 9、P0/P1 9、selector，以及本地 60 组合布局检查通过。完整来源/分片哈希在 [frontend-verification.json](release/frontend-verification.json)，只在追查证据时读取所需字段。依赖 pin 不变，完整/生产 npm 审计在原记录日期为零；不把文档修改当作新扫描或新产品测试。

正式合并另触发 [CI 39110640618](https://github.com/Sceneryyyy/Trace/actions/runs/39110640618)（来源 `4d1fc0b`），本次补记时仍在运行，不能写为新一轮已通过；后续以 Actions 最终状态为准。

## 未关闭边界

真实 Windows 设备/听感、96 kHz 采集、两小时录音/物理故障、GPU/系统 DPI/首帧、原生对话框、独立用户及正式发布按 [76](76-RELEASE-CHECKLIST.md) 待验。macOS 仅有方案（70），R83-09/10 为 P2，未纳入本轮。源码实现/云端模拟/无声卡候选加载不能替代实机验收。

Meter v5、Session v2、Request/Reply protocol v1、文件分析 key v3 保持；修改音频/存储/接口先读 03/04/06。FFT 来源/hash/许可与数值对照保持；图标输出在忽略的 `build/trace-icons/`，品牌素材不覆盖。

## 下一会话接力

2026-10-19 声谱图移植、频谱空列、录音目录识别、复位移位及设备/录音设置调整已完成（本地未提交）：使用本页顶部 `preview.35-device-settings` 的新程序确认设备/格式信息、统一录音设置及按钮位置、复验列表和回听，然后检查低频连续性、2D/3D 实际素材与真实监测/录音链路；不要重复移植或使用旧目录中的包。专项见 [93](93-RECORDING-DISCOVERY-FIX.md)、[92](92-SPECTRUM-CONTINUITY-FIX.md) 与 [91](91-SPECTROGRAM-PORT-PREVIEW35.md)。

1. 检查目录及 Git 状态/分支，接续已合入 PR #3 的 `recorder/dev`；按用户新方向开发，不重复已完成的合并/归档。
2. 云端 UI88 已完成，不重复基线和完整 CI；有 Windows 后按 76 收集真实设备/视觉/回听反馈，下一版本范围写入 07。
3. 后续候选需绑定目标源码并补匹配的包/手册与发布证据。签名、组件分发复核和用户测试分别关闭。

构建/专项复现命令见 [09](09-WINDOWS-SETUP.md)。私有 EBU 用 `python3 references/ebu-loudness-test-set-v5/prepare.py` 还原核验；公开源码归档不含素材，强制模式缺素材须失败。`artifacts/` 原始日志、截图及本轮归档检查不随 clone 下载；旧阶段证据和历史交接统一从[归档索引](archive/README.md) 按问题查找。

本轮归档只执行迁移/引用/内容保全/阅读量检查，未重跑产品、Windows 或音频测试；检查结果见[归档记录](archive/README.md#本轮归档与验证)。
