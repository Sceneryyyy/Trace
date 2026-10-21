# 94 · Windows 首轮实机复验与专项稳定性

2026-10-19。本轮完整两小时 Realtek 48 kHz 长测及文件校验**已完成**，19:10 正常收尾，19:14 完成独立文件核验。结果带 estimated-silence 限制；不等于全部 DATA/发布门禁关闭。

## 用户验收与本轮收尾（2026-10-21）

用户确认人工听感通过。该结论按用户反馈记录，未提供具体设备、素材或逐项听测记录；不据此扩展其他设备与测试矩阵的通过范围。

其余未验项目交由用户后续验证，包括剩余采样率/长测、设备变化与物理故障、干净 Windows、默认后台调度和更多 working set/GPU/DPI 覆盖。本轮验证收尾，heartbeat `trace` 保持 PAUSED，不再主动追加测试或修改，收到用户反馈后再处理。此前估算静音、资源变化与失败证据保留；剩余发布门禁保持待验。

## 19:14 最终结果（2026-10-19 历史记录）

- `artifacts/acceptance/machine-1792400235856/report.json` 为 pass；10 分钟监测无音频文件写入，随后真实 WASAPI 48 kHz 双声道 WAV24 连续 **7200.038979166667 秒**。accepted/written/start-end/reopened 总帧数均为 **345601871**；正常停止、会话 ready、重启全文件分析及起点/中点/99% 位置请求通过。程序于本地 19:10:17 完成，无残留 Trace/测试音进程。
- 独立 `reopen-verification.json` 通过 RIFF 大小/完整 PCM 帧、ffprobe 格式/帧数、全部源 SHA256 及静音/测试音内容检查：339784231 静音帧、5817640 非零帧。单个源 WAV SHA256 `951a5c9b2128e61640f20a765d9e2a7311da5927fe9a175a718ac7cf49abad66`。没有拿旧中断段凑时长。
- **质量限制**：录音保留 **12431 帧 / 0.258979 秒**估算静音，239 个录音样本从首次采样到末次均为该固定计数，未持续增加；会话 continuity 正确为 `estimated-silence`，hasDiscontinuities=false。不能声称每帧均来自设备实采。所有录音采样 droppedFrames=0、timestampErrors=0、overlapEvents=0；live discontinuities 累计 1 不增加，与初始转场记录一起保留，不能当成持续丢帧。录音队列 high-water 最大 11，采集队列最大 3。
- 119 个录音期进程树资源样本：private bytes **467468288–552370176**（约 **446–527 MiB**），首/末 540672000/472813568（约 516/451 MiB）；句柄首/末 2367/2368，JS 堆约 5.2–43.5 MiB，未见私有内存/句柄持续增长。但 working set 从 614793216 增至 952639488（约 586→909 MiB），因此不宣称所有资源恒定或对 GPU/驻留集泄漏已全面排除。原始数据 `process-resources.json` 保留。
- 本轮关闭的是该包、该 Realtek 48 kHz 条件下的连续两小时录音/帧数/重开/文件完整性检查；仍需物理慢盘/满盘/断电、设备变化、44.1 kHz/96 kHz 长测、默认后台调度与更多 GPU/DPI/听感。测试控制器使用防后台节流参数，范围保持不变。之前 CDP 超时、旧导航脚本不兼容、停止控制进程操作失误及旧 39 分钟未知尾部证据均不撤销。
- heartbeat `trace` 收尾后设为 PAUSED；无提交或推送，产品包未替换。下一步按 76 的剩余实际设备/物理故障/听感矩阵推进。

## 16:57 重启后恢复

