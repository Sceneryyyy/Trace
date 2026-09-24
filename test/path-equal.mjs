import assert from 'node:assert/strict'

// Windows file names are case-insensitive. The services canonicalise paths with
// realpath — deliberately, so junction and alias tricks cannot smuggle a path
// past the ownership checks — and realpath returns the drive letter in the OS
// casing (C:\). Test expectations built with path.resolve inherit the casing of
// process.cwd() instead (c:\ when launched from some shells), so a byte-for-byte
// comparison would assert on how the test process happened to be started rather
// than on the path itself. Compare with the platform's own semantics.
const fold = value => (process.platform === 'win32' ? String(value).toLowerCase() : String(value))

export function assertSamePath(actual, expected, message) {
  assert.equal(fold(actual), fold(expected), message)
  return actual
}
