const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict')
const {spawnSync} = require('child_process'), asar = require('@electron/asar')
const root = path.resolve(__dirname,'../..'), config = require('../../electron-builder.trace.cjs')
const folder = path.join(root,'artifacts/layout-feedback/package-'+Date.now())
fs.mkdirSync(folder,{recursive:true})
const oldDir = path.join(root,'dist-trace/preview.25/win-unpacked')
const dir = path.join(root,config.directories.output,'win-unpacked')
const previous = path.join(oldDir,'resources/app.asar'), candidate = path.join(dir,'resources/app.asar')
const files = p => asar.listPackage(p).map(f=>f.replaceAll('\\','/')).filter(f=>f.startsWith('/out-trace/main/')&&f.endsWith('.js')||f==='/out-trace/preload/index.js')
const report = {status:'running',version:config.extraMetadata.version,folder,verified:[]}
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
try {
 assert.deepEqual(files(candidate),files(previous))
 for (const file of files(previous)) {
  const oldText = asar.extractFile(previous,path.normalize(file.slice(1))).toString().replaceAll('0.1.0-preview.25','VERSION')
  const newText = asar.extractFile(candidate,path.normalize(file.slice(1))).toString().replaceAll(config.extraMetadata.version,'VERSION')
  assert.equal(newText,oldText,file); report.verified.push(file)
 }
 assert.equal(sha(path.join(dir,'resources/native/trace_engine.node')),sha(path.join(oldDir,'resources/native/trace_engine.node')))
 const audit = JSON.parse(fs.readFileSync(path.join(root,'artifacts/m6/package-audit-latest.json')))
 assert.equal(audit.status,'pass')
 for (const [file,expected] of Object.entries(audit.files)) assert.equal(sha(path.join(dir,file)),expected.sha256,file)
 report.fileCount = Object.keys(audit.files).length
 const zip = path.join(root,config.directories.output,'Trace-'+config.extraMetadata.version+'-Windows-x64.zip')
 const result = spawnSync(require('7zip-bin').path7za,['t',zip],{encoding:'utf8',windowsHide:true})
 fs.writeFileSync(path.join(folder,'zip-test.log'),(result.stdout||'')+(result.stderr||''))
 assert.equal(result.status,0)
 report.asarSha256 = sha(candidate); report.nativeSha256 = sha(path.join(dir,'resources/native/trace_engine.node'))
 report.zip = {bytes:fs.statSync(zip).size,sha256:sha(zip)}
 report.status = 'pass'
} catch (e) {report.status='fail';report.error=String(e);console.error(e);process.exitCode=1}
fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2))
fs.writeFileSync(path.join(root,'artifacts/layout-feedback/package-latest.json'),JSON.stringify(report,null,2))
console.log('LAYOUT_PACKAGE',report.status,folder)
