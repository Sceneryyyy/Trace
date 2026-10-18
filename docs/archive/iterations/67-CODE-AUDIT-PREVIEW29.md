# Trace preview.29 全量代码质量审计

阅读提示：本页为 preview.29 的审计与修复建议快照。后续落地及独立反例见 [68](68-INDEPENDENT-CHANGE-REVIEW.md)、[交接历史](../13-HANDOFF-HISTORY.md)；当前源码/测试边界见 [13](../../13-HANDOFF.md)。文中的未修项不能直接当成当前缺陷清单。

审计日期：2026-09-21
范围：`src/trace/`（89 ts，主进程 + 服务层）、`src/main/` + `src/renderer/`（上游 Prism）、`native/`（65 个 C++ 文件，两套原生栈）、`test/`（47 mjs + 16 ts + 16 cpp）、`tools/`（137 脚本）、构建与 CI 配置。
方法：四个分区并行静态审计 + 关键结论逐条人工核验（本报告只保留已核验或标注为待验证的结论）。
前置：前端渲染层已于 `66-FRONTEND-AUDIT.md` 单独审计并完成一轮迭代，本报告不重复。

---

## 0. 总体判断

**这不是一个"质量差"的代码库，而是一个"验证强度分布极不均匀"的代码库。**

做得好的部分明显超出同类项目：BigInt uint64 帧算术全程无精度损失、`SpscQueue` 无锁队列的内存序完全正确、libebur128 的 vendored 补丁有完整的上下游 SHA256 链与规范引用、IPC 契约有精确 key 集合比对与原型污染防护、诊断导出的脱敏链路完整、打包门禁有 SHA256 绑定防"拿旧证据糊弄"。测试里没有一处 skip、没有放宽容差、没有合成读数——EBU 的 `+0.2/-0.4 dB` 是标准原值，`report-targets.test.mjs:13` 甚至在**反向守护容差不被偷改**。

问题集中在三处结构性失衡：

1. **CI 对 Trace 产品零覆盖**（已核验）。`.github/workflows/main.yml` 跑的 19 个测试全部属于上游 Prism；`build:trace`、`build:trace-engine`（含 15 个原生 CTest）、全部 `test:trace-*` 均不在 CI。Trace 的实际把关完全依赖人工在 Windows 本机执行 `tools/trace.cjs check`——而它只跑 47 个 Trace 测试中的 **4 个**。
2. **破坏力与验证强度倒挂**。会删除用户原始录音的 `sourceRetention.ts`、决定录音元数据可否读取的 `sessionStore.ts`、决定落盘 WAV 格式正确性的 `wavPostprocess.ts`——**三者在 `test/` 下零命中**（已核验）。
3. **`main.ts` 单文件 819 行承担七类职责**，`dispatch` 一个函数 288 行 / 约 90 个 case，且零测试覆盖。

---

## 1. 已核验的关键缺陷

### P0-A 回听时连续性读数恒为"完整"（数据正确性）

```257:257:src/trace/playbackService.ts
continuity:native.error?'unknown':'complete',
```

`continuity` 是数据协议中唯一的连续性读数（`shared.ts:15`，取值 `complete|estimated-silence|gaps|unknown`）。此处只看**输出设备**有无错误，完全不参考 take 自身的 `hasDiscontinuities`、`region.status==='interrupted'`、`RECOVERED_UNKNOWN_TAIL`、`estimatedFrames`。

判定为遗漏而非设计的依据：实时路径在 `viewModel.ts:33` 专门写了 `continuity:multiRegion?'gaps':snapshot.continuity` 做补偿，文件回听路径没有对应补偿。

后果：回听一个多段拼接或已恢复（尾部未知）的录音时，表头连续性指示显示正常。直接违反 AGENTS.md「不能悄悄丢帧后仍报告完整」。
缓解：库列表（`RecordingLibrary.tsx:92`）与报告（`ReportPanel.tsx:4`）仍显示"含设备中断"/"存在中断"，用户并非完全无从得知，但**表头读数本身是错的**。

