# 68 · 2026-09-23 三批变更的独立复核

后续状态（2026-10-02）：三项 P1 已在 2026-09-24 修复、提交并完成本机回归，过程见 [交接历史](../13-HANDOFF-HISTORY.md) 与 [69](69-INTERNAL-TEST-R3.md)。估计静音界面提示已在 2995174 修正，见 [73](73-CLOUD-CODE-REVIEW.md)；该日期远程 Windows CI 实跑仍未验证；后续已完成完整 CI，最新源码及范围见 [89](../../89-FRONTEND-SIMPLIFICATION-ITERATION.md)。退出看门狗的编排/持久化云端反例已在 [75](75-CLOUD-RELEASE-PREPARATION.md) 修复并回归，实机收尾仍待验证。65 是当时三批未提交变更的临时交接，已在本轮清理，原件可从 Git 历史追溯；本复核保留独立反例与证据。

复核日期：2026-09-23。基线提交 `4fa6b21`，分支 `recorder/dev`。复核时 65 所列三批均仍在工作树，未将它们合并、提交或发布。本文件记录独立读码与验证的结果；不修改对方的实现或 65 号文档。

## 结论

测试覆盖的扩展和 P0-B、P0-D、P0-G 的主要方向合理，`recording-service.test.mjs` 将“三条有效记录”扩为“三条有效 + 三条不可读”的断言属于行为变化后的更强验证。Windows 路径测试按平台大小写规则比较，符合现有 `realpath`/归属校验设计。P0-E 的上游 Prism 采集路径未进入 Trace 包，暂不纳入当前 Trace 录音修复是合理的范围判断。

但本轮发现三个需在合并/继续分发前处理的实质问题，一个完成度遗漏。65 的“全绿”只覆盖了当前已有检查，并没有覆盖下列反例。

## 发现

### [P1] F 的回滚仍会让幸存原文件不可见

`src/trace/sourceRetention.ts:66-91` 在删除失败后按 `previous[i]` 回滚，但“应用重启时已持久化为 removing”的记录，`previous[i]` 本身就是 `removing`。再次碰到 EBUSY，文件仍存在而状态继续 `removing`。此外 `stillPresent()` 对任何 `lstat` 错误返回 false，而非只将 ENOENT 视为不存在；回滚和外层 catch 都忽略 `take.save()` 的失败，落盘清单可能继续是 `removing`。

隔离复现：使用原 `test/source-retention.test.mjs` 夹具追加两个反例（临时副本保存在 `artifacts/audit/review-retention-copy.mjs`，未改仓库测试）。一例“持久化 removing 后重试删除失败”读到幸存的 b.wav，但其状态仍为 `removing`；另一例让回滚保存返回 EACCES，最后成功持久化的清单也仍把 b.wav 标为 `removing`。原有两项测试继续通过，说明新反例未被覆盖。

改进方向：对仍存在的资产恢复为可见/待整理状态；无法确认存在性时保留为异常待处理，不标已删除。持久化回滚失败必须显式保留可恢复故障，并补重启回归。

### [P1] Windows CI 任务缺少实际构建前置条件

`.github/workflows/main.yml:101-132` 中 `trace-engine` 任务执行 `npm ci`（跳过 native postinstall）后直接 `npm run build:trace-engine`。`tools/build-engine.cjs:7-13` 明确要求本地 Electron 40.8.3 SDK 的 node_api.h 和 node.lib；该任务没有准备它们。即使 runner 恰巧缓存过 SDK，后续 native 层还需要 `native/build/Release/visualizer_dsp.node`，任务也没有调用 `rebuild:native` 来生成。该新任务从未在 GitHub Actions 实际运行，不能因本机通过而称 CI 通过。工作流注释仍写“17 CTest”，实际为 15。

改进方向：Windows 任务中显式准备固定 Electron 头文件、构建上游 DSP，再建 Trace engine，最后强制执行 native 层。首次 CI 真实运行和日志是退出条件。

