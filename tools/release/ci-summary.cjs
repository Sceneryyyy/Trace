// Publish only bounded, selected evidence from files produced by actual checks.
// GitHub annotations remain readable when the runner's log/artifact blob is not.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto')
const root=path.resolve(__dirname,'../..'),sha=bytes=>createHash('sha256').update(bytes).digest('hex')
function read(file,limit=16*1024*1024){const target=path.join(root,file);if(!fs.existsSync(target))return null;const size=fs.statSync(target).size;if(size>limit)throw Error('CI_EVIDENCE_TOO_LARGE');return fs.readFileSync(target)}
function json(file){const bytes=read(file);return bytes?{value:JSON.parse(bytes),sha256:sha(bytes)}:null}
function fields(file,keys){const record=json(file);if(!record)return null;return {sha256:record.sha256,...Object.fromEntries(keys.map(k=>[k,record.value[k]]))}}
function junit(file){const bytes=read(file);if(!bytes)return null;const text=bytes.toString('utf8'),tag=text.match(/<testsuite\s[^>]*>/)?.[0];if(!tag)throw Error('INVALID_CI_JUNIT');const attrs=Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));return {sha256:sha(bytes),tests:Number(attrs.tests),failures:Number(attrs.failures||0),disabled:Number(attrs.disabled||0),seconds:Number(attrs.time)}}
function windowsCtest(){const bytes=read('build/trace-engine/Testing/Temporary/LastTest.log');if(!bytes)return null;const text=bytes.toString('utf8');return {sha256:sha(bytes),tests:[...text.matchAll(/^\d+\/\d+ Testing:/gm)].length,passed:[...text.matchAll(/^Test Passed\./gm)].length,failed:[...text.matchAll(/^Test Failed\./gm)].length}}
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()
if(process.env.GITHUB_SHA&&process.env.GITHUB_SHA!==commit)throw Error('CI_EVIDENCE_COMMIT_MISMATCH')
const windows=process.platform==='win32',output=require('../../electron-builder.trace.cjs').directories.output
const ebu=fields(windows?'build/trace-engine/ebu-wav-results.json':'build/trace-portable/ebu-wav-results.json',['commit','sourceDirty','status','measurementConfigId','summary','sourceSha256'])
const tests=['portable',...(windows?['native']:[])].map(tier=>fields('artifacts/release/trace-tests-'+tier+'.json',['commit','tier','files','exitCode','status','counts','failureDetails','observations','outputSha256']))
const codec=fields('.tools/ffmpeg/build-report.json',['buildLockSha256','systemInventorySha256','configHeaderSha256','configMakSha256','recipes'])
if(codec){const expected=JSON.parse(read('ffmpeg.lock.json'));codec.matchesPinnedReport=codec.sha256===expected.buildReportSha256;codec.ffmpegSha256=sha(read('.tools/ffmpeg/bin/ffmpeg.exe'));codec.ffprobeSha256=sha(read('.tools/ffmpeg/bin/ffprobe.exe'))}
const candidate=fields('dist-trace/candidate/manifest.json',['commit','status','signed','files','dependencySource'])
const audit=json('artifacts/m6/package-audit-latest.json')
const report={schemaVersion:1,commit,sourceDirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),platform:process.platform,arch:process.arch,
 tests,ctest:windows?windowsCtest():{core:junit('build/trace-portable/portable-core-results.xml'),ebu:junit('build/trace-portable/ebu-wav-results.xml')},ebu,
 security:fields('artifacts/release/security-audit.json',['commit','sourceDirty','packageLockSha256','status','checks']),
 verification:fields('artifacts/release/verification.json',['commit','sourceDirty','platform','arch','status','checks']),
 portableGate:fields('artifacts/release/portable-ci-gate.json',['status','headSha','runId','attempt','jobId']),
 packageLoad:fields('artifacts/release/package-load.json',['commit','status','exeSha256','asarSha256']),
 packageAudit:audit?{sha256:audit.sha256,status:audit.value.status,checks:audit.value.checks,files:Object.fromEntries(['Trace.exe','resources/app.asar'].map(n=>[n,audit.value.files?.[n]]))}:null,
 runtime:fields(output+'/win-unpacked/resources/licenses/runtime-provenance.json',['electron','electronBuilder','vcRedist','dlls']),codec,candidate,
 scope:'Selected actual CI-produced test/numerical/build/package records; generated/offline and no-card checks, not physical-device or release acceptance'}
for(const record of [...tests,ebu,report.security,report.verification,report.packageLoad,candidate].filter(Boolean))if(record.commit!==commit)throw Error('STALE_CI_EVIDENCE')
const bytes=JSON.stringify(report)
if(Buffer.byteLength(bytes)>60000)throw Error('CI_ANNOTATION_TOO_LARGE')
fs.mkdirSync(path.join(root,'artifacts/release'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/release/ci-summary.json'),JSON.stringify(report,null,2)+'\n')
// GitHub truncates each annotation message at 4096 bytes. ASCII base64 parts
// remain below that limit; the collector must verify all parts and their hash.
const encoded=Buffer.from(bytes).toString('base64'),partSize=3000,total=Math.ceil(encoded.length/partSize),digest=sha(Buffer.from(bytes))
for(let i=0;i<total;i++)console.log('::notice title=Trace CI evidence::TRACE_CI_SUMMARY_PART '+(i+1)+'/'+total+' '+digest+' '+encoded.slice(i*partSize,(i+1)*partSize))
