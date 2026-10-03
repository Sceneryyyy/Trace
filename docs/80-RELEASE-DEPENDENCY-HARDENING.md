# 80 · 发布依赖与源码收尾

2026-10-03。接在工程独立化与交接提交 `598c63c` 之后，按用户授权处理
云端发布准备的第一步。产品仍 preview.31、Meter v5；算法、数值参考、
容差和单/双声道范围保持。实机与正式发布验收见 [76](76-RELEASE-CHECKLIST.md)。

## 固定工具链与实际安全门禁

| 输入 | 原值 | 当前固定值与理由 |
| --- | --- | --- |
| Electron/SDK | 40.8.3 | 42.11.10，仍受支持的稳定分支；40 系列最后补丁仍落在部分公告范围内 |
| electron-builder | 26.8.1 | 26.15.3，修复构建器/下载凭据公告，实际打包需复验 |
| node-gyp | 10.3.1 | 13.1.0，与 Node 24.19.0 兼容，移除旧 tar/下载缓存链 |
| 下载器 | @electron/get 2/3 | 统一覆盖为官方 5.1.0，接口加载已实测，Windows 构建/打包继续验收 |
| FFmpeg | Gyan 9.0.1 | Gyan 9.0.2 essentials，同一功能配置的稳定补丁版；ZIP CRC、大小、两 EXE 与发布者 digest 已核验 |

完整 npm 审计由 18 个受影响包（17 high / 1 critical）降至 **0**，生产依赖
审计亦 0。不是用 omit=dev 或隐藏公告制造通过。HTTP 缓存库的已发布最新
版仍受影响，因此通过官方新下载器移除旧 got/cacheable-request 链。
仅升级受影响的直接构建依赖；应用 React/字体/原生计量库依赖保持。
当前版本、覆盖和锁文件 SHA 见 [toolchain.trace.json](../toolchain.trace.json)
与 [安全基线](release/security-baseline.json)。

新增 `npm run check:security`，每次实际请求 npm 审计完整锁定依赖及生产
依赖，保存原始 JSON/hash/提交与结果。CI 两端及 Windows 验证调用此门禁；
候选要求当前提交、干净 checkout、同锁文件的真实成功报告。生产依赖为零、
过期基线、缺失审计或非零计数都拒绝候选。

## FFmpeg 主源码与实际阻塞

固定上游提交 `946fcce07b6dcd0331c8cc609192aeff5e1924f8`，已下载源码 tar.gz
17,333,895 字节，SHA-256
`0aa2b1de2a5698b20a23e93d539a9a8e82ca0117496c5bdf05d198805f42bb3b`，
检查 `RELEASE=9.0.2`、源码许可与归档内容。发布者 README/GPL 原字节、
上游许可及配置清单保存在 [来源目录](../references/ffmpeg-9.0.2/README.md)。

`node tools/release/dependency-sources.cjs --fetch` 核对二进制身份、文档 hash、
固定源码的大小/hash 后准备缓存。另取得与发布者记录相符的 LAME 3.100 官方源码（1,524,133 字节，SHA-256
`ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e`）
及 LGPL。候选附带两份源码、来源清单与状态说明；应用
许可目录同步可核验来源。源码缓存截断/改写、过期 EXE 来源绑定及伪造
“完整对应源码”反例均拒绝。

发布者列出 42 个外部组件、13 个硬件特性；README 末尾另有 37 条版本/
提交后缀记录，已逐项归入清单。但八项基础库版本、完整传递依赖与许可、
生产者补丁、构建脚本及工具链清单未提供。系统 API 和第三方 SDK 仍需区分。
当前发布仓库只有支持 README 和 FUNDING，不能从最新 MSYS2 包推断此 EXE。
**完整静态构建对应源码门禁仍阻塞**，`--require-complete` 必须失败，候选
保留 `correspondingSourceComplete:false`。这些缺失信息需要发布者提供，或
另行建立、验收拥有完整来源的 codec 构建；本轮没有缩减既有编码/导入范围。

## 验证范围与接力

云端已实际执行：新锁普通安装、完整/生产审计、类型检查、JS **251/251**
（51 文件，0 fail/skip）、默认构建、独立性检查、真实 Electron 42 headless
图标生成和 SDK 目标计划。首次旧代理标志下载失败保留；在当前受代理限制
的 Node 24 云环境，使用 `NODE_USE_ENV_PROXY=1 ELECTRON_GET_USE_PROXY=true`
安装成功，TLS 校验保持。Windows 常规直连环境使用普通 `npm ci`。

新增四项 Windows 实际 EXE 回归，核验二进制/配置/编码器身份及 WAV、MP3、
AAC 的真实编码、probe、解码、时长/采样率/声道/信号；AAC 物理尾部 padding
与 PCM 音频帧分别断言，不放宽 EBU 门禁。Windows 引擎/19 CTest/原生及 codec
测试、Linux ASan/UBSan 与浏览器、当前候选全流程仍须本次 CI 收齐。上一轮
`db005b5` 只证明旧工具链，不能沿用为本轮兼容通过。

完成后的 run/commit 与候选身份同步 [13](13-HANDOFF.md)。即使 npm 归零、
工程候选通过，也不关闭静态 FFmpeg 对应源码与相关库安全核查、真实设备、
三分钟视频、长测、GPU/DPI、签名和用户验收。
