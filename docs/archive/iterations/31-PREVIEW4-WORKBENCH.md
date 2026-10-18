# 31 · preview.4 统一工作台

2026-09-16。用户确认以 Wwise Profiler 的交互思路迭代：同一窗口、同一时间轴，LIVE 跟随最新，拖动游标查看历史。使用自己的界面与素材。

## 行为

- 来源/设备、缩放、LIVE、选区和走带控制固定呈现，不再以 LIVE / HISTORY / FILE 替换整行控件。
- 点按或拖动波形、响度图定位。首次离开实时头固定一份历史快照，后续读数来自同一快照；采集和 REC 在后台继续。
- 松开游标不恢复发声。点击 LIVE 跟随最新；健康输入不重启、不清空累计。若监测关闭，点击 LIVE 明确启动监测。
- 点击播放才打开 WASAPI 输出并暂停系统采集；暂停、游标拖动、播放结束关闭输出后，按 monitoringRequested 恢复采集，历史游标保留。
- REC 期间允许查看历史，拒绝发声回听。停止录音按钮和实时录音时长始终可见。
- “录音文件”的“查看”在同一画布加载文件；输出设备不可用仍可浏览数据，发声失败单独提示。
- Ctrl + 滚轮时间窗 5–60 秒，普通滚轮波形 ×1–×4，不影响保存音频或测量值。

## 时间与数据

- ReplayBuffer 的采集缓存、Recorder 的当前连续段缓存各有 60 秒 PCM 和 6002 条计量历史上界，分别使用 live Meter、录音自己的 Meter。
- 活动 freeze 固定到最后一条已发布 Meter 帧，排除等待 true-peak 前视的尾部。PCM、历史及映射在各自分析/写入发布锁内读取。采集 producer 不获取这些锁。
- 未录音不写临时音频。长录音继续流式写盘；固定的是有限最近缓存，不是整段录音。
- 历史 I/LRA/Max TP 恢复当时对应 Meter 的累计状态，不从缓存截取起点重算。选区独立统计才从选区起点计算。
- 精确 REC 历史覆盖当前连续区域最近约 60 秒。旧区域及超出缓存位置明确返回 HISTORY_OUTSIDE_BUFFER；全长概览保留，完整文件历史在结束后读取。
- replayFreeze 元数据版本升为 2，原子返回 sourceId、epochId、measurementEpoch、captureStartFrame、originFrame、frames、sampleRate、channelCount。
- LIVE 用 capture frame 映射至 clip-local frame；REC 纳秒偏移为此前各区域的有理数时长加当前区域 originFrame。只有标签增加 timeOffsetSeconds，音频/历史仍用整数局部帧。
- 显式 release 释放快照；重开采集不修改已固定内容。未完成的单个选区任务可短暂持有上一快照。
- 迟到的旧查询结果及错误均按来源/代次丢弃；当前历史读取故障关闭输出、恢复采集并标记读数不可用。输出设备故障不使有效历史数据失效。
- 显示 generation 与实际输出 nativeGeneration 分开。尚未发声时 outputReady=false、clockAccurate=false，不能将浏览位置冒充设备呈现时钟。
- 计量配置、Session schema 和磁盘分析缓存 schema 不变；原有 cache key 中 native hash 自动区分新原生构建。

## 验证入口

- node tools/build-engine.cjs：12 个原生目标，增加活动缓存尾部及 44.1/48/96 kHz 合成帧并发录音快照检查。
- node tools/workbench/run-ui.cjs：真实 Electron/WASAPI，鼠标拖动、后台采集/写盘、稳定历史、固定布局、LIVE 不重启、选区、发声互斥、输出失败、EOF 恢复。
- node tools/workbench/gate.cjs：新工作台验证，加 feedback3 / feedback / M6 / M5 组合回归。旧用例的打开文件暂停输入、松开拖动自动发声按本次批准语义更新；数值、帧数、时钟容差和文件完整性标准保留。
- feedback 的 65 秒实采检查 60 秒上界、无临时音频、原始读数精确重现及非零时间偏移。
- node tools/m6/archive.cjs 与 relocated-smoke.cjs：已测目录 ZIP、中文路径解压和独立启动。

## 验证工具修正

显示矩阵曾在新页面加载完成前发送首条 state.get，出现 crypto.randomUUID 尚不可用的启动竞态。应用随后正常初始化；已保留失败报告。CDP harness 现在明确等待 document complete、trace 接口与 UUID API 就绪后才开始断言。没有替换 API、放宽音频容差或跳过矩阵。仅验证工具改变时，--reuse-audio-regression 向下传递既有复用选项，M6 仍校验 M5 通过报告的 main/native hash 与当前构建完全一致。

## 交付状态

正式交付入口 dist-trace/preview.4/win-unpacked/Trace.exe；仍为开发预览，旧版本保留。最终工程门禁、ZIP 和重定位检查已通过。

原始 EBU 素材、真实 96 kHz 捕获、物理拔插/驱动格式矩阵、混合 Windows DPI 和干净 VM 仍未验证。原有 30 分钟实录是历史基线，本次未重新长录。

## preview.4 最终交付证据

- 组合门禁：artifacts/workbench/gate-1789539668525/report.json，2 个顶层阶段通过，包含完整 feedback3 / feedback / M6 / M5 / M4 回归。
- 工作台实际交互：artifacts/workbench/ui-1789539669402/report.json，8 项；包括录音持续写入、LIVE 滑窗继续前进、静音定位、输出/历史故障及 EOF 恢复。
- 服务边界 10/10；原生 CTest 12/12，活动 freeze 与三档合成采样率并发录音历史通过。M4 20 项，54 项编码矩阵、65 秒实采缓存、尺寸/DPI 及保留的 30 分钟文件均通过。
- M6：artifacts/m6/gate-1789539776371/report.json；ZIP 解压至中文路径后的 8 项独立流程通过。
- ZIP：dist-trace/preview.4/Trace-0.1.0-preview.4-Windows-x64.zip；207080294 bytes；97 个文件逐一 hash 一致。
- ZIP SHA-256：779bce119c7f9967372ecb075c6b978929e0cfd6d15e16c46f38a44ec4117885
- native SHA-256：af6f94486db5aeeaba0d20f5a99b03081ab2729606ab0cc874a979ce74683847
- main SHA-256：e204ba2b9f583e88773812f2d4be570864515b51894d017b6861c0a765b3c174
- app.asar SHA-256：565228a9d44b9a709b53eb2adbdeb37efbf2e48eb79a22485a43d1464a529877
- 新包使用 0.1.0-preview.4，旧预览目录保持。源码未提交/未推送。

下一任务：用户实际复验统一时间轴、LIVE 返回与声音回听手感；原始 EBU、真实 96 kHz 捕获、物理设备变化、混合系统 DPI 和干净 VM 门禁仍开放。
