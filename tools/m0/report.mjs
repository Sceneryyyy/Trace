// Diagnostic interpretation only; never inserts PCM or repairs a timeline.
const u64 = value => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw Error('Expected unsigned decimal frame/time string')
  const result = BigInt(value)
  if (result > 0xffffffffffffffffn) throw Error('Value exceeds uint64')
  return result
}
const integer = value => Number.isSafeInteger(value) && value >= 0

export function inspectRawReport(report) {
  if (report.kind !== 'raw-wasapi') throw Error('Expected raw-wasapi report')
  const rate = report.format?.sampleRate
  if (!Number.isSafeInteger(rate) || rate <= 0 || ![1, 2].includes(report.format?.channelCount)) throw Error('Unsupported format')
  if (!Array.isArray(report.packets) || !report.packets.length) throw Error('No actual WASAPI packets')
  if (report.metadataOverflow !== 0 || report.packetCount !== report.packets.length) throw Error('Incomplete packet metadata')
  if (report.captureHr !== 0 || report.stopHr !== 0 || report.fixtureError) throw Error('Capture or fixture failed')
  let total = 0n
  let previous = null
  let silentFrames = 0n
  let timestampErrors = 0
  let discontinuitiesAfterFirst = 0
  let positionGapFrames = 0n
  let overlappingFrames = 0n
  let qpcRegressions = 0
  const unrepresentedQpcIntervals = []
  for (let index = 0; index < report.packets.length; index++) {
    const packet = report.packets[index]
    if (!integer(packet.frames) || !packet.frames || !integer(packet.flags) || packet.flags > 7) throw Error('Invalid packet')
    const position = u64(packet.deviceFrame)
    const qpc = u64(packet.qpc100ns)
    total += BigInt(packet.frames)
    if (packet.flags & 2) silentFrames += BigInt(packet.frames)
    if (packet.flags & 4) timestampErrors++
    if (index > 0 && (packet.flags & 1)) discontinuitiesAfterFirst++
    if (previous && !(packet.flags & 4) && !(previous.flags & 4)) {
      const expected = previous.position + BigInt(previous.frames)
      if (position > expected) positionGapFrames += position - expected
      if (position < expected) overlappingFrames += expected - position
      if (qpc < previous.qpc) qpcRegressions++
      const qpcElapsed = Number(qpc - previous.qpc) / 1e7
      const deviceElapsed = Number(position - previous.position) / rate
      // This is an observation threshold (>= 40 ms for 10 ms packets), not a
      // standard tolerance or permission to infer silence. Preserve anomalies.
      const threshold = Math.max(0.025, 4 * previous.frames / rate)
      const unrepresentedSeconds = qpcElapsed - deviceElapsed
      if (unrepresentedSeconds > threshold) unrepresentedQpcIntervals.push({
        beforePacket: index, unrepresentedSeconds,
        previousDeviceFrame: previous.position.toString(), deviceFrame: position.toString(),
      })
    }
    previous = { position, qpc, frames: packet.frames, flags: packet.flags }
  }
  if (total !== u64(report.frames)) throw Error('Frame total does not match packet evidence')
  const hasGap = timestampErrors || discontinuitiesAfterFirst || positionGapFrames || overlappingFrames || qpcRegressions
  return {
    sampleRate: rate, channelCount: report.format.channelCount,
    frames: total.toString(), packetSeconds: Number(total) / rate,
    packets: report.packetCount, silentFrames: silentFrames.toString(),
    initialDiscontinuity: Boolean(report.packets[0].flags & 1),
    discontinuitiesAfterFirst, timestampErrors, positionGapFrames: positionGapFrames.toString(),
    overlappingFrames: overlappingFrames.toString(), qpcRegressions, unrepresentedQpcIntervals,
    continuity: hasGap ? 'packet-anomalies' : unrepresentedQpcIntervals.length
      ? 'idle-clock-policy-required' : 'continuous-observed-packet-span',
    // A finite packet span never proves complete coverage of start/end walls.
    recordingIntegrityValidated: false,
  }
}
