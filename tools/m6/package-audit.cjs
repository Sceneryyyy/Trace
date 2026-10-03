const productPath=require('../trace-package-files.cjs')
const releaseConfig=require('../../electron-builder.trace.cjs'),packageOutput=releaseConfig.directories.output,packageVersion=releaseConfig.extraMetadata.version
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),asar=require('@electron/asar'),ResEdit=require('resedit'),PE=require('pe-library')
const root=path.resolve(__dirname,'../..'),dir=path.join(root,packageOutput+'/win-unpacked'),archive=path.join(dir,'resources/app.asar'),report={status:'running',checks:[]}
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
try{
 const entries=asar.listPackage(archive).map(p=>p.replaceAll('\\','/'));assert(entries.every(p=>p==='/package.json'||p==='/out-trace'||p.startsWith('/out-trace/')&&productPath(p.slice('/out-trace/'.length))))
 const pkg=JSON.parse(asar.extractFile(archive,'package.json'));assert.equal(pkg.name,'trace');assert.equal(pkg.version,packageVersion);assert.equal(pkg.main,'out-trace/main/index.js');assert.equal(Object.keys(pkg.dependencies||{}).length,0)
 const outputFiles=[];function visit(p){for(const item of fs.readdirSync(path.join(root,p),{withFileTypes:true})){const next=p+'/'+item.name;if(item.isDirectory())visit(next);else if(productPath(next.slice('out-trace/'.length)))outputFiles.push(next)}}visit('out-trace')
 for(const file of outputFiles)assert(fs.readFileSync(path.join(root,file)).equals(asar.extractFile(archive,path.normalize(file))),file+' mismatches app build')
 for(const p of ['out-trace/main/index.js','out-trace/main/file-worker.js','out-trace/main/media-runner.js','out-trace/main/report-worker.js','out-trace/preload/index.js','out-trace/renderer/index.html'])assert(entries.includes('/'+p),p)
 report.checks.push('ASAR contains only the Trace build and a minimal package, with all workers and assets identical to the build')
 const files=[];function walk(p){for(const d of fs.readdirSync(p,{withFileTypes:true})){const name=path.join(p,d.name);if(d.isDirectory())walk(name);else files.push(name)}}walk(dir)
 assert(!files.some(p=>/\.(wav|mp3|m4a|aac|vst3)$/i.test(p)));assert(!fs.existsSync(path.join(dir,'resources/default_app.asar')))
 for(const p of ['README-Trace.md','LICENSE.electron.txt','LICENSES.chromium.html','resources/licenses/React-MIT.txt','resources/licenses/ReactDOM-MIT.txt','resources/licenses/ReactScheduler-MIT.txt','resources/licenses/Prism-GPL-3.0.txt','resources/licenses/Prism-FFT-GPL-3.0.txt','resources/licenses/prism-fft-source.json','resources/licenses/prism-fft-README.md','resources/licenses/libebur128-MIT.txt','resources/licenses/libebur128-patches.md','resources/licenses/FFmpeg-GPL.txt','resources/licenses/ffmpeg-source-manifest.json','resources/licenses/FFmpeg-source-status.md','resources/licenses/FFmpeg-upstream-license.md','resources/licenses/FFmpeg-upstream-GPLv3.txt','resources/licenses/LAME-LGPL.txt','resources/licenses/Inter-OFL.txt','resources/licenses/JetBrainsMono-OFL.txt'])assert(fs.statSync(path.join(dir,p)).size>0,p)
 assert(fs.readFileSync(path.join(dir,'README-Trace.md')).equals(fs.readFileSync(path.join(root,'docs/28-USER-GUIDE.md'))))
 report.checks.push('Package contains usage guide, licenses and no recordings, default demo, VST or TUI')
 const fftRoot=path.join(root,'native/vendor/prism-fft')
 for(const [original,packaged]of [['COPYING','Prism-FFT-GPL-3.0.txt'],['SOURCE.json','prism-fft-source.json'],['README.md','prism-fft-README.md']]){
  const source=path.join(fftRoot,original),target=path.join(dir,'resources/licenses',packaged)
  assert(fs.readFileSync(target).equals(fs.readFileSync(source)),packaged+' differs from retained FFT provenance')
  assert.equal(sha(target),sha(source),packaged)
 }
 assert.equal(sha(path.join(dir,'resources/licenses/Prism-GPL-3.0.txt')),sha(path.join(root,'LICENSE')))
 const fftSource=JSON.parse(fs.readFileSync(path.join(fftRoot,'SOURCE.json'),'utf8'))
 assert.equal(fftSource.repository,'https://github.com/Boof2015/prism')
 assert.equal(fftSource.commit,'df0755b8caaaab85157ac51aefffca0526974fc1')
 const originalSources={
  'FFT.h':['native/src/dsp_utils.h','52f1cd4ef6b00227fd46adfa75237957c4b35628ac5d6371d26b65d3f3ee5c95'],
  'FFT.cpp':['native/src/dsp_utils.cpp','63bad15b4eb398bd12df5f4439bcafe2d62aee0a1edd3541d5dd560c77dfa7bf'],
  COPYING:['LICENSE','3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'],
 }
 assert.deepEqual(fftSource.files.map(entry=>entry.file).sort(),Object.keys(originalSources).sort())
 for(const entry of fftSource.files){
  const [sourcePath,sourceSha256]=originalSources[entry.file]
  assert.equal(entry.sourcePath,sourcePath,entry.file+' source path')
  assert.equal(entry.sourceSha256,sourceSha256,entry.file+' pinned source hash')
  assert.equal(sha(path.join(fftRoot,entry.file)),entry.sha256,entry.file+' retained source hash')
 }
 report.fftProvenance={repository:fftSource.repository,commit:fftSource.commit,manifestSha256:sha(path.join(fftRoot,'SOURCE.json')),files:fftSource.files.map(({file,sourceSha256,sha256})=>({file,sourceSha256,sha256}))}
 report.checks.push('Retained Prism FFT license/provenance matches packaged bytes and pinned source/extraction hashes')
 assert.equal(sha(path.join(dir,'resources/native/trace_engine.node')),sha(path.join(root,'build/trace-engine/Release/trace_engine.node')))
 const codec=JSON.parse(fs.readFileSync(path.join(dir,'resources/ffmpeg.lock.json'),'utf8'))
 for(const bin of ['ffmpeg','ffprobe'])assert.equal(sha(path.join(dir,'resources/ffmpeg',bin+'.exe')),codec[bin+'Sha256'])
 const sourceManifest=JSON.parse(fs.readFileSync(path.join(dir,'resources/licenses/ffmpeg-source-manifest.json'),'utf8'))
 require('../release/dependency-sources.cjs').validateManifest(codec,sourceManifest)
 assert.equal(sha(path.join(dir,'resources/licenses/ffmpeg-source-manifest.json')),sha(path.join(root,codec.correspondingSourceManifest)))
 for(const [source,target]of [['LICENSE.publisher.txt','FFmpeg-GPL.txt'],['README.publisher.txt','FFmpeg-build.txt']])assert.equal(sha(path.join(dir,'resources/licenses',target)),sha(path.join(root,'references/ffmpeg-9.0.2',source)))
 const provenance=JSON.parse(fs.readFileSync(path.join(dir,'resources/licenses/runtime-provenance.json'),'utf8'))
 for(const [file,hash]of Object.entries(provenance.dlls))assert.equal(sha(path.join(dir,'resources/native',file)),hash)
 report.runtime=provenance;report.codec={version:codec.version,ffmpegSha256:codec.ffmpegSha256,ffprobeSha256:codec.ffprobeSha256,correspondingSourceComplete:sourceManifest.correspondingSourceComplete}
 console.log('TRACE_RUNTIME_PROVENANCE',JSON.stringify(provenance))
 report.checks.push('Native addon, VC runtime, codecs and available source inventory match locked/staged hashes')
 const executable=PE.NtExecutable.from(fs.readFileSync(path.join(dir,'Trace.exe'))),resource=PE.NtExecutableResource.from(executable),versions=ResEdit.Resource.VersionInfo.fromEntries(resource.entries)
 assert(versions.length);assert(versions.some(v=>v.getAllLanguagesForStringValues().some(l=>v.getStringValues(l).ProductName==='Trace'&&v.getStringValues(l).ProductVersion===packageVersion)))
 assert(ResEdit.Resource.IconGroupEntry.fromEntries(resource.entries).length)
 report.checks.push('Trace executable carries its own icon and the current product version')
 report.files=Object.fromEntries(files.map(p=>[path.relative(dir,p).replaceAll('\\','/'),{bytes:fs.statSync(p).size,sha256:sha(p)}]));report.bytes=files.reduce((n,p)=>n+fs.statSync(p).size,0);report.status='pass'
}catch(e){report.status='fail';report.error=String(e);report.stack=e.stack;console.error(e);process.exitCode=1}
fs.writeFileSync(path.join(root,'artifacts/m6/package-audit-latest.json'),JSON.stringify(report,null,2));console.log('M6_AUDIT',report.status,report.checks.length)