### P0-B 元数据校验失败导致录音从库中静默消失（数据可见性）

```89:89:src/trace/recording.ts
try{const take=await readSession(join(directory,entry.name));take.document.preset=validateRecordSettings(take.document.preset);this.takes.set(take.document.sessionId,take)}catch{}
```

空 `catch` 吞掉 `readSession` 的一切失败，而 `normalizeSession`（`sessionStore.ts:22-54`）+ `SessionTimeline` 构造有十余个抛出点（`INVALID_SESSION`、`DUPLICATE_ASSET`、`TIMELINE_RATE_COMPLEXITY`、`REGION_FRAME_MISMATCH` 等）。

后果：磁盘上音频完好，但 take 不进入 `this.takes` → 库列表、`recover` 入口全部看不到它，**无错误提示、无占位项**。这与 `libraryService` 已有的 `availability:'missing'`（清单在、文件丢）机制正好互补的另一半——"文件在、清单不可读"完全没有覆盖。

### P0-C 退出路径：原生引擎先关，异步收尾后跑；且无看门狗

```803:816:src/trace/main.ts
try{final=engine?.shutdown()}catch(error){console.error('Trace shutdown:',error)}
const finish=(async()=>{
  if(importWatchTimer)clearInterval(importWatchTimer)
  await imports?.shutdown()
  await references?.shutdown()
  await reports?.shutdown()
  await Promise.all([spectrogram?.close(),instruments?.shutdown(),deliveries?.shutdown(),retention?.shutdown(),exporter?.pauseForRecording(),analyses?.shutdown(),playback?.close()])
  if(final&&recordings)await recordings.finish(final)
  await exporter?.shutdown()
  await nativeAnalysisQueue.close()
  await preferencesWriter?.flush()
  await supportRuntime?.finish()
})()
finish.catch(error=>console.error('Trace finalization:',error)).finally(()=>{readyToQuit=true;app.quit()})
```

两个问题：
- **顺序**：`engine.shutdown()`（803）先于仍会触达原生的 `playback.close()`、`analyses.shutdown()`、`nativeAnalysisQueue.close()`、`recordings.finish(final)`。是否安全取决于原生侧 shutdown 后的行为，需原生确认；不安全则是退出期 use-after-free。
- **无超时**：`finish` 中任一 `await` 挂起（含 ffmpeg 子进程、磁盘 IO、而 `fileJobs.ts:21-49` 的 worker **无超时/心跳**）→ `readyToQuit` 永不为真 → `event.preventDefault()` 使应用永不退出。用户强杀将丢失 `recordings.finish(final)` 的录音收尾。

### P0-D 原生 N-API 入参校验缺失（仅影响上游 Prism 栈，见定级说明）

```132:140:native/src/main.cpp
Napi::Value SpectrumSetFFTSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected FFT size").ThrowAsJavaScriptException();
        return env.Null();
    }
    spectrum.setFFTSize(info[0].As<Napi::Number>().Uint32Value());
```

无 2 的幂校验、无上下界。而 `dsp_utils.cpp:45-55` 的 radix-2 FFT 假定 2 的幂：传入 1000 时索引 `512+255+256=1023` > `buffer_.size()-1=999`，**堆越界写**。同文件的 `spectrogram.cpp:76-79` 对同类参数做了完整校验（`isPowerOfTwo` + `clamp(128,16384)`），证明这是缺失而非设计。

```275:276:native/src/oscilloscope.cpp
while (pos < 0) pos += OSCILLOSCOPE_BUFFER_SIZE;
while (pos >= OSCILLOSCOPE_BUFFER_SIZE) pos -= OSCILLOSCOPE_BUFFER_SIZE;
```
`startPos=±Infinity` 时（入口 `main.cpp:105,118` 无 `isfinite` 校验）永不退出，线程 100% CPU 挂死。

