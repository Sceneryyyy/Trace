const { spawnSync } = require('node:child_process')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const artifacts = path.join(root, 'artifacts/m0')
mkdirSync(artifacts, { recursive: true })
// Windows environment names are case-insensitive. Some launchers supply both
// Path and PATH; MSBuild rejects them before compiling. Normalize child only.
const env = Object.fromEntries(new Map(Object.entries(process.env).map(([k, v]) => [k.toUpperCase(), v])))
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw Error(`${path.basename(command)} exited ${result.status}`)
  return result
}
async function main() {
  const [action, ...args] = process.argv.slice(2)
  if (process.platform !== 'win32') throw Error('WASAPI probes require Windows')
  if (action === 'build') {
    run('cmake', ['-S', 'tools/m0', '-B', 'build/m0', '-G', 'Visual Studio 17 2022', '-A', 'x64'])
    run('cmake', ['--build', 'build/m0', '--config', 'Release', '--parallel', '1'])
  } else if (action === 'probe') {
    const mode = args[0] || 'list'
    if (!['list', 'raw', 'upstream'].includes(mode)) throw Error('Invalid probe mode')
    const result = spawnSync(path.join(root, 'build/m0/Release/trace-capture-probe.exe'), args.length ? args : ['list'],
      { cwd: root, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 75000 })
    if (result.error) throw result.error
    // Parse before publishing an evidence file. Bad/incomplete output fails.
    const report = JSON.parse(result.stdout)
    const file = path.join(artifacts, `${mode}.json`)
    writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
    if (result.status !== 0) throw Error(`Probe exited ${result.status}: ${result.stderr}`)
    if (mode === 'raw') {
      const { inspectRawReport } = await import('./report.mjs')
      console.log(JSON.stringify(inspectRawReport(report), null, 2))
    } else console.log(JSON.stringify(report, null, 2))
    console.log(`Evidence: ${path.relative(root, file)}`)
  } else if (action === 'electron') {
    delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(require('electron'), [path.join(__dirname, 'electron-smoke.cjs')],
      { cwd: root, env, encoding: 'utf8', timeout: 20000 })
    writeFileSync(path.join(artifacts, 'electron-smoke.log'), (result.stdout || '') + (result.stderr || ''))
    if (result.error) throw result.error
    if (result.status !== 0) throw Error(`Electron smoke exited ${result.status}; see artifacts/m0/electron-smoke.log`)
    const report = JSON.parse(readFileSync(path.join(artifacts, 'electron-smoke.json'), 'utf8'))
    if (report.status !== 'pass') throw Error('Electron report failed')
    console.log(JSON.stringify(report, null, 2))
  } else throw Error('Expected build, probe, or electron')
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
