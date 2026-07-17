import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'

import { installHarness, FE_SKILLS } from '../dist/install/harness.js'
import { mergePlatformRepos } from '../dist/install/platform-repos.js'
import { resolveAdapter } from '../dist/config/project-root.js'
import { installCursorMcp } from '../dist/install/cursor-mcp.js'

test('adapters resolve', () => {
  assert.equal(resolveAdapter('nuxt4'), 'nuxt4')
  assert.equal(resolveAdapter('nextjs'), 'nextjs')
  assert.throws(() => resolveAdapter('nestjs'))
})

test('fe init syncs skills and forbids docs assumptions', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-fe-'))
  const harness = installHarness({ projectRoot: root, adapter: 'nuxt4' })
  assert.equal(harness.conflicts.length, 0)
  for (const skill of FE_SKILLS) {
    assert.ok(existsSync(path.join(root, '.cursor', 'skills', skill, 'SKILL.md')))
  }
  const maps = mergePlatformRepos({ projectRoot: root, adapter: 'nuxt4' })
  const platform = JSON.parse(readFileSync(maps.path, 'utf8'))
  assert.deepEqual(
    platform.harness.profiles.fe.skills.filter((id) => FE_SKILLS.includes(id)).sort(),
    [...FE_SKILLS].sort(),
  )
  const mcp = installCursorMcp({
    projectRoot: root,
    adapter: 'nuxt4',
    docsRoot: '/tmp/docs-hub-example',
  })
  const cfg = JSON.parse(readFileSync(mcp.path, 'utf8'))
  assert.equal(cfg.mcpServers.codegenkit.env.CODEGENKIT_ADAPTER, 'nuxt4')
  assert.equal(cfg.mcpServers.codegenkit.env.CODEGENKIT_DOCS_ROOT, '/tmp/docs-hub-example')
})

test('cli rejects docs profile', () => {
  const result = spawnSync(
    process.execPath,
    ['bin/codegenkit.mjs', 'init', '--type=docs', '--yes'],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr + result.stdout, /only supports --type=fe|docs hub forbidden/i)
})

test('adapter engines no longer hardcode sibling ../base-docs fallback as default success path', () => {
  const gen = readFileSync('adapters/nuxt4/codegen/runners/generate.mjs', 'utf8')
  assert.match(gen, /CODEGENKIT_DOCS_ROOT/)
  assert.match(gen, /no longer assumed/)
  assert.doesNotMatch(gen, /return path\.join\(root, '\.\.\/base-docs\/product'\)/)
})
