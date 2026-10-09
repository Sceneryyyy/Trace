// Runs the Trace test tiers declared in test/trace-suites.mjs.
//
//   node scripts/run-trace-tests.mjs portable   (default; any OS, clean checkout)
//   node scripts/run-trace-tests.mjs native     (needs engine/ffmpeg builds)
//   node scripts/run-trace-tests.mjs all
//
// The native tier reports the missing build step instead of failing with a bare
// ENOENT from inside a test file.
import {spawnSync, execFileSync} from 'node:child_process'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
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
  '.tools/ffmpeg': 'node tools/prefetch-ffmpeg.mjs',
}

function nativeFiles() {
  const missing = new Map()
  for (const [path, command] of Object.entries(artifacts)) {
    const relevant = Object.values(native).some(requirement => requirement.includes(path))
    if (relevant && !existsSync(join(root, path))) missing.set(path, command)
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
const reportInCI = process.env.GITHUB_ACTIONS === 'true'
const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files.map(name => join('test', name))], {
  cwd: root,
  stdio: reportInCI ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
  env: {...process.env, FORCE_COLOR: '0'},
})
if (reportInCI) {
  const stdout = result.stdout || '', stderr = result.stderr || ''
  process.stdout.write(stdout); process.stderr.write(stderr)
  const counts = Object.fromEntries([...stdout.matchAll(/^ℹ (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms) ([\d.]+)\s*$/gm)].map(m => [m[1], Number(m[2])]))
  const observations = {}
  for (const name of ['TRACE_MP3_IMPORT_MATRIX', 'TRACE_CODEC_MINUTE']) {
    const line = stdout.split(/\r?\n/).find(line => line.startsWith(name + ' '))
    if (line) observations[name] = JSON.parse(line.slice(name.length + 1))
  }
  const complete = ['tests','pass','fail','cancelled','skipped','duration_ms'].every(key => Number.isFinite(counts[key])) &&
    counts.tests === counts.pass + counts.fail + counts.cancelled + counts.skipped
  const report = {schemaVersion: 1, commit: execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(), tier, files:files.length,
    exitCode:result.status, status:complete && !result.error && result.status === 0 ? 'pass' : 'fail', counts, observations,
    outputSha256:createHash('sha256').update(stdout).update(stderr).digest('hex'), scope:'Actual Node test output; no device acceptance'}
  mkdirSync(join(root,'artifacts/release'),{recursive:true})
  writeFileSync(join(root,'artifacts/release/trace-tests-'+tier+'.json'),JSON.stringify(report,null,2)+'\n')
  if (!complete && result.status === 0) {console.error('TRACE_TEST_SUMMARY_MISSING');process.exit(1)}
}
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
