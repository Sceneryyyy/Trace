# 65 · 未提交改动复核交接（面向复核 agent）

交接日期：2026-09-23
状态：**全部改动位于工作树，未 commit、未 push**（分支 `recorder/dev`，基线 commit `4fa6b21`）
目的：把当前工作树里的改动完整、可追溯地移交给另一个 agent 独立复核。

> **给复核者的一句话**：本文档不要求你相信任何结论。第 8 节列了我自己认为最该被挑战的点，第 9 节给了可执行的复核清单。**发现我判断错了请直接推翻。**

---

## 1. 必读：工作树里混着三批改动，不要混为一谈

`git diff` 会给你 44 个改动文件 + 12 个新增文件，但它们来自**三个不同批次**。只有第 3 批是这一轮的产物。复核时请按批次隔离，否则会把别人的改动算到这一轮账上。

### 批次 0 · preview.29 内测 R2 打包（更早会话，非本轮）

```
electron-builder.trace.cjs
docs/64-INTERNAL-TEST-R2.md                     (新增)
docs/distribution/internal-test/00,02,03,04*.txt
tools/package-internal-test-r2.cjs               (新增)
src/trace/product.ts                             (仅版本号 preview.28 → preview.29)
```

**本轮未触碰。** 如需复核请另行要求，不在本文档范围内。

### 批次 1 · 前端渲染层迭代（本会话上一轮，依据 `14-FRONTEND-AUDIT.md`）

```
src/trace/renderer/App.tsx                       (±310 行，改动量最大)
src/trace/renderer/LiveInstruments.tsx           (新增)
src/trace/renderer/snapshotStore.ts              (新增)
src/trace/renderer/viewModel.ts                  (新增)
src/trace/renderer/{AnalysisInstruments,SpectrogramPanel,Timeline,InstrumentWorkspace,ReportPanel}.tsx
src/trace/renderer/{styles,instruments,analysis-instruments}.css
src/renderer/components/{ScopeModule,SettingsPanel,Strip,AstraScopeModule}.tsx
src/renderer/stores/settingsStore.ts
src/renderer/visualizers/{SpectrumAnalyzer,Oscilloscope}.ts
src/renderer/styles/globals.css
```

**⚠ 这一批是当前最大的未验证风险面，见第 7.1 节。** 本文档对它只做风险提示，详细设计说明在仓库外的 `14-FRONTEND-AUDIT.md`（见第 10 节的文档位置问题）。

### 批次 2 · 本轮：测试接入 CI + P0 缺陷修复（依据 `15-CODE-AUDIT-PREVIEW29.md`）

**这是需要你重点复核的部分。** 文件清单：

| 类别 | 文件 |
|---|---|
| 测试基础设施（新增） | `test/trace-suites.mjs`、`scripts/run-trace-tests.mjs`、`test/suite-coverage.test.mjs`、`test/path-equal.mjs` |
| 回归测试（新增） | `test/source-continuity.test.mjs`、`test/source-retention.test.mjs`、`test/library-visibility.test.mjs` |
| 测试修正 | `test/{delivery-service,import-service,import-store}.test.mjs`（盘符大小写）、`test/recording-service.test.mjs`（**预期变更，见 8.1**）、`test/spectrum-native.test.mjs`（+1 项） |
| 门禁与 CI | `tools/trace.cjs`、`package.json`、`.github/workflows/main.yml` |
| P0 修复（TS） | `src/trace/{recording,sourceRetention,main,fileJobs,analysisService,playbackService,supportJournal,supportRuntime}.ts`、`src/trace/renderer/RecordingLibrary.tsx` |
| P0 修复（C++，上游栈） | `native/src/{spectrum,oscilloscope,main}.cpp` |
| 文档 | `docs/13-HANDOFF.md`、本文件 |

注意 `src/trace/renderer/RecordingLibrary.tsx` **同时含批次 1 与批次 2 的改动**（`useMemo` 属批次 1，不可读条目展示属批次 2）——这是唯一跨批次的文件。

---

## 2. 环境准备（不做这步你跑不起来任何东西）

**本机 `node`/`npm` 都不在 PATH 上。** 我实际使用的解释器：

```
C:\Users\v_yuqixing\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
```

因此**不要用 `npm run xxx`**，直接调 node 脚本，或先把上述目录加进 PATH：

```bat
set PATH=C:\Users\v_yuqixing\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%
```

