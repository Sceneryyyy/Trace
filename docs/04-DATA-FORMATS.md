# 04 · 会话、音频、缓存与恢复

M10 / preview.19：spectrogramSettings v2 增加独立 surface 显示选项（2D/3D、相机、高度、细节），v1 保留原分析设置并迁移至默认 2D；坏相机仅回退相机。分析键及原始时频缓存不包含这些显示选项。设置写入改为有界队列、唯一临时文件、原子替换与短暂文件锁重试，退出等待最新快照；永久失败保留旧配置并提示重试。见 49。

M9 服务增量：时频缓存采用独立的 128 字节头、log32/状态掩码及 SHA256 校验，缓存键包含来源/解码范围/算法配置。preview.17 原始/派生缓存合计：FILE 原始块 48 MiB、合计 64 MiB；实时/录音/固定缓存仅内存，原始块 96 MiB、合计 112 MiB，预留在途/显示预算；过期块淘汰。显示格最多 1024×512，聚合值与原始点查询分开，部分覆盖显式标注；见 43。主进程来源关闭/库清理生命周期及 2D 已接入，见 46。workspace v3 保留 v1/v2 布局并添加默认隐藏的声谱图；spectrogramSettings v1 独立保存。未验证内容身份阶段只用本次打开的内存缓存，获得内容分析键后才持久化；不改变原会话 schema 或 LUFS 缓存。

M8：workspace 升为 v2，保留 v1 原布局及预设，新增 spectrum/soundfield 叶子默认隐藏；instrumentSettings v1 独立保存分析和显示设置。仪器查询至多两个异步任务、两个结果缓存，实时仅复制最多 5 秒上下文；未录音不产生新音频文件。格式/时序详见 41/42。

M7：trace-settings.json 新增独立 workspace 字段，version 1 包含 layout、presets（最多 20 个自定义预设）、activePreset 和 locked。实际类型见 workspace.ts；树节点 row/column/ratio/first/second，四个唯一仪器叶子。纯显示选项包括响度视图、电平读数、历史曲线可见性；最大化不持久化。缺失/坏配置只回退布局，不丢弃录音目录/监测意图/目标。原会话与音频分析缓存版本不变，见 39。

preview.4：内存历史元数据 v2 增加原子来源/epoch/起点映射；磁盘 schema 不变。未录音不写临时音频；历史查看采用独立有界快照，后台继续缓存，见 31。

状态：当前会话 schema v2，支持加载 v1。多区域写入、会话视图和恢复见 23；二进制分析缓存仍为独立的 schema v1。示例保留早期规格参考，压缩资产尚待 M5。

## 持久化结构

每次 REC 生成独立 take 目录，目录内 `session.json` 为清单，`journal.jsonl` 为录制/恢复日志；`audio/` 保存当前仍保留的源分段和成品；`cache/` 保存可重建的二进制波形/计量块。所有媒体路径相对会话目录，避免换盘后失效。

应用设置和音频文件分开：设备选择、窗口布局、输出预设放本机配置；不将个人录音写入源码目录。未按 REC 的 LIVE 只允许写一般设置/诊断元数据，不写任何音频临时文件。

| 对象 | 必要字段与约束 |
| --- | --- |
| Session | schemaVersion、sessionId、createdAt、状态、takes、assets、segments、events |
| Take | takeId、实际起止边界、sourceFormat、outputPreset、measurementConfigId |
| Asset | assetId、role(source/deliverable)、relativePath、codec/container、sampleRate、channelCount、sampleFormat/bitrate、decodedFrameCount、状态、hash |
| Segment | segmentId、takeId、assetId、captureEpochId、captureStartFrame、assetStartFrame、frameCount、timelineStartNs、sampleRate、gapBeforeNs |
| Event | 类型、严重程度、所在 epoch/帧/会话时间、可恢复性；未知位置不得填造值 |
| Analysis | assetId、analysisVersion、measurementConfigId、内容标识、索引步长、有效范围、汇总、状态 |

所有音频帧、长时间纳秒以十进制字符串存 JSON；原生侧 uint64；图形层转成局部可视区浮点秒。`null` 表示未知，不用 0 占位。资产完成后记录内容哈希；写盘中可先用稳定 assetId 和 revision，但不能把未完成内容标成最终哈希。

示例见 [session.example.json](../examples/session.example.json)。文件中的 `exampleOnly:true` 标记说明它是规格示例，实际读取器不得把它当作可播放媒体。

## 文件格式

