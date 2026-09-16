# 24 · WAV 成品精度转换与削波报告

2026-09-15。补齐手动重采样后的整数 WAV 削波报告。M4 尚未实现，原始 EBU/真实设备格式切换的验收状态不变。

## 问题与实现

原先手动率成品由 FFmpeg 直接输出整数 WAV，超出整数幅度范围时没有对应的已写样本计数。现将流程拆为：

1. 需要重采样/声道映射时，由已锁定 FFmpeg 生成流式 float32 中间文件。
2. 后台 file-worker 调用原生 convertWaves，分块读取同率/同声道文件，通过现有 WavWriter 写出 PCM16/PCM24。
3. 对每个实际写入的采样值，超出 [-1, 1] 时计一次削波；准确的 +1/-1 按已有量化规则映射，不计超范围。
4. 每个输出分段有 clippedSamples；会话资产、asset.clipped 事件和文件摘要持久化该数据。原始录音分段也记录独立计数。
5. float32 输出保留有限的超 0 dBFS 值，clippedSamples 为 0；不自动归一化、不加限制器，不引入抖动。

无需重采样时直接分块读取原文件。所有 PCM 扫描/量化在独立文件工作进程完成，主进程不处理全量音频，capture producer 路径不受影响。单个读取缓冲为 2048 帧，输出继续按 2 GiB 完整帧边界分段；不会把整次录音装入内存。

各 source/recovered 区域的格式不变。原始源文件保持可用；量化结果经 ffprobe 格式/帧数核对、SHA256 后才发布。转换失败不会覆盖源。会话视图包含源 WAV 已削波内容时，源削波警告仍可见，不能因视图为 float 而掩盖已损失的幅度。

## 接口与界面

- native convertWaves(sources, base, encoding, segmentBytes?)：只接受有限路径列表及明确精度；不同采样率/声道在创建输出前拒绝。使用 CREATE_NEW，已有输出不覆盖。
- fileJobs.quantizeFiles / file-worker：内部白名单任务，renderer 不能提交文件路径或直接调用转换。
- SessionAsset.clippedSamples 是可选的十进制字符串；旧资产缺字段保持未知，不伪造已验证的零。
- NativeRecordSnapshot.segments 增加 clippedSamples；源资产使用每段实际计数。
- TakeSummary.clippedSamples 为当前优先资产的计数；sourceClippedSamples 保留录音源的计数。文件列表对正计数明确提示“保存文件发生削波”或“源 WAV 发生削波”。
- 数值引擎配置仍为 v4；输入文件 hash 和原生 hash 继续参与独立缓存身份。

## 验证

- 原生 CTest 10/10。新增 7 个 precision case：PCM16/24/F32 × 单/双声道，加混合率拒绝。
- 2051 帧夹具跨 601 帧源分段、333 帧输出分段，逐样本值、每段/总削波数、总帧数、源字节不变、已有目标拒绝均通过。
- 96 kHz 单声道、常数 1.5 的明确合成夹具转换到 48 kHz：16/24-bit 输出各 2400 帧，2400 个削波采样值，解码整数值逐项为正确最大值。
- 同一夹具 float32 输出逐项保留 1.5，计数为 0；原始 float 源未变化。
- JS 生命周期/边界测试现为 28 项；原有跨率会话、停止/迟到重连、恢复、故障保护均保留。
- 实际 Electron 文件列表加载三种夹具：整数计数与警告一致，float 不显示削波警告。截图在 precision-ui-* 目录，已目视检查提示没有溢出或遮挡。
- 当前应用续录/恢复/重开/分析回归通过。完整入口：先运行 node tools/build-engine.cjs、node tools/trace.cjs AppBuild，再运行 node tools/m3/precision-gate.cjs。
- 精度 UI 使用合成素材，不能称为真实声卡过载实测或响度标准验收。

证据：artifacts/m2-regions/precision-ui-latest.json、continuation-gate-latest.json；可重复组合门禁生成 precision-gate-latest.json。源文件和大缓存仅在忽略的 artifacts 中保存。

## 下一步

M2 手动率整数成品的削波报告开放项已补齐。下一实现焦点是 M4 的文件输出与呈现位置，随后连接统一时间轴、拖动/暂停/循环和选区分析。真实 96 kHz 捕获、驱动格式变化与原始 EBU 素材继续保留未验收状态。

后续状态：M4 已接通并通过最小工程门禁，见 25；本文件保留此前 M2 阶段的实现与验证记录。