git 仓库根是 `TraceDev/app/`（**不是** `TraceDev/`）。所有 git 命令请在 `app/` 下执行。

---

## 3. 复核用命令与期望基线

按开销从低到高排列。前两条就能覆盖绝大部分本轮改动。

| # | 命令（在 `app/` 下） | 期望结果 | 耗时 |
|---|---|---|---|
| 1 | `node tools\trace.cjs check` | typecheck 通过；`3 pass` + `6 pass` + **portable 43 文件 / 202 项** + **native 8 文件 / 49 项**，`fail 0` | ~2 min |
| 2 | `node tools\trace.cjs native` | `gyp info ok`（重建上游 `visualizer_dsp.node`） | ~1 min |
| 3 | `node --test test\spectrum-native.test.mjs test\spectrogram-native.test.mjs test\vectorscope-native.test.mjs test\lufsmeter-native.test.mjs` | 23 项全过 | ~10 s |
| 4 | `node tools\build-engine.cjs` | **15** 个 CTest 全过（`100% tests passed out of 15`） | ~3 min |
| 5 | `node_modules\.bin\electron-vite.cmd build --config electron-vite.trace.config.ts` | 3 个 `✓ built` | ~5 s |
| 6 | `node tools\m0\run.cjs electron` | `"status":"pass"`、`"frames":240000`、`"overwrites":0` | ~1 min |
| 7 | `node tools\m7\workspace-ui.cjs` | **期望失败**，见 7.2 | ~30 s |

> 命令 1 的 native 层需要 `native-trace/build/Release/trace_engine.node`、`native/build/Release/visualizer_dsp.node` 与 `.tools/ffmpeg`。缺产物时运行器会打印"需要 X，请运行 Y"并**跳过**该层（此时项数会少于 49，属预期行为）。若要强制缺产物即失败：`set TRACE_REQUIRE_NATIVE=1`。

---

## 4. 方向一：测试基础设施（改了什么，为什么这么设计）

### 问题（审计已核验）

`tools/trace.cjs check` 只跑 47 个 Trace mjs 测试中的 **4 个**；CI 的 19 个测试**全部**属于上游 Prism，Trace 产品在 CI 上覆盖率为 **0**；`build:trace-engine`（15 个原生 CTest）也不在 CI。有 6 个测试文件从未被任何入口引用（孤儿）。

### 改动

1. **`test/trace-suites.mjs`** — 分层清单，单一事实来源：
   - `portable`（43 个）：纯 esbuild + `src/`，任意 OS、干净检出即可跑。
   - `native`（8 个）：每个条目显式标注所需产物（`trace_engine` / `visualizer_dsp` / `ffmpeg`）。
2. **`scripts/run-trace-tests.mjs`** — `portable | native | all`。缺产物时打印可操作提示并跳过，而不是抛晦涩的 ENOENT；`TRACE_REQUIRE_NATIVE=1` 时缺产物即失败。
3. **`package.json`** — 新增 `test:trace` / `test:trace-native` / `test:trace-all`。
4. **`tools/trace.cjs`** — check 的测试列表从 4 个文件改为两层全量（原 `test:trace-report`/`-contracts`/`-recording` 已被 portable 层涵盖，不再单列）。
5. **`.github/workflows/main.yml`** — `quality-gate` 增加 `test:trace` + `build:trace`；新增独立 `trace-engine` job（windows-2022）跑 `build:trace-engine` + `prefetch-ffmpeg` + `test:trace-native`（带 `TRACE_REQUIRE_NATIVE=1`）。
6. **`test/suite-coverage.test.mjs`** — 元测试，防复发：
   - ① `test/*.test.mjs` 目录扫描结果与清单**双向相等**（新增测试不登记即失败）；
   - ② portable 层不得出现原生依赖标记。

> **设计意图**：孤儿测试的根因是"清单靠人记得维护"。元测试把它变成结构性约束。该元测试在我自查时**真实拦下过一次误分层**。

### 附带发现：孤儿测试已经腐化（这是"没人跑"的实际代价）

审计指出的 6 个孤儿里，**4 处已经跑不过**：

- `test/delivery-service.test.mjs`
- `test/import-service.test.mjs`（2 处）
- `test/import-store.test.mjs`

**根因**：Windows 盘符大小写。服务层经 `realpath` 规范化后返回 `C:\...`，测试用 `path.resolve()` 得到继承 cwd 的 `c:\...`，两者做了大小写敏感的字符串比较。

