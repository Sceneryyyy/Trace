const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const ui=read('artifacts/m2/ui-latest.json'),native=read('artifacts/m2/native-latest.json'),recovery=read('artifacts/m2/recovery-latest.json'),reopen=read('artifacts/m2/reopen-ui-latest.json');
for(const report of [ui,native,recovery,reopen])assert.equal(report.status,'pass');
assert(ui.checks.includes('Native region clock persisted in the session'));
assert(recovery.originalHashesUnchanged);
for(const record of native.takes)assert(BigInt(record.endQpc100ns)>BigInt(record.startQpc100ns));
const tests=fs.readFileSync('build/trace-engine/Testing/Temporary/LastTest.log','utf8');
assert.equal((tests.match(/Test Passed\./g)||[]).length,8);assert(tests.includes('4/4 region clock cases passed'));
const files=['native/src/recorder/CaptureRecovery.h','native/src/recorder/CaptureClock.h','native/src/recorder/AudioTypes.h','native/src/recorder/Recorder.cpp','native/src/recorder/Engine.cpp','native/src/recorder/addon.cpp','src/trace/sessionTimeline.ts','src/trace/recording.ts','src/trace/shared.ts','src/trace/renderer/time.ts','src/trace/renderer/App.tsx','test/native/region_clock_tests.cpp','test/session-timeline.test.mjs'];
const result={status:'region-clock-and-timeline-foundation',checkedAt:new Date().toISOString(),automaticContinuationImplemented:false,
 nativeTargets:8,regionClockCases:4,timelineCases:5,totalJsCases:19,nativeThreeWav:true,uiChecks:ui.checks.length,reopen:true,recoveryOriginalsUnchanged:true,
 binarySha256:hash('build/trace-engine/Release/trace_engine.node'),sourceSha256:Object.fromEntries(files.map(p=>[p,hash(p)])),
 evidence:{ui:ui.folder,recovery:recovery.folder,native:'artifacts/m2/native-latest.json',log:'.tools/m2-region-clock.log'},
 next:'Integrate generation-guarded same-session reconnect, region manifests and session-view conversion; preserve all original milestone gates.'};
fs.mkdirSync('artifacts/m2-regions',{recursive:true});fs.writeFileSync('artifacts/m2-regions/checkpoint.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,automaticContinuationImplemented:false,nativeTargets:8,regionClockCases:4,timelineCases:5,totalJsCases:19,uiChecks:result.uiChecks},null,2));
