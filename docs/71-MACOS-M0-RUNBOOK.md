# 71 · M-MAC0 Core Audio tap 真机验证手册

状态（2026-09-24）：探针源码已加入 `tools/mac0/`；**尚未在 macOS 编译或运行**，尚无系统声音、权限、设备或 96 kHz 结论。本手册是 [70](70-MACOS-PORT-PLAN.md) 的首项工作票，不是测试报告。探针与正式 `trace_engine.node` 分离，不写 PCM、WAV 或压缩音频文件。

## 准备

使用可运行 macOS 14.2 或更新版本的 Apple silicon Mac。将当前分支检出到 Mac；安装 Xcode Command Line Tools、适用 Xcode/macOS SDK 和 CMake。先记录 `sw_vers`、`uname -m`、`xcodebuild -version`、`xcrun --show-sdk-version`、`cmake --version` 的原始输出。不要把个人用户名、设备 UID 或本机绝对路径提交入仓库；可将原始日志放在被 `.gitignore` 排除的 `artifacts/mac0/`，对外报告只保留必要的匿名设备标识。

从 `app/` 目录运行：

```sh
cmake -S tools/mac0 -B build/mac0
cmake --build build/mac0 --config Release
codesign --force --sign - build/mac0/TraceCoreAudioProbe.app
build/mac0/TraceCoreAudioProbe.app/Contents/MacOS/TraceCoreAudioProbe --list
```

`codesign --sign -` 只为本地探针提供临时签名；它不是 Trace 产品的 Developer ID 签名或公证。若 CMake 生成器把 bundle 放在配置子目录，先确认实际生成路径，再用其 `Contents/MacOS/TraceCoreAudioProbe`。构建或签名失败时保留原始错误，不改 SDK 或忽略权限错误来制造通过。

## 采集矩阵

用 `--device UID` 指定 `--list` 中的设备；省略时选择系统默认输出设备。`--seconds` 允许 1–3600。探针每秒输出一行 JSON，包含实际 tap 格式、回调/帧数、超过阈值的信号帧、原生 host/sample 时间、样本时间缺口/重叠和无效缓冲计数。`deltaAudibleFrames` 只是判断是否收到明显的 PCM 信号，**不是** LUFS、完整录音或设备覆盖的证明。日志不包含 PCM。

建议按顺序做以下独立运行，并用外部播放器制造可识别的播放→静音→播放阶段：

1. 默认输出设备：播放 5 秒、静音 5 秒、继续播放 5 秒；运行 `--seconds 20`，记录授权提示与响应。
2. `--device UID` 选择第二个输出设备；确认声音确实从该设备播放，比较探针结果与默认设备。只换 UID 但不实际路由声音不能证明来源选择。
3. 在运行前拒绝系统音频录制权限，再通过系统设置恢复；分别记录错误、提示和重试结果。不要手改 TCC 数据库。
4. 设备断开、默认设备切换、空闲无播放；记录原始 host/sample 时间、帧差和 tap 是否终止。必要时重新运行探针，每次运行按新的 epoch 判断。
5. 可配置时依次试 44.1/48/96 kHz；记录**设备标称采样率与 tap 实际采样率**。没有可用 96 kHz 设备时标未验证。
6. 短项成立后再做 30 分钟空闲/播放混合观察。探针无 PCM 写盘，此项只检验 API 回调、时间和资源走势，不能代替后续 Trace 30 分钟录音验收。

示例（将 UID 替换成 `--list` 的实际值）：

```sh
mkdir -p artifacts/mac0
set -o pipefail
build/mac0/TraceCoreAudioProbe.app/Contents/MacOS/TraceCoreAudioProbe --seconds 20 2>&1 | tee artifacts/mac0/default-play-silence-play.jsonl
build/mac0/TraceCoreAudioProbe.app/Contents/MacOS/TraceCoreAudioProbe --device 'DEVICE_UID' --seconds 20 2>&1 | tee artifacts/mac0/selected-output.jsonl
```

探针若报告不支持的 tap 格式，会直接停止，不会假设格式并读错 PCM；零回调/零帧也会返回非零退出码。请记录 `capture_start` 前后的完整错误。系统未交付 sample time 时，不能从探针的 `frames` 总数直接推定没有缺口。还要核对 host time 与实际播放区间，以及运行后设备/权限状态。

## 记录模板与 M-MAC0 出口

| 项目 | 实测填写 |
| --- | --- |
| 分支/提交、探针源码版本 | 待实测 |
| Mac 芯片、macOS、Xcode/SDK、CMake | 待实测 |
| 输出设备匿名标识、路由方式、标称率/声道 | 待实测 |
| tap 实际格式、声道、采样率 | 待实测 |
| 首次授权、拒绝、恢复的操作和结果 | 待实测 |
| 播放→静音→播放的 `deltaFrames`、`deltaAudibleFrames` | 待实测 |
| sample/host time 可用性、gap/overlap、无效包 | 待实测 |
| 指定设备是否只采到所选来源 | 待实测 |
| 44.1/48/96 kHz 各自状态 | 待实测或明确未验证 |
| 30 分钟资源、回调/时钟趋势 | 待实测 |
| 阻塞缺陷、原始日志位置、后续决定 | 待实测 |

只有在真实 PCM、来源语义、权限和时钟都能解释且保存证据后，才决定进入 M-MAC1。任何失败须保留完整反例；如 Core Audio taps 不能满足指定来源或可靠计时，按 [ADR-012](11-DECISIONS.md) 修订并验证备选，而不把上游 Prism 展示队列接成正式录音路径。
