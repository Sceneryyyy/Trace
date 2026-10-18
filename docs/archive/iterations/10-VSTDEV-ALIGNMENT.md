# 10 · 与 VSTDev 的只读对齐

核查日期：2026-09-15。已按本项目规则检查同级 `../VSTDev`，未改动该项目。

| 核查项 | 实际证据与处理 |
| --- | --- |
| 参考仓库 | 分支 codex/sfx-rack-pro，HEAD b91f659c32ad9384d10ce0f4e3c4ea5217d57526；有大量既有未提交改动，不参与本项目 |
| 规则 | 根 AGENTS.md 不存在；读取 docs/26_开发验证与文档工作流.md |
| 技术栈 | CMakeLists.txt 明确 C++20 / JUCE / VST3 + Standalone；不是依据项目名推测 |
| 构建 | CMakePresets.json 使用 VS 2022 x64 的独立 Pro Debug/Release 构建目录、jobs=1、/MP1 |
| 验证习惯 | 按实际风险定向测试；先构建对应目标；失败分类；源码/构建/部署/用户验收分开 |
| 交接 | 当前焦点、证据身份、未验证项和下一任务写回接力文档 |
| 发布 | scripts/ 中存在部署/qualification 入口；只查看文件名，未运行 |
| UI/音频模块迁入 | 未评估到可直接复用模块；本次不移植其 DSP、UI、SDK 或打包 |

Trace 沿用独立目录、适用测试、差异归属及接力习惯。技术主路线仍为已验证的 Prism/Electron/C++ WASAPI；不运行 VSTDev 安装/部署，不修改其 SDK 或全局设置。

这次核查对象是该日期的工作树与 HEAD，不能把 VSTDev 的现有未提交内容当成已发布基线。更细的主题/音频实现对齐留到有明确复用任务时再读。
