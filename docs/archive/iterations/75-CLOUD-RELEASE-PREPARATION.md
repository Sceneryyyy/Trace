# 75 · 云端发布收尾与剩余阻塞

2026-10-18 阅读提示：本文为 10 月 2 日发布准备快照。下方 15 个受影响 npm 包、Gyan 对应源码缺口及当时未运行的 Windows CI，已由 [80](80-RELEASE-DEPENDENCY-HARDENING.md)/[81](../../81-SELF-BUILT-FFMPEG.md)/[82](82-FILE-FAULT-TESTING.md) 后续处理；不要将本页旧数字与现行 [security-baseline.json](../../release/security-baseline.json) 混用。preview.35 完整 CI 见 [89](../../89-FRONTEND-SIMPLIFICATION-ITERATION.md)，真实硬件、安全/分发条款及正式发布门禁仍见 [76](../../76-RELEASE-CHECKLIST.md)。

2026-10-02。用户授权完成可在云端独立完成的发布准备、修复与测试，遇到需要外部环境的项目记录阻塞，最后提交本地 Git。起点 `recorder/dev@37cd0ef`，源码仍为 preview.31；本轮没有推送、签名或公开发布。

## 已完成的工程工作

| 范围 | 交付 |
| --- | --- |
| Trace CI | 新增 `.github/workflows/trace.yml`，自动覆盖 recorder/dev push 和 recorder/dev/main PR；Linux 执行类型、portable、应用构建、ASan/UBSan C++、真实 React selector 和模拟 IPC 界面专项；Windows 准备固定 Electron SDK/DSP，再跑 Trace CTest/native 与前端检查 |
| 候选包 | 新增 `trace-release.yml`，手动触发同一工作流生成 Actions 候选附件；不创建公开 Release 或标签。上游发布工作流名称明确保留 Prism 身份 |
| 打包可移植性 | `vc-runtime.cjs` 从 VS2022 各安装版本发现 x64 VC143 CRT，可通过 TRACE_VC_REDIST_DIR 指定；检查 DLL 的 PE 架构，记录版本和每文件 SHA256，移除固定个人安装目录及对未准备本地 npm 的隐式依赖 |
| 候选证据 | verify 实际执行检查并记录命令退出码、提交和工作树状态；候选要求干净源码、同一提交的 Windows/native 证据与包加载证明；包加载绑定 EXE/ASAR hash，ZIP 按文件流式核对审计中的尺寸/hash，并拒绝重复、额外或缺失文件 |
| 分发内容 | 候选包含程序 ZIP、当前 PDF、项目源码 ZIP、验证记录、发布清单、manifest 和 SHA256SUMS。manifest 明确标记 engineering-candidate、未签名及未关闭的硬件/安全/依赖来源门禁，不表示正式放行 |
| 退出 | 抽取有界 finalizeShutdown；正常先排空服务再关闭引擎；超时最多再等 250 ms 诊断写入。超时状态不会被晚到的 clean-exit 清除，重启可查看 shutdown-timeout；无效环境时间值回退 60 秒 |
| 3D 游标 | 在投影后的时间轴位置补主题色三角与 2 CSS px 标记，不改变数据；裁掉画面外和相机后方位置。云端几何/绘制回归通过，真实 WebGL/GPU 体验仍待验 |
| 使用材料 | preview.31 八页 PDF、当前 React 插图及字体许可；补主题选择、取消恢复与采集质量含义。旧 PDF/内测包不覆盖、不改名冒充新版 |

## 依赖安全处理

在已有约束内，将 Vite 固定到 7.3.6、PostCSS 固定到 8.5.28，并更新受影响的兼容间接依赖。没有使用 `npm audit fix --force`，也没有升级 Electron 40.8.3、electron-builder 26.8.1、node-gyp 10.3.1、@electron/rebuild 3.7.2 或 node-addon-api 8.6.0。

