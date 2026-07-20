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
  agentConfigPath,
  installAgents,
  parseAgentTargets,
  uninstallAgents,
} from '../dist/install/agents.js'
import {
  canonicalGitignorePattern,
  ensureGitignoreEntries,
  generatedTargets,
  removeGitignoreEntries,
} from '../dist/install/gitignore.js'
import {
  harnessStatus,
  installHarness,
  uninstallHarness,
} from '../dist/install/harness.js'
import { resolveInitWizard } from '../dist/install/init-wizard.js'
import { wirePlatformDnaCodegraph } from '../dist/install/platform-dna.js'

function temp(name) {
  return mkdtempSync(path.join(os.tmpdir(), `codegenkit-${name}-`))
}

test('parseAgentTargets supports auto/all/none and aliases', () => {
  assert.deepEqual(parseAgentTargets('none', ['cursor']), [])
  assert.deepEqual(parseAgentTargets('all', []), [
    'claude',
    'cursor',
    'codex',
    'opencode',
    'hermes',
    'gemini',
    'antigravity',
    'kiro',
    'kilo',
  ])
  assert.deepEqual(parseAgentTargets('cursor,agy', []), ['cursor', 'antigravity'])
  assert.deepEqual(parseAgentTargets('auto', []), ['cursor'])
  assert.deepEqual(parseAgentTargets('auto', ['codex']), ['codex'])
})

test('wizard skip optional and defer codegraph with injected prompts', async () => {
  const root = temp('wizard')
  const selection = await resolveInitWizard({
    root,
    interactive: true,
    detectedAgents: ['cursor'],
    prompts: {
      checkbox: async ({ message }) => {
        if (message.includes('agents')) return []
        if (message.includes('Optional')) return []
        return []
      },
      select: async ({ message, choices }) => {
        if (message.includes('lane')) return 'fe'
        if (message.includes('FE adapter')) return 'nuxt4'
        if (message.includes('CodeGraph')) return 'later'
        return choices[0].value
      },
      line: async () => '',
    },
  })
  assert.deepEqual(selection.targets, [])
  assert.equal(selection.type, 'fe')
  assert.equal(selection.feAdapter, 'nuxt4')
  assert.deepEqual(selection.withOptional, [])
  assert.equal(selection.wireCodegraph, false)
})

