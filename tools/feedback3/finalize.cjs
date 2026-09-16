const fs=require('fs'),path=require('path'),crypto=require('crypto')
const root=path.resolve(__dirname,'../..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),rel=p=>path.relative(root,p).replaceAll('\\','/')
const gate=read('artifacts/feedback3/gate-latest.json'),desktop=read('artifacts/m6/gate-latest.json'),archive=read('artifacts/m6/archive-latest.json'),ui=read('artifacts/feedback3/ui-latest.json'),reopen=read('artifacts/feedback3/reopen-latest.json'),audio=read('artifacts/m5/gate-latest.json')
if([gate,desktop,archive,ui,reopen,audio].some(v=>v.status!=='pass')||!archive.relocatedSmokeFolder||!archive.zip.includes('preview.3'))throw Error('Delivery validation incomplete')
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')
if(sha('build/trace-engine/Release/trace_engine.node')!==gate.nativeSha256||sha('out-trace/main/index.js')!==gate.mainSha256||archive.asarSha256!==desktop.asarSha256)throw Error('Build changed')
const completed=[
'## 最终交付记录','',
'- 状态：preview.3 本轮实现、针对性验证与完整回归通过，可供人工复验。',
'- 运行入口：dist-trace/preview.3/win-unpacked/Trace.exe。',
'- ZIP：'+archive.zip+'，'+archive.bytes+' bytes（'+(archive.bytes/1048576).toFixed(1)+' MiB）。',
'- ZIP SHA-256：'+archive.sha256+'。',
'- '+archive.fileCount+' 个解压文件逐一 hash 对比通过；中文路径重新定位运行通过。',
'- 本轮门禁：'+rel(gate.folder)+'/report.json。',
'- 实机交互：'+rel(ui.folder)+'/report.json；同目录 reopen.json 为独立重开。',
'- 桌面回归：'+rel(desktop.folder)+'/report.json；音频回归：'+rel(audio.folder)+'/report.json。',
'- ZIP 重定位：'+archive.relocatedSmokeFolder+'/report.json。',
'- native SHA-256：'+gate.nativeSha256+'。',
'- main SHA-256：'+gate.mainSha256+'。',
'- ASAR SHA-256：'+archive.asarSha256+'。',
'',
'下一步是用户复验滚轮手感、精简后的界面及仅录音工作流。前两版的原始 EBU/硬件/干净环境开放项保持，不自动标记为通过。'
].join('\n')
const doc=path.join(root,'docs/30-PREVIEW3-INTERACTION.md');fs.writeFileSync(doc,fs.readFileSync(doc,'utf8').split('## 最终交付记录')[0]+'\n'+completed+'\n')
const handoff=path.join(root,'docs/13-HANDOFF.md'),old=fs.readFileSync(handoff,'utf8')
const heading='# 13 · 当前状态与下一会话'
const current=heading+'\n\n## 当前焦点：preview.3（反馈 4–6）\n\n2026-09-16：连续缩放、文字精简和监测关闭直接录音已实现并通过门禁，详见 [30-PREVIEW3-INTERACTION](30-PREVIEW3-INTERACTION.md)。\n\n- 当前入口：dist-trace/preview.3/win-unpacked/Trace.exe。\n- ZIP：'+archive.zip+'；SHA-256 '+archive.sha256+'。\n- 新门禁：node tools/feedback3/gate.cjs；当前报告 '+rel(gate.folder)+'/report.json。\n- 使用指南：28。monitoringRequested 与 active 分离，记录开关跨重启保存；显示设置版本 2，时间 5–60 秒、倍率 1–4 连续。\n- 当前构建 native '+gate.nativeSha256+'；main '+gate.mainSha256+'。\n- 下一步：用户实际复验操作手感；原有 EBU / 96 kHz 等开放项不变。源码未提交、未推送。\n\n## 以下为前版记录\n'
fs.writeFileSync(handoff,current+old.slice(heading.length));console.log('PREVIEW3_DELIVERED',archive.zip,archive.sha256)
