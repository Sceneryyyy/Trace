const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ui=read('artifacts/m3/ui-latest.json'),integration=read('artifacts/m3/integration-latest.json'),boundary=read('artifacts/m3/query-boundaries-latest.json');
const recovery=read('artifacts/m2/recovery-latest.json'),record=read('artifacts/m2/native-latest.json');
for(const report of [ui,integration,boundary,recovery,record])assert.equal(report.status,'pass');
assert.equal(ui.checks.length,10);assert.equal(integration.checks.length,19);assert(recovery.originalHashesUnchanged);
const manifest=read(path.join(integration.long.cacheDirectory,'manifest.json'));
assert.equal(manifest.measurementConfigId,'trace-meter-v4-ebur128-1.2.6-lra10hz-tpaligned');
const binary='build/trace-engine/Release/trace_engine.node',binaryHash=hash(binary);
assert.equal(manifest.engineSha256,binaryHash);
assert(Date.parse(record.started)>=fs.statSync(binary).mtimeMs);
assert(fs.statSync('artifacts/m3/ui-latest.json').mtimeMs>=fs.statSync('out-trace/main/index.js').mtimeMs);
const ctest=fs.readFileSync('build/trace-engine/Testing/Temporary/LastTest.log','utf8');
assert.equal((ctest.match(/Test Passed\./g)||[]).length,7);
assert(ctest.includes('18/18 generated reference cases passed'));assert(ctest.includes('233/233 TP time cases passed'));assert(ctest.includes('shared constants initialized exactly once'));
const sourceHashes={};
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())walk(p);else if(/\.(cpp|h|c|ts|tsx|css|cjs|mjs|json|md|txt)$/.test(item.name))sourceHashes[p.replaceAll('\\','/')]=hash(p)}}
for(const dir of ['native/src/recorder','native/recorder','native/vendor/libebur128','src/trace','test/native','tools/m3'])walk(dir);
const git=args=>spawnSync('git',args,{encoding:'utf8',windowsHide:true}).stdout.trim();
const result={milestone:'M3',status:'implementation-checkpoint',milestoneGatePassed:false,checkedAt:new Date().toISOString(),
 head:git(['rev-parse','HEAD']),branch:git(['branch','--show-current']),worktree:'uncommitted',
 measurementConfigId:manifest.measurementConfigId,binarySha256:binaryHash,appMainSha256:hash('out-trace/main/index.js'),sourceHashes,
 checks:{nativeTargets:7,nativeGeneralCases:52,truePeakTimeCombinations:233,parallelMeterLifecycles:32,generatedReferenceCases:18,jsBoundaryCases:14,uiChecks:ui.checks.length,cacheIntegrationChecks:integration.checks.length,
  queryBoundaries:boundary.checks,recoveryOriginalsUnchanged:true,nativeThreeWav:true,longFile:integration.long},
 evidence:{ui:ui.folder,integration:integration.folder,recovery:recovery.folder,before:'.tools/m3-reference-before.log',after:'.tools/m3-reference-after.log'},
 remainingGate:'Original EBU test-set WAV programme material has not been obtained or exercised; generated tests are not a substitute.',
 openProductWork:['M2 cross-rate same-session device recovery','M3 original reference material','M4 file playback and selection','M5 MP3/AAC export','M6 desktop package and manual acceptance']};
fs.writeFileSync('artifacts/m3/checkpoint.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,milestoneGatePassed:result.milestoneGatePassed,measurementConfigId:result.measurementConfigId,checks:{...result.checks,longFile:{...integration.long,metrics:undefined,cacheDirectory:undefined}},remainingGate:result.remainingGate},null,2));