**判断**：产品行为是**正确的**——`realpath` 规范化是防 junction/symlink 逃逸的必要手段，不能为了让测试过而去掉。是测试的比较方式错了。新增 `test/path-equal.mjs` 的 `assertSamePath()` 按平台语义比较（Windows 大小写无关），修正 4 处调用点。

**请复核者挑战**：我是否把"产品对、测试错"判反了？请自行确认 `realpath` 规范化确实是有意设计而非偶然（建议查 `src/trace/` 内相关注释与 `11-DECISIONS.md`）。

---

## 5. P0 修复逐条（含精确行号与可证伪方式）

行号为**改动后**的新行号。

### P0-A · 回听时连续性读数恒为"完整"（数据正确性）

- **缺陷**：`src/trace/playbackService.ts:257` 原为 `continuity:native.error?'unknown':'complete'`——**硬编码 `'complete'`**。只要原生层没报错，界面对任何素材都显示"完整"，包括实际有丢包/拼接/估计静音的录音。这是一个会让用户**据此做出错误结论**的读数。
- **修复**：
  - `src/trace/analysisService.ts:7` — `AnalysisSource` 增加 `continuity` 字段；
  - `src/trace/recording.ts:40-53` — 新增**导出**函数 `sourceContinuity(document, regionId?)`，综合 region 状态、错误、拼接痕迹、`estimatedFrames`、`hasDiscontinuities` 判定；
  - `src/trace/playbackService.ts:257` — 改为 `native.error?'unknown':c.source.continuity||'complete'`。
- **回归测试**：`test/source-continuity.test.mjs`（5 项）覆盖完整 / 中断 / 恢复 / 拼接 / 估计静音 / 已取消区段不误判 / 单区段只判自身。
- **如何证伪**：把 `playbackService.ts:257` 改回硬编码 `'complete'`，测试应失败。
- **未验证**：真实"丢包"录音的端到端表现（需实机拔插声卡制造缺口）。

### P0-B · 清单不可读导致录音从库里静默消失（数据可见性）

- **缺陷**：`src/trace/recording.ts` 原 `catch{}` 静默吞掉 `session.json` 解析失败。音频文件仍在磁盘上，但库里**什么都不显示**——用户无法区分"录音失败了"和"从来没录"。
- **修复**：
  - `recording.ts:58`（字段）、`:81`、`:90-97`、`:110`、`:113-117` — 失败项记入 `unreadable` Map；`summaries()` 追加 `status:'unreadable'` 条目（`availability:'unavailable'`、`roles:[]`、携带错误原因）；
  - `recording.ts:376-381` — `folder()` 支持 `unreadable:` 前缀，让"打开目录"可用；
  - `setDirectory` 重扫时清空 Map，避免跨目录累积；
  - `src/trace/renderer/RecordingLibrary.tsx` — 显示原因，且**只**提供"打开目录"（不提供任何分析入口）。
- **回归测试**：`test/library-visibility.test.mjs`（3 项）+ **加强**后的 `recording-service.test.mjs`（见 8.1）。
- **设计取舍**：不提供任何分析角色是刻意的——清单不可信时，让用户去文件系统自行处置比我们猜测更安全。

### P0-C · 退出顺序错误 + 无超时看门狗（崩溃/挂死风险）

- **缺陷**：`app.on('before-quit')` 原先在仍有服务可能触达原生对象时就调用了 `engine.shutdown()`；整个退出流程**没有任何超时**，任一环节卡住则进程永不退出（用户只能强杀，下次启动被判定为"上次异常中断"）。
- **修复**（`src/trace/main.ts:805-829`）：退出序列重排为
  1. 停泵 → 2. drain 所有可触达原生的服务 + `nativeAnalysisQueue.close()` → 3. **之后**才 `engine.shutdown()` → 4. 纯 JS/磁盘收尾。
  并新增 **60 s 看门狗**（`TRACE_SHUTDOWN_TIMEOUT_MS` 可覆盖），超时记 `shutdown-timeout` journal 后强制退出。
- **配套**：
  - `src/trace/fileJobs.ts:21-27,35-41,48,57,61` — worker 新增 **180 s 空闲**超时，新增 `file-worker-timeout` 事件。**注意是"空闲"而非"总时长"**：收到进度消息即重置计时，长文件分析不会被误杀。
  - `src/trace/supportJournal.ts:6` — 注册 `file-worker-timeout`、`shutdown-timeout` 两种事件；`src/trace/supportRuntime.ts:98` — 新增 `recordShutdownTimeout()`。