- 用户明确恢复后，上次中断恢复文件再次实际重开、全文件分析/起点/中点/99% 尾段定位通过；旧 `file-reopen.json` checkedAt 为 `2026-10-19T08:56:24.885Z`。旧 39 分钟仍按中断证据保存。
- 同一个完整包 ASAR SHA256 再核对为 `215ffe83c26de54757a7ad6dc064e710a5e6a3553c46a178f2b4cac85fea6154`，没有替换产品。新测试目录 `artifacts/acceptance/machine-1792400235856/`，16:57:15 开始，Realtek 48 kHz 10 分钟预检 + 7200 秒实际录音，预计 19:08 后进入停止/重开/文件校验。日志改为 `artifacts/acceptance/machine-resumed-console.log`，进程树资源采样正常重启；旧日志不覆盖。heartbeat `trace` 已恢复 ACTIVE。
- 本轮测试控制器增加 `pause-request.json` 安全暂停入口（按秒检查），正常停止录音/核对帧数/最终化/重开后才退出，避免杀控制 Node 导致 Windows 同时终止其拥有的录音进程。独立实测 `artifacts/acceptance/machine-1792400221173/report.json` 为 paused，native phase complete，accepted/written/reopened 均 **157078 帧**，没有复用旧中断录音。将来暂停仅新建该标记，等待控制器自行收尾。
- 重启后枚举 RME 已真实配置为 **96000 Hz 双声道 Float32**（系统格式不是本轮修改）。补跑实际 RME WASAPI 到 source-rate WAV24 短录音，**1381440 帧 / 14.39 秒**，录音估算帧 0、无录音缺口；ffprobe 验证 96000 Hz、2 声道、pcm_s24le、duration_ts=1381440，源文件 SHA256 与会话清单一致。证据 `artifacts/acceptance/rme-1792400210927/report.json` / `source-verification.json`。因此真实 96 kHz **短采集路径**已有本机证据，不宣称 96 kHz 两小时、切换或故障恢复矩阵通过。

## 15:15 用户暂停与重启交接

- 10 分钟监测预检完成，无音频文件写入；录音观察 78 个样本、累计 98 个阶段样本。最后观察的队列 droppedFrames=0、timestampErrors=0；录音期累计 estimatedFrames 保持不再增长，但包含 REC 前监测期的估算静音，不能用 live 累计值当成录音质量计数。
- 停止控制 Node 进程时，Windows 同时终止了它拥有的 Trace 和测试音进程，未能正常 REC stop。这是本次停止操作的失误，不是被测程序自然发生的崩溃。首次正常暂停连接因此 ECONNREFUSED，保留原始 WAV/journal 和 `before-user-pause.json`。使用产品 `record.recover` 另存恢复文件，没有覆盖原始录音；录音状态 `recovered` / continuity `gaps`，未知尾部明确标记。
- 恢复 **112628058 帧 / 2346.417875 秒（39 分 6.4 秒）**，48 kHz 双声道 pcm24。超过最后观察的 112497018 已写帧。`report.json` / `pause-report.json` 状态为 `paused`，`unknownTail:true`，不是 `pass`。
- `reopen-verification.json` 文件校验通过：RIFF 大小/完整 PCM 帧、ffprobe、恢复文件 SHA256、总帧数；静音 110688802 帧、非零 1939256 帧。恢复文件 SHA256 `5fd171a9dfd6a2dc50446fc88f9153a817d8ff33c41365668b848eb9c0f3f629`。文件校验 PASS 不等于连续长测 PASS。
- 录音期间进程树 private bytes 范围 **449003520–458633216**（约 428–437 MiB），首/末约 435.6/435.5 MiB，句柄首/末 2381/2377；本段未见持续增长趋势，但不能外推两小时。原始逐分钟样本见 `process-resources.json`。
- 恢复文件已通过实际包重开、全文件分析和起点/中点/99% 尾段精确定位，`file-reopen.json` 为 PASS（112628058 帧）；仍保留 unknownTail。
- heartbeat `trace` 已按用户要求 **PAUSED**。测试采集/渲染和资源采样均已结束；重启不会自动开始测试。恢复后先用同一包/隔离配置重开旧恢复文件，再在新目录重新开始连续两小时；中断前 39 分钟保留作阶段证据，不与新段拼接声称连续两小时。

## 程序与环境