另：`main.cpp` 全文零 `try/catch`，而 `binding.gyp:26` 定义 `NAPI_DISABLE_CPP_EXCEPTIONS`（node-addon-api 不代为兜底）同时 `:62` 又开启 `/EHsc`——C++ 异常会直接穿透进 V8。对照 `trace_engine` 侧的 `addon.cpp:14-18` 有统一 `guard()`。

### P0-E 采集线程合成假静音且不可区分（仅影响上游 Prism 栈）

```944:962:native/src/windows_capture.cpp
const UINT32 silenceFrames = std::min<UINT32>(maxSilenceFrames, std::max<UINT32>(1, static_cast<UINT32>(sinceLastChunkMs * format.sampleRate / 1000.0)));
CapturedChunk silentChunk;
silentChunk.left.assign(silenceFrames, 0.0f);
...
pushChunk(std::move(silentChunk));
```
帧数由**墙钟**推算（违反「用实际采样率、采样帧位置和设备时钟关联数据」），且 `DrainResult` 无任何字段标识该 chunk 为合成（违反「设备失效不显示为正常静音」）。同一采集线程还存在每包 2 次堆分配、双重加锁、`deque` 可覆盖队列（`windows_capture.cpp:905-909,1021-1030`）。

对照：`trace_engine` 的 `CaptureClock` 用 QPC 锚点推算并以 `EstimatedSilence`/`Gap`/`Missing` 显式标注（`AudioTypes.h:8-10`），`Engine.cpp:330-333` 对 `Missing` 帧拒绝计入测量——**完全正确**。

### P0-F 保留策略删除中途失败 → 幸存文件永久不可见

`sourceRetention.ts:65` 先把**全部** candidates 持久化为 `'removing'`，`:69` 才逐个 `unlink`。若第 k 个失败（占用/权限），catch 只置 `phase='error'`。而 `'removing'` 状态在 `recording.ts:65,335`、`sourceRetention.ts:53` 三处被过滤 → 磁盘上仍存在的原始 WAV 从此不可列出、不可分析、不可导出、不可恢复。

### P0-G `reference.set` 缺少录音互斥守卫

```362:362:src/trace/main.ts
case 'reference.set':{...await retention.pause();try{...}finally{retention.resume()};...}
```
对比 `main.ts:164` 的统一规则 `if(recordings.busy()||exiting||managingLibrary)void retention.pause();else retention.resume()`——这是**唯一**无条件 `resume()` 的 retention 操作。而 `sourceRetention.ts:32-37` 的 `pump()` 只看 `paused` 不看录音状态 → 录音进行中可能启动源文件哈希与删除。

---

## 2. 定级修正（子代理结论中两处不准确，已核验纠正）

| 原结论 | 核验结果 |
|---|---|
| `main.ts:409` `report.retry` 缺 `finally` → retention 永久暂停 | **不成立**。`main.ts:635` 的 `report.` 前缀 catch 分支有 `retention?.resume()` 兜底；即便当时 `recordings.busy()`，`main.ts:164` 也会在录音结束时恢复。属可读性问题，非缺陷 |
| 原生层"两套响度引擎并存"违反统一引擎约束 | **对 Trace 产品不成立**。已核验 `dist-trace/preview.29/win-unpacked/resources/native/` 与 R1/R2 包内**只有 `trace_engine.node`**，不含 `visualizer_dsp.node`。自研 `lufsmeter.cpp` 只服务上游 Prism 界面（`preload/index.ts:296`），不进 Trace 包。P0-D/P0-E 同理——它们是**仓库技术债**，不是 Trace 产品缺陷 |

同时确认一条重要的**否定结论**：逐行核对后，**不存在**"用 RMS 换标签冒充 LUFS"或"把 sample peak 当 true peak"。两套实现的 LUFS 都是真 K-weighting + 门控，TP 都是真过采样（libebur128 侧 `Meter.cpp:24` 的 `tpDelayFrames_` 与上游 49 taps/factor 推导完全吻合）。标签正确。

---

## 3. 改进方向（按投入产出排序）

