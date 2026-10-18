# 27 · M6 桌面开发预览

日期：2026-09-16。版本：**0.1.0-preview.1**。状态：**最小工程门禁通过，可开始人工验收**。原始 EBU、物理硬件和完整发布门禁仍开放。

## 交付物

- dist-trace/Trace-0.1.0-preview.1-Windows-x64.zip，207058037 bytes（约 197.5 MiB）。
- dist-trace/win-unpacked/Trace.exe，可直接运行，必须保留同目录的全部资源。
- ZIP 内 README-Trace.md；源码指南在 [28-USER-GUIDE](../../28-USER-GUIDE.md)。
- ZIP SHA-256：6690a7acc661bd56abe420c5b40823e438e7ff1c7c1b9b3607e541e3b39afa77。
- ZIP 完整性与 97 个解压文件逐一 hash 对比通过。中文目录解压后的运行检查见 artifacts/m6/archive-latest.json。

此为未签名内部开发预览，未创建安装器、修改注册表/系统音频格式或发布到远程。保留 Prism 上游来源；包内不包含 VST/TUI、测试录音和开发依赖目录。

## 新增实现

### 桌面与显示

- Trace 专用 electron-builder.trace.cjs 与 tools/package-trace.cjs；固定 Electron 40.8.3、electron-builder 26.8.1。
- 最小应用暂存目录只含 out-trace 和 package.json；包含 file-worker、media-runner 与所有 renderer 资源。
- 原生 addon、三枚 VC runtime DLL、锁定 FFmpeg/ffprobe、各组件许可随包交付；实际加载路径已确认来自包内。
- 自有 SVG/PNG/ICO 和 EXE 产品版本资源，保留 Electron 其他资源。Windows 临时占用时，资源原子替换有限重试，失败仍返回错误。
- Trace.ps1 Package / node tools/trace.cjs Package 为独立打包入口，默认生成 ZIP；--dir 只生成目录。
- 显示设置可配置目标线及倍率，持久化到用户目录；目标线不参与 DSP。
- 窗口正常尺寸、位置、最大化状态持久化；跨显示器工作区校验，失效坐标不直接恢复到屏幕外。
- R 开始录音，Escape 结束录音/暂停；帮助页汇总快捷键。文本框/对话框内不误触发走带。

### REC 与 FILE

- REC 全长/跟随最新/手动浏览；浏览固定概览游标，后台仍写入同一 take。
- REC 概览只显示可得的 M/S/I；Peak/RMS/TP/LRA 等不可得历史明确空缺，停止后 FILE 提供完整历史。
- FILE 手动窗口调整关闭自动跟随；重新开启后按设备呈现位置推进共享窗口。
- 常见失败映射为用户可理解的文案，保留录音不完整、来源中断、缓存待准备等区别。

### 原始 WAV 保留

- recordSettingsVersion = 3；keepOriginal 缺省 true，旧设置兼容。
- 关闭保留仅在独立成品与分析核验完成后处理源 WAV；原始资产 hash 全部一致才进入 removing。
- 先保存状态再整理；源回听/导出占用延后；失败显式可重试，重启可继续。保留源资产元数据。
- WAV 直录本身是唯一成品时始终保留。
- 切换 WAV/MP3/AAC 保持同一保留选择；修复 AAC 分支曾遗漏该字段的问题，并以实际设置界面补验。

## 最小门禁

主报告：artifacts/m6/gate-1789490018985/report.json，亦保存为 artifacts/m6/gate-latest.json。

| 检查 | 本轮结果 |
| --- | --- |
| 原生构建 / CTest | 11/11，包含录音原子快照、帧边界、参考计量与播放 |
| TypeScript | 通过 |
| 显示/窗口/保留设置 | 3 项通过 |
| 保留服务 | 4 项通过：默认保留、核验后整理、占用延后、源身份变化阻止整理 |
| 包结构/内容/许可/版本 | 4 项通过；全部 out-trace 文件与 ASAR 内容一致 |
| 独立包实际流程 | 8 项通过，含新数据目录、精简 PATH、空工作目录、断网、录音、格式切换保留意图、压缩成品、选区导出、重启 |
| 界面矩阵 | 10 项通过，含 REC 浏览、FILE 跟随、六组尺寸/缩放、双显示器恢复 |
| 长文件资源 | 3 项通过，复用保留的 M2 实录，不重新录制 30 分钟 |

