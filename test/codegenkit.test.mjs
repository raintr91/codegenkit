import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'

import { installHarness, BE_SKILLS, FE_SKILLS } from '../dist/install/harness.js'
import { mergePlatformRepos } from '../dist/install/platform-repos.js'
import {
  resolveAdapter,
  resolveBeAdapter,
  resolveType,
} from '../dist/config/project-root.js'
import { installCursorMcp } from '../dist/install/cursor-mcp.js'
import { runBeEngine } from '../dist/adapters/run-be.js'

test('adapters resolve', () => {
  assert.equal(resolveAdapter('nuxt4'), 'nuxt4')
  assert.equal(resolveAdapter('nextjs'), 'nextjs')
  assert.throws(() => resolveAdapter('nestjs'))
  assert.equal(resolveBeAdapter('fastapi'), 'fastapi')
  assert.equal(resolveBeAdapter('laravel'), 'laravel')
  assert.equal(resolveType('fullstack'), 'fullstack')
})

test('fe init syncs skills and forbids docs assumptions', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-fe-'))
  const harness = installHarness({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nuxt4',
  })
  assert.equal(harness.conflicts.length, 0)
  for (const skill of FE_SKILLS) {
    assert.ok(existsSync(path.join(root, '.cursor', 'skills', skill, 'SKILL.md')))
  }
  const maps = mergePlatformRepos({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nuxt4',
  })
  const platform = JSON.parse(readFileSync(maps.path, 'utf8'))
  assert.deepEqual(
    platform.harness.profiles.fe.skills.filter((id) => FE_SKILLS.includes(id)).sort(),
    [...FE_SKILLS].sort(),
  )
  const mcp = installCursorMcp({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nuxt4',
    docsRoot: '/tmp/docs-hub-example',
  })
  const cfg = JSON.parse(readFileSync(mcp.path, 'utf8'))
  assert.equal(cfg.mcpServers.codegenkit.env.CODEGENKIT_FE_ADAPTER, 'nuxt4')
  assert.equal(cfg.mcpServers.codegenkit.env.CODEGENKIT_DOCS_ROOT, '/tmp/docs-hub-example')
})

test('cli rejects docs profile', () => {
  const result = spawnSync(
    process.execPath,
    ['bin/codegenkit.mjs', 'init', '--type=docs', '--yes'],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr + result.stdout, /type must be fe \| be \| fullstack|forbidden/i)
})

test('adapter engines require an explicit docs root fallback', () => {
  const gen = readFileSync('adapters/nuxt4/codegen/runners/generate.mjs', 'utf8')
  assert.match(gen, /CODEGENKIT_DOCS_ROOT/)
  assert.match(gen, /no sibling docs hub is assumed/)
  assert.doesNotMatch(gen, /return path\.join\(root, '\.\.\/base-docs\/product'\)/)
})

test('be init syncs API skills with Laravel adapter', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-be-'))
  const harness = installHarness({
    projectRoot: root,
    type: 'be',
    beAdapter: 'laravel',
  })
  assert.equal(harness.conflicts.length, 0)
  assert.ok(existsSync(path.join(root, 'registries', 'codegen.registry.json')))
  assert.ok(existsSync(path.join(root, 'registries', 'unit-test.registry.json')))
  for (const skill of BE_SKILLS) {
    assert.ok(existsSync(path.join(root, '.cursor', 'skills', skill, 'SKILL.md')))
  }
  assert.equal(
    existsSync(path.join(root, '.cursor', 'skills', 'prototype', 'SKILL.md')),
    false,
  )
  const maps = mergePlatformRepos({
    projectRoot: root,
    type: 'be',
    beAdapter: 'laravel',
  })
  const platform = JSON.parse(readFileSync(maps.path, 'utf8'))
  assert.deepEqual(platform.harness.profiles.be.skills, [...BE_SKILLS])
  assert.equal(platform.harness.profiles.be.adapter, 'laravel')
})

test('fullstack init syncs FE and BE subsets explicitly', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-fullstack-'))
  installHarness({
    projectRoot: root,
    type: 'fullstack',
    feAdapter: 'nextjs',
    beAdapter: 'fastapi',
  })
  for (const skill of [...FE_SKILLS, ...BE_SKILLS]) {
    assert.ok(existsSync(path.join(root, '.cursor', 'skills', skill, 'SKILL.md')))
  }
  const maps = mergePlatformRepos({
    projectRoot: root,
    type: 'fullstack',
    feAdapter: 'nextjs',
    beAdapter: 'fastapi',
  })
  const platform = JSON.parse(readFileSync(maps.path, 'utf8'))
  assert.equal(platform.harness.profiles.fe.adapter, 'nextjs')
  assert.equal(platform.harness.profiles.be.adapter, 'fastapi')
})

test('Laravel adapter dry-run is target-contained and non-writing', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-laravel-'))
  writeFileSync(path.join(root, 'artisan'), '#!/usr/bin/env php\n')
  writeFileSync(
    path.join(root, 'composer.json'),
    JSON.stringify({
      require: {
        'laravel/framework': '^12.0',
        'nwidart/laravel-modules': '^12.0',
      },
    }),
  )
  const spec = path.join(root, 'spec.yaml')
  writeFileSync(
    spec,
    `id: auth-login
modules:
  - name: Admin
    entities:
      - name: Session
        mode: Platform
api:
  endpoints:
    - id: login
      action: create
      method: POST
      path: /api/auth/login
`,
  )
  const result = runBeEngine({
    adapter: 'laravel',
    projectRoot: root,
    argv: ['--spec', spec],
    dryRun: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /php artisan m:module Admin/)
  assert.doesNotMatch(result.stdout, /m:module-test[^\n]+--skip-questions/)
  assert.equal(existsSync(path.join(root, 'Modules')), false)
})

test('Laravel adapter refuses unsupported app-layer targets', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-laravel-layer-'))
  writeFileSync(path.join(root, 'artisan'), '#!/usr/bin/env php\n')
  writeFileSync(
    path.join(root, 'composer.json'),
    JSON.stringify({ require: { 'laravel/framework': '^12.0' } }),
  )
  const result = runBeEngine({
    adapter: 'laravel',
    projectRoot: root,
    argv: ['--spec', path.join(root, 'missing.yaml')],
    dryRun: true,
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /requires nwidart\/laravel-modules/)
})

test('BE registry validators use adapter-owned templates and synced registries', () => {
  for (const adapter of ['fastapi', 'laravel']) {
    const root = mkdtempSync(path.join(os.tmpdir(), `codegenkit-${adapter}-registry-`))
    installHarness({
      projectRoot: root,
      type: 'be',
      beAdapter: adapter,
    })
    for (const kind of ['registry', 'unit-registry']) {
      const result = runBeEngine({
        adapter,
        projectRoot: root,
        kind,
      })
      assert.equal(result.status, 0, `${adapter}/${kind}: ${result.stderr}`)
      assert.match(result.stdout, /validate: OK|registry v\d+: OK/)
    }
  }
})

test('FastAPI adapter ships unit generator and rejects invalid Python identifiers', () => {
  assert.ok(
    existsSync('adapters/fastapi/unitgen/runners/fast_unit_gen/cli.py'),
  )
  const source = readFileSync(
    'adapters/fastapi/codegen/runners/fast_gen/plan.py',
    'utf8',
  )
  assert.match(source, /isidentifier/)
  assert.match(source, /module_package/)
  assert.doesNotMatch(
    readFileSync('adapters/fastapi/codegen/templates/router.py.j2', 'utf8'),
    /app\.modules\.\{\{ module_kebab/,
  )
})
