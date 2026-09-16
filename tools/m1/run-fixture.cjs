const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const index = process.argv[2]
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
if (index !== undefined) env.TRACE_TEST_DEVICE_INDEX = index
function run(exe, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd: root, env, windowsHide: true, ...options })
    let stdout = '', stderr = ''
    child.stdout.on('data', x => { stdout += x })
    child.stderr.on('data', x => { stderr += x })
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
  })
}
async function main() {
  const smoke = run(require('electron'), ['tools/m1/native-smoke.cjs'])
  await new Promise(resolve => setTimeout(resolve, 1000))
  const args = ['raw', '--seconds', '6', '--fixture']
  if (index !== undefined) args.push('--device-index', index)
  const fixture = run(path.join(root, 'build/m0/Release/trace-capture-probe.exe'), args)
  const [s, f] = await Promise.all([smoke, fixture])
  const name = index ?? '-default'
  fs.writeFileSync(path.join(root, 'artifacts/m1/raw-fixture' + name + '.json'), f.stdout)
  const result = JSON.parse(fs.readFileSync(path.join(root, 'artifacts/m1/native-smoke' + name + '.json')))
  const maxMetric = key => result.samples.reduce((max, s) => Math.max(max, s[key]?.value ?? -Infinity), -Infinity)
  const output = { smokeExit: s.code, fixtureExit: f.code, status: result.status, error: result.error,
    maxM: maxMetric('momentary'), maxI: maxMetric('integratedToCursor'),
    last: result.samples.at(-1)?.diagnostics, stop: result.stopDiagnostics, reset: result.reset }
  console.log(JSON.stringify(output, null, 2))
  if (s.code || f.code || result.status !== 'pass' || !Number.isFinite(maxMetric('momentary'))) {
    console.error(s.stderr || f.stderr)
    process.exitCode = 1
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1 })