- 程序为 `dist-trace/preview.35-device-settings/win-unpacked/Trace.exe`，ZIP SHA-256 `c6436276e1a2294a6f2750f1dbcff6cb7bf6d5c504e9e3a8b017ba179b76a46e`。来源为 `d268e5b` 加本轮未提交增量，产品文件身份见包旁 `LOCAL-VALIDATION.json`。本次只改验证脚本和文档，没有重建或替换产品。
- Windows 11 专业版 build 26200，i9-14900K，Intel UHD 770 / NVIDIA RTX 4080 SUPER。硬件和驱动本地证据为 `artifacts/acceptance/host.json`；没有强制切换所用 GPU，不能宣称两块 GPU 均验收。
- WASAPI 实际枚举：Realtek(R) Audio 与 RME Fireface UCX 的 4 个输出端点，目前均为 48000 Hz、双声道、Float32。未改变系统默认设备、采样率或个人设置；真实 44.1/96 kHz 采集未测。
- 所有设置、音频和崩溃注入仅限新建的 `artifacts/` 子目录，不使用个人录音，不提交这些证据或音频。生成测试信号经真实 WASAPI 渲染/捕获，仍不代表个人素材听感或 YouTube 场景验收。

## 已完成

| 项目 | 结果与本地证据 |
| --- | --- |
| 原生/媒体与故障反例 | strict native/media **68/68**；`artifacts/native-first-machine.log`。包括实际原生/媒体运行及容量、进程、缓存等隔离反例，不等于把系统盘填满 |
| C++ / EBU | CTest **19/19**，含 EBU 原始 WAV；`artifacts/ctest-first-machine.log` |
| 真实引擎采集 | RME 默认端点与 Realtek 的 native-smoke 通过；JS 阻塞时采集推进、计量帧对齐、统计复位不重开设备、停止后帧计数一致；`artifacts/m1/native-smoke-default.json` 与 `native-smoke1.json` |
| 三种 WAV 精度及分段 | pcm16/pcm24/float32 的实际 WASAPI 录音，低阈值多分段、接收/写入/边界帧数一致；`artifacts/m2/native-1792390805182/report.json` |
| 完整包音频流程 | **8 组**：离线启动、无 REC 不写音频、WAV 录音、MP3 自动成品与原件策略、MP3 回放/定位、AAC ADTS 选区导出/独立分析、重启恢复；`artifacts/m6/package-1792390654535/report.json` |
| 中文/空格路径 | ZIP 实际解压到独立中文及空格目录，再跑以上 **8 组**；`artifacts/m6/package-1792390870702/report.json`。开发者本机，未代替干净 Windows 普通用户 |
| 保存缓存 | **6 组**：监测无写盘、精确两秒选区、WAV/MP3/AAC 独立文件及分析、监测 epoch 保持、重启/过期请求；`artifacts/iteration/three-1792390697353/report.json` |
| 超过 60 秒录音历史 | **5 组**：有界最近历史、过期概览点击不发无效 seek、近期历史查看时同 take 继续写、停止反馈/打开成品、恢复原先关闭监测意图；`artifacts/iteration/two-live-1792390709449/report.json` |
| 实际输出/循环/定位 | **10 组**，44.1/48/96 kHz 的单/双声道生成文件经真实输出；共 300 次快速 seek，各组合至少 10 次循环，EOF、暂停、音量、解码异常；`artifacts/m4/native-1792390945029/report.json`。96 kHz 是文件输入，不是采集率 |
| 数字回环内容/时钟 | **4 组**，左右声道相关系数约 1，增益 0.1500000047，声道位置一致，测得时钟偏差 **2.1782 ms**；`artifacts/m4/loopback-1792390949733/report.json` |
| RME 包内复跑 | 真实采集约 14.6 秒，写入/接收一致、录音估算帧 0、无录音缺口；`artifacts/acceptance/rme-1792391017254/report.json` |
| 3D 实际 WebGL 布局 | **3 组**，最新完整包在拆分、最大化、横/方/竖视口覆盖合理，保持 zoom、原始点与 PCM；`artifacts/m10/viewport-fit-1792390837828/report.json`。几何模拟不代替物理跨屏 DPI |
| 实际查询到绘制延迟 | 最大 FFT/仪表配置，**213** 次实际 paint，p95 **82.8 ms < 100 ms**；`artifacts/m9/latency-1792391032496/report.json`。非两小时 GPU 性能结论 |
| 隐藏/最小化 | **3 组**：界面停止展示更新而同一录音继续写入、恢复后显示当前状态、保留原监测意图；`artifacts/m8/visibility-1792391067780/report.json` |
| 频谱来源/绘制回归 | **7 组**，旧请求不可覆盖当前来源、错误重试、单声道默认、快速切源/FFT、隐藏恢复所有权、各编码独立谱数据与 PCM 不变；`artifacts/m9/presentation-1792391074195/report.json` |
| 实际故障/恢复 | **5 组**：诊断脱敏、实际 file worker 退出、脚本与实际 renderer 崩溃后保持录音、主进程异常退出后重启恢复已写帧、正常退出清除警告；`artifacts/public-beta/support-1792391185698/report.json`。不等于物理断电 |

