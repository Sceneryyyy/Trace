# 13 · 当前交接

更新：2026-10-18。后续 agent 先读本页和 [07](07-BACKLOG.md)，其余按任务读取 [文档索引](README.md)；不要遍历归档或整份验证 JSON。源码根为本 checkout，规则见 [AGENTS.md](../AGENTS.md)。

## 身份与同步

| 项目 | 当前记录 |
| --- | --- |
| 源码 | `0.1.0-preview.35`，产品来源 `3e665d92f0fc95b245956347fad56e0b43707107`；实现与验收范围见 [89](89-FRONTEND-SIMPLIFICATION-ITERATION.md) |
| 分支/PR | [PR #3](https://github.com/Sceneryyyy/Trace/pull/3) 已于 2026-10-18T08:13:45Z 合入 `recorder/dev`，合并提交 `4d1fc0b89b4b1522f019490d86c42106a8a4acf3`；PR head=`1ec9585`。PR #1/#2 亦已合入，本地已快进同步 |
| 工作区 | 文档复核、71 份阶段归档与入口精简提交 `1ec9585` 已推送并合入；本次合并状态补记为文档增量，最终提交以 Git log 为准。产品代码未改，先查 git status/log 再同步 |
| 工程候选 | Windows x64 preview.31 / `2aee519` / CI `38099859270`，私有附件 `11688230696`，未签名；不是 preview.35 包 |
| 历史交付 | preview.30 / InternalTest-r3 来源 `9c1ee21`；PDF/截图各保留原版本，本轮未生成新包或 PDF |

默认开发分支 `recorder/dev` 已包含 preview.35 与文档归档。同步前检查本地修改/分叉，干净且无分叉时使用 `git pull --ff-only origin recorder/dev`；不能 reset 覆盖用户工作。

## 最近交付与验证

UI88-00～09 云端内容完成：上下文摘要/设备模态、仪器更多菜单、单版本详情、报告三分区、分类设置、A/B/3D 高级区、目标与故障分层；L86 列表规则、文件保护及既有计量语义保留。

[完整 CI 39035516698](https://github.com/Sceneryyyy/Trace/actions/runs/39035516698) 已成功：Linux/Windows portable 各 321/321；Windows CTest 19/19、原生/媒体 68/68；Linux ASan/UBSan 核心 8/8＋原始 EBU 1/1；两端适用 WAV 68/68、数值 112/112、一致性 204/204，两个多声道排除。实际 PR 测试提交 `11831764ebad1fb0be9aa6cfb2fb36e88b08b507` 与交付源码树相同（`b0d76559b16f355776f68003c5ffa9d1f63c9f7e`），两端 sourceDirty=false。

前端实际 React/模拟 IPC：frontend 11、library 13、renderer 9、P0/P1 9、selector，以及本地 60 组合布局检查通过。完整来源/分片哈希在 [frontend-verification.json](release/frontend-verification.json)，只在追查证据时读取所需字段。依赖 pin 不变，完整/生产 npm 审计在原记录日期为零；不把文档修改当作新扫描或新产品测试。

正式合并另触发 [CI 39110640618](https://github.com/Sceneryyyy/Trace/actions/runs/39110640618)（来源 `4d1fc0b`），本次补记时仍在运行，不能写为新一轮已通过；后续以 Actions 最终状态为准。

## 未关闭边界

真实 Windows 设备/听感、96 kHz 采集、两小时录音/物理故障、GPU/系统 DPI/首帧、原生对话框、独立用户及正式发布按 [76](76-RELEASE-CHECKLIST.md) 待验。macOS 仅有方案（70），R83-09/10 为 P2，未纳入本轮。源码实现/云端模拟/无声卡候选加载不能替代实机验收。

Meter v5、Session v2、Request/Reply protocol v1、文件分析 key v3 保持；修改音频/存储/接口先读 03/04/06。FFT 来源/hash/许可与数值对照保持；图标输出在忽略的 `build/trace-icons/`，品牌素材不覆盖。

## 下一会话接力

1. 检查目录及 Git 状态/分支，接续已合入 PR #3 的 `recorder/dev`；按用户新方向开发，不重复已完成的合并/归档。
2. 云端 UI88 已完成，不重复基线和完整 CI；有 Windows 后按 76 收集真实设备/视觉/回听反馈，下一版本范围写入 07。
3. 后续候选需绑定目标源码并补匹配的包/手册与发布证据。签名、组件分发复核和用户测试分别关闭。

构建/专项复现命令见 [09](09-WINDOWS-SETUP.md)。私有 EBU 用 `python3 references/ebu-loudness-test-set-v5/prepare.py` 还原核验；公开源码归档不含素材，强制模式缺素材须失败。`artifacts/` 原始日志、截图及本轮归档检查不随 clone 下载；旧阶段证据和历史交接统一从[归档索引](archive/README.md) 按问题查找。

本轮归档只执行迁移/引用/内容保全/阅读量检查，未重跑产品、Windows 或音频测试；检查结果见[归档记录](archive/README.md#本轮归档与验证)。
