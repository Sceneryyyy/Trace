# 49 · M10 3D 接入 / preview.19

2026-09-17。M9 已完成工程交付；M10 已接入同一声谱图仪器。preview.19 长测在来源切换时发现绑定前的过期请求，已由 preview.20 修复；25 阶段短门禁通过，新的 1800 秒 GPU 门禁运行中。尚未关闭 M10，也未开始最终产品复评。

## 已接入的能力

- 同一仪器内 2D/3D 切换，复用 M9 的原始分析和显示数据；文件、实时与固定缓存保持原来的来源与时间轴。
- 拖动旋转、滚轮缩放视角，正面/侧面/斜视/俯视、视角复位、高度和细节设置。线性时间刻度支持共用定位与选区。
- 三条轴分别表示时间、频率和 dBFS 显示高度。3D 网格的像素汇总值与原始频点查询仍分开；改变相机不改变 FFT、历史 I 或播放位置。
- 当前游标与选区映射到表面；数据使用包的实际时间范围映射至当前视口，跨来源/配置仍执行绘制前校验。
- 无 WebGL 及 GPU 上下文丢失时回到 2D，保留当前来源；恢复重建 GPU 资源，或由用户“重试 3D”。录音不依赖图形生命周期。
- spectrogramSettings 升为 v2，v1 保留 FFT/声道/坐标设置并默认 2D。损坏的相机设置回退为默认相机，不重置已有效的分析配置。

## 实机发现及修正

首次共用刻度测试发现父容器高度为 0，实际点击落在下方读数行；已明确保留 26 px 刻度高度。测试记录了 elementFromPoint 命中结果，修正后拖选区通过。

矮宽仪器中原始投影使图形缩成小方块、标签重叠。图表采用适合数据轴的横向投影比例，拾取与标签使用同一矩阵；对小高度减少刻度数量并避让标签。此处显示比例不表达物理空间比例，不改变时间/频率对应值。已查看真实文件 3D 截图。

图形能力探针确认本机 RTX 4080 SUPER / ANGLE D3D11 可用。上下文扩展对象必须在丢失前保留，恢复时重建所有图形资源。探针同时跟踪真实 create/delete API 调用，确认相机变化不增加对象，销毁后 buffer/program/VAO/shader 持有计数为 0。

禁用 WebGL 的测试首先确认 getContext 返回 null，再检查产品 2D 降级。测试进程通过 Electron webPreferences.webgl=false 控制，普通产品不受测试选项影响；没有把“命令行加了开关”直接当成 WebGL 已禁用。

## 设置保存的 Windows 文件锁修复

完整回归遇到 trace-settings.json 原子替换的 EPERM，失败报告保留。此前同步写入使设置保存失败直接打断导出操作。

PreferencesWriter 现使用串行、可合并的异步写入，唯一临时文件与原子替换；仅对 EPERM/EACCES/EBUSY 做有界退避重试。原配置不提前删除，连续编辑只保留最新待写快照，正常退出等待最后写入。持续失败用独立“设置未保存 / 重试保存”提示，不把它当成声音来源故障。

测试覆盖暂时失败、永久失败、快速编辑合并与 flush 等待。真实 Windows 独占文件锁测试中，命令约 4 ms 返回，发生 5 次重试，录音帧从 60,480 增至 101,760；解锁后最新配置落盘，录音正常结束。证据 artifacts/m10/preferences-lock-1789589151066/report.json。该测试仅锁定隔离测试配置，不操作用户当前配置。

## 验证入口与边界

