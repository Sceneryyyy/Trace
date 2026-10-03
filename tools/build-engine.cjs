const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw Error('Trace native engine builds require Windows x64; portable C++ tests use native/portable')
}
const version = require('../node_modules/electron/package.json').version
if (version !== '40.8.3') throw Error('Verify a new Electron version before changing the native target')
const candidates = [
  path.join(root, '.tools/node-gyp', version),
  path.join(root, '../.tools/node-gyp', version),
  path.join(process.env.LOCALAPPDATA || '', 'node-gyp/Cache', version),
]
const sdk = candidates.find(p => fs.existsSync(path.join(p, 'include/node/node_api.h')) && fs.existsSync(path.join(p, 'x64/node.lib')))
if (!sdk) throw Error('Electron SDK missing; run npm run install:trace-sdk (or Trace.ps1 Setup) first')
const env = Object.fromEntries(new Map(Object.entries(process.env).map(([k,v])=>[k.toUpperCase(),v])))
function run(command, args) {
  const r = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (r.error) throw r.error
  if (r.status !== 0) process.exit(r.status || 1)
}
run('cmake', ['-S', 'native/recorder', '-B', 'build/trace-engine', '-G', 'Visual Studio 17 2022', '-A', 'x64', '-DELECTRON_SDK=' + sdk,
  '-DTRACE_REQUIRE_EBU=' + (process.env.TRACE_REQUIRE_EBU === '1' ? 'ON' : 'OFF')])
run('cmake', ['--build', 'build/trace-engine', '--config', 'Release', '--parallel', '1'])
run('ctest', ['--test-dir', 'build/trace-engine', '-C', 'Release', '--output-on-failure'])
