# 61 · LeoMoon 系列 / Trace 产品标识接入

日期：2026-09-17。交付版本：0.1.0-preview.28。

## 确认的品牌层级

用户明确要求复用已有 LeoMoon 的狮子月牙图标形状，仅换色；LeoMoon 继续作为系列品牌，Trace 是个体产品名。此前声波新图形方向已放弃，没有接入软件。

顶部改为绿—青狮子月牙 + LeoMoon 字标，下方 TRACE 产品名；保留 Audio Recorder & Analyzer 副标题。

2026-09-28 补充（用户确认，见 [71](71-INSTRUMENT-THEMES-PLAN.md) 第 6 节 D1）：引入仪表主题后，狮子月牙 PNG、应用图标和 LeoMoon 字标仍固定为本节样式；TRACE 小字随所选仪表主题变色，默认 Trace 绿主题下与现状一致。preview.31 已在本地实施（`--brand-product`），像素采样确认五个主题的 TRACE 小字分别使用各自主色；2026-09-30 用户已验收开发构建并接受主题差异（71-D5）；额外显示器/色弱用户与首帧专项仍分别待验。应用名称、进程/文件名、配置目录、录音与数据身份仍为 Trace。帮助中补充“LeoMoon 系列”。

素材来自用户提供的 LeoMoon 概念图，使用内置 image_gen 提取/换色/清理；仅有位图参考，未声称获得原始矢量文件。最终图复制进入 `resources/trace/branding/leomoon-trace-v1.png`，来源和提示词见该目录 README。另一项目保持只读，未改动其标识或界面。

## 接入

- `BrandLockup.tsx` 统一渲染系列/产品组合，图像为装饰元素，组合提供完整可访问名称。
- 标题栏沿用 42px 高度。标识 36px，LeoMoon 20px，TRACE 10px；窄窗口隐藏副标题，仍保留系列和产品名称。
- 顶部、PNG 应用图与 Windows ICO 使用同一来源，ICO 包含 16/32/48/64/128/256 六档；打包工具写入 Trace.exe 资源。
- 原波形 SVG 移入 legacy 留存，不再作为图标输入；旧版本包不覆盖。

## 验证

- TypeScript 检查、构建通过。
- preview.28 实际包在 1024/1280 宽度、1/1.5/2 倍渲染的六组检查通过：素材成功加载，系列/产品文字存在，无页面溢出，与右侧状态/按钮不重叠。实际顶部截图与 256px 图标已查看。
- 报告：`artifacts/branding/ui-1789625259550/report.json`；截图同目录。
- 八个 main/worker/preload JS 除产品版本号外与 preview.27 相同，native 字节相同；未修改音频/录音/故障处理或重新执行这些路径的全量测试。
- 包审计四项通过，源 PNG、生成图标与 EXE 品牌版本已接通。真实 Windows 任务栏图标缓存刷新仍以用户重启新版后的显示为准。

## 交付

- EXE：`dist-trace/preview.28/win-unpacked/Trace.exe`。
- ZIP：`dist-trace/preview.28/Trace-0.1.0-preview.28-Windows-x64.zip`，208,414,286 bytes。
- ZIP SHA256：`550153407e6865484713be7188a0ee6c0cb952fa7d5624b14446a85add160637`。

下一步为用户确认当前系列/产品层级与配色；本轮没有工程阻塞，不扩展 PB3–PB5。
