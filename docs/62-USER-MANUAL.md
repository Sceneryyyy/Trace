# 62 · 用户手册核对与 PDF 快速上手

2026-09-17。适用软件：Trace 0.1.0-preview.28；手册版本：1.0。

2026-10-02 状态：本文为该版 PDF 的交付与质量记录。PDF 已纳入 preview.30 / R3 的历史包，但不包含 preview.31 主题与最新质量提示；[28](28-USER-GUIDE.md) 已更新为当前源码指南。preview.31 PDF 现已生成，见下方新增交付；旧包/PDF 保持历史身份；[preview.28 PDF](../output/pdf/LeoMoon-Trace-Quick-Start-preview.28-zh-CN.pdf) 已纳入源码版本控制；渲染/QA 报告位于忽略的 artifacts，克隆不会附带这些报告。

## 核对结果

项目此前已有 `docs/28-USER-GUIDE.md`，软件包中对应 `README-Trace.md`。它覆盖主要功能，但属于文字使用说明，未提供成册 PDF、界面图解和面向新用户的任务顺序，且有少量旧条目。

本次修正：

- 报告和外部参考比较已交付，不再写为“后续推进”。
- 仪器列表补上参考比较。
- “实时页”改为“实时视图”，符合统一工作台。
- 验证说明补充 M12、PB1/PB2 与品牌版本入口，不仅引用旧 preview.9 文档。

## PDF 交付

文件：`output/pdf/LeoMoon-Trace-Quick-Start-preview.28-zh-CN.pdf`。8 页 A4 中文，采用 LeoMoon / TRACE 品牌、绿青色强调、可检索文字、嵌入中文字体和内部导航。

| 页 | 内容 |
| --- | --- |
| 1 | 五分钟首次录音与章节跳转 |
| 2 | 实际界面图解与六个主要区域 |
| 3 | 录音、WAV/MP3/AAC、缓存保存与导出 |
| 4 | 历史定位、选区、循环与时间轴导航 |
| 5 | 布局编辑、命名预设与各仪器用途 |
| 6 | M/S/I/LRA/TP 口径与测量报告 |
| 7 | 外部素材、A/B、缓存/原件/成品管理 |
| 8 | 快捷键、常见问题、诊断与反馈 |

截图来自当时 preview.28 实际包的隔离配置和生成的演示信号，不使用个人录音。界面编号是 PDF 中的说明标记。它是快速上手手册，详细参数仍参照 28；没有把尚未完成的环境/硬件/官方素材专项标为已验收。

## 可维护来源

- `tools/docs/capture-manual.cjs`：从指定 preview.28 包采集截图；三张正式插图放入 `docs/assets/quick-start-preview28`，其余采集留在 artifacts。
- `tools/docs/build-quick-start.py`：ReportLab 生成源，含经核对的精简操作文案；使用 Windows 微软雅黑字体并嵌入子集。
- `tools/docs/check-quick-start.py`：核对八页主题、可检索文字、字体嵌入、八个书签、四个内部跳转、文本边界与私有路径排除。
- 内容更新时先核对 28 和实际界面，再同步生成源和版本；不要只改 PDF 文件名冒充新版。

## 验证

PDF 已完整渲染为 PNG 并逐页检查。修正了图解第三个标记的定位、选区图注和页脚线宽；最终文字/字体/链接/页面边界检查通过。机器报告：`artifacts/manual-qa.json`，页面图在 `artifacts/manual-render`。

使用 Poppler 渲染时出现系统通用 Symbol/ArialUnicode 显示字体配置提示；本 PDF 中文字体子集已实际嵌入，八页渲染、文本提取均正常，未出现缺字方框或裁切。

本轮是文档交付，未修改业务代码、未重打包 preview.28，也未重复音频测试。现有 ZIP 内的 README 仍是原交付快照；新版 PDF 单独提供，下一次重打包可同步纳入。无工程阻塞。

## preview.31 新 PDF（2026-10-02）

[新版 PDF](../output/pdf/LeoMoon-Trace-Quick-Start-preview.31-zh-CN.pdf)：8 页 A4，新增五主题预览/保存/取消与采集质量说明；当前 React 界面在 Linux Chromium 中通过模拟 IPC/读数绘制，截图与来源见 [preview.31 素材](assets/quick-start-preview31/README.md)。这不是 Windows 包截图或 WASAPI/数值验收证据。

生成源现在生成 preview.31；Linux 可通过 TRACE_PDF_FONT_REGULAR/BOLD 选择有许可的 TrueType 字体。本轮嵌入 Noto Sans SC 子集，OFL 许可与来源已保留。`python tools/docs/check-quick-start.py` 检查当前版；`--version 28` 可继续核查旧 PDF。新版文字/嵌入字体/8 书签/4 内部跳转/边界与逐页渲染通过，QA 在忽略的 artifacts。本轮没有将新 PDF 加入旧 R3 包；Windows 新候选组装会独立包含它，见 [76](76-RELEASE-CHECKLIST.md)。
