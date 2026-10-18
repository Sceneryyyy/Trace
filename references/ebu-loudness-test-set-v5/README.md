# EBU Loudness Test Set v5.0

2026-10-03：按用户要求保存到私有 `Sceneryyyy/Trace` 仓库，供用户的其他云端 Codex 会话拉取并用于内部技术测试。原始 ZIP 的全部字节以 11 个分块受 Git 版本控制，普通 clone/pull 即可取得，不依赖 Git LFS 或再次访问 EBU 下载站。

## 获取并解压

在已有 Trace checkout 的仓库根执行：

```sh
git switch recorder/dev
git pull --ff-only origin recorder/dev
```

运行以下命令（Python 3.9+，只用标准库，不需要联网或安装 npm 依赖），校验分块/官方 PDF、还原原始 ZIP 并解压、逐个核对全部 70 个原始 WAV：

```sh
python3 references/ebu-loudness-test-set-v5/prepare.py
```

新环境先通过已授权的 GitHub 身份 clone 私有仓库，然后在仓库根执行以上校验和解压命令：

```sh
gh repo clone Sceneryyyy/Trace -- --branch recorder/dev --depth 1
cd Trace
```

还原的原始 ZIP 位于 `artifacts/ebu-loudness-test-setv05.zip`，WAV 位于 `artifacts/ebu-loudness-v5/`。`artifacts/` 已在根 `.gitignore` 中忽略，避免同时提交约 300 MiB 的解压副本。解压后按原始文件名读取，不做归一化、增益、改名或格式转换；部分原名含 `.wav.wav`。Windows 上如 Python 命令名为 `python`，将上述 `python3` 替换为 `python`。

## 内容与来源

- `archive-parts/`：原始 `ebu-loudness-test-setv05.zip` 的 11 个连续字节分块，每块最多 8 MiB。还原 ZIP 为 91,631,421 字节，约 87.4 MiB，含 70 个 WAV 和 `readme.txt`；v5.0 发布日期为 2016-03-30。
- [archive-manifest.json](archive-manifest.json)：分块顺序、大小/校验值以及原始 ZIP 的大小/SHA-256；分块后还原的 ZIP 字节保持不变。
- [prepare.py](prepare.py)：离线还原、解压和完整性检查入口。常规 Git 上传返回 HTTP 401，GitHub Blob API 上传整个 ZIP 返回大小限制（422），因此使用分块保存全部原始数据。
- `EBU_Tech_3341_2023.pdf`、`EBU_Tech_3342_2023.pdf`、`EBU_Tech_3343_2023.pdf`、`EBU_R128_2023.pdf`：从 EBU 官方下载的 2023 年 11 月版。
- `EBU_Audio_Test_Sequences_Terms_of_Use.pdf`：官方使用条款（2019-07，v1.0）。
- [获取说明](获取说明.md)：官方与镜像链接、HTTP 状态、版本历史、素材用途和容差。
- [WAV_inventory.csv](WAV_inventory.csv)：70 个文件的采样率、声道、位深、时长、大小及 SHA-256。
- [SHA256SUMS.txt](SHA256SUMS.txt)：五份官方 PDF 的 SHA-256；ZIP 和分块的 SHA-256 见 manifest。
- [原始 EBU readme](readme.txt)、[镜像维护者说明](mirror-README.md)：保留出处及署名。

官方发布页：https://tech.ebu.ch/publications/ebu_loudness_test_set

本次 ZIP 来自：https://github.com/maxwalley/EBULoudnessTestSetV5/releases/tag/EBU_Loudness_Test_Set_v5

维护者声明获得 EBU 分发许可；未向 EBU 独立确认此声明。ZIP SHA-256 与该 Release 公布的 digest 一致，全部条目 CRC 检查通过，70 个 WAV 的格式头可解析；本次官方 ZIP 直接下载返回 403，尚未与其逐字节比对。

## 计量验收范围

素材取得与存储完成，不代表 Trace 的 EBU 数值验收已经通过。本轮只检查文件完整性，未构建应用/原生 addon，也未运行 M/S/I/LRA/TP 计量测试。

素材取得阶段曾使用 Prism 的 `test:lufsmeter-ebu`，只覆盖 Tech 3341 真峰值 15–23；该命令与上游 addon 已随独立化退役，当前不再构建 `visualizer_dsp.node`。当前使用本仓库 Trace 引擎的 CTest：Windows 执行 `npm run build:trace-engine`，Linux 配置 `native/portable` 并启用 `TRACE_REQUIRE_EBU=ON`；复现见 [09](../../docs/09-WINDOWS-SETUP.md)。`test/native/ebu_reference_tests.cpp` 使用生成信号；原始 WAV 的 Trace 引擎门禁现为 `tools/metering/run-ebu-wav-tests.py`，固定引擎配置、声道映射、素材 SHA-256 与 Tech 3341/3342 的原始参考值和容差。

2026-10-03 后续修复：实际 Trace Meter v5 已在 Linux 通过 68/68 适用原始 WAV，包含原先失败的 Max M；2 个多声道文件仍超出产品范围。已接入原始素材 CTest/CI runner，校准与完整密集历史见 [78](../../docs/archive/iterations/78-EBU-METER-RECALIBRATION.md)；后续 Windows 实际 WavReader/原生文件分析已通过，旧工具链独立化记录见 [79](../../docs/79-TRACE-INDEPENDENT-PROJECT.md)，当前完整 CI 见 [80](../../docs/archive/iterations/80-RELEASE-DEPENDENCY-HARDENING.md)。前文“未运行”描述的是素材取得轮，不代表本次修复后的状态。

## 使用范围

© EBU。测试素材及官方文档不属于 Trace 的 GPL 授权；原始权利和条款保持不变。这份副本仅用于用户私有研发环境的内部技术测试，不应随应用安装包、公开源码或公开 Release 分发。具体限制见 [官方使用条款](EBU_Audio_Test_Sequences_Terms_of_Use.pdf)，镜像维护者的特殊许可不自动转授。

Tech 3341 提醒测试信号 15–23 电平较高，不应以正常监听音量播放。
