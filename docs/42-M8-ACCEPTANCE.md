# 42 · M8 频谱与声场 / preview.14 工程验收

2026-09-17：preview.14 的功能/短门禁与 30 分钟可见窗口资源门禁通过，M8 工程交付关口关闭，待用户人工复验。原 preview.11/12 的资源失败记录保留，调查及修复见 44/45。用户总体目标保持 active，继续 M9–M12 与同口径复评；既有标准素材及硬件专项仍单独开放。

## preview.14 最终工程证据

- 短门禁：artifacts/m8/final-1789576171939/report.json，12 阶段 pass；含真实可见 UI、三组进程缩放、隐藏/最小化录音生命周期及 ZIP/重定位检查。
- 长门禁：artifacts/m8/resources-1789576099071/report.json，**1800.366 秒 pass**，120 次采样、29 次仪器显隐恢复。前约 300 秒录音，余下持续 LIVE；不是 30 分钟持续录音测试。
- FFT 16384、平均/保持 2000 ms、声场 1000 ms；总工作集峰值 **979.40 MiB**，主进程峰值 **399.43 MiB**，renderer JS 堆峰值 **30.45 MiB**。基准均值 833.68 MiB、尾段均值 928.15 MiB，增长 **94.47 MiB < 原门槛 128 MiB**；总量/主进程/堆仍在原预算内。未主动 GC、未放宽阈值。
- 捕获 droppedFrames 和仪器错误均为 **0**，回放缓存守住上限。窗口实际可见，每次采样均有断言；使用软件渲染，不代表所有 GPU/驱动环境。
- 录音事后流式核对 RIFF 长度、数据帧数、格式和 SHA256：48 kHz / 双声道 / PCM24，**14,402,400 帧，300.05 秒**；文件与 session 清单一致、无会话错误。见同目录 file-integrity.json。保留录音，未加入源码提交。
- 运行入口：dist-trace/preview.14/win-unpacked/Trace.exe；ZIP：dist-trace/preview.14/Trace-0.1.0-preview.14-Windows-x64.zip。
- ASAR SHA256：85e899ad2ae23e346297ecaf94a53214f0fe97663fc335749b346a806be4b15d；包内 Native：f5276ad9fc622ffa00e78adbf5329a40c53bc6c6b86682b94447c209f8c4ba7e；ZIP：7f9d0e2b44b88caf21f30d88f2f0f94507b3ac1b4b0b8fb888c10163c17001e8。

后续源码已包含 M9 增量；此处身份仅属于冻结的 preview.14 包。下一阶段为完整来源查询与共轴 2D，不再重复启动已结束的资源任务。以下 preview.11 的初次验证与身份保留历史用途。

## 本次能力

- 频谱：原生真实 PCM 上计算；当前、线性功率平均、固定时间峰值保持；FFT 512–16384、声道能量/L/R/Mid/Side。
- 频率/电平坐标可缩放、平移、复位；读数对应真实 FFT bin。显示操作不 seek、不改音频。
- 声场：Lissajous、Polar Sample、Polar Level；Polar RMS/Peak/Envelope 使用窗口全部样本聚合，不能从稀疏显示点反推。
- 相关度与功率平衡明确区分静音、单声道、数据不足与缺口；显示倍率只影响图形。
- 实时、当前录音段、固定缓存、分段文件/解码范围都接入。REC 使用原生段帧号，不把纳秒画轴直接当 PCM 帧。
- 设置独立持久化；workspace v1 → v2 保留旧布局和自定义预设，新增仪器初始隐藏，提供“频率与声像”预设。

## 并发、时序与文件安全

原生 ROI 最多 5 秒，只复制实际分析上下文；不每帧 freeze 60 秒，也不在采集回调做 FFT。原生最多两个异步工作任务；主进程保留两个精确查询结果。文件路径由已选资产解析，renderer 不能传任意文件路径。临时 PCM 不写盘，原音频只读。

Native 返回包校验位置、采样率、FFT/窗口、typed arrays、有限值与标量范围。文件查询在新游标或来源取代时丢弃旧结果，录音观察与显示计算独立。实时发布保留单调帧位置，显隐切换后旧计算结果不能覆盖已发出的较新快照。

停止录音的收尾阶段继续使用该录音的计量和原生段帧，避免提前混入实时监测数值。退出会等待已提交的仪器计算结束。

## 验证

- 类型检查；相关 JS **105 项**通过，覆盖设置/IPC、缓存上限、关闭等待、异常响应、旧 seek/换源淘汰、解码范围及旧布局迁移。
- 原生 **CTest 14/14** 通过，含独立 DFT/幅度参考、ROI 环绕/过期/上限和 Polar 能量。
- Electron 原生桥接 **7 项**通过，包括真实捕获、冻结缓存所有权、并发上限、范围检查和不改原始素材。
- 独立包 **11 阶段**短门禁通过：100%/150%/200% 进程缩放各 **12 项**工作台流程；每组 100 个位置响应采样；旧导航、包审计、三格式离线流程、ZIP 全文件比对、中文路径重定位。
- 数据与截图位于 artifacts/m8/final-1789570821219；各组定位 p95 以对应 ui 报告为准，门槛 100 ms，均通过。
- 软件渲染、进程缩放与合成文件有明确记录；不代替真实系统混合 DPI、干净 Windows 或标准节目素材验证。

首次原生桥接脚本直接由 GUI executable 启动出现 Error 窗口，未形成完成报告；核实只属于该测试后停止了那个进程，改为 Node 托管子进程并隔离 userData 后通过，没有重启用户的 Trace/DAW。

## 30 分钟资源门禁

tools/m8/resources.cjs 默认 1800 秒；前 300 秒进行 WAV 录音，其余继续 LIVE。使用 FFT 16384、2 秒平均/保持和 1 秒声场，每分钟显隐恢复，观察 droppedFrames、仪器错误、窗口内存与进程工作集。使用独立 artifacts 目录并保留音频，不提交到 Git。

当前实际结果见 artifacts/m8/resources-latest.json。短时启动校验不代表 30 分钟完成；必须检查 requestedSeconds/elapsedSeconds、checks 和最终 status。若仍 running，先核对 PID/任务 handle，不能因为读取超时重复启动。

## 交付身份

- 目录：dist-trace/preview.11/win-unpacked/Trace.exe
- ZIP：dist-trace/preview.11/Trace-0.1.0-preview.11-Windows-x64.zip
- ZIP SHA256：22bb8ae77255c31ee8ebcfb9444134cc114b068f1dd416531838731df2d4ec27
- ASAR SHA256：5b471c22e1eeaa7ca88d140042da6a94173e5eae22a09079e05aadf8cb35b0f7
- Native SHA256：7414bd4f4f540bca889ae5bf03805272a4ca0784b2ccb89b43c25dab3fd761b2
- 短门禁：artifacts/m8/final-latest.json（11 阶段、97 个包文件）

原始 EBU、真实 96 kHz/完整驱动变化、混合系统 DPI、独立干净 Windows 和用户主观复验继续开放。下一步在资源门禁运行期间开展 M9 时频缓存与 2D 数据规范；不把 M8 或单次评分当作整个目标完成。
