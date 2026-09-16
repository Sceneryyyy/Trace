# 45 · 窗口可见性与资源验证修正

2026-09-17。M8 资源调查继续；不能把此前任何短测或诊断 GC 当作 30 分钟门禁通过。

## 当前证据

1. preview.12 的 1800 秒复测仍因工作集增长失败。preview.13 的 600 秒诊断通过，但不足以关闭长测。
2. 大快照读取诊断（telemetry-probe-1789574825436）对同一状态分别读取小字段/大对象；出现暂时分配，随后回落。没有证据仅凭该实验认定产品持续泄漏来自调试序列化。
3. 布局可见性对照（layout-memory-latest.json）：同样重复切换 40 次，隐藏窗口诊断 GC 后约 3304 DOM 节点，可见窗口恢复到约 616。诊断 GC 只发生在这个独立实验中。
4. 找到启动器冲突：即使提供 --trace-test-visible，Node spawn 的 windowsHide:true 仍使 BrowserWindow.isVisible() 为 false。旧测试实际上没有验证持续可见的工作台。已改为 windowsHide:!visible，并让 UI 自动化默认启动可见窗口。
5. 新测试明确断言原生窗口 visible=true；FFT 设置还检查真实 DOM 文案，防止只检查后台快照却漏掉未更新的界面。

## 产品改动

- TraceState.windowVisible 由原生窗口 show/hide/minimize/restore 事件发布。
- 隐藏/最小化时 App 保持最新状态与呈现上下文，但停止 React 仪器树反复更新；恢复显示时立即应用最新快照。
- 主进程在隐藏与最小化时降低显示采样频率，录音观察和原生捕获仍保持运行。
- 偏好保存等待初始化读取完成，防止启动阶段的窗口事件写入默认设置。
- test.window 仅在 --trace-test 下可用，限制为 show/hide/minimize/restore，不向普通产品开放任意窗口或系统操作。
- 命令白名单、contextIsolation、sandbox 与原音频只读约束保留。

## 验证

preview.14 的类型检查、M8 12 个真实窗口流程（含 100 个位置与设置重启）、三项隐藏/最小化录音流程通过。M8 打包门禁 12 阶段通过，汇总 artifacts/m8/final-1789576171939/report.json。

窗口生命周期测试通过 MutationObserver 确认隐藏期间工作台没有持续 DOM 更新，同时录音帧仍增长，恢复后得到最新布局。没有通过停止采集或伪造读数达到这个结果。

新可见窗口长测：artifacts/m8/resources-1789576099071/report.json；exec session 68283，runner PID 78012、application PID 61252。默认 1800 秒，预算、增长比较、录音/监测切换与显隐操作不变；每次采样额外断言窗口实际可见。当前仍在运行，结束后根据最终报告决定是否关闭 M8。

原隐藏窗口失败结果仍保留。展示状态修正与根因解释不能代替新的完整门禁；如果新长测失败，继续定位，不调宽阈值。