test('init --target=none installs harness and exclusive gitignore without agent MCP', () => {
  const root = temp('none-agents')
  const cli = path.resolve('bin', 'codegenkit.mjs')
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'init',
      '--project-root',
      root,
      '--type=fe',
      '--adapter=nuxt4',
      '--target=none',
      '--no-codegraph',
      '--yes',
    ],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.ok(existsSync(path.join(root, '.codegenkit', 'install-manifest.json')))
  assert.ok(existsSync(path.join(root, '.cursor', 'skills', 'prototype', 'SKILL.md')))
  assert.equal(existsSync(path.join(root, '.cursor', 'mcp.json')), false)
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.match(ignore, /\.codegenkit\//)
  assert.match(ignore, /\.cursor\//)
  assert.doesNotMatch(ignore, /src\//)
  assert.doesNotMatch(ignore, /generated\//)
  assert.doesNotMatch(ignore, /\.codegraph/)
  const manifest = JSON.parse(
    readFileSync(path.join(root, '.codegenkit', 'install-manifest.json'), 'utf8'),
  )
  assert.ok(manifest.gitignore.some((e) => e.pattern.includes('codegenkit') && !e.shared))
  assert.ok(manifest.gitignore.some((e) => canonicalGitignorePattern(e.pattern) === '.cursor' && e.shared))
  assert.equal(manifest.mcp, undefined)
})

test('multi-agent local paths write only selected agents and ignore actual-written targets', () => {
  const root = temp('multi-agent')
  const agents = installAgents({
    projectRoot: root,
    type: 'be',
    beAdapter: 'fastapi',
    targets: ['cursor', 'codex', 'claude'],
  })
  assert.equal(agents.written.length >= 3, true)
  assert.ok(existsSync(agentConfigPath('cursor', root)))
  assert.ok(existsSync(agentConfigPath('codex', root)))
  assert.ok(existsSync(agentConfigPath('claude', root)))
  assert.equal(existsSync(agentConfigPath('hermes', root)), false)

  const cursor = JSON.parse(readFileSync(agentConfigPath('cursor', root), 'utf8'))
  assert.equal(cursor.mcpServers.codegenkit.env.CODEGENKIT_TYPE, 'be')
  assert.equal(cursor.mcpServers.codegenkit.env.CODEGENKIT_BE_ADAPTER, 'fastapi')

  const ignoreEntries = generatedTargets({
    projectRoot: root,
    written: agents.written.map((w) => w.path),
    harnessInstalled: true,
  })
  installHarness({
    projectRoot: root,
    type: 'be',
    beAdapter: 'fastapi',
    gitignoreEntries: ignoreEntries,
    mcp: agents.mcp,
  })
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.match(ignore, /\.cursor\//)
  assert.match(ignore, /\.codegenkit\//)
  assert.match(ignore, /\.codex\//)
  assert.match(ignore, /\.claude\.json/)
  assert.doesNotMatch(ignore, /\.hermes\//)

  const status = harnessStatus(root)
  assert.ok(status.gitignore.every((e) => e.status === 'present'))
  assert.ok(status.mcp.some((m) => m.agent === 'cursor' && m.status === 'present'))
})

test('gitignore create / idempotent / equivalent / CRLF / legacy block migration', () => {
  const root = temp('gitignore')
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\r\n', 'utf8')
  const first = ensureGitignoreEntries(root, ['.cursor/', '.codegenkit/'])
  assert.equal(first.changed, true)
  assert.deepEqual(first.added, ['.cursor/', '.codegenkit/'])
  const second = ensureGitignoreEntries(root, ['/.cursor/', '.codegenkit/'])
  assert.equal(second.changed, false)
  assert.deepEqual(second.added, [])

  writeFileSync(
    path.join(root, '.gitignore'),
    [
      'keep-me',
      '# >>> codegenkit generated files',
      '/.cursor/',
      '/.codegenkit/',
      '# <<< codegenkit generated files',
      '',
    ].join('\n'),
    'utf8',
  )
  const migrated = ensureGitignoreEntries(root, ['.cursor/', '.codegenkit/'])
  const content = readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.equal(content.includes('# >>> codegenkit'), false)
  assert.match(content, /keep-me/)
  assert.match(content, /cursor/)
  assert.equal(migrated.changed, true)
})

test('product code paths are never claimed by generatedTargets', () => {
  const root = temp('product')
  const entries = generatedTargets({
    projectRoot: root,
    written: [
      path.join(root, 'src', 'app.ts'),
      path.join(root, 'generated', 'codegen.manifest.json'),
      path.join(root, '.cursor', 'mcp.json'),
    ],
    harnessInstalled: true,
  })
  const patterns = entries.map((e) => e.pattern)
  assert.ok(patterns.some((p) => canonicalGitignorePattern(p) === '.cursor'))
  assert.ok(patterns.some((p) => canonicalGitignorePattern(p) === '.codegenkit'))
  assert.equal(patterns.some((p) => p.includes('src')), false)
  assert.equal(patterns.some((p) => p.includes('generated')), false)
})

test('laravel be claims src/.codegenkit for PHP unitgen', () => {
  const root = temp('laravel-php')
  const entries = generatedTargets({
    projectRoot: root,
    written: [],
    harnessInstalled: true,
    beAdapter: 'laravel',
  })
  const patterns = entries.map((e) => canonicalGitignorePattern(e.pattern))
  assert.ok(patterns.includes('src/.codegenkit'))
})

test('multi-toolkit .cursor survival: deinit keeps shared, removes exclusive', () => {
  const root = temp('shared-cursor')
  writeFileSync(
    path.join(root, '.gitignore'),
    'node_modules/\n.cursor/\n.hubdocs/\n',
    'utf8',
  )
  mkdirSync(path.join(root, '.cursor'), { recursive: true })
  writeFileSync(
    path.join(root, '.cursor', 'mcp.json'),
    `${JSON.stringify({
      mcpServers: {
        hubdocs: { command: 'keep-me' },
      },
    })}\n`,
  )
  const agents = installAgents({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nuxt4',
    targets: ['cursor'],
  })
  installHarness({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nuxt4',
    gitignoreEntries: generatedTargets({
      projectRoot: root,
      written: agents.written.map((w) => w.path),
      harnessInstalled: true,
    }),
    mcp: agents.mcp,
  })

  uninstallAgents({ projectRoot: root, yes: true, recorded: agents.mcp })
  const uninstall = uninstallHarness({ projectRoot: root, yes: true })
  assert.ok(uninstall.gitignoreRemoved.some((p) => canonicalGitignorePattern(p) === '.codegenkit'))
  assert.equal(
    uninstall.gitignoreRemoved.some((p) => canonicalGitignorePattern(p) === '.cursor'),
    false,
  )
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
  assert.match(ignore, /\.cursor\//)
  assert.match(ignore, /\.hubdocs\//)
  assert.doesNotMatch(ignore, /\.codegenkit\//)
  const mcp = JSON.parse(readFileSync(path.join(root, '.cursor', 'mcp.json'), 'utf8'))
  assert.equal(mcp.mcpServers.codegenkit, undefined)
  assert.deepEqual(mcp.mcpServers.hubdocs, { command: 'keep-me' })
})

test('modified MCP entry is preserved on uninstall', () => {
  const root = temp('mcp-hash')
  const agents = installAgents({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nextjs',
    targets: ['cursor'],
  })
  installHarness({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nextjs',
    gitignoreEntries: generatedTargets({
      projectRoot: root,
      written: agents.written.map((w) => w.path),
      harnessInstalled: true,
    }),
    mcp: agents.mcp,
  })
  const file = agentConfigPath('cursor', root)
  const config = JSON.parse(readFileSync(file, 'utf8'))
  config.mcpServers.codegenkit.env.CODEGENKIT_TYPE = 'be'
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)

  const result = uninstallAgents({
    projectRoot: root,
    yes: true,
    recorded: agents.mcp,
  })
  assert.ok(result.preserved.some((line) => line.includes('cursor')))
  assert.ok(JSON.parse(readFileSync(file, 'utf8')).mcpServers.codegenkit)
})

test('status reports missing gitignore entries', () => {
  const root = temp('status-ignore')
  const agents = installAgents({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nuxt4',
    targets: ['cursor'],
  })
  installHarness({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nuxt4',
    gitignoreEntries: generatedTargets({
      projectRoot: root,
      written: agents.written.map((w) => w.path),
      harnessInstalled: true,
    }),
    mcp: agents.mcp,
  })
  removeGitignoreEntries(root, ['.codegenkit/'])
  const status = harnessStatus(root)
  assert.ok(
    status.gitignore.some(
      (e) => canonicalGitignorePattern(e.pattern) === '.codegenkit' && e.status === 'missing',
    ),
  )
})

test('init twice is idempotent for harness ignore and MCP', () => {
  const root = temp('idempotent')
  const cli = path.resolve('bin', 'codegenkit.mjs')
  const args = [
    cli,
    'init',
    '--project-root',
    root,
    '--type=fe',
    '--adapter=nuxt4',
    '--target=cursor',
    '--no-codegraph',
    '--yes',
  ]
  const first = spawnSync(process.execPath, args, { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(first.status, 0, first.stderr)
  const ignore1 = readFileSync(path.join(root, '.gitignore'), 'utf8')
  const mcp1 = readFileSync(path.join(root, '.cursor', 'mcp.json'), 'utf8')
  const second = spawnSync(process.execPath, args, { cwd: path.resolve('.'), encoding: 'utf8' })
  assert.equal(second.status, 0, second.stderr)
  assert.equal(readFileSync(path.join(root, '.gitignore'), 'utf8'), ignore1)
  assert.equal(readFileSync(path.join(root, '.cursor', 'mcp.json'), 'utf8'), mcp1)
  const cursorCount = ignore1.split('\n').filter((l) => canonicalGitignorePattern(l) === '.cursor').length
  assert.equal(cursorCount, 1)
})

test('Platform DNA codegraph delegate skips when not initialized and passes argv', () => {
  const root = temp('dna-skip')
  const skipped = wirePlatformDnaCodegraph({ projectRoot: root, filterKeys: 'portal,api' })
  assert.equal(skipped.skipped, 'not-initialized')
  assert.deepEqual(skipped.args.slice(0, 4), [
    'codegraph:wire',
    '--project-root',
    path.resolve(root),
    '--yes',
  ])
  assert.ok(skipped.args.includes('--codegraph-repos=portal,api'))

  mkdirSync(path.join(root, '.platform-dna'), { recursive: true })
  writeFileSync(path.join(root, '.platform-dna', 'install-manifest.json'), '{}\n')
  const previous = process.env.PLATFORM_DNA_COMMAND
  const shim = path.join(root, 'fake-platform-dna')
  writeFileSync(
    shim,
    `#!/usr/bin/env node
process.stdout.write(JSON.stringify(process.argv.slice(2)))
`,
  )
  spawnSync('chmod', ['+x', shim])
  process.env.PLATFORM_DNA_COMMAND = shim
  try {
    const wired = wirePlatformDnaCodegraph({ projectRoot: root, filterKeys: 'portal' })
    assert.equal(wired.attempted, true)
    assert.equal(wired.status, 0)
    const argv = JSON.parse(wired.stdout)
    assert.equal(argv[0], 'codegraph:wire')
    assert.ok(argv.includes('--project-root'))
    assert.ok(argv.includes('--codegraph-repos=portal'))
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_DNA_COMMAND
    else process.env.PLATFORM_DNA_COMMAND = previous
  }
})

test('CLI --no-codegraph never attempts DNA wire', () => {
  const root = temp('no-codegraph')
  mkdirSync(path.join(root, '.platform-dna'), { recursive: true })
  writeFileSync(path.join(root, '.platform-dna', 'install-manifest.json'), '{}\n')
  const previous = process.env.PLATFORM_DNA_COMMAND
  const shim = path.join(root, 'should-not-run')
  writeFileSync(shim, '#!/bin/sh\necho RAN >&2\nexit 1\n')
  spawnSync('chmod', ['+x', shim])
  process.env.PLATFORM_DNA_COMMAND = shim
  try {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve('bin', 'codegenkit.mjs'),
        'init',
        '--project-root',
        root,
        '--type=fe',
        '--adapter=nuxt4',
        '--target=cursor',
        '--no-codegraph',
        '--yes',
      ],
      { cwd: path.resolve('.'), encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.doesNotMatch(result.stdout + result.stderr, /RAN/)
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_DNA_COMMAND
    else process.env.PLATFORM_DNA_COMMAND = previous
  }
})