- **验证**：`m0 electron` 真实主进程冒烟通过（240000 帧 / 0 覆盖）。
- **⚠ 未验证**：**看门狗与 180 s 超时的触发路径本身没有被测试覆盖**。我无法在本机构造"原生层卡死"的场景。60 s / 180 s 两个数字是我的工程判断，**请复核者挑战是否合理**（尤其 180 s 对超长文件 + 慢盘是否足够）。

### P0-D · 原生入参可致堆越界 / 挂死（上游 Prism 栈）

三处均可**从渲染进程直接触发**：

| 文件 | 行 | 缺陷 | 修复 |
|---|---|---|---|
| `native/src/spectrum.cpp` | 31-40 | `setFFTSize` 未校验，非 2 的幂会喂给假定 radix-2 的变换并按 2 的幂索引 → 越界 | 增加 2 的幂校验 + `clamp(128,16384)`；并改为**先构造 FFT 再赋值 `fftSize_`**，避免分配失败留下撕裂状态 |
| `native/src/oscilloscope.cpp` | 271-284 | `getSamplesInterpolated` 对 `Infinity`/`NaN` 用 `while` 循环归一化位置 → 永不退出 | 增加 `isfinite` 拒绝；`while` 改 `fmod`（O(1)） |
| `native/src/main.cpp` | 106-112 | `getSamples` 的 count 取自**未校验的 uint32**，最大可请求约 17 GB | 增加 count 上限校验并抛 JS 异常 |

- **回归测试**：`test/spectrum-native.test.mjs` 新增 1 项。
- **✅ 已双向验证**：`git stash` 回退三个 cpp 后重编译，该测试精确报出 `FFT size must remain a power of two, got 1000`；恢复后通过。
- **注意**：编译时暴露 `OSCILLOSCOPE_BUFFER_SIZE` 位于 `Visualizer` 命名空间内，`main.cpp:108` 需限定为 `Visualizer::OSCILLOSCOPE_BUFFER_SIZE`（已修）。

### P0-F · 保留策略删除中途失败导致幸存文件永久不可见

- **缺陷**：`src/trace/sourceRetention.ts` 批量删除前把资产标为 `removing`；若中途抛错，**已成功删除的和尚未删除的都停在 `removing`**。后者文件还在磁盘上，但状态永久停留在"正在删除"，界面不再显示——用户的原始录音事实上被隐藏了。
- **修复**（`sourceRetention.ts:66,71-86`）：记录失败点，随后对仍处 `removing` 的资产**按文件是否真实存在**回滚为原状态或 `removed`，落盘后再抛出原错误。
- **回归测试**：`test/source-retention.test.mjs`（2 项）。
- **✅ 已双向验证**：回退修复后精确报出 `a surviving file must not stay hidden behind removing`（实际值 `removing`）。

### P0-G · `reference.set` 缺录音互斥守卫

- **缺陷**：`src/trace/main.ts:362` 附近，`finally` 中无条件 `retention.resume()`，可能在录音进行中恢复保留策略（进而删除素材）。
- **修复**：加上与 `syncRetentionState` 完全一致的条件 `!recordings.busy() && !managingLibrary && !exiting`。
- **回归测试**：由 portable 层既有 reference 测试回归覆盖。**这一条我没有新增针对性测试**，因为构造"录音中同时 set reference"的时序需要改造既有 harness；**请复核者判断是否需要补**。

### P0-E · 未做（合成假静音无标识）

`native/src/windows_capture.cpp` 在设备欠载时合成静音但不加标识，下游无法区分"真静音"与"补的"。

**未做的理由**（请挑战）：修复需为 `AudioChunk`/`DrainResult` 增加字段并贯穿整条上游采集链路。已核验 **Trace 产品包内只有 `trace_engine.node`**，不含 `visualizer_dsp`/上游采集；而 `trace_engine` 自己的 `CaptureClock` 用 QPC 锚点并以 `EstimatedSilence`/`Gap`/`Missing` 显式标注，**实现是正确的**。因此该缺陷只影响上游 Prism 路径。建议与"上游栈是否仍在产品路线内"一并决策，不宜在本轮夹带大范围改动。