本次 npm 公告盘点从 **31 个受影响包降到 15 个（14 high、1 critical）**；它计数的是包及依赖传播，不能称为 31 个独立可利用漏洞。记录：[security-baseline.json](../../release/security-baseline.json)，绑定当前 package-lock SHA256，并保存剩余范围和公告链接。

`npm audit --omit=dev` 为 0，但 Electron 属于 devDependency 且随产品运行，**生产依赖 0 不等于 Trace 安全通过**。Electron 的公告覆盖当前版本；打包/原生链还包含 tar 等问题。要关闭这些项目，需要选择新工具链版本、更新各处固定 SDK/打包约束并取得 Windows addon、CTest、三格式和新包复验；当前云端不能完成最终兼容性判断。这是正式发布阻塞。

FFmpeg 仍为锁定的 Windows Gyan GPL/version3 静态构建；已有哈希、配置、许可和 upstream revision，不把项目源码 ZIP 当作该构建全部依赖的对应源码。发行方构建资料与启用库的对应源码/许可核对尚未闭合。

## 本次验证

- `npm run typecheck`、`npm run test:trace`、`npm run build:trace`；最终 portable 数量见 13。针对退出/发布反例还单独运行了 shutdown/release 测试。
- `native/portable` 六个 CTest 在 GCC 14.2、Debug、ASan/UBSan 下 **6/6**，包括生成 EBU 数值参考、Meter 初始化、TP 时间归属、ReplayQuality、仪器分析和声谱瓦片。用时约 212 秒，未报告 sanitizer 错误。
- 未用替代 WavReader 或假平台 API 让 Windows 测试通过：ReplayBuffer/WaveSequence 文件路径及原生写盘测试仍留在 Windows CTest。
- 实际 React + Chromium selector 回归：相同快照额外 render=0；值/props 更新及卸载行为正确。
- 当前 React + 明确模拟 IPC 的界面：五主题入口/预览/应用、Home/End 焦点与单一 Tab 停靠、Esc 恢复、质量提示、同一数据的读数不变。无未处理界面异常；帧间隔仅记录无头模拟环境观察，不等于实时 WASAPI 性能验收。
- actionlint 1.7.12 检查两份新增工作流；工具下载 SHA256 已对照发布校验清单。该阶段没有远程执行新增 Actions，仅提交本地。2026-10-03 后续 GitHub 同步包含此发布准备，见 [当前交接](../../13-HANDOFF.md)；远程 CI 结果不属于本页的历史测试证据。
- PDF：8 页、8 书签、4 内部链接、可检索文字、嵌入字体与页内文字边界通过，并渲染检查。新旧 PDF 身份分开。

本地日志、审计原始 JSON、浏览器报告、CTest JUnit、PDF 渲染在忽略的 `artifacts/release-cloud`、`artifacts/release` 和 `build/trace-portable`。生成的界面数据和 mock 只能证明已列出的代码/显示行为。

## 无法独立关闭的项目

1. **Windows 实机**：最新 addon/全量 native、新 ZIP、YouTube 三分钟、真实 96 kHz、USB/默认设备变化、睡眠恢复、满盘/慢盘、长时间实际录音及退出后恢复。本轮没有 Windows 主机。
2. **官方 EBU**：官网页面及已知测试集 URL 返回 HTTP 403/Cloudflare 拒绝；没有绕过站点挑战，未从不明镜像下载替代文件。生成信号检查不能关闭官方素材门禁。
3. **物理图形与用户**：混合 DPI、普通 GPU/不同显示器、色弱主观体验及独立新用户任务/邀请测试。
4. **可信发布**：Windows 签名证书/发布身份、签名后浏览器下载启动与升级回退；FFmpeg 完整依赖来源；剩余工具链安全升级的 Windows 复验。
5. **macOS**：Apple silicon、macOS SDK/权限/音频来源探针、后端实现及签名公证。当前不把上游 Mac 目标当成 Trace Mac 已可用。

当前工程收尾不意味着已正式放行。下一步按 [76 · 发布验收清单](../../76-RELEASE-CHECKLIST.md) 在相应环境逐项补证据。
