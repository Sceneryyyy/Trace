# 16 · M0 Windows 底座与采集诊断

日期：2026-09-15。源码：Prism `df0755b8caaaab85157ac51aefffca0526974fc1` + Trace 未提交开发增量；分支 `recorder/dev`。这是一份 M0 复用验证报告，不是录音机发布验收。

## 结论与退出边界

**保留 Electron/React/TypeScript + C++ WASAPI 主路线。** 锁定上游可构建，原生模块能在对应 Electron 主进程加载，独立 C++ 消费者可在无 renderer 时取块；原生时间信息也可直接从 WASAPI 取得。改造可定位到 Windows capture / 新 recorder 引擎和应用控制器，无需切换 NAudio/WPF。

M0 的环境、底座与改造边界验证完成。**空闲时间线仍是 M1/T10 的首个实现关口**：本次诊断已测出不同端点的行为，尚未实现录音时间线补齐，不能声称录音完整性通过。M1 的常驻统一计量和 Trace 窗口未实现；M0 通过不等于 M1 通过。

## 实际环境

精确版本和锁文件身份见 [toolchain.m0.json](../toolchain.m0.json)。

| 项目 | 实测值 |
| --- | --- |
| Windows | x64，25H2，build 26200.9168 |
| Git | 2.55.0.windows.3 |
| Node（开发） / npm | 24.19.0 / 10.9.2 |
| Python | 3.12.14 |
| VS Build Tools / MSVC | 17.14.37 / 19.44.35228，工具集目录 14.44.35207 |
| Windows SDK / CMake | 10.0.26100.0 / 4.4.0 |
| Electron | 40.8.3，内嵌 Node 24.14.0，modules ABI 143，N-API 10 |
| React / TypeScript / node-gyp | 19.2.4 / 5.9.3 / 10.3.1 |

没有升级上游依赖树，`package-lock.json` 与锁定提交完全一致。libebur128 与 FFmpeg 尚未引入，不能把上游自带 LUFS/TP 当成 Trace 统一计量引擎。

## 任务与命令证据

| 任务 | 实际动作 / 命令 | 结果 |
| --- | --- | --- |
| T00 | 检查开工包、关联会话、同级 VSTDev 文档/状态 | 完成，只读对齐见 10；开工目录原本没有 Git |
| T01 | clone + checkout `recorder/dev` 到指定提交；读取 package/lock/gyp/postinstall | 完成，上游许可及 README 保留 |
| T02 | 依赖安装、显式 `rebuild:native`、`typecheck`、`build` | 原生 0 警告/0 错误，类型/资源构建退出 0 |
| T02 | 真正 Electron main 的 `electron-smoke.cjs` | 退出 0，加载 addon，最终复验 5 秒 240,000 帧 / 500 块 / 0 覆盖 |
| T03 | 原生 list + raw fixture；Komplete 与 Realtek 分别测试 | 实际格式、时间戳、静音/恢复证据齐备；96 kHz 未测 |
| T04 | `trace-capture-probe upstream --seconds 5` | 退出 0，239,520 帧 / 499 块 / 0 覆盖 / 0 sequence gap；不经过 JS/UI |
| T05 | 保留主路线；规则、文档、示例和调研移入 app | 完成，唯一维护文档在 app/docs |

可重复入口：

```powershell
.\Trace.ps1 Check
.\Trace.ps1 ProbeBuild
.\Trace.ps1 Probe list
.\Trace.ps1 Probe raw --seconds 6 --fixture
.\Trace.ps1 Probe raw --device-index 0 --seconds 6 --fixture
.\Trace.ps1 Probe upstream --seconds 5
.\Trace.ps1 Smoke
```

设备索引不是持久身份；先 list 确认。此机器本次 index 0 为 Realtek，默认端点为 Komplete Main Output。原始测试时使用等价的直接 CMake/node/npm 命令；新入口 Setup 已完成完整重装与原生重建，Check、Build、ProbeBuild、list、Smoke 均实际通过。最终 Check 仍为类型通过与 3/3、6/6、7/7；最终 Smoke 为 240,000 帧 / 500 块 / 0 覆盖。

## 设备及真实观察

4 个活跃播放端点：Realtek 扬声器、Komplete Audio 6 的 Main Output、Output 3/4、S/PDIF Output。查询均返回 **48,000 Hz、2 声道、32-bit float、blockAlign 8、channelMask 3**。这表示 Windows shared mix format，不代表 ADC/DAC 有 32-bit 有效硬件精度。

夹具通过单独 WASAPI render 流输出低电平 997 Hz：约 0.5–1.5 秒测试音、1.5–2.5 秒显式静音、2.5–3.5 秒停止 render、3.5–4.5 秒恢复测试音，随后停止。设备/系统音量与处理可能改变幅度，因此夹具用于链路与时间行为，不作为 LUFS/TP 数值参考。半秒桶按诊断观察时间分组，不作为样本级音频时间线。

| 观察 | Komplete Main Output | Realtek |
| --- | --- | --- |
| 观察窗口 | 6.00725 秒 | 6.01228 秒 |
| 实际包 | 599 × 480 帧 = 287,520 帧 | 381 × 480 帧 = 182,880 帧 |
| 包所含音频时间 | 5.99 秒 | 3.81 秒 |
| SILENT 标志帧 | 0；静音以真实全零 PCM 交付 | 79,680 |
| 初始 discontinuity | 1，保留为边界事实 | 1，保留为边界事实 |
| 后续 discontinuity / timestamp error | 0 / 0 | 0 / 0 |
| 设备帧位置缺口 / 重叠 | 0 / 0 | 0 / 0 |
| 连续帧号间 QPC 额外前进 | 未观察到 | 约 0.5959346 秒 |
| 判读 | 被观察的包范围连续 | `idle-clock-policy-required` |

