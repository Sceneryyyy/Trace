# preview.31 快速上手插图

来源：`tools/audit/renderer.cjs` 加载仓库当前 React、CSS 和 Canvas，在 Linux 无头 Chromium 中绘制。IPC、设备名称、波形和读数都是明确的模拟示例，不含个人录音；这些图不证明 Windows/WASAPI、计量精度或真实 GPU 已通过验收。

`workbench.png`、`waveform.png`、`layout-toolbar.png` 用于新版 PDF；`themes.png` 展示五主题设置。`capture.json` 保存版本和来源范围。更新手册素材：`node tools/audit/renderer.cjs --capture-docs`；需要 Chromium 或 `TRACE_AUDIT_CHROMIUM` 指定浏览器。普通回归不加该参数，只在忽略的 `artifacts/release-cloud/renderer-*/captures` 留图，避免改写提交的素材。

PDF 使用 Noto Sans SC（[Google Fonts 来源](https://github.com/google/fonts/tree/main/ofl/notosanssc)），许可为 [SIL OFL 1.1](NotoSansSC-OFL.txt)。源变量字体 SHA256：`a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`；本轮通过 fontTools 实例化 400/700 权重后嵌入 PDF 子集，完整字体仅在忽略的 `.tools/fonts`，不提交字体二进制。

Linux 生成 PDF 时将 `TRACE_PDF_FONT_REGULAR`、`TRACE_PDF_FONT_BOLD` 指向有许可的 TrueType 字体；Windows 默认继续读取本机微软雅黑。执行 `python tools/docs/build-quick-start.py` 和 `python tools/docs/check-quick-start.py`。preview.28 PDF、截图和 R3 包保留历史身份。
