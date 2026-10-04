# FFmpeg 9.0.2 · 源码与静态依赖核查

> 本目录保留 Gyan 9.0.2 历史候选的来源证据；它不代表新的自建二进制。当前组件见 [Trace 自建来源](../trace-ffmpeg/README.md)。原始发布者文件与不完整来源结论保持。

2026-10-03。对应 [ffmpeg.lock.json](../../ffmpeg.lock.json) 固定的 Gyan
Windows x64 essentials ZIP 和两份 EXE。原始 publisher README/GPL 保持字节，
上游 `LICENSE.md` 和 GPLv3 来自固定源码提交
`946fcce07b6dcd0331c8cc609192aeff5e1924f8`。完整身份、配置及缺口见
[source-manifest.json](source-manifest.json)。

`node tools/release/dependency-sources.cjs --fetch` 下载并验证固定上游源码，
保存到忽略目录 `.tools/ffmpeg-source/`；同时核验与发布者版本记录一致的
LAME 3.100 官方源码与 LGPL。候选附件提供两份 tar.gz、清单和本说明。
已有缓存必须匹配大小与 SHA，源码说明也核对原始字节。

已取得的是 FFmpeg 主源码和与报告版本一致的 LAME 3.100 原始源码；
LAME 的本地补丁/构建映射仍需发布者说明。发布者 README 列出 42 个外部组件和 13 个硬件
特性；系统 API 与外部 SDK 仍需区分。发布仓库只有支持说明和 FUNDING，
README 末尾提供 37 条版本/提交后缀记录，但 bzlib、gmp、gnutls、iconv、
libxml2、fontconfig、lzma、zlib 的版本未列出；也未提供完整传递依赖、
生产者补丁、构建脚本或
工具链清单，不能由“当前 MSYS2 包版本”推断历史构建。

因此完整对应源码门禁仍阻塞。`--require-complete` 必须失败，候选 manifest
保留 `correspondingSourceComplete:false`。项目归档及主源码不能充当这些
未取得资料。需要发布者提供上述构建输入，或另行建立并验收具有完整来源的
FFmpeg 构建；本轮保留相同 essentials 功能范围，未替换成受限格式构建。