### 方向一：让已有的测试真的跑起来 —— 成本最低、收益最大

这不是"写新测试"，而是"接线"。项目已有 47 个 Trace mjs 测试（其中 43 个跨平台、干净检出即可跑）和 15 个高质量原生 CTest，但：

- CI 一个都不跑（已核验）
- `tools/trace.cjs:62` 的常规门禁只跑 4 个 Trace 测试文件（8.5%）
- 6 个测试文件是**彻底的孤儿**：`cache-recording`、`delivery-service`、`native-long-path`、`operation-feedback`、`product-preferences`、`workbench-navigation`——写了、能跑、永远不跑
- `test:trace-timeline`、`test:trace-workspace`、`test:lufsmeter-ebu` 是孤儿 npm 脚本

具体动作：
1. 新增 `test:trace-all` 一次性跑全部 43 个跨平台 mjs，接入 CI（Ubuntu runner 即可）——这是 Trace 的第一条真正 CI 防线。
2. Windows CI job 加 `build:trace-engine`（含 `ctest`，15 个原生测试）。
3. 把 `test:trace-all` 加进 `tools/trace.cjs:62`。
4. 加一条"孤儿检测"元测试：扫描 `test/*.test.mjs` 与门禁引用的差集，有孤儿即失败——**结构性防止**问题复发。

### 方向二：给"能毁数据"的三个模块补单测

按破坏力排序，都是当前零覆盖：

- **`sourceRetention.ts`**（删除用户原始录音）：把 `tools/m6/retention-test.cjs` 的场景下移为纯 fs 单测（假桩），重点覆盖**拒绝删除**路径——存在未知文件、活跃 playback 持有、未完成 export、hash 不符、pause/resume 期间的请求。再补 P0-F 的"删除中途失败"用例。
- **`sessionStore.ts`**（录音元数据可读性）：v1→v2 迁移幂等、并发 `save()` 最终一致、写盘中断后 JSON 非半截、外部改坏后**明确报错而非被 `recording.ts:89` 吞掉**。
- **`wavPostprocess.ts`**（落盘格式正确性）：`{source,44100,48000,88200,96000} × {pcm16,pcm24,float32}` 共 15 组的头部字节/frameCount/blockAlign 精确断言；区域裁切的帧级边界；格式不符必须抛 `WAV_PRECISION_FORMAT_MISMATCH`。

### 方向三：修复已核验的 P0（按风险排序）

1. **P0-A** `playbackService.sample()` 从 `AnalysisSource` 携带 take 级完整性标记参与 `continuity` 计算——这是唯一会产生**错误读数**的缺陷，应最先修。
2. **P0-B** `recording.ts:89` 的 `catch{}` 改为记录 `{directory,error}` 并在库列表呈现"无法读取的录音"占位项。
3. **P0-C** 退出顺序改为：停泵 → drain 原生在途请求 → `engine.shutdown()` → 纯 JS/磁盘收尾；并加 N 秒看门狗 + journal + `app.exit`。同时给 `fileJobs.runJob` 加超时。
4. **P0-F** 保留策略改为逐个提交（删成功一个标记一个），而非先全标 `'removing'`。
5. **P0-G** `reference.set` 补 `recordings.busy()||managingLibrary` 守卫。
6. **P0-D/E**（上游栈）：给 `main.cpp` 全部导出套 `guard()`、补 `isfinite` 与 2 的幂校验、`while` 改 `fmod`；为合成静音 chunk 加标识字段。若上游 Prism 界面已不在产品路线内，更优解是**明确标注其为非交付路径并从 CI 中分离**，避免持续投入。

### 方向四：`main.ts` 拆分（可维护性，非紧急）

819 行承担命令分发、状态机、快照泵、窗口管理、设备生命周期、14 个服务编排、退出收尾七类职责。建议边界：

