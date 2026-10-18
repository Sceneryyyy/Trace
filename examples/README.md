# Trace 数据示例

2026-10-02 对照 preview.31 源码更新。示例无真实音频，`exampleOnly:true` 只标识文档用途，不是应用强制拒绝载入的开关；不要复制到录音库执行回放或恢复。

- [session.example.json](session.example.json)：SessionDocument v2 的中断录音结构，含 region、帧边界、质量 unknown、WAV-only assets 与纳秒会话坐标。通过真实 `normalizeSession()` 的结构校验；媒体存在性与哈希无法由示例证明。类型见 [sessionStore.ts](../src/trace/sessionStore.ts)，语义见 [04](../docs/04-DATA-FORMATS.md)。
- [export-presets.example.json](export-presets.example.json)：分别列出 RecordSettings v3 和 ExportPreset。每个 settings/preset 对象通过当前校验器；外层 label、exampleOnly、documentationVersion 是文档元数据，不作为 IPC payload 发送。

WAV 录音允许 `sampleRate:'source'`，导出预设需解析成数值采样率；MP3/AAC 只允许 44.1/48 kHz。当前没有 VBR/抖动选项。录音参数含 namePrefix/keepOriginal，导出参数不含这两项；字段定义见 [recordSettings.ts](../src/trace/recordSettings.ts)、[mediaTypes.ts](../src/trace/mediaTypes.ts) 和 [06](../docs/06-CONTRACTS.md)。

2026-10-18 对照 preview.35 复核：6 个录音设置、5 个导出预设通过实际校验器；Session v2 的帧数、纳秒时长和 unknown 质量保持。旧示例结构仍兼容，不为前端改版升级 schema；检查见 [90](../docs/archive/iterations/90-WORK-DOCUMENTATION-REVIEW.md)。

早期 example schema v1 已被这些现行示例替代，可从 Git 历史追溯。
