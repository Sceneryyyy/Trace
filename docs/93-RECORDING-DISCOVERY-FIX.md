# 93 · 录音库目录识别修复

2026-10-19，本地 `recorder/dev@d268e5b` 未提交增量。用户将桌面等混合用途目录选为录音根时，普通文件夹被列为损坏录音，无法回放。

## 原因与范围

`RecordingService.setDirectory` 对所有直接子目录调用 `readSession`，并将所有失败都加入不可读列表，包括不存在 `session.json` 的 ENOENT。旧行为实际上与是否含 WAV 无关，只要是子目录就会误列。

现在先检查普通、非链接的 `session.json`，无清单/非文件/链接候选跳过；`readSession` 将可解析但 product 不为 Trace 的清单识别为非本项目会话，目录发现不收录。JSON 破损、Trace 未支持版本、非法字段或无法访问的清单仍保留故障提示。合法 v1/v2 录音读取、v1 迁移、录制中断恢复及源文件整理恢复逻辑保持；没有遍历音频来猜测身份。

所有被忽略目录和文件只读、不删除、不迁移；非 Trace WAV 通过“导入”进入外部素材。会话 schema、PCM 和播放协议不变。

## 验证

- `node --test test/recording-service.test.mjs test/recovery-inventory.test.mjs`：9/9。新增普通 WAV、嵌套 audio、空目录、其他软件清单、无 product 清单、清单为目录、损坏 JSON、未来版本及两次重扫回归，核对外部音频/清单字节不变；已有合法录音、损坏录音、v1 迁移和中断恢复检查保留。
- typecheck / AppBuild / portable 334/334 通过。日志 `artifacts/m9/library-fix-build.log`、`library-fix-portable.log`。
- `node tools/m9/library-discovery-ui.cjs`：实际 Electron 在独立合成混合目录中仅列合法录音与损坏 Trace 清单；刷新后数量不变；合法录音实际文件分析、seek、静音回放时钟前进及暂停通过，原 PCM 和外部文件 hash/内容不变。初次开发构建报告 `artifacts/m9/library-discovery-1792386928325/report.json`；不使用个人录音，不替代听感验收。

## 新验证包与接力

新包目录 `dist-trace/preview.35-library-fix/`，入口 `win-unpacked/Trace.exe`；包含之前声谱图移植与频谱低频修复。版本仍为 `0.1.0-preview.35`，以输出目录及 `LOCAL-VALIDATION.json` 区分。未关闭或覆盖旧程序；打包/审计设置进程级 `TRACE_BUILD_TAG=library-fix`，不改变全局配置。

ZIP `Trace-0.1.0-preview.35-Windows-x64.zip` 为 150229952 字节，SHA-256 `186e5c25cd653bd8aea9253ef721e00621f2e78f6cb861543f85ea5df93bc767`；110 个 ZIP 文件与应用目录逐一 hash 一致，ASAR SHA-256 `1b2f83b46ecc9292e075b4eb01df4f464962eee3f6aecbcc8e08f96ea2de8288`。新包内容审计 5/5、加载/主题重启通过；包内识别/分析/静音回放专项 4 组通过，报告 `artifacts/m9/library-discovery-1792386979383/report.json`，已查看实际列表截图。包审计/加载报告位于 `artifacts/m6/package-audit-latest.json`、`artifacts/release/package-load.json`；打包日志 `artifacts/m9/library-fix-package.log`。

用户正常退出旧程序，运行新目录中的程序，保留同一录音目录检查列表：普通 WAV 文件夹应消失，真正 Trace 录音及损坏 Trace 提示保留。其他录音通过导入使用，不自动转换为 Trace 会话。未提交/推送、未签名、未触发远程 CI；设备故障、长录音、96 kHz 实录与系统 DPI 边界仍按 76 待验。