| 目标模块 | 迁出内容 |
|---|---|
| `mainState.ts` | `state` 单例 + `update/emitState` + 全部 `sync*`（112-172） |
| `commandRouter.ts` + `commands/*.ts` | `dispatch` 288 行 → `Record<Command, handler>` 表（356-643） |
| `snapshotPump.ts` | 快照泵 + 定时器 + 降频（173-219、768-792） |
| `services.ts` | 14 个服务构造与接线（698-734） |
| `windowHost.ts` | 窗口创建、可见性、几何、关闭确认（737-767） |

拆分后 `main.ts` 应 ≤120 行。**配套收益**：`dispatch` 变得可测后，可以加两条极便宜但极有效的契约测试——(a) `contracts.ts` 白名单与 handler 表的 key 集合**双向相等**（防漂移）；(b) 非 testMode 下所有 test-only 字段与命令不可达。

另一项低成本高收益的类型改进：`main.ts` 中有 **61 处** `as string|number|boolean` 断言集中在 payload 解包。引入 `type Payloads = {'playback.seek':{...}, ...}` 让 `validateRequest` 返回判别联合，可一次性消除全部断言，并顺带解决"白名单与 `Command` 联合手工双份维护"的漂移风险。

### 方向五：工具链瘦身（长期）

137 个脚本中常驻门禁仅约 14 个（10%），一次性调查脚本约 30 个（22%）。明显的复制演化：5 份 `workspace-ui.cjs`、5 份 `resources.cjs`、`m8`–`m12/verify.cjs` 第 9 行是同一行的 5 次累加复制、4 套 `ui/gate/run-ui` 三件套。建议：一次性脚本移入 `tools/archive/` 并加 README，与常驻门禁物理分离；`m8`–`m12` 的测试清单抽为提交进仓库的静态文件（当前依赖 gitignored 的 `artifacts/iteration/final-js.json`，干净检出**第 9 行就崩**）。

顺带两个小修：
- `tools/m3/integration.cjs:71` 的 `expected.get('177600')||await cache.metrics('177600')` 在键缺失时退化成**自己和自己比**，断言恒真（已核验）。
- `tsconfig.json:22` 的 `include` 只有 `src/**`，16 个 `test/*.test.ts` 与 `tools/*/api.ts` **不被 `tsc --noEmit` 检查**——而它是所有门禁的第一道关。

---

## 4. 不建议做的事

- **不要动 EBU 容差**（`lufsmeter-native.test.mjs:9-10` 的 `+0.2/-0.4 dB`）——那是 Tech 3341/3342 标准原值，非对称设计正是抄标准的证据。
- **不要放宽 `wavPostprocess.ts:55-56` 的 1 帧容差**。若 44.1k↔48k 重采样出现合法失败，应先测量实际偏差分布并修正重采样路径，而不是调容差。
- **不要为了消除 `tools/m7/workspace-ui.cjs:36` 的失败而删除该门禁**。正确做法是把 `label:nth-child(2)` 改为按 `data-instrument` 属性定位（根因是 instruments 顺序变化后选择器未同步）。
- **不要合并 `package-internal-test{,-r2}.cjs`**——已交付修订的不可变性是有意设计（`assert(!fs.existsSync(delivered))`）。

---

## 5. 本次审计的验证边界

- 全部结论基于静态阅读 + 本机 `tools/trace.cjs check` 通过的事实；**未在 Windows 实机验证**任何原生并发窗口、96 kHz 实采、设备拔插路径。
- 需运行验证的疑点（未纳入上述结论，仅备查）：`Recorder::prepare` 与采集线程 `push` 对 `queue_` 的竞争窗口是否可实际命中（建议 ASan/TSan + start/stop 压测）；`sessionTimeline` 对零长 region 的二分落点；实机 WASAPI 能否协商出非 {44.1k,48k,88.2k,96k} 速率；`file-worker` 挂死概率。
- 本报告未重复 `66-FRONTEND-AUDIT.md` 已覆盖的渲染层内容。

---

## 6. 实施记录（2026-09-22，改动未提交）

### 6.1 方向一：让已有测试真的跑起来

