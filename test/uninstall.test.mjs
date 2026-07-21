import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  installHarness,
  uninstallHarness,
} from '../dist/install/harness.js'
import {
  cursorMcpPath,
  installCursorMcp,
  uninstallCursorMcp,
} from '../dist/install/cursor-mcp.js'
import {
  discoverInstalls,
  forgetInstall,
  ledgerPath,
  readLedger,
  recordInstall,
} from '../dist/install/ledger.js'

function temp(name) {
  return mkdtempSync(path.join(os.tmpdir(), `codegenkit-${name}-`))
}

test('ledger uses Codegenkit state and discovers legacy installs', () => {
  const previous = process.env.CODEGENKIT_STATE_DIR
  const state = temp('ledger-state')
  const first = temp('ledger-first')
  const discovery = temp('ledger-discovery')
  const legacy = path.join(discovery, 'products', 'legacy')
  mkdirSync(path.join(legacy, '.codegenkit'), { recursive: true })
  writeFileSync(path.join(legacy, '.codegenkit', 'install-manifest.json'), '{}\n')
  process.env.CODEGENKIT_STATE_DIR = state
  try {
    recordInstall(first)
    assert.deepEqual(readLedger(), [])
    installHarness({ projectRoot: first, type: 'fe', feAdapter: 'nuxt4' })
    assert.deepEqual(readLedger(), [first])
    assert.deepEqual(discoverInstalls(discovery), [legacy])
    assert.equal(ledgerPath(), path.join(state, 'installs.json'))
    forgetInstall(first)
    assert.deepEqual(readLedger(), [])
  } finally {
    if (previous === undefined) delete process.env.CODEGENKIT_STATE_DIR
    else process.env.CODEGENKIT_STATE_DIR = previous
  }
})

test('harness uninstall preserves modified files and removes its manifest', () => {
  const root = temp('harness-uninstall')
  installHarness({ projectRoot: root, type: 'be', beAdapter: 'fastapi' })
  const modified = path.join(root, 'registries', 'common.registry.json')
  const removable = path.join(root, '.cursor', 'skills', 'api', 'SKILL.md')
  const custom = JSON.parse(readFileSync(modified, 'utf8'))
  custom.entries['other-toolkit.entry'] = { status: 'custom' }
  writeFileSync(modified, `${JSON.stringify(custom, null, 2)}\n`)

  const preview = uninstallHarness({ projectRoot: root })
  assert.ok(preview.removable.includes(removable))
  assert.ok(preview.modified.includes(modified))
  assert.ok(existsSync(removable))

  const applied = uninstallHarness({ projectRoot: root, yes: true })
  assert.ok(applied.removed.includes(removable))
  assert.ok(applied.modified.includes(modified))
  assert.ok(existsSync(modified))
  assert.equal(existsSync(removable), false)
  assert.equal(existsSync(path.join(root, '.codegenkit', 'install-manifest.json')), false)
})

test('Cursor MCP uninstall removes only the Codegenkit entry', () => {
  const root = temp('mcp-uninstall')
  installCursorMcp({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nextjs',
  })
  const file = cursorMcpPath(root)
  const config = JSON.parse(readFileSync(file, 'utf8'))
  config.mcpServers.docskit = { command: 'keep-me' }
  config.otherConfig = { keep: true }
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)

  const preview = uninstallCursorMcp({ projectRoot: root })
  assert.equal(preview.removed, true)
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).mcpServers.codegenkit)

  const applied = uninstallCursorMcp({ projectRoot: root, yes: true })
  assert.equal(applied.removed, true)
  const remaining = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(remaining.mcpServers.codegenkit, undefined)
  assert.deepEqual(remaining.mcpServers.docskit, { command: 'keep-me' })
  assert.deepEqual(remaining.otherConfig, { keep: true })
})

