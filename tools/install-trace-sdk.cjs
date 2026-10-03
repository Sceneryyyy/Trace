// Fetch the pinned Electron SDK without configuring or compiling an addon.
// node-gyp verifies the downloaded headers/node.lib against SHASUMS256.txt.
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const electronVersion = '42.11.10'

function sdkPlan() {
  return {
    executable: process.execPath,
    args: [
      path.join(root, 'node_modules/node-gyp/bin/node-gyp.js'),
      'install',
      '--target=' + electronVersion,
      '--arch=x64',
      '--dist-url=https://electronjs.org/headers',
      '--devdir=' + path.join(root, '.tools/node-gyp'),
      '--ensure',
    ],
    sdk: path.join(root, '.tools/node-gyp', electronVersion),
  }
}

function installSdk() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw Error('The Trace native engine requires Windows x64. Use --plan to inspect SDK acquisition on another OS.')
  }
  if (require('../node_modules/electron/package.json').version !== electronVersion) {
    throw Error('Verify a new Electron version before changing the Trace native SDK')
  }
  const plan = sdkPlan()
  const result = spawnSync(plan.executable, plan.args, { cwd: root, env: process.env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw Error('Electron SDK installation exited ' + result.status)
  for (const file of ['include/node/node_api.h', 'x64/node.lib']) {
    if (!fs.existsSync(path.join(plan.sdk, file))) throw Error('Electron SDK is incomplete: ' + file)
  }
  console.log('TRACE_ELECTRON_SDK_READY', electronVersion)
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2)
    if (args.length === 1 && args[0] === '--plan') console.log(JSON.stringify(sdkPlan(), null, 2))
    else if (!args.length) installSdk()
    else throw Error('Usage: install-trace-sdk.cjs [--plan]')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { sdkPlan }
