# 44 · M8 资源增长排查

2026-09-16。M8 功能与短门禁已通过，但 preview.11 的 30 分钟资源检查未通过增长门槛，不能将 M8 标为完成。M9 当前仅有独立数据底座，尚未接入界面。

## 已验证的失败

- 原始长测：artifacts/m8/resources-1789570665775/report.json。
- 实际运行 1800.265 秒；前 300 秒录音正常收尾，之后 LIVE；droppedFrames=0、instrumentErrors=0。
- 内存绝对预算未超出，但结束阶段的工作集相对暖机基准增加超过 128 MiB，因此状态 fail。
- Native/Main 工作集基本在一定范围内波动，增长更多来自渲染进程及共享工作集；不能仅凭工作集把原因归结为 JavaScript heap 泄漏。
- 原报告和录音全部保留，副本为 artifacts/m8/resources-before-transfer.json。

## 两项候选改动

### 快照传递（preview.12）

preload 只监听一次高频快照，以 window.postMessage 转移已接收的 ArrayBuffer 到渲染主世界；主世界分发给订阅者，避免为每个订阅者重复走 contextBridge。命令和低频状态仍由隔离的 traceHost 提供，未开放通用 IPC、Node 或文件系统。

Electron 官方说明普通跨 contextBridge 值会复制并冻结：[contextBridge 文档](https://www.electronjs.org/docs/latest/api/context-bridge)。这支持减少复制的设计动机，但不是本机资源增长的根因证明。

功能/订阅测试与实际 M8 窗口 12 项通过。30 分钟复测仍在运行；早期工作集高于原版本，不能先宣称修复成功。后续根据完整结果决定保留、替换或回退该候选。

### 画布分配（preview.13）

原绘制代码每帧重设 canvas.width/height。现统一 canvasSurface：仅尺寸/DPI 变化时调整存储，每帧重设变换并清除像素；避免反复重建 backing store。绘图数据、计量和录音语义不变。

单元测试验证 100 次同尺寸绘制只有首次尺寸赋值，DPI 改变才再次分配；功能/UI 回归通过。该版本同时包含前一项传递改动，目前进行 600 秒诊断复测，不等于正式 1800 秒门禁通过。

## 正在运行的明确任务

- preview.12 / 1800 秒：exec session 23741，runner PID 7148，application PID 48148，目录 artifacts/m8/resources-1789573295492。
- preview.13 / 600 秒：exec session 8696，runner PID 71012，application PID 6260，目录 artifacts/m8/resources-1789574225764。

PID 可能在后续退出；恢复工作时先核对进程/报告与相同工具 handle。两个任务都会更新 resources-latest.json，因此必须分别读取其目录 report.json，不能只信 latest，也不要重复启动。

没有在门禁运行中主动触发 GC 或修改正在运行的版本以制造通过。额外内存读取仅调用 Runtime.getHeapUsage/Memory.getDOMCounters 和进程只读信息。preview.12 一次读取显示 JS usedSize 约 12MB、backingStorageSize 约 2.3MB、embedder 约 5.4MB；这不足以解释总工作集，需结合进程 private/shared memory、DOM 数量和渲染分配继续定位。

## 下一步

1. 收取上述两个已启动任务的实际结果，确认进程退出状态。
2. 以相同工作负载对比：必要时分别隔离传递层与绘制层；诊断实验不能当作产品验收。
3. 只保留有证据改善实际产品的改动。继续使用原绝对预算与增长门槛，不调宽阈值或删除失败记录。
4. 最终候选重新跑完整 30 分钟、M8 短门禁、旧流程及包验证后，才能关闭 M8。
5. 继续 M9–M12 与原八维评分，整体目标保持 active。

原生 M9 tile 20 场景、CTest 15/15 与 log32 编解码 3 项通过，见 43；该事实不代表 M8 资源问题或 M9 产品功能已经完成。