| 格式 | 首版规格 | 注意事项 |
| --- | --- | --- |
| WAV PCM | 16/24-bit；44.1/48/88.2/96 kHz 或跟随 | 合法 RIFF/WAVE 头，声道和帧数按真实内容写入 |
| WAV float | 32-bit IEEE float，同上采样率 | 不将 float 写成 integer PCM 格式标志 |
| MP3 | 44.1/48 kHz，CBR 预设与经验证的 VBR | 无 96 kHz 选项、无 PCM 位深选项；正确处理 delay/padding |
| AAC | AAC-LC，44.1/48 kHz，M4A 或 ADTS .aac | 扩展名、封装和实际编码一致；ADTS 需要自身定位索引 |

保存预设示例见 [export-presets.example.json](../examples/export-presets.example.json)。能力发现是运行时真实编码器能力和产品允许范围的交集；即使 AAC 编码器支持 96 kHz，首版也不因此开放该选项。

WAV 默认跟随来源、24-bit。若源本身为整数且格式匹配，可直接写；常见浮点源向整数转换时处理溢出检测与可选抖动。默认不自动归一化或加限制器；检测到会削波时给出明确状态，并保留恢复依据。升位深或升采样不能宣称恢复源中不存在的信息。

## 持续写盘与分段

使用分块写入和预分配缓冲。首版优先采用兼容 RIFF 的自动分段策略：每个 WAV 数据段在 2 GiB payload 前按完整帧边界切分，留足格式头空间；会话看成一条录音。RF64 可后续加入，不让普通 WAV 越过 RIFF 大小字段。

参考容量：96 kHz、双声道、24-bit 约 2.0736 GB/小时；float32 约 2.7648 GB/小时（十进制 GB，仅音频数据）。预估同时包含临时源、成品和缓存，不只显示最终 MP3 大小。

每个实际分段有自己的采样率和帧数。系统重设导致采样率改变时完成旧段、重开 epoch 和新段，记录缺口。不同采样率的裸 PCM 不能直接追加进同一个 WAV 数据区。会话时间通过分段前缀时长映射，而不是假设整段 96 kHz。

跨采样率会话的整段 I/LRA 需明确分析时间基准：对“拼接回放视图”选定一个固定分析率，流式重采样后统一分析，并标为“会话视图统计”；不得平均各段 LUFS。各原始段仍保留本段原采样率统计。未知时长缺口使全会话连续性状态降级，统计说明只覆盖已恢复音频。

## 生成成品

无需转换的 WAV 持续写入；需要转换的 WAV/MP3/AAC，先在选定录音目录下保存可恢复的源 PCM/WAV，再由后台任务生成临时成品。任务状态为 queued、running、verifying、ready、failed、cancelled；停止 REC 只意味着捕获结束。

生成流程：冻结源资产边界 → 编码/重采样到临时目标 → 完成封装 → 检查可解码、采样率、声道、帧数/时长 → 原子替换到最终文件名 → 为成品建立独立缓存 → 按保留策略清理临时源。若目标重命名或校验失败，不能删除唯一源文件。不会通过覆盖旧录音实现“重录”。

FFmpeg 参数使用固定程序路径和参数数组，避免 shell 字符串拼接；默认不覆盖已有文件。支持取消，取消只清理该任务明确拥有的临时成品，源文件仍保留。录音期间限制编码并发，避免吞掉写盘资源。

当“不另存原始 WAV”时，源 PCM 清理前必须保证成品及其定位/分析所需信息已经独立可用。用户主动选择保留原始文件时，source 与 deliverable 同时列出，不自动互换回放来源。

## 缓存格式

波形采用多分辨率 min/max 二进制块，按声道保存。计量历史采用独立块：10 ms 电平、100 ms 响度；记录索引原点、步长、长度、状态掩码和数据版本。建议按固定时长页分块并用磁盘索引查询；首版不需要把每 10 ms 样本写成庞大的 JSON 数组。

测量缓存键至少包括：资产内容哈希、实际采样率/声道、分析引擎精确版本、模式/窗口/声道映射、边界处理、缓存格式版本。只改颜色或缩放不失效；文件内容、采样率或算法改变就失效。缓存损坏时隔离并重建，不能修改原始媒体“配合”旧缓存。

JSON 禁止 NaN 和 Infinity；数值为空时附 ready/silence/insufficient/gap/error 状态。不同资产的历史不能只凭“文件名相同”共享。导入/转码后 decoder delay、padding 和实际解码帧原点进入索引映射。

## 恢复与一致性

清单使用同目录临时写入后替换；journal 以带序号的事件记录 begin、segment、checkpoint、close、export。周期性记录已写完整帧数与文件位置；写盘和系统缓存刷新频率应权衡并记录，不能声称突然断电零损失。