- test/spectral-surface.test.mjs：最大值/缺口/静音、相机变换与反解、拾取、最大存储和无效输入。
- test/surface-settings.test.mjs：迁移、坏相机回退、纯显示参数不改变分析身份。
- tools/m10/render-probe.cjs：实际 shader、100 次相机变化、上下文丢失/恢复和 API 对象释放；合成几何有明确标识。
- tools/m10/workspace-ui.cjs：真实文件 2D/3D 同窗读数、相机与细节、共用选区、GPU 故障降级、REC 中持续写入、重启设置与源 hash。
- tools/m10/no-webgl.cjs：实际禁用 WebGL 后的 2D 降级。
- tools/m10/preferences-lock.cjs：真实 Windows 锁期间的命令响应、录音和最新设置保存。
- tools/m10/verify.cjs：上述流程、多 DPI、全部受影响旧流程、包/ZIP/中文路径门禁。
- tools/m10/resources.cjs：计划 1800 秒真实 GPU 流程，最高 FFT/网格、周期显隐、强制丢失恢复，沿用原内存/丢帧门槛并检查图形分配上限。

首个运行候选 preview.18 的失败记录保留；修复后的目标为 preview.19。最终独立包与长测结论以对应报告为准，不能用原型检查或截图代替。原 EBU/96 kHz 真实采集/物理驱动/混合系统 DPI/干净 Windows 和人工主观验收继续独立跟踪。

## preview.19 短门禁与运行身份

**24 阶段 / 150 JS pass**：artifacts/m10/final-1789589279738/report.json。包括原生数值/服务、M9 全部场景、3D 三组进程缩放各 6 项、实际禁用 WebGL 降级、真实 Windows 文件锁、包/ZIP 97 文件及中文路径重定位。已查看真实文件 3D 截图，姿态变化、底部选区和单位布局可读。

- 入口：dist-trace/preview.19/win-unpacked/Trace.exe。
- ASAR SHA256：2aaf12362cac920dc2e039024b4104c74fc993c6e83bed89ec77d5d7d0cabb04。
- Native SHA256：7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。
- ZIP：Trace-0.1.0-preview.19-Windows-x64.zip，207,170,283 bytes，SHA256 95a176fa744d410a633bde3b2e3d10a3ad2322b6d0e812b4f7b34ffc87c11d0c。

新 GPU 资源任务：artifacts/m10/resources-1789589444537/report.json，1800 秒，最高 FFT/高细节表面、周期显隐并强制一次上下文丢失/恢复，保留原内存/丢帧阈值。该任务后来以 fail 结束，详情及新候选的复测见下方；原包与失败证据保留。

### preview.20 来源切换修复与复验

上述 preview.19 资源任务实际在约 300 秒 REC → LIVE 后终止 fail：错误为 STALE_SPECTROGRAM_SOURCE。解析请求时引用已过期、尚未建立绑定，原先的“绑定无效则丢弃异常”检查覆盖不到这一阶段；原报告和录音保留。

应用解析器现在仅在确证来源/epoch/可见性不匹配时抛出 SpectrogramContextChanged，发布 cancelled 控制状态；前端重新查询当前来源。原生失败、文件读取失败和当前来源故障仍是 error，未按字符串一概忽略。加入确定性停止后旧引用请求测试，取消路径通过；60.402 秒 GPU 复测（含强制丢失/恢复和录音转 LIVE）通过。

preview.20 完整短门禁 **25 阶段 / 151 JS pass**：artifacts/m10/final-1789591500935/report.json。

- ASAR：0bfc600d6121cd601f3c8600564b33d1c796bc79d4c70fa79029905a32e3b231。
- Native：7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe。
- ZIP：Trace-0.1.0-preview.20-Windows-x64.zip，207,170,574 bytes；SHA256 96ab0f5d166da55cd6d049cfc00e6a8152f22bc313b41c63c38b87e7e5b2dfd2。
- 新长测：artifacts/m10/resources-1789591713041/report.json，1800 秒，原阈值不变，取消计数与真实错误计数分别记录；最终结果仍待收取。

下一步：收取完整短门禁，执行 1800 秒 GPU 资源流程与录音完整性检查。完成后关闭 M10 工程关口，推进 M11 的目标、事件和报告，再完成 M12 导入/参考比较及原八维复评。
