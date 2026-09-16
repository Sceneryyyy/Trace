import assert from 'node:assert/strict'
import test from 'node:test'
import { inspectRawReport } from '../tools/m0/report.mjs'

function report(packets) {
  return { kind: 'raw-wasapi', format: { sampleRate: 48000, channelCount: 2 },
    metadataOverflow: 0, captureHr: 0, stopHr: 0, fixtureError: '', packets,
    packetCount: packets.length, frames: packets.reduce((n, p) => n + BigInt(p.frames), 0n).toString() }
}
const packet = (deviceFrame, qpc100ns, flags = 0) => ({ deviceFrame: String(deviceFrame), qpc100ns: String(qpc100ns), frames: 480, flags })

test('continuous packets retain initial discontinuity and exact uint64 positions', () => {
  const start = 9007199254740993n
  const r = inspectRawReport(report([packet(start, 1000000, 1), packet(start + 480n, 1100000)]))
  assert.equal(r.frames, '960')
  assert.equal(r.initialDiscontinuity, true)
  assert.equal(r.continuity, 'continuous-observed-packet-span')
  assert.equal(r.recordingIntegrityValidated, false)
})
test('Realtek-style idle is detected even when the device frame counter is continuous', () => {
  const r = inspectRawReport(report([packet(0, 1000000), packet(480, 11100000)]))
  assert.equal(r.positionGapFrames, '0')
  assert.equal(r.continuity, 'idle-clock-policy-required')
  assert.equal(r.unrepresentedQpcIntervals[0].unrepresentedSeconds, 1)
})
test('a later discontinuity is not discarded as an initial boundary', () => {
  const r = inspectRawReport(report([packet(0, 1000000), packet(480, 1100000, 1)]))
  assert.equal(r.discontinuitiesAfterFirst, 1)
  assert.equal(r.continuity, 'packet-anomalies')
})
test('timestamp errors prevent false position or elapsed-time claims', () => {
  const r = inspectRawReport(report([packet(0, 1000000), packet(999999, 999999999, 4), packet(960, 1200000)]))
  assert.equal(r.timestampErrors, 1)
  assert.equal(r.positionGapFrames, '0')
  assert.deepEqual(r.unrepresentedQpcIntervals, [])
  assert.equal(r.continuity, 'packet-anomalies')
})
test('gap, overlap and backwards QPC survive the summary', () => {
  const r = inspectRawReport(report([packet(0, 1000000), packet(960, 1200000), packet(1200, 1100000)]))
  assert.equal(r.positionGapFrames, '480')
  assert.equal(r.overlappingFrames, '240')
  assert.equal(r.qpcRegressions, 1)
  assert.equal(r.continuity, 'packet-anomalies')
})
test('SILENT is valid framed input and distinct from no packets', () => {
  const r = inspectRawReport(report([packet(0, 1000000, 2)]))
  assert.equal(r.silentFrames, '480')
  assert.throws(() => inspectRawReport(report([])), /No actual/)
})
test('truncated metadata and mismatched totals cannot produce a passing report', () => {
  const good = report([packet(0, 1000000)])
  assert.throws(() => inspectRawReport({ ...good, packetCount: 2 }), /Incomplete/)
  assert.throws(() => inspectRawReport({ ...good, metadataOverflow: 1 }), /Incomplete/)
  assert.throws(() => inspectRawReport({ ...good, frames: '481' }), /Frame total/)
  assert.throws(() => inspectRawReport({ ...good, captureHr: -1 }), /failed/)
  assert.throws(() => inspectRawReport(report([packet(-1, 1000000)])), /unsigned/)
  assert.throws(() => inspectRawReport(report([packet(2n ** 64n, 1000000)])), /uint64/)
})