| 动作 | 实现 |
|---|---|
| 测试分层清单 | 新增 `test/trace-suites.mjs`：`portable`（43 个，纯 esbuild + src，任意 OS + 干净检出可跑）与 `native`（8 个，注明各自需要 `trace_engine.node` / `visualizer_dsp.node` / `.tools/ffmpeg`） |
| 统一运行器 | 新增 `scripts/run-trace-tests.mjs`：`portable\|native\|all`；原生层缺产物时打印"需要 X，请运行 Y"并跳过，而非报晦涩的 ENOENT；`TRACE_REQUIRE_NATIVE=1` 时缺产物即失败，防止 CI 静默退化成空跑 |
| npm 入口 | `test:trace` / `test:trace-native` / `test:trace-all` |
| 常规门禁 | `tools/trace.cjs check` 的测试列表由 4 个文件改为两层全量（原 `test:trace-report`/`-contracts`/`-recording` 已被 portable 层涵盖） |
| CI | `main.yml` 的 `quality-gate` 增加 `npm run test:trace` 与 `npm run build:trace`；新增独立 `trace-engine` job（windows-2022）跑 `build:trace-engine`（含 15 个 CTest）+ `prefetch-ffmpeg` + `test:trace-native`（带 `TRACE_REQUIRE_NATIVE=1`） |
| 防复发 | 新增 `test/suite-coverage.test.mjs`：①目录与清单双向相等（新增测试不登记即失败，杜绝再出现孤儿）②portable 层不得出现原生依赖标记。该元测试已在自查中真实拦下一次误分层 |

**孤儿测试的代价已被证实**：审计指出的 6 个孤儿里，`delivery-service.test.mjs` 与另外 3 处（`import-service`×2、`import-store`）**已经腐化**——全部因 Windows 盘符大小写（服务经 `realpath` 规范化返回 `C:`，测试用 `path.resolve` 继承 cwd 的 `c:`）而失败。产品行为正确（规范化是防 junction 攻击的必要手段），是测试做了大小写敏感的路径比较。新增 `test/path-equal.mjs` 的 `assertSamePath` 按平台语义比较并修正 4 处。

### 6.2 P0 修复（逐条附回归测试）

| 编号 | 修复 | 回归测试 |
|---|---|---|
| **P0-A** 回听 continuity 恒报完整 | `AnalysisSource` 新增 `continuity` 字段（`analysisService.ts`）；`recording.ts` 新增导出函数 `sourceContinuity(document, regionId?)` 综合 region 状态/错误/拼接/`estimatedFrames`/`hasDiscontinuities`；`playbackService.ts:257` 改为 `native.error?'unknown':c.source.continuity\|\|'complete'` | 新增 `test/source-continuity.test.mjs`（5 项）：完整/中断/恢复/拼接/估计静音/取消区段不误判/单区段只判自身 |
| **P0-B** 清单不可读致录音静默消失 | `recording.ts:89` 的 `catch{}` 改为记入 `unreadable` Map；`summaries()` 追加 `status:'unreadable'` 条目（`availability:'unavailable'`、`roles:[]`、携带错误码）；`folder()` 支持 `unreadable:` 前缀以便"打开目录"；`setDirectory` 重扫时清空避免累积；`RecordingLibrary.tsx` 显示原因并只提供"打开目录" | 新增 `test/library-visibility.test.mjs`（3 项）；并**加强**既有 `recording-service.test.mjs`：原来只断言"3 个有效项"，现同时断言 3 个损坏项被显式呈现且不提供任何分析角色 |
| **P0-C** 退出顺序 + 无看门狗 | `main.ts` 退出序列改为：停泵 → drain 全部可触达原生的服务 + `nativeAnalysisQueue.close()` → **之后**才 `engine.shutdown()` → 纯 JS/磁盘收尾；新增 60 s 看门狗（`TRACE_SHUTDOWN_TIMEOUT_MS` 可调），超时记 `shutdown-timeout` journal 并强制退出。`fileJobs.ts` 的 worker 新增 180 s **空闲**超时（进度消息重置计时，长文件分析不会被误杀），新增 `file-worker-timeout` 事件 | 由 `m0 electron` 冒烟覆盖（240000 帧 / 0 覆盖 / pass） |
| **P0-F** 保留策略删除中途失败致幸存文件永久不可见 | `sourceRetention.ts`：删除循环记录失败点，随后对仍处 `removing` 的资产按文件是否真实存在回滚为原状态或 `removed`，再落盘并抛出 | 新增 `test/source-retention.test.mjs`（2 项）。**已验证有效**：回退修复后该测试精确报出 `a surviving file must not stay hidden behind removing`（实际值 `removing`） |
| **P0-G** `reference.set` 缺录音互斥守卫 | `finally` 的 `retention.resume()` 加上与 `syncRetentionState` 一致的 `!recordings.busy()&&!managingLibrary&&!exiting` 条件 | 由 portable 层既有 reference 测试回归 |
| **P0-D** 原生入参可致堆越界/挂死（上游栈） | `spectrum.cpp` 的 `setFFTSize` 增加 2 的幂校验 + `clamp(128,16384)`，并改为先构造 FFT 再赋值 `fftSize_`（避免分配失败留下撕裂状态）；`oscilloscope.cpp` 的 `getSamplesInterpolated` 增加 `isfinite` 拒绝 + `while` 改 `fmod`（O(1)）；`main.cpp` 的 `getSamples` 增加 count 上限（原为未检查 uint32，最大可请求 17 GB） | 在 `spectrum-native.test.mjs` 新增 1 项。**已验证有效**：回退修复后精确报出 `FFT size must remain a power of two, got 1000` |

