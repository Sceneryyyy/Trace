# 80 · 发布依赖与源码收尾

2026-10-04 补充：本页保留 `6835af9` 的 Gyan 依赖候选及历史来源缺口。当前源码改用 Trace 自建 FFmpeg/LAME；构建与新的来源门禁见 [81](../../81-SELF-BUILT-FFMPEG.md)，新候选实际状态见 [13](../../13-HANDOFF.md)。

2026-10-03。接在工程独立化与交接提交 `598c63c` 之后，按用户授权处理
云端发布准备的第一步。产品仍 preview.31、Meter v5；算法、数值参考、
容差和单/双声道范围保持。实机与正式发布验收见 [76](../../76-RELEASE-CHECKLIST.md)。

## 固定工具链与实际安全门禁

| 输入 | 原值 | 当前固定值与理由 |
| --- | --- | --- |
| Electron/SDK | 40.8.3 | 42.11.10，仍受支持的稳定分支；40 系列最后补丁仍落在部分公告范围内 |
| electron-builder | 26.8.1 | 26.15.3，修复构建器/下载凭据公告，实际打包已复验 |
| node-gyp | 10.3.1 | 13.1.0，与 Node 24.19.0 兼容，移除旧 tar/下载缓存链 |
| 下载器 | @electron/get 2/3 | 统一覆盖为官方 5.1.0，接口加载及 Windows 构建/打包已实测 |
| FFmpeg | Gyan 9.0.1 | Gyan 9.0.2 essentials，同一功能配置的稳定补丁版；ZIP CRC、大小、两 EXE 与发布者 digest 已核验 |

完整 npm 审计由 18 个受影响包（17 high / 1 critical）降至 **0**，生产依赖
审计亦 0。不是用 omit=dev 或隐藏公告制造通过。HTTP 缓存库的已发布最新
版仍受影响，因此通过官方新下载器移除旧 got/cacheable-request 链。
仅升级受影响的直接构建依赖；应用 React/字体/原生计量库依赖保持。
当前版本、覆盖和锁文件 SHA 见 [toolchain.trace.json](../../../toolchain.trace.json)
与 [安全基线](../../release/security-baseline.json)。

新增 `npm run check:security`，每次实际请求 npm 审计完整锁定依赖及生产
依赖，保存原始 JSON/hash/提交与结果。CI 两端及 Windows 验证调用此门禁；
候选要求当前提交、干净 checkout、同锁文件的真实成功报告。生产依赖为零、
过期基线、缺失审计或非零计数都拒绝候选。

## FFmpeg 主源码与实际阻塞

固定上游提交 `946fcce07b6dcd0331c8cc609192aeff5e1924f8`，已下载源码 tar.gz
17,333,895 字节，SHA-256
`0aa2b1de2a5698b20a23e93d539a9a8e82ca0117496c5bdf05d198805f42bb3b`，
检查 `RELEASE=9.0.2`、源码许可与归档内容。发布者 README/GPL 原字节、
上游许可及配置清单保存在 [来源目录](../../../references/ffmpeg-9.0.2/README.md)。

`node tools/release/dependency-sources.cjs --fetch` 核对二进制身份、文档 hash、
固定源码的大小/hash 后准备缓存。另取得与发布者记录相符的 LAME 3.100 官方源码（1,524,133 字节，SHA-256
`ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e`）
及 LGPL。候选附带两份源码、来源清单与状态说明；应用
许可目录同步可核验来源。源码缓存截断/改写、过期 EXE 来源绑定及伪造
“完整对应源码”反例均拒绝。

