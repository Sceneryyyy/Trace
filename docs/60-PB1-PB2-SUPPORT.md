# 60 · PB1 单实例与 PB2 故障诊断

2026-09-17。用户已授权先完成 PB1/PB2。反馈收件地址已明确为 472841772@qq.com；用户点击后打开邮件草稿，不自动发送或上传音频。

**状态：PB1/PB2 工程交付完成，候选 preview.27。** 本轮只推进这两步，公测其余门槛仍按 59 待验。

## PB1 开发阶段

- 在加载引擎和录音库前，以规范化的 userData 目录取得 Electron 单实例锁。重复启动退出，仅恢复/显示/聚焦已有窗口；初始化期间的激活请求延后到窗口创建。
- `tools/public-beta/single-instance.cjs` 实测通过：重复启动不回退设置、最小化唤回、真实 WASAPI 同一 take 持续增长、退出释放锁后配置正确恢复。
- 开发报告：`artifacts/public-beta/single-1789623313316/report.json`，提交 3b9e2c1。最终包已复验从两个不同解压目录启动，并核对配置与同一录音持续增长。
- 保护范围是遵守锁协议且共享配置目录的版本。preview.26 及更早版本没有请求锁，新程序无法反向限制它们；升级前须退出旧版，不允许新旧同时运行。没有修改或删除旧包。

## PB2 设计与结果

- SupportJournal：最多 128 条固定字段事件，重复事件短时间合并；异步串行/合并/原子写入。events.json 采用 schemaVersion=1 与 clean 标记；fatal.json 是致命异常退出前的极小同步记录。日志不写原始异常消息、堆栈、路径、设备身份、文件名或音频。
- SupportRuntime：记录录音/采集状态变化、失败任务、文件 worker 退出、界面/子进程故障。正常退出在原录音/任务收尾之后标记 clean；不正常退出在下次启动提示检查音频文件，文件恢复仍使用原录音日志和流程。
- React 错误边界与脚本/Promise 错误入口提供恢复界面、退出及诊断。Electron 渲染进程真正退出时由主进程提供恢复/导出/退出选项，退出事件返回后才允许重建 renderer；失效/重载期间不向已释放的 frame 发送数据，后台采集/录音继续。
- 主进程未捕获异常/拒绝记录固定类别并退出，不继续未知状态的音频/文件操作。受控启动失败提供原生诊断导出/退出入口；诊断模块都无法初始化时提供最小启动失败提示。
- “显示与帮助 → 诊断与反馈”包含导出、复制、邮件反馈。导出在用户选择位置排他创建新目录，生成 diagnostics.json 和 feedback.txt；最多 512 KiB 的报告包含构建主模块 SHA256、版本、系统/图形功能状态、固定字段历史及已脱敏状态摘要。
- 邮件使用固定收件人和模板，只调用系统邮件草稿；无附件自动添加、无网络上传、无实际发送。测试模式返回草稿 URI 供断言，不启动邮件客户端。

## 验证与修正记录

最终报告：`artifacts/public-beta/final-1789624386050/report.json`，十阶段全部通过：

1. 19 项日志/协议/偏好检查，含只读目录降级、坏记录过滤、历史上限、异常退出与 clean、排他导出和固定收件人。
2. 包审计及 ZIP 解压后 97 个文件哈希一致。
3. 两个解压目录的单实例/配置保存/最小化唤回/实际 WASAPI 不中断。单实例报告 `single-1789624390207`，帧数 15360 → 36960。
4. 打包程序的 worker 失败、脚本错误、真实 renderer 崩溃/重载、主进程致命异常/重启、实际录音恢复、诊断脱敏、帮助 UI 三组缩放。报告 `support-1789624397460`；测试使用隔离配置和生成素材，不触碰用户录音。
5. React 组件抛错边界单独验证；桥接为明确的测试夹具，不替代真实音频测试。
6. 布局与历史导航回归、中文路径副本的录音/编码/重开八项、启动失败标记检查。

开发期间原失败保留：隐藏窗口截图超时；在 render-process-gone 回调内立刻 reload 导致 Electron 重入问题，改为事件返回后恢复并抑制失效 frame 发送；fatal 分支在 app.exit 返回后又抛异常导致退出码 7，移除该二次异常后按退出码 1 完成。最终包均已复验。

## 交付与边界

- EXE：`dist-trace/preview.27/win-unpacked/Trace.exe`。
- ZIP：`dist-trace/preview.27/Trace-0.1.0-preview.27-Windows-x64.zip`，207,222,570 bytes。
- ZIP SHA256：`2f52741def982df648b1a1501bf47a0bf34df8b6decc92dbdc6e954bc84fa90c`。
- ASAR SHA256：`1549254f5bfbde7f6638702447bd77dc99607444ca91a613e1e27be4d878a91e`。
- Native SHA256：`7f1606b31bdf1664b7563b418ba0d43e3c025198e874c387851338eb9c0a7dbe`，与 preview.26 相同。

本轮未实发邮件，未验证各邮箱客户端；原生故障对话框由测试决策选择恢复，未做人工点击验收。未重复 30 分钟资源、物理拔插/96k、EBU 或干净机器专项；PB3–PB5 仍开放。没有运行中的测试或本轮工程阻塞，下一步先请用户试用 preview.27 的单实例与反馈入口，再按需推进 PB3。

机制依据：[Electron 单实例](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata)、[渲染进程退出事件](https://www.electronjs.org/docs/latest/api/web-contents#event-render-process-gone)、[Node 致命异常处理边界](https://nodejs.org/api/process.html#warning-using-uncaughtexception-correctly)。
