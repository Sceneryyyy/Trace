export function timecode(frame = '0', rate = 48000): string {
  const milliseconds = BigInt(frame) * 1000n / BigInt(rate || 48000)
  const seconds = milliseconds / 1000n
  return [seconds / 3600n, seconds / 60n % 60n, seconds % 60n].map(n => String(n).padStart(2, '0')).join(':') + '.' + String(milliseconds % 1000n).padStart(3, '0')
}
export function relativeFrame(frame: string, end: string): number { return Number(BigInt(frame) - BigInt(end)) }

export function timecodeNs(nanoseconds = '0'): string { return timecode((BigInt(nanoseconds)/1000000n).toString(),1000) }
