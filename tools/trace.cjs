// Project-local tooling. Does not change global npm/Git/Windows settings.
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const local = path.join(root, '.tools')
const npm = path.join(local, 'npm/package/bin/npm-cli.js')
const env = Object.fromEntries(new Map(Object.entries(process.env).map(([k,v]) => [k.toUpperCase(), v])))
env.PATH = path.dirname(process.execPath) + path.delimiter + (env.PATH || '')
function setEnv(key, value) { delete env[key.toUpperCase()]; env[key] = value }
setEnv('npm_config_cache', path.join(local, 'npm-cache'))
setEnv('npm_config_devdir', path.join(local, 'node-gyp'))
setEnv('electron_config_cache', path.join(local, 'electron-cache'))
setEnv('npm_config_loglevel', 'warn')
setEnv('npm_config_msvs_version', '2022')
const python = path.resolve(path.dirname(process.execPath), '../../python/python.exe')
if (!env.NPM_CONFIG_PYTHON && fs.existsSync(python)) setEnv('npm_config_python', python)
const action = (process.argv[2] || 'Check').toLowerCase()
function run(command, args) {
  const r = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (r.error) throw r.error
  if (r.status !== 0) throw Error(path.basename(command) + ' exited ' + r.status)
}
async function ensureNpm() {
  if (fs.existsSync(npm)) {
    if (require(path.join(local, 'npm/package/package.json')).version !== '10.9.2') throw Error('Unexpected local npm version')
    return
  }
  fs.mkdirSync(path.join(local, 'npm'), { recursive: true })
  const response = await fetch('https://registry.npmjs.org/npm/-/npm-10.9.2.tgz')
  if (!response.ok) throw Error('npm download failed: ' + response.status)
  const archive = Buffer.from(await response.arrayBuffer())
  const expected = 'iriPEPIkoMYUy3F6f3wwSZAU93E0Eg6cHwIR6jzzOXWSy+SD/rOODEs74cVONHKSx2obXtuUoyidVEhISrisgQ=='
  if (createHash('sha512').update(archive).digest('base64') !== expected) throw Error('npm integrity mismatch')
  const target = path.join(local, 'npm.tgz')
  fs.writeFileSync(target, archive)
  run('tar', ['-xzf', target, '-C', path.join(local, 'npm')])
}
async function main() {
  if (process.platform !== 'win32') throw Error('Trace desktop tooling targets Windows x64; use npm run build/test/typecheck for portable checks')
  if (process.arch !== 'x64') throw Error('Trace desktop tooling requires x64 Node')
  if (action === 'sdk') return run(process.execPath, ['tools/install-trace-sdk.cjs'])
  if (action === 'codecs') return run(process.execPath, ['tools/prefetch-ffmpeg.mjs'])
  if (action === 'engine' || action === 'native') return run(process.execPath, ['tools/build-engine.cjs'])
  if (action === 'app') { delete env.ELECTRON_RUN_AS_NODE; return run(require('electron'), ['out-trace/main/index.js']) }
  if (action === 'package') { await ensureNpm(); run(process.execPath, [npm, 'run', 'build:trace']); run(process.execPath, ['tools/build-engine.cjs']); return run(process.execPath, ['tools/package-trace.cjs', ...process.argv.slice(3)]) }
  if (action === 'appbuild') { await ensureNpm(); return run(process.execPath, [npm, 'run', 'build:trace']) }
  if (!['setup', 'check', 'build'].includes(action)) throw Error('Unknown action')
  await ensureNpm()
  if (action === 'setup') {
    run(process.execPath, [npm, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'])
    run(process.execPath, ['node_modules/electron/install.js'])
    run(process.execPath, ['node_modules/esbuild/install.js'])
    run(process.execPath, ['tools/install-trace-sdk.cjs'])
    run(process.execPath, ['tools/prefetch-ffmpeg.mjs'])
  } else if (action === 'check') {
    // test:trace covers the whole portable tier, which subsumes the individual
    // report/contracts/recording scripts that used to be listed here.
    for (const script of ['typecheck', 'test:trace', 'test:trace-native']) {
      run(process.execPath, [npm, 'run', script])
    }
  } else if (action === 'build') {
    run(process.execPath, [npm, 'run', 'build'])
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