M5 → M4/M3/M2 组合回归已在 artifacts/m5/gate-1789489346567 通过：54 项编码矩阵、11 项导出服务、6 项导出 UI、3 项格式录音、3 项正常退出、3 项硬杀恢复及下层回归。M6 门禁校验其 main/native hash 与当前构建一致；随后只修改过保存设置的 AAC 字段和提示，由打包后的实际格式切换检查覆盖。

运行：
- node tools/trace.cjs Package --dir
- node tools/m6/gate.cjs；没有当前 main/native 对应的 M5 报告时加 --regression
- node tools/m6/archive.cjs
- node tools/m6/relocated-smoke.cjs

测试脚本的早期 Windows ASAR 路径/字符串语法/按钮就绪等待失败保留在各次 artifacts 中，最终报告只在实际检查成功后生成。未放宽数值容差、删除音频失败用例或生成假读数。

## 尺寸与显示器范围

六组为 1024×700、1280×800 窗口目标 × 100/150/200% 进程/renderer 缩放。实际内容视口为对应窗口扣除边框；高 DPI 下使用明确 renderer viewport，覆盖本机物理分辨率放不下的 800 DIP 情况。已人工查看最小 FILE、REC 概览和高 DPI 设置截图。

物理显示器为两台 2560×1440、Windows 缩放均 100%；分别验证负坐标与主屏工作区中的位置、退出重启恢复。未修改 Windows DPI，未验证混合系统 DPI 的实时跨屏切换。

## 资源实测

artifacts/m6/resources-1789490115496/report.json。Windows 10.0.26200、Intel Core i9-14900K、32 逻辑核、约 127.7 GiB 内存。

- 新用户数据目录下先采样 10 秒 LIVE，再打开保留 M2 实录的副本。
- 30 分钟文件 1800.84 秒、86440320 帧，新建独立分析约 18670 ms；可定位近末尾并实际回听。
- 本次采样主进程工作集峰值 118060 KiB，约 115.3 MiB。此数不含 renderer、分析 worker 与 GPU 进程，不能称为整应用内存。
- renderer performance.memory 返回约 10000000 bytes 的粗粒度 JS 堆读数，只作诊断；不替代全进程 RSS。
- 最后文件快照波形 900 点、响度历史 582 点，未把 30 分钟 PCM 推给 UI。
- 原始长录音资产 SHA-256 未变。LIVE 的 droppedFrames 与 timestampErrors 见逐样本 diagnostics；启动 discontinuities 有计数，未伪称所有计数为零。
- 更长运行、全进程 CPU/RSS、低配电脑和多设备性能仍需后续基准，已有 M1 10 分钟和 M2 30 分钟实录作为前期证据。

## 构建身份

- native SHA-256：1826f6701223da3133e8ee91e21b18402234b51a53666495dea272d548ea8439
- main SHA-256：b465f36e8d129605a1ba01abd284515fa7ef1c3bc1c017e6f8676e41bd8175f4
- app.asar SHA-256：410f78080eaebfa6cb8709636c43148f388e0f84caa636eb0385c4ad48d2c820
- Trace.exe SHA-256：bccd459eee7f7d192a39312e38ba5cb54de4e6b5d25b4cf10cda01a4590c42db
- 源码仍在 recorder/dev，HEAD 为上游 df0755b8caaaab85157ac51aefffca0526974fc1；本地 Trace 工作未提交、未推送。最终本地清单见 artifacts/m6/checkpoint.json。

## 开放门禁与下一步

1. 用户按 28 使用指南验收实际工作流与视觉/听感。
2. 原始 EBU Loudness Test Set v5.0 下载仍返回 403；用户已确认本机无素材并要求继续。18 个生成参考与 233 个 TP 组合不替代官方素材。
3. 真实捕获 96 kHz、物理拔插、驱动格式变化全矩阵仍未验收；数值 96 kHz 文件检查不等于硬件捕获。
4. 新用户数据、空目录、精简 PATH 和网络模拟隔离是在当前开发机执行；未在独立干净 Windows/VM 验证。
5. 当前达到可人工验收的开发预览，A01–A14 和正式发布资格没有自动通过。