发布者列出 42 个外部组件、13 个硬件特性；README 末尾另有 37 条版本/
提交后缀记录，已逐项归入清单。但八项基础库版本、完整传递依赖与许可、
生产者补丁、构建脚本及工具链清单未提供。系统 API 和第三方 SDK 仍需区分。
发布仓库只有支持 README 和 FUNDING。另找到 [公开通用构建 fork](https://github.com/GyanD/media-autobuild_suite)，默认分支及 GPL 分支所查提交分别为 2020-12-20/2020-03-07，尚无绑定本 9.0.2 发布二进制的准确 revision/settings/toolchain/package 记录；不能从最新 MSYS2 包推断此 EXE。
**完整静态构建对应源码门禁仍阻塞**，`--require-complete` 必须失败，候选
保留 `correspondingSourceComplete:false`。这些缺失信息需要发布者提供，或
另行建立、验收拥有完整来源的 codec 构建；本轮没有缩减既有编码/导入范围。

## 验证范围与接力

云端已实际执行：新锁普通安装、完整/生产审计、类型检查、JS **258/258**
（51 文件，0 fail/skip）、默认构建、独立性检查、真实 Electron 42 headless
图标生成和 SDK 目标计划。首次旧代理标志下载失败保留；在当前受代理限制
的 Node 24 云环境，使用 `NODE_USE_ENV_PROXY=1 ELECTRON_GET_USE_PROXY=true`
安装成功，TLS 校验保持。Windows 常规直连环境使用普通 `npm ci`。

新增五项 Windows 实际 EXE 回归：二进制/配置/编码器身份、WAV/MP3/AAC
编码/probe/解码，以及生产导入→多段浮点 PCM→三格式导出（含 AAC M4A/ADTS）。
断言时长/采样率/声道/信号及物理帧与有效范围，不放宽 EBU 门禁。

第一轮 [CI 37143481325](https://github.com/Sceneryyyy/Trace/actions/runs/37143481325)
绑定 `3d63d8f`：Windows SDK/诊断/引擎、19/19 CTest（255.94 s）、安全审计、
251/251 portable JS 和构建通过；native 44/47，新增三格式用例因有效周期
WAV 被 MPEG-TS 探测误判而失败。二进制身份用例通过。为修复后重新取得
完整证据，取消了仍在运行的 Linux job；此 run 的总体结论为 cancelled，
Windows job 仍为 failure，不作为候选通过证据。

修复从 16 字节 RIFF/RIFX 或 RF64/BW64 + WAVE 容器头取得 WAV 解复用提示；
不依据扩展名，FFmpeg 仍验证实际流与内容。导入探测、导入解码及成品 WAV
检查使用同一规则；保留原失败正弦信号。新增实际生产回归又发现 AAC M4A
尾块与 ADTS `initial_padding=0`：M4A 必须有精确匹配的 time_base/duration_ts，
尾部少于一个 1024 帧 AAC-LC 块才接受；实际尾块记录在既有 recipe，回听与
计量仍排除它。ADTS 从实际首包负 PTS/Skip Samples 取得延迟，并拒绝缺失、
冲突或异常元数据。有效帧等式、MP3 零额外填充规则及数值容差保持。

本地补充用 Linux FFmpeg 7.1.5 跑原回归信号和真实生产流程：4 项通过；
固定 Windows EXE 身份用例明确跳过 1 项，这不算 Windows 通过。
最终 [`6835af9` 的完整 CI](https://github.com/Sceneryyyy/Trace/actions/runs/37164188081) 已收齐：Windows CTest **19/19**、
原生/媒体 **48/48**、两端 JS **258/258**、Linux ASan/UBSan 核心 **8/8** 与原始
EBU **1/1**、浏览器/类型/构建均通过。新候选 ZIP、5 项包审计、实际原生加载
及主题重启、clean-checkout、生成/上传通过；两份源码归档由成功的候选生成器
校验并附带。CRT 实际 **14.44.35112 x64** 与 DLL hash 留存在完成日志/验证摘要。
旧 `db005b5` 保持旧工具链证据，当前身份为 `6835af9` / run `37164188081`。
已读取完成日志与附件元数据；附件 payload 未下载/读取，内部 JSON hash 未独立复读。
详细证据见 [dependency-verification.json](../../release/dependency-verification.json)。

完成后的 run/commit 与候选身份同步 [13](../../13-HANDOFF.md)。即使 npm 归零、
工程候选通过，也不关闭静态 FFmpeg 对应源码与相关库安全核查、真实设备、
三分钟视频、长测、GPU/DPI、签名和用户验收。

### 候选源码下载回归

第二轮 [CI 37162767474](https://github.com/Sceneryyyy/Trace/actions/runs/37162767474)
绑定 `ef51603`：Linux 全部成功，Windows CTest 19/19、原生/媒体 48/48、
两端 JS 254/254、安全门禁、同次 Linux 门禁、打包、5 项包审计与包加载/
重启均成功。但最终源码下载触发 Node 24.19.0 内部 Undici
`Parser.finish: assert(!this.paused)`，Windows/工作流 failure，无新候选上传。

下载改用 Node 原生 HTTPS 流，代理取自环境、TLS/CA 校验保持；HTTPS
重定向最多五次，拒绝降级，240 秒整体下载超时与流式大小上限保留。
只有准确大小/SHA-256 校验成功才发布缓存，失败清理临时文件。新增四项
实际本机 HTTP 流反例（测试仅映射 loopback，生产仍严格 HTTPS），专项
11/11、完整 JS 258/258 和类型检查通过。已用新实现重新下载官方
FFmpeg/LAME 归档，两个实际大小/hash 与原锁一致；修复后的完整 CI `37164188081` 及候选生成/上传已通过，最终复验于 2026-10-04。
