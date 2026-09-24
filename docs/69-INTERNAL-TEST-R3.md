# 69 · 同事内测分发包 R3（preview.30）

2026-09-24：基于已完成的三项 P1 修复、回归测试和 M7 布局验证，重新构建独立的 Windows x64 内测分发包。版本为 `0.1.0-preview.30`，分发修订为 `InternalTest-r3`；保留 preview.29 R2，不覆盖历史包。

R3 对应的修复、审查和本机源码验证见 [13](13-HANDOFF.md) 与 [68](68-INDEPENDENT-CHANGE-REVIEW.md)。快速上手 PDF 沿用 preview.28 手册，分发说明会明确标出当前版本与验证边界。远程 Windows CI 按用户决定暂缓。

## 交付

- 同事内测包：`dist-trace/internal-test/LeoMoon-Trace-preview.30-InternalTest-r3-Windows-x64.zip`，210,509,000 bytes，SHA256 `8558a825ca44d2c84d8faf80ccb46848cdbb2b09a5d430ae157a59aa8b02d8a5`；同目录 `.zip.sha256` 可供核对。包内顶层目录为 `Trace-preview.30-InternalTest-r3`，共 105 个文件，解压后先读 `00-开始使用.txt`。
- 独立程序 ZIP：`dist-trace/preview.30/Trace-0.1.0-preview.30-Windows-x64.zip`，208,418,661 bytes，SHA256 `40680ca266905ec502c7fa58d339b5519444d4c4a8f56d5529ed2fb96e22bd72`。
- 包内 `BUILD-INFO.json` 的运行时来源为准备提交 `9c1ee2101fad6b36d5f13d1552bf5ebf469f6044`，并记录实际 ASAR、原生模块与脚本哈希。手册沿用 preview.28 PDF，分发文本已更新到 R3。

## 验证

1. 固定 Electron 40.8.3 与本机 SDK 重新构建 Trace 引擎；15/15 CTest 通过。`build:trace` 与独立 ZIP 构建成功。
2. `tools/m6/package-audit.cjs` 四项通过：ASAR 内容与当前构建逐文件一致，许可与说明齐全，无录音或上游 VST/TUI；原生模块、VC 运行库和编解码器哈希相符；可执行文件版本为 preview.30。
3. `tools/package-internal-test-r3.cjs` 通过：ZIP 完整性、中文路径解压后逐文件哈希、随包说明与个人数据排除；解压副本完成真实 WASAPI 录音、WAV/MP3 成品、重开及单实例四项，运行后包内文件哈希不变。报告位于 `artifacts/internal-distribution-1790226193475/report.json`。
4. 新打包程序执行 `tools/m7/verify.cjs`，10 阶段全过；M7 界面在 1×、1.5×、2× 各 11/11 通过，另含导航回归、包内及解压后录音冒烟、程序 ZIP 完整性与 97 个文件逐项哈希。报告位于 `artifacts/m7/final-latest.json`。

以上是本机 Windows x64 工程验证；远程 CI、独立干净 Windows 与不同声卡矩阵仍待后续内测。R3 未数字签名。
