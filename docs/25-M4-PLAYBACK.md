# 25 · 文件回放、呈现时钟与独立选区

2026-09-15。M4 已接通 WAV 文件回放、共用时间轴、历史表头和独立选区分析。当前完整组合门禁已通过，结果在 artifacts/m4/gate-latest.json；checkpoint.json 绑定源码、原生、主进程和 renderer 产物。M3 原始 EBU 素材门禁仍开放，M5/M6 还未完成。

## 用户流程

录音文件列表的每个可用来源增加“回听”：可选原始、恢复、成品或多区域会话视图。多区域原始/恢复文件仍须选择连续区域。打开 FILE 先停止 LIVE 采集；文件播放、暂停、循环均不进入自身的 LIVE 统计。返回 LIVE 关闭文件输出并创建新采集 epoch。

两张图共用文件帧位置及可视范围：

- 单击或拖动波形/响度图定位；拖动时停止发声，松开仅在原本有播放意图时恢复。
- Shift 拖动建立选区；两端把手可调整，数值输入也可设置边界。
- 选区循环保留文件历史读数；独立选区 I/LRA/Max TP 在图下单独显示。
- 支持全长、放大/缩小、左右浏览和滚轮缩放。跳到当前视窗外的位置时重新居中可视范围。
- Space 播放/暂停，Home 回起点，Escape 暂停；输入框和对话框内不触发这些走带快捷键。
- 回听音量只作用于输出，不改变文件计量。
- 分析未完成时显示未就绪，不以实时录到的自身回放冒充文件历史。
- 当前 FILE 输入为本机已有 WAV 资产；MP3/AAC 成品及解码定位属于 M5。

## 原生输出层

| 文件 | 责任 |
| --- | --- |
| PlaybackTimeline.h | 设备时钟单位换算、文件位置与循环映射；128 位乘除避免 uint64 乘法溢出 |
| WaveSequence.h/.cpp | 同率同声道源分段的连续读取和定位，不把全部 PCM 装入内存 |
| Playback.h/.cpp | 独立预读线程、64×2048 帧有界队列、WASAPI 渲染线程、暂停/定位/EOF/故障 |
| PlaybackAddon.h/.cpp | Promise 化打开/关闭及窄控制接口；生命周期代次阻止迟到打开 |
| playbackService.ts | 文件身份、播放意图、分析任务引用、视窗与选区、历史查询代次 |
| renderer/Timeline.tsx | 两图共用可视范围、游标、选区和交互 |
| renderer/FileControls.tsx | FILE 来源/走带/缩放与选区独立统计 |

磁盘读取只发生在预读线程。渲染线程从预分配队列取样，使用 100 ms 的共享模式事件缓冲。短循环最多缓存 2048 帧，避免单采样循环反复读盘。队列中每块带 generation 和从本次定位起点计算的 streamFrame；旧代次丢弃，未来代次等待，不能错把新预读块当旧数据清掉。

文件流明确使用 Media 类别，默认请求 RAW 以绕过可旁路的系统音效，避免回听时再次塑形；不支持时用新的客户端回退普通 Media 共享流。rawModeApplied 只描述本流，没有改 Windows 全局音效。RAW 不承诺绕过端点始终开启的处理，参见 [Microsoft RAW 选项](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/ne-audioclient-audclnt_streamoptions)。

