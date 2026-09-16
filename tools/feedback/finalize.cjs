const fs=require('fs'),path=require('path'),crypto=require('crypto')
const root=path.resolve(__dirname,'../..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),relative=p=>path.relative(root,p).replaceAll('\\','/')
const gate=read('artifacts/feedback/gate-latest.json'),desktop=read('artifacts/m6/gate-latest.json'),archive=read('artifacts/m6/archive-latest.json'),ui=read('artifacts/feedback/ui-latest.json'),audio=read('artifacts/m5/gate-latest.json')
if([gate,desktop,archive,ui,audio].some(r=>r.status!=='pass')||!archive.relocatedSmokeFolder||!archive.zip.includes('preview.2'))throw Error('Delivery checks are incomplete')
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
if(gate.nativeSha256!==sha('build/trace-engine/Release/trace_engine.node')||gate.mainSha256!==sha('out-trace/main/index.js')||archive.asarSha256!==desktop.asarSha256)throw Error('Build changed after validation')
const section=[
'## 最终完成记录','',
'- 状态：preview.2 三项反馈实现完成，针对性与整包最小门禁通过，可开始用户复验。',
'- 新包：'+archive.zip+'；'+archive.bytes+' bytes（'+(archive.bytes/1048576).toFixed(1)+' MiB）。',
'- 直接运行：dist-trace/preview.2/win-unpacked/Trace.exe。旧 preview.1 独立保留。',
'- ZIP SHA-256：'+archive.sha256+'。',
'- '+archive.fileCount+' 个解压文件逐一 hash 一致；中文路径解压副本再次通过离线流程。',
'- 反馈门禁：'+relative(gate.folder)+'/report.json。',
'- 实际 65 秒缓存/循环/文件管理：'+relative(ui.folder)+'/report.json，'+ui.checks.length+' 项通过。',
'- M6 桌面门禁：'+relative(desktop.folder)+'/report.json。',
'- 当前 main/native 对应的 M5 → M2 回归：'+relative(audio.folder)+'/report.json。',
'- ZIP 重新定位运行：'+archive.relocatedSmokeFolder+'/report.json。',
'- native SHA-256：'+gate.nativeSha256+'。',
'- main SHA-256：'+gate.mainSha256+'。',
'- ASAR SHA-256：'+archive.asarSha256+'。',
'',
'门禁曾因 M3 测试在开发输出目录生成 analysis-test-api.cjs 而误报包缺文件。已使用统一生产文件白名单暂存/审计：真实入口、worker、chunks 和界面资源全部比对，测试接口明确禁止进入包。当前打包目录通过重新生成证明该边界有效。未更改音频容差、删除失败音频用例或生成假读数。',
'',
'生产代码保持不变后的打包检查复用已通过且 main/native hash 完全匹配的音频回归；其余反馈 UI、桌面流程、六组尺寸/DPI、双屏恢复、长文件和包完整性按当前产物检查。源码及最终证据清单在 artifacts/m6/checkpoint.json。',
'',
'下一步：用户在 preview.2 按 28 的流程复验真实声音、选区循环和文件列表。原始 EBU/真实 96 kHz/物理设备变化等原有开放项保持开放。'
].join('\n')
const doc=path.join(root,'docs/29-PREVIEW2-FEEDBACK.md');fs.writeFileSync(doc,fs.readFileSync(doc,'utf8').split('## 最终完成记录')[0]+'\n'+section+'\n')
const handoff=path.join(root,'docs/13-HANDOFF.md');let h=fs.readFileSync(handoff,'utf8').replace('实现及针对性测试完成，最终组合门禁运行中。','实现、针对性测试、最终组合门禁及 ZIP 中文路径重定位检查均已通过。');h=h.replace('- 最终状态以 artifacts/feedback/gate-latest.json、artifacts/m6/archive-latest.json 和 29 完成记录为准。','- 最新包：'+archive.zip+'（SHA-256 '+archive.sha256+'）。\n- 最终状态以 artifacts/feedback/gate-latest.json、artifacts/m6/archive-latest.json 和 29 完成记录为准。');fs.writeFileSync(handoff,h)
console.log('FEEDBACK_DELIVERY_RECORDED',archive.zip,archive.sha256)
