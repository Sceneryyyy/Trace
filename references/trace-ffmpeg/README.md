# Trace 自建 FFmpeg 来源

Windows x64 编码组件由 Trace 的 [构建脚本](../../tools/codec/build.cjs) 编译，
输入为 [build-lock.json](build-lock.json) 固定的 FFmpeg 9.0.2 和 LAME 3.100 官方源码。
源码不修改，补丁清单为空。GNU Make 只作为构建工具，MSYS2 库不链接进程序。
旧 Gyan 来源及当时缺失的资料保留在 [历史目录](../ffmpeg-9.0.2/README.md)。

产品需要的 WAV 16/24-bit PCM、32-bit float、MP3、AAC LC（M4A/ADTS），
分段、拼接、重采样、裁剪及 JPEG/PNG 附图识别均保留。只开放 file/pipe 协议。
PNG 附图随音频探测，音频解码忽略视频；此配置不提供通用视频处理。

构建使用 MSVC 19.44.35229 / 工具集 14.44.35207、SDK 10.0.26100.0、静态 `/MT` CRT。
工具 EXE/DLL、编译器目录和 SDK/CRT 头文件及 x64 库均生成输入哈希。
Microsoft 的系统库、CRT 与编译工具单列为专有系统/工具链输入，
不声称提供它们的开源实现；源码完整性字段的范围是 FFmpeg、LAME 和本项目构建脚本。
分发前的系统库例外、微软条款与组件安全复核仍由发布验收单跟踪。

## 复现与材料

```powershell
node tools/codec/build.cjs
node tools/prefetch-ffmpeg.mjs
node tools/release/dependency-sources.cjs --fetch --require-complete
```

构建要求锁定的 VS 2022 x64 工具、SDK 与 `C:\msys64` Bash。
脚本通过 vswhere 查找 VS，可使用符合相同输入哈希的 Enterprise/Community/Build Tools 安装。
源码和 Make 包均经大小/SHA-256 校验；完整构建在带所有者标记的 `C:\trace-codec` 下运行，
不覆盖未标记的已有目录。固定路径及 `/Brepro` 用于核验输出是否可重复。

源码缓存位于 `.tools/ffmpeg-source`；试构建输出在 `.tools/trace-ffmpeg`，
安装门禁通过后才切换到 `.tools/ffmpeg`。也可将匹配的私有 CI 编码组件附件完整解压到
`.tools/trace-ffmpeg` 再执行安装命令；它仍须通过锁定 EXE、报告、配置及许可的校验。
已存在但不匹配的报告/缓存会明确拒绝；更新工具链时须重新构建、回归并更新证据，
不能直接跳过哈希检查。

`source-manifest.json` 与 `build-report.json` 将实际 EXE、配置、源码、构建锁、脚本
和工具/系统输入绑定。候选包附带两份官方源码归档、项目源码（含脚本和锁）、
构建报告、配置及完整系统输入文件清单。应用许可目录也保留来源与构建记录。

[COPYING.GPLv3](COPYING.GPLv3)、[上游许可说明](LICENSE.upstream.md)、
[LAME LGPL](LAME-LGPL.txt) 和 [LAME README](LAME-README.txt) 保留原始字节。
二进制与对应源码的实际验证记录见 [自建说明](../../docs/81-SELF-BUILT-FFMPEG.md)。

2026-10-09 的 MSYS 运行库身份更新及源码重建已核验，原 EXE/config/recipe 保持。
2026-10-11 完整 CI 复用同 pin 的构建缓存，再次严格核验报告、实际 EXE、配置与
系统输入清单；不声称本次重新编译或核验当前主机的工具文件。
最新文件/故障矩阵、实际 CI 摘要及候选身份见 [82](../../docs/82-FILE-FAULT-TESTING.md)
与 [当前交接](../../docs/13-HANDOFF.md)。旧附件只有通过当前完整身份核验才可复用；
旧报告与当前 lock 不匹配时应重新构建，不能混用证明。