输出以文件采样率/声道、float32 打开共享流，启用 Windows 的 AUTOCONVERTPCM 与 SRC_DEFAULT_QUALITY 适配设备混音格式；文件分析仍使用源自身格式。该机制的定义见 [Microsoft 流标志](https://learn.microsoft.com/en-us/windows/win32/coreaudio/audclnt-streamflags-xxx-constants)。

呈现帧来自 IAudioClock 的 position/frequency，再映射为文件帧及循环坐标。submittedFrames 只是已交给输出缓冲的数量，不能代替呈现帧。暂停冻结设备流；seek 停止并 Reset，再消费新 generation 的预读。EOF 在相应真实帧已呈现后结束。[Microsoft IAudioClock::GetPosition](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclock-getposition)

## 故障与意图

慢预读测试复现了初始实现的漏洞：只检测 clockFrames > submittedFrames 不足以识别输出耗尽，慢文件最终被报为正常结束。现增加“运行中的缓冲为空且仍有未提交内容”的检查，报告 PLAYBACK_UNDERRUN 并停止，保留最后可信位置；不补假数据后继续假报连续。[Microsoft GetCurrentPadding](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-getcurrentpadding)

非有限 PCM（NaN/Infinity）在预读阶段拒绝。输出设备/API 失败带诊断返回，主视图保留位置并显示错误。真实驱动拔插未在本轮执行。

控制器显式保存 desiredPlaying；原生快照可能晚于暂停请求。已复现并修复“暂停刚提交就改选区，旧 playing 状态又触发播放”的问题。UI 预读/历史请求同时核对文件 ID、输出 generation 与视窗代次，旧结果不能覆盖新游标。

打开/关闭在原生异步 worker 执行，生命周期 ticket 以调用顺序失效旧打开请求。关闭后迟到的 open 不重占设备。

## 历史与选区

FILE 表头：

- Peak/RMS/TP 用最近不晚于呈现位置的 10 ms 索引。
- M/S/I 用最近不晚于位置的 100 ms 索引；I 始终从文件起点累计。
- 右侧 LRA、Max TP、FILE I 为整段文件统计。
- 暂停不按墙钟继续衰减；监听音量不参与这些读数。

选区 [a,b) 以空 Meter 状态重新分析。FileAnalysisOptions.startFrame/endFrame 对连续源分段作精确裁取，仅将选中 PCM 送入同一个 Meter；缓存局部原点为 0，帧数为 b-a，不平均各点 LUFS。M/S/TP/EOF 上下文使用现有 v4 规则。

**缓存键版本升级为 2（analysisCacheKeyVersion=2）**，键和清单加入 sourceRange。原二进制页 schema 仍为 1，计量配置仍为 trace-meter-v4-ebur128-1.2.6-lra10hz-tpaligned。页布局及数值算法未改变。清单验证边界、长度与来源绑定；旧键版本不能复用。

文件分析任务与选区任务有独立 ID/范围。改变选区取消前一个未完成任务；仅切换循环不重算同一个选区。当前 FILE 及选区的任务被引用保留，64 项历史裁剪不会删掉它们；关闭/替换时释放引用，历史仍保持有界。

## 实际验证与失败记录

### 原生与控制器

- CTest 11/11：新增 7 个播放基础用例；文件分析新增 2 个选区用例，原有数值、录音、精度及快照回归保留。
- 原生设备输出：44.1/48/96 kHz × 单/双声道，每组验证暂停、50 次定位、十次循环、音量和 EOF；另检查参数拒绝、异步打开取消和两项输出故障。
- 96 kHz 是文件输入经输出适配的验证，不是 96 kHz WASAPI 捕获验收。
- 8 个 JS 检查覆盖过期查询、暂停意图、关闭中的打开、源 ID、范围白名单、整段/前缀区分与 64 项任务历史的引用保留。

### 数字回环验证

额外用本项目低电平伪随机双声道文件作数字回环，验证真实输出内容与 seek，而不只检查 API 状态。普通 Media 输出的本机回录相关性为 0.60195 / 0.57032，并有交叉混合；同一 Media 类别启用 RAW 后为约 1.0 / 1.0，左右标记落在同一采样帧，标记与输出设备时钟差约 2.04 ms。0.95 相关阈值和 50 ms 时钟阈值未放宽；普通模式失败对照保留在 loopback-* 目录。

这确认了本机可旁路系统处理会改变回听内容，RAW 请求在本机恢复了期望文件数据。它是数字回环证据，不是麦克风声学测量，也不代表所有驱动/端点效果都能旁路。回环验证只在独立测试程序中同时打开捕获与播放，产品 FILE/REC 仍互斥。

### 实际窗口

八秒三分段合成测试文件经真实 Electron/WASAPI 路径验证。当前检查包含 100 个历史位置、两张图定位、暂停/恢复、十次循环、音量独立、选区统计、键盘、双向滚轮、最小窗口和返回 LIVE。结果与截图按轮保存在 artifacts/m4/ui-*。

早期 15 项窗口门禁中，前端快照相对设备呈现时钟的 p95 延迟为 35.1458 ms，最大 35.8333 ms；原目标 50 ms 未放宽。最终构建数值以最新报告为准。该测量比较设备时钟与 renderer 快照，不是声学麦克风往返测试。

选区的数值验证没有放宽标准容差：

- 初次测试错误地要求直方图 I 精确相差 6.0206 LU；本机实际为 -25.25 与 -19.25 LUFS。
- vendored histogram 的 0.1 LU 分箱在源码可查；解析幅度比用于 RMS。
- 修正后的测试保留 1e-5 精度检查 RMS 的 6.020599913 dB 差值，并将全部选区统计与独立截取 WAV 的完整分析作精确对照。
- 原生还逐字节对比跨分段选区缓存与独立裁取文件的所有缓存流。
- 失败基线 ui-1789478408198 保留；没有调整 Meter 数值或原 EBU 容差。

滚轮测试首版向 native 输入负 deltaY，却按放大方向断言；报告显示视窗实际从 4 秒扩大到 5.2 秒。现同时验证正/负原生输入的双向效果，保留 ui-1789479617880 失败记录。生产 UI 使用浏览器 WheelEvent 的方向。

输出欠载基线见 .tools/m4-underrun-before.log，暂停意图基线见 .tools/m4-pause-intent-before.log。独立 C++ 故障程序另写结构化 JSON，门禁不依赖控制台末尾是否已经刷新。

## 可重复门禁

```text
node tools/build-engine.cjs
node tools/trace.cjs AppBuild
node tools/m4/gate.cjs
```

组合门禁检查类型、8 个播放 JS 用例、实际原生输出、真实数字回环、FILE UI、M3 长文件/分页缓存集成、查询边界以及 M2 录音/续录/恢复/精度 UI。每项检查退出码、报告更新时间和 status，失败时不继续宣称阶段通过。

## 保持开放

M3 原始 EBU WAV 素材仍未取得。真实捕获 96 kHz、物理设备拔插、驱动主动格式变化以及完整 DPI/多显示器范围未验收。M5 MP3/AAC/M4A/ADTS 和整段/选区导出、M6 桌面包/完整交互/干净环境验证尚待完成。M4 工程门禁不代表全项目完成。

## 最终当前构建

完整 M4 组合门禁通过：原生 11/11、JS 36 项、原生输出 10 项、数字回环 4 项、FILE UI 19 项、M3 集成 19 项，及 M2 续录/恢复/精度回归。最终 FILE UI 的时钟差 p95 为 33.792 ms；数字标记时钟差 2.052 ms，实际增益 0.150000005（请求 0.15）。后一个增益断言为相同二进制的针对性补验，没有放宽阈值。

下一任务 M5。保留原始 EBU、真实捕获 96 kHz/设备物理变化和 M6 发布验收开放。
