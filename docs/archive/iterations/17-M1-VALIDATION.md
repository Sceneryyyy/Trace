# 17 · M1 实时监测实现与门禁

2026-09-15。状态：M1 最小工程门禁通过，进入 M2。完整录音机和人工验收尚未完成。

## 实现

- 新增 Trace 原生引擎、独立 CMake 目标及 Electron N-API 模块，未让 PCM 经过 renderer。
- 设备真实格式校验、稳定设备 ID、epoch、QPC 时间映射、预分配 SPSC 队列、独立分析线程和原子故障计数。
- libebur128 1.2.6 / commit 67b33abe1558160ed76ada1322329b0e9e058b02；M/S/I/LRA/TP 同一引擎，histogram 模式，无 fast-math。
- 300 ms RMS、10 ms level/wave、100 ms loudness，最多 60 秒显示历史；单声道不复制为双声道计量。
- Trace 专用 Electron 主进程和窄 preload；白名单命令、状态版本和最近 256 请求结果去重；外部导航/窗口被拒绝。
- React LIVE 窗口按 05 配色与布局，波形/响度共轴；设备、10/30/60 秒显示、停止/继续与重置统计；无录音文件写入。
- 当前录音按钮禁用并说明尚未开放，不能把这个开发窗口称为完整录音机。

## 最小门禁

| 检查 | 结果 / 证据 |
| --- | --- |
| 原生编译与 CTest | 通过，1 CTest target 内 16 个 case；build/trace-engine/Testing/Temporary/LastTest.log |
| 类型检查 | 通过 |
| 命令参数检查 | 7/7；test/trace-contracts.test.mjs |
| 真实默认设备 + 低电平夹具 | 通过；artifacts/m1/native-smoke-default.json |
| 真实 Realtek + 空闲恢复 | 通过；artifacts/m1/native-smoke0.json |
| JS 主线程卡顿 500 ms | 原生分析继续、无队列丢帧 |
| 停止排空与计量帧数 | 实际采集帧 + 明确标记的估计静音帧 = 已分析有效帧 |
| 实际鼠标 / IPC | 停止、开始、重置、冻结、非法/过期请求均通过 |
| 窗口截图 | 1280×800 和 1024×700 已渲染检查，小窗口说明溢出已修正 |
| 最小化持续 10 分钟 | 进行中，必须读取最终新报告且 monitorSeconds >= 600 |

本次工程门禁不是 A01–A14 全部验收。官方 EBU 素材/96 kHz 实机/物理拔插仍待专门验收。

## 实测夹具摘要

Komplete：停止后实际 328,800 帧 + 估计静音 1,656 帧 = 分析 330,456 帧；0 dropped、0 timestampError、0 overlap；初始 discontinuity 1。

Realtek：停止后实际 182,880 帧 + 估计静音 144,155 帧 = 分析 327,035 帧；0 dropped、0 timestampError、0 overlap；初始 discontinuity 1。

这两组测试都是实际 WASAPI loopback，经系统/设备处理后的信号用于验证链路，不作为 LUFS 标准值 oracle。用暂停 render 模拟端点空闲，未改系统格式。设备空闲补齐明确标为估计，未知缺口另行记录，不宣称样本级无损补齐。

## 本次修复记录

- 区分有效 SILENT 包与未知缺失填充，避免把可用静音数据从有效分析帧计数中漏掉。
- 正 DC 波形不强制包含零；原始 min/max 正确。
- 100 ms 历史聚合其所有 10 ms 块的标志；无有效响度内容时 LRA 保持未就绪。
- CaptureClock 迟到包不静默丢弃，重叠标 Gap/Overlap；Reset 只更换 measurement epoch。
- Windows addon 添加对应 Electron 的 delay-load hook；node-addon-api 头部有两个既有 C4127 警告，Trace 核心未出现编译错误。
- Vite 首次相对 outDir 解析错误，现用项目绝对解析；已将 54 个确认由本次生成的意外输出文件移回 artifacts/m1/recovered-build-output，哈希/时间核对与恢复清单保留，未删除未知文件。
- UI 测试最初试图跨进程返回 listener 清理函数，导致不可克隆；改为返回普通结果，检查进程和报告双重结果。
- 截图发现小窗口说明超出面板，已缩为一行并扩大布局检测范围。
- 命令测试暴露 Date/原型继承载荷未被拒绝，已限制为普通对象、显式字段。
- 显示帧差先用 BigInt 相减再转局部 number，避免大帧号损失精度。

## 运行入口

```powershell
.\Trace.ps1 Engine
.\Trace.ps1 AppBuild
.\Trace.ps1 App
node --test test/trace-contracts.test.mjs
node tools/m1/run-fixture.cjs
node tools/m1/run-fixture.cjs 0
```

M1 的 UI smoke 入口是 tools/m1/ui-smoke.cjs，在项目 Electron 中运行并传 --trace-test；输出和用户目录均在 artifacts/m1。TRACE_MONITOR_SECONDS=600 选择十分钟门禁。不要将执行中的旧 ui-smoke.json 当成当前结果，先核验对应进程已经终止。

UI 设计以 05 为准，使用 UI/UX Pro Max 的流式图表准则辅助 Canvas/有界显示和可访问性检查。未引入外部在线字体或服务。

## 后续门禁修复与当前运行（同日）

轮询版 10 分钟报告保留在 artifacts/m1/ui-long-polling-600s.json：606.332 秒，0 队列丢帧，但记录 10 次设备不连续。改为 WASAPI EVENTCALLBACK + 100 ms 缓冲（实际 4800 帧）；两种设备短测通过。

事件版第二轮在约 4 分钟时状态改变，记为失败，见 ui-long-event-failed.json。未取得失败瞬间的错误码，不能断言是程序、设备或用户操作；已补全故障/控制记录。当前最终长测 session 72293，读取 .tools/m1-long-final-ui.log，完成后检查新报告至少 600 秒。

真实夹具进一步发现滑动 RMS 加减残差：数字静音约 -179 dBFS，真实 -200 dBFS 的弱信号被抬至约 -181 dBFS。两项新回归先失败（14/16），改为每个 10 ms 读数边界对固定 300 ms 正平方窗口重新求和后 16/16 通过；未设信号截断阈值。真实静音尾部已恢复 silence/null，弱信号仍保留正确数值。

事件驱动支持依据：Microsoft Loopback Recording 与 IAudioClient::Initialize 文档；当前目标 Windows 25H2 支持事件式 loopback。此修复未修改系统全局格式。

## M1 最终结果

605.405 秒最小化监测通过：只有初始 discontinuity 1，后续无额外不连续，0 dropped、0 timestampError、0 overlap；100 ms 端点缓冲为 4800 帧，队列高水位 5。私有内存最终 80160 KB，未随运行时长增长。原生核心 16/16、参数/时间 7/7，快照带单调事件序号与状态版本，最后短 UI 复验通过。

用户确认旧事件测试期间切换过声卡或 DAW；该轮保留为未完成长测，没有补造故障码或把它改记通过。最终证据是 ui-long-final-600s.json 与 gate.json。

结论仅为 M1 工程关口，可进入 M2。真实 96 kHz、物理拔插、所有 DPI、正式 EBU 素材与发布验收仍需后续补齐。
