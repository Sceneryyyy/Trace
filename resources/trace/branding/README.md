# LeoMoon · Trace 品牌素材

2026-09-17，用户明确：LeoMoon 为系列品牌，复用狮子与月牙图形；Trace 为个体产品名，只调整配色以适配本产品。

## 当前资产

- `leomoon-trace-v1.png`：当前实际使用的绿—青配色狮子月牙，深石墨底。顶部品牌区直接使用此文件，Windows PNG/ICO 由同一来源生成。
- 来源：用户提供的另一项目 `VSTDev/docs/assets/leomoon-concept-v1/leomoon-sfx-rack-concept-v1.png`。该目录只有概念图，没有独立透明图或 SVG 原稿；当前文件是依据参考图提取、换色和清理得到的位图，不称为原始矢量文件。
- 工具：Codex 内置 image_gen。最终生成资产完整复制进入本项目，未使用 CLI/API fallback，未修改另一项目的素材。
- 色彩方向：顶部荧光绿 `#91E65C` 至底部青色 `#58D4DA`；石墨底参考 `#171D24`。实际生成色值具有渐变，不把描述色值当作全图逐像素校准。
- SHA256：`ebc47614d0490582b4f26b6e43fda36e60ff75e3d663cc7338d877f90abe8a57`。
- 标题栏文字由界面渲染：LeoMoon 为系列字标，TRACE 为下方产品名，旁边保留 Audio Recorder & Analyzer。
- `tools/m6/icon.cjs` 从此 PNG 生成 256px 应用图及 16/32/48/64/128/256 的 ICO。原波形 SVG 保留在 `resources/trace/legacy/icon-wave-v1.svg`，不再作为打包输入。

## 最终清理提示词

Image 1 is the recolored LeoMoon lion-and-crescent emblem to clean. Image 2 is the original approved LeoMoon brand and is a geometry reference. Preserve the original crescent and lion silhouette, all proportions, eye/nose/mouth/mane, facing right, same exact logo identity. Do not invent a different design. Remove all speckles and stray pixels; retain only the clean large intended filled silhouette with smooth anti-aliased contours. Retain the lime green top to cyan bottom fill. Return on a perfectly flat opaque solid dark graphite background, hex #171D24, including negative spaces. Do not return transparency. No vignette, glow, shadows, texture or noise. Centered square production asset, approximately 8% margin. No text; the application renders the LeoMoon series wordmark with TRACE beneath.

透明探索稿出现边缘杂点，未接入产品；最终采用已检查的深色底版本。此前误解为声波新图形的方案已放弃，不属于品牌资产。
