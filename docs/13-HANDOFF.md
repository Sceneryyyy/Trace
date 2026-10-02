# 13 · 当前状态与下一会话

更新：2026-10-02。默认开发分支 `recorder/dev`；源码仓库根为当前 checkout（本次云端 `/workspace/Trace`）。项目规则见 [AGENTS.md](../AGENTS.md)，全部资料见 [文档索引](README.md)。早期会话已移至 [交接历史](archive/13-HANDOFF-HISTORY.md)，其“下一步”和当时分支状态不代表当前待办。

## 源码与分发身份

| 项目 | 当前记录 |
| --- | --- |
| 源码 | `0.1.0-preview.31`，最新业务修复提交 `2995174` |
| Git | `Sceneryyyy/Trace`，默认开发分支 `recorder/dev`。2026-10-02 已核对远程起点 `d2981fd`；用户随后授权将修复提交 `2995174` 与本轮文档整理一并提交/推送。文档整理由包含本记录的文档提交交付，最终同步状态以远程 `refs/heads/recorder/dev` 为准 |
| 仪表主题 | 实现 `2938c8e`、审计修复 `c67e9e9` 等已于 2026-09-30 合入 `recorder/dev`；用户已验收开发构建并接受 71-D5 差异 |
| 最近已验证分发包 | Windows x64 preview.30 / InternalTest-r3，来源 `9c1ee21`，包名/校验见 [69](69-INTERNAL-TEST-R3.md) |
| preview.31 分发 | 尚未重打包；当前 PDF 仍对应 preview.28，R3 包仍是历史交付快照 |
| macOS | [70](70-MACOS-PORT-PLAN.md) 方案已记录；当前分支的 Trace 后端仍为 Windows/WASAPI，Mac 实现/实机验收未完成 |

## 最近完成的代码工作

[73](73-CLOUD-CODE-REVIEW.md) 的五项问题与两项已有缺口已在 `2995174` 修复：

- selector 跨快照复用相等输出，避免顶栏随音频快照重渲染。
- 导出保存并继承原采集完整性；旧导出通过元数据追溯，缺失/循环来源为 unknown。
- 固定内存缓存及选区保存携带按帧质量；ReplayFreeze v3 / quality v1，保存、重载、回听和报告保留 estimated/gaps/unknown。
- 报告事件跳转释放输出并恢复原监听意图，保持静默定位。
- 录音/缓存准备失败统一恢复后台服务，包括另存；退出、维护、活动录音状态保持暂停。
- 显示估计静音/未知完整性提示；主题首帧缺失 paint 不再被计为通过。

Session v2、Request v1、Meter v4、磁盘分析缓存 key v3 保持；新增质量字段向旧记录兼容。具体类型与边界见 [03](03-AUDIO-METERING.md)、[04](04-DATA-FORMATS.md)、[05](05-UI-UX.md)、[06](06-CONTRACTS.md)。

## 已运行与未运行

`2995174` 提交前云端最终检查：`npm run typecheck`、`npm run test:trace` **233/233（47 文件，0 fail/skip）**、`npm run build:trace` 通过。真实 React + Chromium 订阅专项中，相同 30 次快照的额外 render 为 0，props/值变化仍更新；新增可移植 C++ ReplayQuality 10 cases 通过。业务回归含真实 DeliveryService 失败后另存、保存→重载→回听→报告质量链路。审计阶段其他 C++ 数值检查与具体证据见 73；本地日志在忽略目录 `artifacts/cloud-audit/`、`artifacts/cloud-regression/`。

最新修复未执行 Windows 原生 addon、全量 CTest/native、WAV 写盘质量日志及真实设备资源验收；未运行完整主题 flow、真实首帧、YouTube 三分钟、物理拔插/96 kHz、磁盘拥塞、GPU/DPI、60 秒退出看门狗故障注入或 preview.31 分发包。新增按帧质量环每对象最高约 5.49 MiB，需要实机资源检查。历史 Windows 通过记录仅适用于各自的源码和包。

## 本轮文档整理

已按用户要求盘点所有受版本控制的说明文档，清理兼容入口 `TRACE-README.md`、开工包自检 15 和已被后续提交替代的临时交接 65；保留来源、许可、阶段设计/数值证据及发布校验。重写开发入口/环境/当前接口，勘误分支、版本、提交时态和过度的性能验收结论，建立文档索引。清理范围与检查结果见 [74](74-DOCUMENTATION-CLEANUP.md)。用户已授权本轮 Git 提交与 GitHub 推送，沿用 74 的文档检查并再次检查提交范围、空白和远程基线；未构建新包。

## 下一项可执行工作

Windows 可用后，在仓库根执行 `.\Trace.ps1 -Action Engine`（构建并自动执行 CTest），随后运行 `.\Trace.ps1 -Action Check` 与主题 flow，确认新质量字段的原生边界及严格首帧断言，再按用户最初场景播放约三分钟在线视频，交叉操作监听/录音/回听/报告跳转/缓存保存。

继续单列：官方 EBU WAV、真实 96 kHz/驱动矩阵、干净 Windows、混合 DPI/真实 GPU、看门狗验证；M13 的 3D 游标三角、实时帧时间、显示器/色弱用户体验及 preview.31 PDF/内测包。公开测试 PB3–PB5 状态见 [59](59-PUBLIC-BETA-READINESS.md)，不能因工程评分或旧包通过自动放行。Mac 下一步在 Apple silicon 真机执行 70 的 M-MAC0/T00 探针。

当前实际阻塞为只有 Linux 云环境；已运行的云端代码检查通过。本轮文档检查单独记入 74，不复用为新的音频验收。