---

## 6. 全部验证结果（我实际跑过的）

| 项 | 结果 |
|---|---|
| `tools/trace.cjs check` | ✅ typecheck 通过；3 + 6 + **portable 202 项（43 文件）** + **native 49 项（8 文件）**，fail 0 |
| `build-engine.cjs`（15 CTest） | ✅ `100% tests passed out of 15`（含 EBU 参考值、真峰时序、WAV 精度、录制快照） |
| 上游 `visualizer_dsp` 重编译 | ✅ `gyp info ok` |
| 上游 4 个原生测试 | ✅ 23 项全过 |
| Trace `electron-vite` 构建 | ✅ 3 个 `✓ built` |
| `m0 electron` 真实主进程冒烟 | ✅ pass，240000 帧 / 0 overwrites |
| `m7/workspace-ui.cjs` | ⚠ 失败，但**与干净基线同一位置**，见 7.2 |
| 两处反向验证（P0-D、P0-F） | ✅ 回退修复后测试精确失败 |

---

## 7. 已知风险与既存问题（不是本轮引入的也列出，避免你误判）

### 7.1 ⚠ 批次 1（前端）几乎没有自动化测试覆盖 —— 当前最大风险

`src/trace/renderer/App.tsx` 改动 ±310 行（快照流从 React state 迁到外部 store），新增 3 个文件。但**已核验：`test/` 下没有任何文件 import `renderer/App`**。也就是说这一批改动的正确性**只靠 typecheck + lint + 我的人工目视**，没有任何断言保护。

对复核者的建议：这里最该做的不是读 diff，而是**实机跑一遍 UI**（录音 → 回听 → 拖时间轴 → 切仪表 → 改设置 → 退出），重点看：
- 30 Hz 快照下电平/波形是否仍实时更新（外部 store 订阅是否真的生效）；
- 时间轴拖拽预览是否有延迟或跳帧（新增 rAF 节流）；
- 相关度游标、响度柱位置是否与改动前一致（`left%`/`height%` → `transform`）；
- 声谱图 hover 读数、滚轮缩放是否正常（`layer` 引用稳定化后改走 ref 读取 volatile 值，**这是最容易出错的一处**）。

### 7.2 `m7/workspace-ui.cjs` 的既存失败（**不是本轮引入**）

停在第 36 行断言 `2 !== 4`。我已确认这与**干净基线完全同一位置**。根因：instruments 顺序变化后 `label:nth-child(2)` 选择器未同步，应改为按 `data-instrument` 属性定位。**本轮未修**（超出范围）。复核时请以"位置是否相同"为准，不要当成新回归。

### 7.3 CI 新增内容未在真实 CI 上跑过

`.github/workflows/main.yml` 的改动（+43 行）**只做了静态审阅，没有真实触发过 GitHub Actions**。windows-2022 上的 MSVC 版本、CMake 可用性、ffmpeg 预取网络访问都可能与本机不同。**这是一个明确的未验证项**，第一次推上去有失败的可能。

### 7.4 其他未验证项

- 看门狗（60 s）与 worker 空闲超时（180 s）的触发路径无测试覆盖（见 P0-C）。
- 原生并发窗口、96 kHz 实采、设备拔插路径均未实机验证（沿袭审计报告第 5 节的边界）。
- P0-A 的真实丢包录音端到端表现未验证。

---

## 8. 我主动标记出来、希望被挑战的判断

### 8.1 唯一一处既有测试预期变更

`test/recording-service.test.mjs` 原有 `assert.equal(summaries.length, 3)`。P0-B **有意**把"损坏清单静默丢弃"改成"显式呈现"，该数字必然变成 6。

我的处理：**没有**放宽或删除，而是改写为更强的断言 ——
- 3 个可用项的 id 精确相等（`['good','interrupted','mixed']`）；
- 3 个不可读项被显式呈现（`['badSegment','escaped','invalid']`）；
- 且每个不可读项**必须**携带错误原因、`availability==='unavailable'`、`roles` 为空数组。

原测试的意图（"损坏项不阻塞有效项加载"）完整保留。

**请复核者判断**：这是"合理地随行为变更更新预期"，还是"改测试迁就实现"？我认为是前者（断言数量与强度都增加了，且新行为是审计认定的缺陷修复方向），但这类判断应由第二个人确认。

### 8.2 其他需要你判断的取舍

