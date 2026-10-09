# 82 · 文件边界与故障注入

2026-10-09，preview.31，Meter v5、Session v2 和缓存 key v3 保持。
本轮扩展云端可重复测试，原始录音、计量算法及 EBU 容差没有修改。
最终代码、CI 和验证记录见 [13](13-HANDOFF.md)。

## 修复

1. 带 Xing/Info 长度声明的 MP3 截断后，FFmpeg 可能成功解码部分音频。
   导入先用固定大小读取获得首 MPEG 帧中的 Xing/Info 或 VBRI 声明；ID3
   元数据用位置跳过。声明字节超出文件立即拒绝；存在帧数声明时，以流式
   ffprobe packet count 核对。`IMPORT_MP3_TRUNCATED` /
   `IMPORT_MP3_FRAME_MISMATCH` 不产生可用解码缓存，原文件保留。
2. 缓存 owner.json 写到一半失败，旧代码留下无法通过 owner 验证的残缺目录。
   现跟踪 `wx` 独占打开的句柄，失败时仅清理自己创建的标记和空目录。
   外来内容、变更的归属或未知文件继续阻止删除。
3. POSIX 子进程忽略 SIGTERM 时，取消可能一直等待。媒体监督进程取消或失去
   父 IPC 后，最多等待两秒再强制终止编码子进程，等待实际退出后才结束。
   这不是对健康长文件设置处理时限。

## 测试矩阵

| 范围 | 实际行为与校验 |
| --- | --- |
| 损坏文件 | 错误容器、空/截断 WAV、截断 MP3/ADTS/M4A、破坏 MPEG 帧头及 AAC 数据；拒绝发布缓存，原字节不变，正常文件随后可重试 |
| MP3 格式扩展 | 8/16/44.1/48 kHz × 单/双声道 × CBR/VBR，共 16 组；用实际 packet 时长和 skip/discard 元数据独立核对导入帧数；无 Xing 文件仍支持 |
| MP3 声明 | MPEG-1/2/2.5、单/双声道、CRC、Xing/Info、VBRI、ID3 大标签/页脚、缺失及非法字段；固定大小解析，不读取整段文件 |
| 磁盘失败 | 容量不足；在真实导入路径注入 ENOSPC：owner 标记部分写入、PCM 目录建立、最终 decoded.json 部分写入；无残留、原文件不变、可重新导入 |
| 取消与变化 | 解码后验证阶段取消；原文件在验证前变化；失败后清理所有已生成分段，保留调用者改后的原文件 |
| 缓存恢复 | 真实分段重读；篡改 PCM、删除分段、伪造帧总数均拒绝；未知文件和变更 owner 阻止删除 |
| 进程故障 | 实际子进程启动失败、非零退出、输出超限；忽略 SIGTERM 的取消、父 IPC 断开；实际 hash worker 卡死、主动取消和突然退出，随后启动新 worker 获得真实 hash |
| 既有恢复 | 中间/最终分段丢失、断裂 journal 尾行、无 checkpoint、导入/交付准备中重启等已有测试继续执行 |

新增测试注册在 [tier 清单](../test/trace-suites.mjs)，缺少锁定 Windows codec
的强制模式必须失败，不将跳过算作通过。磁盘注入通过 esbuild 测试插件修改
文件系统错误返回，生产源码不包含这些测试钩子。

## 复现与证据边界

可移植故障与解析：

```sh
npm ci
npm run test:trace
```

准备好锁定 Windows 编码组件和原生引擎后：

```powershell
$env:TRACE_REQUIRE_NATIVE = '1'
npm run test:trace-native
```

Linux 辅助测试显式选用系统 FFmpeg 7.1.5，只验证夹具和生产流程逻辑：

```sh
TRACE_TEST_SYSTEM_CODEC=1 node --test test/codec-faults.test.mjs test/import-disk-faults.test.mjs
```

它与 `TRACE_REQUIRE_NATIVE=1` 同时使用会报错，不能替代固定 Windows 9.0.2
的实际结果。本地已完成 12/12 真实媒体/注入用例；完整 portable、类型、构建
与安全门禁的最终结果在 13。远程 Windows/Linux CI 尚待本轮提交后的实际执行。

损坏检测针对可观察的容器/解码错误和可信长度声明。没有完整性声明或原始校验值的
外部文件，可能存在无法判断的提前结束或仍可解码的位变化，不能宣称全部损坏均可
检测。8 kHz 辅助夹具的编码前 1737 帧与 decoder 元数据 1775 帧不同；导入保留
实际解码帧数，不裁成猜测的原始长度。Windows 对应数据以实际测试日志为准。
生成的 VBR 文件用于外部导入测试，产品导出仍仅提供原有 CBR 预设。

本轮没有运行两小时物理录音、慢盘/队列拥塞、真实磁盘填满或断电、驱动拔插、
96 kHz 采集、GPU/DPI、三分钟在线视频操作。监督进程自身被强制杀死的进程树
收尾也没有在本轮证明；不能用父 IPC 断开测试替代。实机门禁见 [76](76-RELEASE-CHECKLIST.md)。

## 本轮安全门禁变化

2026-10-09 的实时 npm 审计发现 `source-map-js` 1.2.1 新公告
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)：high 1。
仅更新该传递开发依赖至 1.2.2，锁文件仅对应一项变化；正常 `npm ci` 后完整和
生产审计均为零。直接依赖、Electron、FFmpeg/LAME 与构建 recipe pin 保持。
历史 10 月 4 日零公告记录仍有效于当时审计，当前结果绑定新的锁文件。

## CI 故障诊断与构建工具变化

Windows 镜像更新了 `msys-2.0.dll`，旧 pin 触发 `CODEC_TOOL_HASH_CHANGED`；
30 个其他工具与编译器/SDK 六组系统输入完全一致。失败运行 37876605731、
诊断运行 37877327686 的 Windows 都未进入新增媒体测试；Linux 被主动取消，
这些运行不作为最终通过记录。精确更新该工具身份及其关联的 lock/report/manifest，
仍要求原来的两 EXE/config 哈希与新完整报告匹配，不跳过任何构建核验。

本环境下载 Azure 日志/附件 blob 返回 Forbidden。新增受限的 GitHub 失败注解
和 CI 摘要：从真实 test 输出、CTest/EBU、安全与包校验文件提取计数、状态和 hash，
包含实际提交身份，并拒绝过时记录。只公布必要字段，不读取或发布个人音频。
实际测试仍由原门禁执行，摘要不能授权省略它们；候选 payload 的下载限制仍保留。
