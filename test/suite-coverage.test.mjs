import test from 'node:test'
import assert from 'node:assert/strict'
import {readdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {basename, dirname, join} from 'node:path'
import {portable, native} from './trace-suites.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// A test that no runner executes protects nothing. Before this guard existed,
// six files had silently stopped running and had rotted; this keeps the tier
// manifest and the directory in lockstep.
test('every Trace test belongs to exactly one runnable tier', async () => {
  const present = (await readdir(here)).filter(name => name.endsWith('.test.mjs')).sort()
  const claimed = [...portable, ...Object.keys(native)].sort()

  assert.deepEqual(
    present.filter(name => !claimed.includes(name)),
    [],
    'Add new tests to test/trace-suites.mjs so a runner picks them up',
  )
  assert.deepEqual(
    claimed.filter(name => !present.includes(name)),
    [],
    'Remove deleted tests from test/trace-suites.mjs',
  )

  const overlap = portable.filter(name => Object.hasOwn(native, name))
  assert.deepEqual(overlap, [], 'A test cannot be both portable and native')
  assert.equal(new Set(claimed).size, claimed.length, 'Duplicate entry in the tier manifest')
})

test('portable tests declare no compiled or downloaded dependency', async () => {
  const {readFile} = await import('node:fs/promises')
  // Keeping this mechanical stops a native dependency from quietly entering the
  // tier that CI runs on machines without the engine, ffmpeg or a packaged app.
  const markers = ['trace_engine.node', 'visualizer_dsp', '.tools/ffmpeg', 'TRACE_PACKAGE_EXE']
  const self = basename(fileURLToPath(import.meta.url))
  const offenders = []
  for (const name of portable) {
    if (name === self) continue // this file lists the markers as data
    const text = await readFile(join(here, name), 'utf8')
    const hit = markers.find(marker => text.includes(marker))
    if (hit) offenders.push(name + ' references ' + hit)
  }
  assert.deepEqual(offenders, [], 'Move these to the native tier in test/trace-suites.mjs')
})