**未做**：P0-E（`windows_capture.cpp` 合成假静音无标识）。它需要为 `AudioChunk`/`DrainResult` 增加字段并贯穿上游采集链路，属**上游 Prism 独有路径**——已核验 Trace 产品包内只有 `trace_engine.node`（其 `CaptureClock` 用 QPC 锚点并以 `EstimatedSilence`/`Gap`/`Missing` 显式标注，实现正确）。建议与"上游栈是否仍在产品路线内"一并决策，不宜在本轮夹带。

### 6.3 验证结果

- `tools/trace.cjs check`：typecheck 通过；capture-support 3、lufsmeter-native 6、**portable 43 文件 202 项、native 8 文件 49 项**，全过。
- `build:trace-engine`：15 个原生 CTest 全过（含 EBU 参考值、真峰时序、WAV 精度、录制快照）。
- 上游 `visualizer_dsp` 重编译通过（首次编译暴露 `OSCILLOSCOPE_BUFFER_SIZE` 需 `Visualizer::` 限定，已修）；4 个上游原生测试 22 项全过。
- `electron-vite` Trace 构建通过；`m0 electron` 真实主进程冒烟 pass。
- `tools/m7/workspace-ui.cjs`：**停在与干净基线完全相同的第 36 行断言（2!==4）**，未引入新回归。该基线失败仍未修（根因是 instruments 顺序变化后 `label:nth-child(2)` 选择器未同步，应改为按 `data-instrument` 定位）。

### 6.4 一处需要明确记录的测试预期变更

`recording-service.test.mjs` 原断言 `summaries.length===3`。P0-B 有意把"损坏清单静默丢弃"改为"显式呈现"，故该数字变为 6。已将其改写为"3 个可用项 + 3 个不可读项"的**更强**断言（额外校验错误原因存在、`availability` 正确、不提供任何分析角色），而非放宽或删除。这是唯一一处因本轮修复而调整的既有测试预期。

### 6.5 尚未处理

审计报告第 3 节的方向二剩余项（`sessionStore.ts` / `wavPostprocess.ts` 单测）、方向四（`main.ts` 拆分与 61 处 payload 断言的类型桥）、方向五（工具链瘦身、`tools/m3/integration.cjs:71` 恒真断言、`tsconfig.json` include 扩展到 `test/`+`tools/`）均未动。
