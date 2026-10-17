# preview.35 界面示例

来源提交 `3e665d92f0fc95b245956347fad56e0b43707107`，2026-10-17，1280×800 CSS px。使用实际 Trace React/CSS/Canvas，在 Chromium 中注入模拟 IPC、设备、合成波形与计量读数；这些图用于说明操作与布局，不证明 Windows 真实采集、计量数值、GPU、系统 DPI 或用户验收。

- `workbench.png`：实时工作台，设备/保存摘要及仪器最大化和更多入口。
- `settings.png`：设置的显示分类与海蓝主题预览；切分类保留草稿，应用后保存。

运行 `node tools/audit/renderer.cjs` 后，从输出报告的 captureDestination 目录取得 `workbench.png` 与 `themes.png`，后者在本文档中命名为 `settings.png`。图片是执行时的完整界面截图，未拼贴外部应用或修改音频数据。来源及 SHA-256 见 [sources.json](sources.json)。品牌沿用项目自身资源，字体及组件声明见 [第三方声明](../../../THIRD_PARTY_NOTICES.md)。

旧 preview.28/31 截图与 PDF 保留原版本，未覆盖。当前实现及 CI 边界见 [89](../../89-FRONTEND-SIMPLIFICATION-ITERATION.md)。
