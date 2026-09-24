// Runs the Trace test tiers declared in test/trace-suites.mjs.
//
//   node scripts/run-trace-tests.mjs portable   (default; any OS, clean checkout)
//   node scripts/run-trace-tests.mjs native     (needs engine/ffmpeg builds)
//   node scripts/run-trace-tests.mjs all
//
// The native tier reports the missing build step instead of failing with a bare
// ENOENT from inside a test file.
import {spawnSync} from 'node:child_process'
import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, join, resolve} from 'node:path'
import {portable, native} from '../test/trace-suites.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tier = process.argv[2] || 'portable'
if (!['portable', 'native', 'all'].includes(tier)) {
  console.error('Usage: run-trace-tests.mjs [portable|native|all]')
  process.exit(2)
}

const artifacts = {
  'build/trace-engine/Release/trace_engine.node': 'npm run build:trace-engine',
  'native/build/Release/visualizer_dsp.node': 'npm run rebuild:native',
  '.tools/ffmpeg': 'node tools/prefetch-ffmpeg.mjs',
}

function nativeFiles() {
  const missing = new Map()
  for (const [path, command] of Object.entries(artifacts)) {
    if (!existsSync(join(root, path))) missing.set(path, command)
  }
  const runnable = []
  for (const [file, requirement] of Object.entries(native)) {
    const blockers = [...missing.keys()].filter(path => requirement.includes(path))
    if (blockers.length) {
      console.error(`[skip] ${file} needs ${blockers.join(', ')} — run: ${blockers.map(p => missing.get(p)).join(' && ')}`)
      continue
    }
    runnable.push(file)
  }
  if (missing.size && process.env.TRACE_REQUIRE_NATIVE === '1') {
    console.error('[fail] TRACE_REQUIRE_NATIVE=1 but build artifacts are missing')
    process.exit(1)
  }
  return runnable
}

const files = []
if (tier === 'portable' || tier === 'all') files.push(...portable)
if (tier === 'native' || tier === 'all') files.push(...nativeFiles())
if (!files.length) {
  console.error('No test files selected for tier ' + tier)
  process.exit(1)
}

console.log(`[trace-tests] tier=${tier} files=${files.length}`)
const result = spawnSync(process.execPath, ['--test', ...files.map(name => join('test', name))], {
  cwd: root,
  stdio: 'inherit',
})
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