## 失败与重跑边界

1. SDK 原始短探针：Realtek 为 `idle-clock-policy-required`；RME 出现 3 次初始包以外的不连续标记、768 帧位置间隔，报告 `recordingIntegrityValidated:false`。证据 `artifacts/diagnostics/first-machine-realtek.json` / `first-machine-rme.json`。这些不能写作录音完整性 PASS。后续 RME 包内录音复跑没有复现录音缺口，但不关闭拔插/长时驱动稳定性矩阵。
2. 旧 `iteration-one.cjs` 已通过前 6 个导航检查，随后查找 UI88 已移除的 `.asset-format` 超时；`artifacts/iteration/one-latest.json`。这是旧探针不兼容，完整脚本未通过，不计入通过数；未为迎合它改变产品界面或放宽测试。采用当前显示/来源专项与原生快速定位另行覆盖。
3. 首次长测预检在监测约 270 秒后发生 `CDP timeout Runtime.evaluate`，尚未开始 REC。证据 `artifacts/acceptance/machine-1792390754627/report.json`；当时显示堆约 7–24 MB，不据此判定原因。该失败保留，原因尚未确认。重跑增加防后台节流启动参数，关闭其余短测，不宣称已证明是 GPU/产品/脚本中的哪一方。
4. 新 RME 探针初次错误地要求直接 REC 具备仅缓存保存使用的 `captureQuality`，已按真实契约改为核对 region/native 的 `estimatedFrames` 和会话 discontinuity 状态重跑；未伪造产品元数据。

## 暂停前执行的长测安排（历史过程）

- 本段目录：`artifacts/acceptance/machine-1792391147536/`，启动于本地 **14:25:47**。原计划 10 分钟真实 Realtek 监测后录音 **7200 秒**；15:15 已按用户要求暂停，原 16:36 预计完成时间取消。
- 使用最新完整包与真实 GPU；为稳定测试控制连接，传入 `--disable-renderer-backgrounding` / `--disable-backgrounding-occluded-windows`。这改变后台调度条件，不能代替普通用户默认后台节流的长时验收。
- `tools/m6/machine-stability.cjs` 每 30 秒检查活跃/错误/丢帧、录音阶段、帧位置、队列与 JS 堆；监测期递归检查无音频文件；录音在独立目录，间歇渲染低电平测试音。正常停止核对 accepted/written/start/end，重启后等完整分析并定位起点/中点/尾段。
- `tools/m6/sample-machine-resources.ps1` 单独每 60 秒采样本轮主进程及子进程的 private/working set、CPU、句柄/线程，结果 `process-resources.json`。不能只用 JS 堆证明原生内存稳定。
- 进度 `progress.json`，完成才生成 `report.json`。自动收尾检查已设为本聊天 heartbeat（名称“Trace 两小时实机长测收尾”，ID `trace`），正常运行保持安静；完成后执行 `node tools/m2/verify-long.mjs <本轮 report.json>`，分块校验 RIFF、ffprobe、全部源 SHA256、帧数及静音/测试音，再回填文档并停用检查。长测/文件校验未完成前状态保持进行中。

## 后续仍需实际操作

真实 44.1 kHz 采集、96 kHz 持续长测/格式切换与设备拔插/默认设备变化/独占占用/睡眠恢复；物理慢盘/满盘/断电；约三分钟真实视频的整套工作流与人工听感；物理混合 DPI/分别指定核显与独显；干净 Windows 普通用户、签名/下载/升级回退和独立用户体验。当前不擅自修改系统音频配置、制造系统盘空间不足或切断电源。长测期间请保持电脑唤醒，避免关闭测试窗口或改变 Realtek 输出设备。