重启发现未完成 take：只读取已确认的完整帧，核查实际文件长度，按格式补/修文件头，截断不完整尾帧时先保留副本或恢复文件，不覆盖唯一损坏源。结果标为“已恢复”，记下可能丢失的尾部和未知缺口。源 WAV 与完整编码容器是不同恢复对象，不假定未 finalize 的 M4A 可直接播放。

故障场景见 A13；完整性优先级为：已捕获音频 → 位置与故障记录 → 可重建缓存 → UI 状态。

## M3 实际缓存布局

当前 schema v1 的二进制布局、CRC、按页查询和内容绑定已在 20-M3-FILE-ANALYSIS.md 固定。正式实现为 native/src/recorder/FileAnalysis.cpp 与 src/trace/analysisCache.ts。当前计量配置 v4，旧 v2/v3 历史不能复用。原始 EBU 素材尚未验收；跨率会话使用独立的固定率 session 视图，见 23。

## 区域时间基础

当前增加 native 写入前缀 QPC、每端点 estimated 标记及 journal seq，详见 22。内容时间由实际各段帧数/率累计，设备间隔单独记录。多区域 schema v2 已接入。regions 各自保存格式、帧数、QPC 和 journal，源/恢复资产带 regionId，session 资产和 viewParts 保存规范化内容及实际映射。旧 v1 在内存归一化，写入按会话串行化；详见 23。

## 当前精度转换与削波字段

见 24。原始分段及新派生资产可带 clippedSamples 十进制字符串，计数单位是各声道采样值，不是帧。缺字段的旧资产保持未知。整数成品通过统一原生量化器计数，重采样先保持 float32 余量；asset.clipped 事件保存对应 role/assetIds/计数。float 文件自身不削波，但源整数文件已发生的削波需单独提示。

## M4 选区缓存身份

analysisCacheKeyVersion 升为 2，加入 sourceRange；选区本地原点 0、帧数 b-a，清单验证长度与边界。二进制页仍 schema 1，Meter 配置仍 v4。旧键版本拒绝复用，源 hash/原生 hash 保持绑定。源文件、整段缓存与选区缓存不互换；见 25。

## M5 导出记录

Session schema 2 增加 exports 数组，每项 ExportRecord.version=1。成品与解码 PCM 使用独立 exports/id 目录和原子发布的 export.json。记录输入来源/选区、预设、内容 hash、编码器 hash、物理解码帧数、有效帧范围和填充。AnalysisRole=export + exportId 唯一指向成品，旧 WAV assets/segments 不混入多个导出。缓存键版本 3 加入 mediaIdentity；见 26。

## M6 保留策略

RecordSettings version 3 增加可选 keepOriginal；缺省为 true，与旧设置兼容。Session schema 仍为 2，新增可选 retention 状态：pending / verifying / removing / removed / kept / error。资产新增 removing / removed 状态，摘要、恢复与分析入口排除已经整理的源资产。

仅在用户明确关闭保留、独立最终成品存在且分析核验通过后，核对全部待整理源文件 hash，先持久化 removing 再逐项整理。占用中的原始回听或导出会延后处理；失败保留可恢复状态，重启可继续。未关闭保留时不删除源 WAV；WAV 直录的唯一成品也不删除。保留元数据、成品与可重建的历史缓存。见 27。

## 临时回听与列表存在性（2026-09-16）

ReplayInfo version 1 仅在内存保存，包含连续缓存帧数、实际采样率/声道、原始监测帧偏移；不进入 Session/ExportRecord，也不生成磁盘分析缓存。

列表 availability 为 present / missing / unavailable，独立于录音和导出完成状态；每次扫描重建，不以“录音已完成”推断文件依然存在。缺失单个分段不会把其余分段静默拼成完整录音。外部恢复原路径可恢复可用状态。

移除会话/成品先验证注册路径、根目录与符号链接边界，停止相关回听/分析及保留任务，再调用系统回收站。失败保留列表记录；只有成功才更新内存/元数据。另存副本不属于内部成品路径。

## preview.9 显式保存内存历史

用户点击保存缓存后，冻结 PCM 或选区通过原生 AsyncWorker 使用已有 WavWriter 分块写盘，包含检查点与恢复日志。主线程不传递 PCM，采集线程不等待保存。使用当前录音预设，必要时复用既有重采样/MP3/AAC 成品流程。

新的 Session schema 2 可选 origin.kind=memory，记录原缓存来源、epoch、缓存原点及选区范围；新录音的区域从 0 开始，QPC 为未知，不伪装成一次新的设备捕获。保存文件独立建立分析缓存，不复用原监测累计 I。写入失败保留已写前缀并通过现有恢复入口处理；正常退出等待保存。
