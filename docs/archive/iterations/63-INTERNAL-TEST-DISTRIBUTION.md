# 63 · 同事内测分发包

日期：2026-09-17。软件版本：0.1.0-preview.28；分发修订：InternalTest-r1。

## 交付

`dist-trace/internal-test/LeoMoon-Trace-preview.28-InternalTest-r1-Windows-x64.zip`

- 大小：210,504,189 bytes（约 210.5 MB / 200.8 MiB）。
- SHA256：`8b1d206f938cafe91eeb1bc5b9697655b30d2a77d1d03be5ecd4fedefdeabf72`。
- 同目录 `.zip.sha256` 文件用于分享时核对下载。
- ZIP 内只有一个顶层目录 `Trace-preview.28-InternalTest-r1`；完整解压后阅读 `00-开始使用.txt`，运行 `Trace.exe`。

本次不重新编译、不更改软件版本或功能，也不覆盖原 preview.28 包。分发修订只补齐手册与同事试用材料；当前用户配置和录音不会随包携带。

## 包内内容

| 内容 | 用途 |
| --- | --- |
| Trace.exe、DLL、resources、locales 等 | 原已验证 preview.28 的完整运行组件 |
| 00-开始使用.txt | 解压、运行、第一次录音与反馈入口 |
| 01-快速上手.pdf | 已检查的八页中文手册，字节与原 PDF 相同 |
| 02-内测试用清单.txt | 基本任务、可选环境专项、主观反馈 |
| 03-已知限制与版本说明.txt | 版本范围、单实例旧版边界、待验证项、更新方式 |
| 04-问题反馈模板.txt | 复现步骤、环境、影响和诊断附件说明 |
| 05-许可与来源.txt | 组件许可位置、版本来源与内部使用范围说明 |
| README-Trace.md | 修正旧条目后的详细使用说明 |
| BUILD-INFO.json | 程序源码/手册版本、主模块/native/PDF 和打包脚本身份 |
| SHA256SUMS.txt | 包内逐文件校验，排除校验文件自身 |

沿用原包全部许可文本。这里按同一组织内的同事试用准备，不声称公开分发门槛或对应源码公开交付已经完成；组织外分发需另行整理对应源码等材料。内部使用范围依据见 [GNU FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#InternalDistribution)。

## 构建与保护

`tools/package-internal-test.cjs` 按已有通过的 97 文件审计清单取包，并逐项核对原始 SHA256。README 是明确替换的文档；应用 ASAR、native、编码器及其他运行组件保持原字节。增加的中文 TXT 为带 BOM 的 UTF-8，便于 Windows 记事本打开。

发现原 win-unpacked 目录后来产生了 debug.log。首轮按完整目录一致性检查中止，原记录保留；最终按已验证文件白名单提取，明确跳过 debug.log，不删除源目录中的文件。禁止录音、配置、诊断日志、测试夹具和开发目录进入交付包。

只创建新 staging、ZIP 和解压验证目录；已交付修订存在时拒绝覆盖，应选择新修订号。旧程序、旧 ZIP、个人配置与录音保持原样。

## 实际验证

最终报告：`artifacts/internal-distribution-1789628708810/report.json`。

- ZIP 完整性检查、中文路径解压和 105 文件清单/哈希通过。
- PDF 与已交付原件 SHA256 相同；包内 TXT/README/构建信息不含个人工作区路径。
- 解压后从空工作目录启动，运行时离线；所需 native/DLL 从包内加载。
- `package-smoke.cjs` 八项通过：实际 WASAPI、WAV/MP3 成品、格式设置、编码/解码/分析与重开流程。
- 不同目录程序的单实例四项通过，录音帧数 14880 → 36000，设置没有被重复启动覆盖。
- 使用后包内文件再次校验未变，最终 ZIP 才复制到交付位置。

这些是当前开发机的隔离/重定位验证，不是另一台干净 Windows 或全部声卡验证。包未签名，Windows/公司策略的首次运行体验由本轮同事反馈补充；没有关闭或修改系统安全策略。

## 下一步

发起人可将 ZIP 与校验文件分享给同事，收集试用清单和诊断反馈。未代发邮件、未上传外部站点。没有运行中的测试或工程阻塞；这次分发不等于 PB3–PB5 全部完成。