**关键发现：Realtek 空闲期间可能不交付任何包，设备帧号与 IAudioClock 都不能单独覆盖这段墙上时间。** 恢复时帧号仍连续，QPC 才暴露额外经过的时间。起始前无包和末尾停包区间同样不能通过相邻包全部恢复，不能把 6 秒观察窗口伪报成 3.81 秒完整录音，也不能仅用 frame gap=0 宣称连续。

QPC 字段为 WASAPI 提供的 100 ns 时间，依据 [Microsoft GetBuffer](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer)。实际格式口径依据 [GetMixFormat](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-getmixformat)。

## 已固化的改造边界

| 当前上游位置 | 已观察事实 | Trace 处理方向 |
| --- | --- | --- |
| `native/src/windows_capture.cpp` GetBuffer | device/QPC 参数传 nullptr；flags 未保留到消费者 | 新块元数据保留位置/100 ns QPC/flags/epoch |
| 同文件 `pushChunk` | mutex + deque，满时 pop_front；采集侧 vector 分配 | 预分配块池、有界独立分析/录音队列；异常独立控制通道 |
| 同文件空闲分支 | 按轮询耗时取整合成零块 | CaptureClock 统一锚点/覆盖区间/余数/恢复去重；推定静音必须标注 |
| 同文件设备枚举 | 查询失败后仍可能回报默认 48 kHz/2ch | DeviceService 格式失败返回明确错误，不能伪造格式 |
| 同文件整数解码 | 有效位位置/归一化需额外审计 | M1 前覆盖 PCM16/24/32、有效位左对齐、unsupported subtype |
| `src/main/audioClipLibrary.ts` | 整段片段构造，既有回溯导出语义 | 后续独立流式 take writer；不扩大现有 60 秒缓存 |
| `tools/m0/`（新增） | 独立原生诊断与报告解释器 | 仅研发证据，未接入生产 DSP，不是完整 CaptureClock |

不移植 VSTDev 的插件处理器；只继承按风险验证、源码/构建/部署/验收分开、文档接力的约定。

## 自动检查

- TypeScript：通过。
- 上游 `test:capture-support`：3/3。主要覆盖接口支持与 preload 边界，不等于设备全验收。
- 上游 `test:lufsmeter-native`：6/6。自制 TP 回归通过，不等于 EBU 官方素材集全部通过，也不等于 libebur128 已接入。
- 新增 `test:trace-report`：7/7。覆盖 Realtek 式 QPC 空闲、uint64、标志、重叠/缺口、倒退、损坏证据。
- 原生诊断 Release 构建：通过。
- 原生 addon 在 Electron 主进程实际加载与默认设备取帧：通过。
- 上游 Electron 资源构建：通过；完整上游窗口交互未验收。

## 基线环境失败与处理

1. Git schannel 缺凭据：仅本次 clone 使用 `-c http.sslBackend=openssl`，未修改全局设置。
2. Electron 安装默认缓存目录不可写：依赖按锁恢复，显式设置项目内 `electron_config_cache` 后安装 Electron。上游 postinstall 会吞掉原生失败，因此显式重建并检查退出码。
3. 沙箱 esbuild 父目录访问失败、MSBuild FileTracker E_ACCESSDENIED：普通用户环境重跑通过；未改系统权限或安全策略。
4. 启动环境同时含 Path/PATH 导致 MSBuild 错误：对子进程环境规范化，不改全局环境。
5. 首版诊断报告尾部缓冲未输出：显式 flush 后重新采样、JSON 解析及帧总数校验通过。失败日志只保留为本机排错资料，不作为验收证据。
6. 新 clone 属主为沙箱账号，普通用户 Git 拒绝读取：只将本次新建 app 与 app/.git 两个目录属主改为当前用户，DACL 不变；未添加全局 safe.directory。

## 本机证据与仓库内容

`artifacts/m0/` 被 Git 忽略；保留原始包元数据、设备列表、Electron 结果、构建/测试日志和摘要。不保存个人音频。

- `raw-validated.json` / `raw-validated-summary.json`：Komplete fixture。
- `raw-realtek.json` / `raw-realtek-summary.json`：Realtek fixture。
- `electron-smoke.json`：实际 Electron/N-API 版本及帧数。
- `upstream-native.json`：原生独立消费者。
- `binaries.json`：本次构建二进制 SHA-256。
- `logs/`：已完成命令日志；含本机路径，仅本机保存。

全部源码修改尚未提交；未推送、未安装 VST/TUI、未部署安装包。

## 未验收与下一步

A01/A02 仅有设备枚举、两个端点 48 kHz 采集的部分证据。A03–A14 不因本次 M0 结果被标为通过。96 kHz / 44.1 kHz 真实设备配置、断连/默认设备切换、10 分钟监测、30 分钟录音、官方 EBU 素材、文件/编码/回放/完整 UI/安装包均未验收。

当前没有必须先由用户处理的环境阻塞。下一任务：**M1/T10，实现并验证原生 DeviceService + CaptureClock + 预分配分发边界**。以两份 raw fixture 为验收输入：区分真实零包、SILENT、无包、timestamp error、unknown gap；对空闲估计保存明确标志，恢复后不重复覆盖帧。然后再接 libebur128 和 Trace 的 LIVE 面板。
