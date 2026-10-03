// Tier manifest for the Trace test suite.
//
// Every file matching test/*.test.mjs must appear in exactly one tier; the
// meta test in test/suite-coverage.test.mjs enforces that, so a new test
// cannot be added without deciding where it runs.
//
// portable: pure TypeScript sources bundled on the fly by esbuild. No compiled
//   native module, no ffmpeg, no packaged application. Runs on any OS and on a
//   clean checkout after `npm ci`, which makes this the tier CI can enforce.
// native: needs build/trace-engine/Release/trace_engine.node or .tools/ffmpeg. Windows only,
//   and only after the corresponding build step.
// Archived Prism-specific API tests in archive/prism are historical references;
// their Trace equivalents here exercise production Trace N-API and C++ kernels.

export const portable = [
  'analysis-retention.test.mjs',
  'canvas-surface.test.mjs',
  'cloud-review-regressions.test.mjs',
  'delivery-service.test.mjs',
  'export-contracts.test.mjs',
  'file-worker-watchdog.test.mjs',
  'history-presentation.test.mjs',
  'import-media.test.mjs',
  'import-store.test.mjs',
  'instrument-service.test.mjs',
  'instrument-themes.test.mjs',
  'interaction-settings.test.mjs',
  'library-service.test.mjs',
  'library-visibility.test.mjs',
  'm6-settings.test.mjs',
  'metric-readout.test.mjs',
  'meter-cache-cadence.test.mjs',
  'native-analysis-queue.test.mjs',
  'operation-feedback.test.mjs',
  'playback-service.test.mjs',
  'preferences-writer.test.mjs',
  'product-preferences.test.mjs',
  'read-only-worker-retry.test.mjs',
  'recording-service.test.mjs',
  'recovery-inventory.test.mjs',
  'reference-math.test.mjs',
  'reference-service.test.mjs',
  'reference-spectrum.test.mjs',
  'release-candidate.test.mjs',
  'release-runtime.test.mjs',
  'report-service.test.mjs',
  'report-targets.test.mjs',
  'session-timeline.test.mjs',
  'shutdown.test.mjs',
  'snapshot-transport.test.mjs',
  'source-continuity.test.mjs',
  'source-retention.test.mjs',
  'spectral-surface.test.mjs',
  'spectrogram-codec.test.mjs',
  'spectrogram-presentation.test.mjs',
  'spectrogram-presenter.test.mjs',
  'spectrogram-projection.test.mjs',
  'spectrogram-service.test.mjs',
  'spectrogram-store.test.mjs',
  'suite-coverage.test.mjs',
  'support-journal.test.mjs',
  'surface-settings.test.mjs',
  'trace-contracts.test.mjs',
  'probe-report.test.mjs',
  'workbench-navigation.test.mjs',
  'workspace-layout.test.mjs',
]

/** Each entry records why the tier is required, so the cost stays visible. */
export const native = {
  'codec-runtime.test.mjs': '.tools/ffmpeg (locked EXEs; three real encoding/decoding roundtrips)',
  'cache-recording.test.mjs': 'build/trace-engine/Release/trace_engine.node',
  'import-service.test.mjs': '.tools/ffmpeg',
  'lufsmeter-native.test.mjs': 'build/trace-engine/Release/trace_engine.node',
  'native-long-path.test.mjs': 'build/trace-engine/Release/trace_engine.node',
  'recording-continuation.test.mjs': 'build/trace-engine/Release/trace_engine.node + .tools/ffmpeg',
  'spectrogram-native.test.mjs': 'build/trace-engine/Release/trace_engine.node',
  'spectrum-native.test.mjs': 'build/trace-engine/Release/trace_engine.node',
  'vectorscope-native.test.mjs': 'build/trace-engine/Release/trace_engine.node',
}