test('CLI deinit is repo-local and uninstall is global from anywhere', () => {
  const cli = path.resolve('bin', 'codegenkit.mjs')
  const fakeHome = temp('cli-home')
  const state = temp('cli-state')
  const installDir = path.join(fakeHome, '.codegenkit')
  const binDir = path.join(fakeHome, '.local', 'bin')
  const first = temp('cli-first')
  const second = temp('cli-second')
  const elsewhere = temp('cli-elsewhere')
  const env = {
    ...process.env,
    HOME: fakeHome,
    CODEGENKIT_STATE_DIR: state,
    CODEGENKIT_INSTALL_DIR: installDir,
    CODEGENKIT_BIN_DIR: binDir,
  }

  const previousState = process.env.CODEGENKIT_STATE_DIR
  process.env.CODEGENKIT_STATE_DIR = state
  try {
    installHarness({ projectRoot: first, type: 'fe', feAdapter: 'nuxt4' })
    installCursorMcp({ projectRoot: first, type: 'fe', feAdapter: 'nuxt4' })
  } finally {
    if (previousState === undefined) delete process.env.CODEGENKIT_STATE_DIR
    else process.env.CODEGENKIT_STATE_DIR = previousState
  }
  const deinit = spawnSync(
    process.execPath,
    [cli, 'deinit', '--project-root', first, '--yes'],
    { cwd: elsewhere, env, encoding: 'utf8' },
  )
  assert.equal(deinit.status, 0, deinit.stderr)
  assert.match(deinit.stdout, /Uninstalled \(repo\)/)
  assert.equal(existsSync(path.join(first, '.codegenkit', 'install-manifest.json')), false)

  process.env.CODEGENKIT_STATE_DIR = state
  try {
    installHarness({ projectRoot: first, type: 'fe', feAdapter: 'nextjs' })
    installHarness({ projectRoot: second, type: 'be', beAdapter: 'laravel' })
    installCursorMcp({ projectRoot: first, type: 'fe', feAdapter: 'nextjs' })
    installCursorMcp({ projectRoot: second, type: 'be', beAdapter: 'laravel' })
  } finally {
    if (previousState === undefined) delete process.env.CODEGENKIT_STATE_DIR
    else process.env.CODEGENKIT_STATE_DIR = previousState
  }
  mkdirSync(path.join(fakeHome, '.cursor'), { recursive: true })
  writeFileSync(
    path.join(fakeHome, '.cursor', 'mcp.json'),
    `${JSON.stringify({
      mcpServers: {
        codegenkit: { command: 'remove-me' },
        docskit: { command: 'keep-me' },
      },
    })}\n`,
  )
  mkdirSync(installDir, { recursive: true })
  mkdirSync(binDir, { recursive: true })
  writeFileSync(path.join(installDir, 'marker'), 'installed\n')
  writeFileSync(path.join(binDir, 'codegenkit'), 'shim\n')

  const preview = spawnSync(process.execPath, [cli, 'uninstall'], {
    cwd: elsewhere,
    env,
    encoding: 'utf8',
  })
  assert.equal(preview.status, 0, preview.stderr)
  assert.match(preview.stdout, /Dry-run \(all\)/)
  assert.ok(existsSync(path.join(second, '.codegenkit', 'install-manifest.json')))

  const applied = spawnSync(process.execPath, [cli, 'uninstall', '--yes'], {
    cwd: elsewhere,
    env,
    encoding: 'utf8',
  })
  assert.equal(applied.status, 0, applied.stderr)
  assert.match(applied.stdout, /Uninstalled \(all\)/)
  assert.equal(existsSync(path.join(first, '.codegenkit', 'install-manifest.json')), false)
  assert.equal(existsSync(path.join(second, '.codegenkit', 'install-manifest.json')), false)
  assert.equal(existsSync(installDir), false)
  assert.equal(existsSync(path.join(binDir, 'codegenkit')), false)
  assert.equal(existsSync(path.join(state, 'installs.json')), false)
  const globalMcp = JSON.parse(readFileSync(path.join(fakeHome, '.cursor', 'mcp.json'), 'utf8'))
  assert.equal(globalMcp.mcpServers.codegenkit, undefined)
  assert.deepEqual(globalMcp.mcpServers.docskit, { command: 'keep-me' })
})
