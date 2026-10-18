# 64 · 同事内测分发包 R2（preview.29）

日期：2026-09-20。软件版本：0.1.0-preview.29；分发修订：InternalTest-r2。

## 与 R1 的区别

R1（preview.28）只补文档不重编译；**R2 包含实质代码变更**：2026-09-20 前端性能与视觉一致性迭代，明细见 [66 号前端审计](66-FRONTEND-AUDIT.md) 第 6 节。要点：

- 30 Hz 电平快照移出 React state，仪器面板引入 selector 订阅。**勘误（2026-10-02）：当时 selector 对新快照未复用相等输出，“界面外壳不再逐帧重渲染”的结论不成立；73-R1 已在 2995174 修正，R2 历史包不含该修复。真实工作台帧时间仍需实机测量。**
- 响度柱表/相关度游标/进度条改 transform 合成器动画；设置写盘 300 ms 防抖。
- CSS 设计令牌单源化（视觉零变化）；跨屏 DPR 监听、拖拽 rAF 合并等。

音频引擎、编码器、协议与功能范围不变。快速上手 PDF 沿用 preview.28 手册（界面外观一致），README-Trace.md 仍为 docs/28 快照。

## 交付

`dist-trace/internal-test/LeoMoon-Trace-preview.29-InternalTest-r2-Windows-x64.zip`

- 大小：210,506,908 bytes。
- SHA256：`421e1cdd3c17e0d7af59daba85f5c0c27e42663c57d0bc3f96728eb2d7fc88f1`（同目录 `.zip.sha256`）。
- ZIP 内唯一顶层目录 `Trace-preview.29-InternalTest-r2`，105 个文件；解压后先读 `00-开始使用.txt`。

## 构建与验证

1. 版本升级：`src/trace/product.ts` 与 `electron-builder.trace.cjs` → 0.1.0-preview.29；输出 `dist-trace/preview.29`，不覆盖 preview.28。
2. `tools/package-trace.cjs` 重建：`out-trace` 白名单 staging、图标/版本资源写入、win-unpacked + ZIP。
3. `tools/m6/package-audit.cjs` 通过（M6_AUDIT pass），建立 preview.29 文件基线。
4. `tools/package-internal-test-r2.cjs` 组装内测包：逐项核对基线 SHA256、无个人路径/录音/日志断言、ZIP 完整性、中文路径解压后逐文件哈希一致。
5. 解压副本运行 `package-smoke.cjs`（真实 WASAPI 录音、WAV/MP3 成品、编码/解码/分析/重开）与 `single-instance.cjs` 四项，全部通过；用后包内文件再次校验未变。
6. 迭代代码同时通过：typecheck、capture-support 3、lufsmeter-native 6、trace-report 7、trace-contracts 11、recording/recovery 6、workspace-layout、session-timeline、m0 electron 冒烟。

## 已知边界

- `tools/m7/workspace-ui.cjs` 第 36 行断言在干净 HEAD 上同样失败（2!==4，仪器清单顺序与门禁脚本不同步），属基线遗留，与本次迭代无关，未修。
- `tools/m7/verify.cjs` 全链路（含 ZIP 哈希比对阶段）未跑；R2 验证链为 package-audit + package-smoke + single-instance。
- 干净 Windows/硬件矩阵、官方 EBU 素材、96 kHz 实采仍为开放项；包未签名。
- 构建时代码处于未提交状态：BUILD-INFO.json 记录 HEAD（4fa6b21）+ runtimeAsarSha256 指纹，迭代补丁以 `git diff` 为准。

## 分发

未代发邮件、未上传外部站点。分享 ZIP 与 `.sha256` 给同事即可；反馈按包内 04 模板。