| # | 我的判断 | 请你确认 |
|---|---|---|
| 1 | 盘符大小写案中"产品对、测试错" | `realpath` 规范化是否确为有意的安全设计？ |
| 2 | P0-E 不做（上游独有路径） | 上游 Prism 栈是否仍在产品路线内？若在，此缺陷优先级应提升 |
| 3 | 60 s 关机 / 180 s worker 空闲超时 | 数字是否合理？超长文件 + 慢盘场景够不够？ |
| 4 | P0-G 未补针对性测试 | 是否接受"由既有测试回归覆盖"？ |
| 5 | 不可读录音只给"打开目录" | 是否应提供更多恢复入口（如"尝试修复清单"）？ |
| 6 | `settingsStore` 持久化 300 ms 防抖（批次 1） | 崩溃时丢失最后 300 ms 内的设置变更是否可接受？（已加 `pagehide`/`beforeunload`/`visibilitychange` flush） |

---

## 9. 复核清单（建议按序）

**第一轮 · 低成本、高信息量**

- [ ] 在 `app/` 下跑第 3 节命令 1，确认 202 + 49 全过、typecheck 干净。
- [ ] 读 8.1，独立判断 `recording-service.test.mjs` 的预期变更是否正当。
- [ ] 抽查两处反向验证：`git stash push -- src/trace/sourceRetention.ts` 后跑 `node --test test\source-retention.test.mjs`，确认**确实失败**。（原生那处成本较高，可选）
- [ ] 读 `test/suite-coverage.test.mjs`，确认元测试真能拦住"新增测试不登记"（可故意新建一个空 `test/zzz.test.mjs` 验证它失败，之后删掉）。

**第二轮 · 逐条核对 P0**

- [ ] 按第 5 节行号逐条读 diff，重点看 P0-A 的 `sourceContinuity()` 判定逻辑是否有漏判分支（这是纯逻辑函数，最容易藏错）。
- [ ] 核对 P0-C 的退出序列：确认 drain 确实覆盖了**所有**可触达原生的服务，没有漏项。
- [ ] 核对 P0-F 的回滚逻辑：「按文件是否存在决定回滚目标」在文件被外部程序占用/权限错误时是否仍正确。

**第三轮 · 风险面**

- [ ] 实机跑 UI，按 7.1 的清单目视验收批次 1。
- [ ] 静态审阅 `.github/workflows/main.yml`（7.3：从未真实触发过）。

---

## 10. 需要一并处理的文档问题（我造成的）

工作区里有**两套 docs 目录**，只有一套在 git 内：

- `TraceDev/app/docs/` — **在 git 内**，canonical，01–64 + 本文件 65。
- `TraceDev/docs/` — **不在 git 内**（仓库根是 `app/`）。

我把两份审计报告写进了**未版本控制**的那套，且编号与仓库内文件撞号：

| 文件（仓库外） | 撞号对象（仓库内） |
|---|---|
| `TraceDev/docs/14-FRONTEND-AUDIT.md` | `app/docs/14-SOURCES.md` |
| `TraceDev/docs/15-CODE-AUDIT-PREVIEW29.md` | `app/docs/15-VALIDATION-REPORT.md` |

**建议**：把这两份迁入 `app/docs/` 并重编号为 66、67（或其他空号），使审计结论随代码一起版本控制。**本轮未擅自移动**，等决策。

另：`15-CODE-AUDIT-PREVIEW29.md` 原文 3 处把原生 CTest 数量写成 17，实际 `native/recorder/CMakeLists.txt` 恰有 **15** 个 `add_test`（已核实并修正为 15）。若你在旧副本里看到 17，以 15 为准。

---

## 11. 尚未处理（审计报告中已列、本轮未动）

- 方向二剩余：`sessionStore.ts`、`wavPostprocess.ts` 仍**零测试覆盖**（两者分别决定录音元数据可否读取、落盘 WAV 格式正确性，属"破坏力与验证强度倒挂"的核心）。
- 方向四：`main.ts` 单文件 819 行 / 七类职责，`dispatch` 288 行约 90 个 case，零测试；61 处 payload 断言缺类型桥。
- 方向五：工具链瘦身；`tools/m3/integration.cjs:71` 恒真断言；`tsconfig.json` 的 `include` 未覆盖 `test/` 与 `tools/`。
- `m7/workspace-ui.cjs` 的基线失败（7.2）。
