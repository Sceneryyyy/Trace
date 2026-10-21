# 92 · 频谱低频连续性修复

2026-10-19。接续 [91](91-SPECTROGRAM-PORT-PREVIEW35.md) 的本地 preview.35 增量，基于 `recorder/dev@d268e5b`，未提交/推送。

## 原因与实现

用户截图的对象为频谱曲线。对数横轴低频处一个 FFT 间距覆盖多个屏幕像素，旧 `spectrumPixels` 只写入 FFT 点所在的列，其余列留为 `−∞`，画线时反复连接至图底。48 kHz / FFT 16384 的真实间距约 2.93 Hz，加大窗口不能修复这个投影错误。

`src/trace/spectrumDisplay.ts` 现在区分“没有频点落入”和“频点功率为零”：密集区继续保留每像素最大值；空列在有效相邻频点间按线性功率插值，再转 dB 并应用显示倾斜。真实零功率列、全静音及有效正频点到 Nyquist 以外的边界保持原语义。插值仅用于显示，原始数组、原生 FFT/窗函数、音频、计量与原始频点悬停不变；当前/平均/保持共用修复。

## 验证

- `test/p0-p1-analysis.test.mjs` 13/13，新增三组回归：44.1/48/96 kHz × FFT 512/2048/16384 × 80/744/1600 像素的平坦频谱、零功率/静音/窄峰与数组不变、亚频点视窗/不外推/倾斜。
- typecheck、AppBuild、portable 333/333 通过，零失败/跳过。日志 `artifacts/m9/spectrum-fix-build.log`、`spectrum-fix-portable.log`。
- `node tools/m9/spectrum-continuity-ui.cjs` 用明确标识的确定性合成噪声，经实际原生 FFT 和 Electron canvas 绘制。48 kHz / FFT 16384、100%/150% 光栅倍率下，20–300 Hz 共 296 个曲线点均无虚假落底；悬停 199.2 Hz / −66.1 dBFS，切显示平滑/倾斜后保持原值，PCM hash 不变。报告与已查看截图位于 `artifacts/m9/spectrum-continuity-1792385935748/`。
- UI 探针首次 seek 缺少 playbackId 被现行契约拒绝；补齐请求后重跑通过，产品契约未改。
- 本次未改变原生代码，未重复上一轮的 native/media 68/68、CTest 19/19 或声谱图 WebGL 专项；这些是 [91](91-SPECTROGRAM-PORT-PREVIEW35.md) 中同日先前结果。

## 本地验证包

新输出目录为 `dist-trace/preview.35-spectrum-fix/`，运行 `win-unpacked/Trace.exe` 时保留完整目录。包含之前声谱图三项移植和本次频谱修复；旧程序运行中，未关闭或覆盖它。版本仍为 `0.1.0-preview.35`，以目录及同目录 `LOCAL-VALIDATION.json` / `SHA256SUMS.txt` 区分本地包。

ZIP `Trace-0.1.0-preview.35-Windows-x64.zip` 为 150229853 字节，SHA-256 `1536f1bcb1b2e6b6fc1c65fd03c75aae9ae5b37a056407f98ae32dca1bb4cfa2`；110 个文件与应用目录逐一校验一致。ASAR SHA-256 `a99fe93ae03d443084c7f3227759d8f56960c20d52ec3fab3954a4213cbd9691`。新包审计 5/5、实际启动/自带原生模块/主题保存重启通过；报告在 `artifacts/m6/package-audit-latest.json`、`artifacts/release/package-load.json`，构建日志为 `artifacts/m9/spectrum-fix-package.log`。

复现打包时在当前进程设置 `TRACE_BUILD_TAG=spectrum-fix`，然后运行 `node tools/package-trace.cjs`；包审计和加载探针使用相同环境变量。tag 仅接受小写字母、数字与单连字符，默认不设置时仍输出版本目录。不修改全局环境。

用户下一步正常退出旧程序，打开新目录中的程序，以同一素材、FFT 16384 和原有平滑设置复验低于 300 Hz 的连续性及原始频点读数。真实 WASAPI/听感、系统混合 DPI、96 kHz 实录与长测仍待用户专项；自动化使用合成文件，不替代这些验收。未签名、未触发远程 CI。