### [P1] 180 秒“空闲超时”可误杀健康的长文件任务

`src/trace/fileJobs.ts:27,35-62` 用 IPC 进度或 stderr 重置 180 秒计时，超时即杀进程；`src/trace/file-worker.ts:19-32` 的 hash / copy-export / quantize / recover 路径没有期间进度，只在结束时报告一次。对大文件或慢盘，健康工作超过 180 秒就会报 `FILE_WORKER_TIMEOUT`。`analysisWorker.ts` 的 hashing 过程也只有阶段前后进度，没有按读入字节持续报告。交接写“长文件分析不会被误杀”不适用于这些阶段。

本轮没有在慢盘上重现 180 秒超时，结论来自进度路径和计时器代码。建议按任务加入有界心跳/进度，或为无进度阶段设置独立、可验证的期限；补小超时注入测试和长文件样本验证。

### [P2] A 增加了估计静音状态，但界面仍不提示

`sourceContinuity()` 对仅含 estimatedFrames 的单区段返回 `estimated-silence`（现有测试也证明）；`playbackService.ts:257` 会传给文件快照。然而 `renderer/viewModel.ts:40` 只在 `continuity==='gaps'` 时生成提示，其余均为空，`LiveInstruments.tsx:180-184` 遇空提示直接不显示。使用者仍无法在界面区分估计补零和真实静音。需要按估计静音状态给出文字/颜色之外的提示，并从文件回听测到 UI。

## 验证与边界

- `scripts/run-trace-tests.mjs portable`：202/202 通过；`TRACE_REQUIRE_NATIVE=1` 的 native 层：49/49 通过。TypeScript 检查与当前源码的 Trace 构建通过。所用原生模块是本机已有构建；本轮未独立重新构建全部原生 CTest。
- 当前源码隔离窗口：打开生成的八秒文件，游标从 2 秒移到 6 秒，共轴 DOM 位置随之变化，I 读数从 −25.2 变为 −22.4；选区统计、频谱/声场挂载通过。短暂真实 WASAPI 录音中，帧数从 10080 增至 34560，界面走带由 00:00:00.200 走到 00:00:00.680。证据与截图见 `artifacts/review-frontend-1790135869049`。
- `tools/m7/workspace-ui.cjs` 在当前开发源码和旧 preview.28 包都于第 36 行报 `2 !== 4`。这是同一陈旧选择器/预期失败，不能据此断言新前端回归；也意味着该门禁目前不能覆盖它后面的完整界面流程。
- 前端新架构的长时间压力、跨 DPI、3D 故障与完整交互尚无相应新门禁。真实 CI 也尚未触发。短流程通过不等于整批前端改动都已验收。
- 退出的 60 秒看门狗从服务 drain 前开始计时；`main.ts:828` 在超时后立即推进 app.quit，`recordShutdownTimeout()` 只排队异步写日志，未等写入完成。正常慢盘任务与主进程异常的触发/恢复都未测试。本项是需要专项验证的风险，当前没有证据证明默认 60 秒必然错误，也不能把超时日志称为可靠落盘。
- `git diff --check` 还报 `src/trace/renderer/InstrumentWorkspace.tsx:135` 的文件尾空行，属于低影响清理项。
- `TraceDev/docs/14-FRONTEND-AUDIT.md` 与 `15-CODE-AUDIT-PREVIEW29.md` 在 Git 仓库之外。65 的编号/位置提示正确；入库时应重新编号并保持原件，不覆盖 `app/docs/14` 和 `15`。

## 下一步

优先修正三个 P1 并补相应反例；补“估计静音”的端到端提示，并对 60 秒退出看门狗做卡住/慢任务注入。之后修正 M7 的陈旧测试，让它跑完后续流程；在真实 Windows CI 中验证构建。把批次 0（R2 包）、批次 1（前端）、批次 2（P0 与测试）按来源审查、分批提交和验证。当前工作树中这三批仍未提交，本次复核仅新增复核文档并更新接力入口，没有改业务代码或发布包。
