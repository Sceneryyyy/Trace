# 30 · preview.3 缩放、界面精简与直接录音

日期：2026-09-16。版本：0.1.0-preview.3。对应用户反馈 4–6。

## 连续缩放

- 波形区域 Ctrl + 滚轮调整 5–60 秒时间窗；普通滚轮调整 ×1–×4 波形倍率。
- LIVE 顶栏的两个滑杆支持同一范围。FILE/HISTORY 与 REC 共享时间轴缩放；不足 5 秒按已有音频长度显示。
- FILE/HISTORY 的全长按钮保留整段概览。放大/缩小按钮遵守 5–60 秒边界；选区边界与时间窗独立。
- 显示倍率不改变音频、回听音量、Peak/RMS/TP 或响度值。缩放不会重置采集 epoch。
- 使用连续数值与指针锚点；前端即时显示最新目标，后台同维度命令合并。边界处的无效滚轮不重复发送。
- 修复了快速滚轮到达边界后，后续调节仍沿用旧目标的问题。滑杆、滚轮和文件窗口按钮使用统一的待提交显示状态。
- 显示设置版本 2；旧 ×16 迁移为 ×4，目标线保留。5.25 / 13.75 秒等小数范围可保存；原生读取向上取整的历史长度，界面按精确窗口裁切。

## 界面精简

- TP 行直接显示 dBTP，移除额外的单位解释。
- 移除主界面常驻的“不保存音频”、空闲估计静音说明、重复的 M/S 中文解释和计量段落。
- 正常状态用“监测中 / 已停止 / 录音中 / 已暂停”等短标签。
- 保留音频中断、分析中、实际错误和 LRA 暂估标记；数值未就绪和静音仍分别用 — / −∞。
- 详细口径、滚轮提示移到悬停与帮助。没有隐藏底层 estimatedFrames / discontinuities 等诊断数据。
- 1024×700 的 LIVE、REC、FILE 截图已查看，滑杆、单位及走带控件未裁切。

## 录音与监测开关

- monitoringRequested 表示用户的常驻监测意愿；active 继续表示实际输入采集。
- 监测关闭时可以直接点击 REC 或按 R，无需先点击“开始监测”。
- REC 按需取得采集，停止后归还；已有监测保持运行，epoch 不重置。
- 取消首次目录选择不会启动采集。启动写盘失败、快照故障等路径会完成录音收尾并释放临时采集。
- 录音期间仍禁止直接停止输入采集；Escape 可以从滑杆焦点结束录音。
- 监测关闭时选择设备只更新选择，不启动采集。
- 退出 FILE/HISTORY 和重启应用也恢复监测开关意愿。
- 正常关闭会刷新尚未写入的显示偏好，避免最后一次滚轮值因延迟保存丢失。

## 针对性验证

- TypeScript 与基础协议/设置检查通过。
- 新增 5 项缩放契约检查：连续范围、旧设置迁移、正反滚轮与精确边界、指针锚点/短文件/长概览、新命令白名单。
- 原生 CTest 12/12；原生 snapshot 已实际调用小数窗口，非法范围仍拒绝。
- 实际 Electron 窗口 9 项检查，加独立进程重启恢复 1 项：
  - 取消目录不采集、停监测选择设备不采集。
  - 停监测直接 REC，缩放不重启采集，保存帧数与原生写盘一致。
  - R/Escape 操作，包含滑杆有焦点时停止。
  - 注入写盘启动失败与快照故障后的采集释放。
  - 常驻监测中开始/停止 REC 保持相同 epoch。
  - 快速滚轮与连续滑杆的方向、边界、独立维度；冗余文案不再显示。
  - FILE 缩放保持游标和数值，返回后恢复停止监测。
  - 立即正常关闭后重开，13.75 秒 / ×1.83 / 监测关闭恢复正确。
- 注入故障明确为控制路径测试，不等同物理设备拔插或驱动测试。

构建与门禁：
- node tools/build-engine.cjs
- node tools/trace.cjs AppBuild
- node tools/package-trace.cjs --dir
- node tools/feedback3/gate.cjs
- node tools/m6/archive.cjs
- node tools/m6/relocated-smoke.cjs

新包在 dist-trace/preview.3，前两版目录保留。原始 EBU、真实捕获 96 kHz、物理驱动变化、混合系统 DPI 和独立干净 Windows/VM 仍是开放项。源码未提交、未推送。

## 最终交付记录

- 状态：preview.3 本轮实现、针对性验证与完整回归通过，可供人工复验。
- 运行入口：dist-trace/preview.3/win-unpacked/Trace.exe。
- ZIP：dist-trace/preview.3/Trace-0.1.0-preview.3-Windows-x64.zip，207076287 bytes（197.5 MiB）。
- ZIP SHA-256：3d9cfbea1fa7894ec9cb00c10e2cd12a33aafd765fb12a98e9fd7448fd48e38b。
- 97 个解压文件逐一 hash 对比通过；中文路径重新定位运行通过。
- 本轮门禁：artifacts/feedback3/gate-1789535439551/report.json。
- 实机交互：artifacts/feedback3/ui-1789535440008/report.json；同目录 reopen.json 为独立重开。
- 桌面回归：artifacts/m6/gate-1789535528012/report.json；音频回归：artifacts/m5/gate-1789535528098/report.json。
- ZIP 重定位：artifacts/m6/package-1789535981779/report.json。
- native SHA-256：15799e701bc79bb20cc906a6b97ba3b37a5dcf50ff41011264a8fad876c8957d。
- main SHA-256：56e4536b1e50486a51cd2b76494d61a3879514617649818ebb711fe4896bb2be。
- ASAR SHA-256：b84b49693dcd6c771d234c9b8d78fec3112cc2fe82c98710c82861a6d9aa14ed。

下一步是用户复验滚轮手感、精简后的界面及仅录音工作流。前两版的原始 EBU/硬件/干净环境开放项保持，不自动标记为通过。
