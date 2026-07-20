import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  existsSync,
  copyFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'

import {
  installHarness,
  pruneHarness,
  harnessStatus,
  BE_SKILLS,
  FE_SKILLS,
  feSkillsForAdapter,
} from '../dist/install/harness.js'
import {
  resolveAdapter,
  resolveBeAdapter,
  resolveFeAdapter,
  resolveType,
} from '../dist/config/project-root.js'
import { installCursorMcp } from '../dist/install/cursor-mcp.js'
import { runAdapterEngine } from '../dist/adapters/run.js'
import { runContractEngine } from '../dist/adapters/run.js'
import { runBeEngine } from '../dist/adapters/run-be.js'
import { validateCommonRegistry } from '../dist/registries/common.js'
import {
  preferGenSpec as preferNuxtGenSpec,
  resolveHubId as resolveNuxtHubId,
} from '../adapters/nuxt4/codegen/runners/lib/resolve-hub-id.mjs'
import {
  preferGenSpec as preferNextGenSpec,
  resolveHubId as resolveNextHubId,
} from '../adapters/nextjs/codegen/runners/lib/resolve-hub-id.mjs'

function fastApiFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-fastapi-runtime-'))
  mkdirSync(path.join(root, 'registries'))
  copyFileSync(
    'adapters/fastapi/registries/codegen.registry.json',
    path.join(root, 'registries', 'codegen.registry.json'),
  )
  const spec = path.join(root, 'spec.yaml')
  copyFileSync('test/fixtures/fastapi-multi-entity.yaml', spec)
  return { root, spec }
}

function runFastApi(root, spec, { kind = 'codegen', dryRun = false, force = false } = {}) {
  return runBeEngine({
    adapter: 'fastapi',
    projectRoot: root,
    kind,
    argv: ['--spec', spec, ...(force ? ['--force'] : [])],
    dryRun,
  })
}

const OPTIONAL_SCHEMA_REL =
  '.cursor/schemas/codegenkit/missing-optional-event.schema.json'
const OPTIONAL_RULE_REL =
  '.cursor/rules/codegenkit-optional-integrations.mdc'

test('adapters resolve', () => {
  assert.equal(resolveAdapter('nuxt4'), 'nuxt4')
  assert.equal(resolveAdapter('nextjs'), 'nextjs')
  assert.equal(resolveAdapter('dotnet-line'), 'dotnet-line')
  assert.throws(() => resolveAdapter('nestjs'))
  assert.equal(resolveBeAdapter('fastapi'), 'fastapi')
  assert.equal(resolveBeAdapter('laravel'), 'laravel')
  assert.equal(resolveBeAdapter('dotnet-integration'), 'dotnet-integration')
  assert.throws(() => resolveFeAdapter('dotnet-integration'), /dotnet-line/)
  assert.throws(() => resolveBeAdapter('dotnet-line'), /dotnet-integration/)
  assert.equal(resolveType('fullstack'), 'fullstack')
})

test('dotnet adapter init syncs lane registries and records profiles', () => {
  const cases = [
    {
      type: 'fe',
      feAdapter: 'dotnet-line',
      registry: 'dotnet-line.codegen.registry.json',
      profile: 'fe',
    },
    {
      type: 'be',
      beAdapter: 'dotnet-integration',
      registry: 'dotnet-integration.codegen.registry.json',
      profile: 'be',
    },
  ]
  for (const options of cases) {
    const root = mkdtempSync(path.join(os.tmpdir(), `codegenkit-${options.type}-dotnet-init-`))
    const adapter = options.feAdapter ?? options.beAdapter
    const result = spawnSync(
      process.execPath,
      [
        'bin/codegenkit.mjs',
        'init',
        `--type=${options.type}`,
        `--adapter=${adapter}`,
        '--project-root',
        root,
        '--yes',
      ],
      { cwd: path.resolve('.'), encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.ok(existsSync(path.join(root, 'registries', options.registry)))
    // Codegenkit never writes Platform DNA-owned project maps; the adapter is
    // recorded in the install manifest instead.
    assert.equal(existsSync(path.join(root, 'platform-repos.json')), false)
    const manifest = JSON.parse(
      readFileSync(path.join(root, '.codegenkit', 'install-manifest.json'), 'utf8'),
    )
    assert.equal(manifest.adapters[options.profile], adapter)
  }
})

test('dotnet adapter switch marks the previous registry stale', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-dotnet-switch-'))
  const oldRegistry = path.join(root, 'registries', 'dotnet-line.codegen.registry.json')
  installHarness({ projectRoot: root, type: 'fe', feAdapter: 'dotnet-line' })
  const switched = installHarness({ projectRoot: root, type: 'fe', feAdapter: 'nextjs' })
  assert.ok(switched.stale.includes(oldRegistry))
  assert.ok(harnessStatus(root).stale.includes(oldRegistry))
})

test('dotnet adapters dry-run without writing generated outputs', async (t) => {
  const dotnet = spawnSync(process.env.CODEGENKIT_DOTNET || 'dotnet', ['--version'], {
    encoding: 'utf8',
  })
  if (dotnet.status !== 0) {
    t.skip('dotnet SDK unavailable')
    return
  }
  const nugetPackages =
    process.env.NUGET_PACKAGES ?? path.join(os.homedir(), '.nuget', 'packages')
  if (
    !existsSync(path.join(nugetPackages, 'scriban', '7.2.5')) ||
    !existsSync(path.join(nugetPackages, 'yamldotnet', '16.3.0'))
  ) {
    t.skip('vendored engine NuGet packages are not cached; network restore is not used in tests')
    return
  }
  const cases = [
    {
      adapter: 'dotnet-line',
      fixture: 'dotnet-line-spec.yaml',
      run(root, spec) {
        return runAdapterEngine({
          adapter: this.adapter,
          kind: 'codegen',
          script: 'generate.mjs',
          projectRoot: root,
          argv: ['--spec', spec],
          dryRun: true,
        })
      },
    },
    {
      adapter: 'dotnet-integration',
      fixture: 'dotnet-integration-spec.yaml',
      run(root, spec) {
        return runBeEngine({
          adapter: this.adapter,
          projectRoot: root,
          argv: ['--spec', spec],
          dryRun: true,
        })
      },
    },
  ]
  for (const item of cases) {
    const root = mkdtempSync(path.join(os.tmpdir(), `codegenkit-${item.adapter}-dry-`))
    const spec = path.join(root, 'ir', 'spec.yaml')
    mkdirSync(path.dirname(spec), { recursive: true })
    copyFileSync(path.join('test', 'fixtures', item.fixture), spec)
    installHarness({
      projectRoot: root,
      type: item.adapter === 'dotnet-line' ? 'fe' : 'be',
      ...(item.adapter === 'dotnet-line'
        ? { feAdapter: item.adapter }
        : { beAdapter: item.adapter }),
    })
    const before = new Set([spec, ...Object.keys(JSON.parse(readFileSync(
      path.join(root, '.codegenkit', 'install-manifest.json'),
      'utf8',
    )).files).map((relative) => path.join(root, relative))])
    const result = item.run(root, spec)
    assert.equal(result.status, 0, `${item.adapter}: ${result.stderr}`)
    assert.match(result.stdout, /\[dry\]:/)
    assert.equal(existsSync(path.join(root, 'src')), false)
    assert.equal(existsSync(path.join(root, 'tests')), false)
    assert.equal(existsSync(path.join(root, 'ir', 'generated')), false)
    assert.ok(before.has(spec))
  }
})

test('dotnet adapters report missing runtime and bundled unit limitation', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-dotnet-errors-'))
  const previous = process.env.CODEGENKIT_DOTNET
  process.env.CODEGENKIT_DOTNET = path.join(root, 'missing-dotnet')
  try {
    const missing = runBeEngine({
      adapter: 'dotnet-integration',
      projectRoot: root,
      dryRun: true,
    })
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /No \.NET runtime found/)
  } finally {
    if (previous === undefined) delete process.env.CODEGENKIT_DOTNET
    else process.env.CODEGENKIT_DOTNET = previous
  }
  const unit = runAdapterEngine({
    adapter: 'dotnet-line',
    kind: 'unitgen',
    script: 'generate.mjs',
    projectRoot: root,
  })
  assert.equal(unit.status, 1)
  assert.match(unit.stderr, /bundles test outputs/)
})

test('Nuxt and Next ID resolution require ir/spec.yaml', () => {
  const docsRoot = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-gen-spec-'))
  const root = path.join(docsRoot, 'product', 'fixture')
  mkdirSync(path.join(docsRoot, 'registries'), { recursive: true })
  mkdirSync(root, { recursive: true })
  writeFileSync(
    path.join(docsRoot, 'registries', 'docs-index.json'),
    JSON.stringify({ version: 1, codeIds: { 'W-FIXTURE': 'product/fixture' } }),
  )
  writeFileSync(path.join(root, 'feature.bundle.yaml'), 'id: W-FIXTURE\n')
  writeFileSync(path.join(root, 'spec.yaml'), 'id: legacy\n')

  for (const preferGenSpec of [preferNuxtGenSpec, preferNextGenSpec]) {
    assert.equal(preferGenSpec(root), null)
  }
  const previousDocsRoot = process.env.CODEGENKIT_DOCS_ROOT
  process.env.CODEGENKIT_DOCS_ROOT = docsRoot
  try {
    for (const resolveHubId of [resolveNuxtHubId, resolveNextHubId]) {
      assert.throws(
        () => resolveHubId(docsRoot, 'W-FIXTURE', 'codegen'),
        /Missing required ir\/spec\.yaml.*bundle YAML is design input.*Generate the codegen IR/s,
      )
    }
  } finally {
    if (previousDocsRoot === undefined) delete process.env.CODEGENKIT_DOCS_ROOT
    else process.env.CODEGENKIT_DOCS_ROOT = previousDocsRoot
  }

  const ir = path.join(root, 'ir')
  mkdirSync(ir)
  const spec = path.join(ir, 'spec.yaml')
  writeFileSync(spec, 'codegen:\n  profile: list\n')
  for (const preferGenSpec of [preferNuxtGenSpec, preferNextGenSpec]) {
    assert.equal(preferGenSpec(root), spec)
  }
})

test('common registry validator accepts shipped registry and rejects dangling aliases', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-common-registry-'))
  mkdirSync(path.join(root, 'registries'))
  const registryPath = path.join(root, 'registries', 'common.registry.json')
  const shipped = readFileSync('adapters/fastapi/registries/common.registry.json', 'utf8')
  writeFileSync(registryPath, shipped)

  const valid = validateCommonRegistry(root)
  assert.equal(valid.version, 1)
  assert.equal(valid.entries, 1)
  assert.equal(valid.aliases, 4)
  const cli = spawnSync(
    process.execPath,
    ['bin/codegenkit.mjs', 'common-registry', '--project-root', root],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  )
  assert.equal(cli.status, 0, cli.stderr)
  assert.match(cli.stdout, /common\.registry v1: OK \(1 entries, 4 aliases\)/)

  const invalid = JSON.parse(shipped)
  invalid.aliasIndex.broken = 'missing.entry'
  writeFileSync(registryPath, `${JSON.stringify(invalid, null, 2)}\n`)
  assert.throws(
    () => validateCommonRegistry(root),
    /aliasIndex\.broken: target "missing\.entry" does not exist/,
  )
})

test('Nuxt and Next adapter dry-runs do not write generated files', () => {
  for (const adapter of ['nuxt4', 'nextjs']) {
    const root = mkdtempSync(path.join(os.tmpdir(), `codegenkit-${adapter}-dry-`))
    const docsRoot = path.join(root, 'docs')
    const featureDir = path.join(docsRoot, 'product', 'fixture')
    const irDir = path.join(featureDir, 'ir')
    mkdirSync(path.join(root, 'registries'), { recursive: true })
    mkdirSync(irDir, { recursive: true })
    writeFileSync(
      path.join(root, 'registries', 'design.registry.json'),
      JSON.stringify({
        version: 1,
        canonicalSystem: 'fixture',
        defaults: {
          listShell: 'DataListPage',
          shellByProfile: { list: 'DataListPage' },
        },
        shells: { DataListPage: {} },
        fieldWidgets: {},
        detailRenders: {},
        aliasIndex: {},
      }),
    )
    const spec = path.join(irDir, 'spec.yaml')
    writeFileSync(
      spec,
      `id: W-FIXTURE
title: Fixture
codegen:
  profile: list
  entity: item
  module: items
ui:
  routes:
    - path: /items
  columns:
    - key: name
      label: Name
      type: string
api:
  endpoints:
    - action: list
      method: GET
      path: /api/items
`,
    )

    const result = runAdapterEngine({
      adapter,
      kind: 'codegen',
      script: 'generate.mjs',
      projectRoot: root,
      docsRoot,
      argv: ['--spec', spec],
      dryRun: true,
    })
    assert.equal(result.status, 0, `${adapter}: ${result.stderr}`)
    assert.match(result.stdout, /mode: dry-run/)
    assert.equal(existsSync(path.join(featureDir, 'generated')), false)
    assert.equal(existsSync(path.join(root, adapter === 'nextjs' ? 'src' : 'pages')), false)
  }
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
  assert.equal(existsSync(path.join(root, 'platform-repos.json')), false)
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
  assert.ok(existsSync(path.join(root, 'src', '.codegenkit', 'bin', 'unit-gen.php')))
  assert.ok(
    existsSync(
      path.join(root, 'src', '.codegenkit', 'templates', 'support', 'ModuleTestSupport.php.stub'),
    ),
  )
  for (const skill of BE_SKILLS) {
    assert.ok(existsSync(path.join(root, '.cursor', 'skills', skill, 'SKILL.md')))
  }
  assert.equal(
    existsSync(path.join(root, '.cursor', 'skills', 'prototype', 'SKILL.md')),
    false,
  )
  const manifest = JSON.parse(
    readFileSync(path.join(root, '.codegenkit', 'install-manifest.json'), 'utf8'),
  )
  assert.equal(manifest.adapters.be, 'laravel')
  assert.ok(manifest.files['src/.codegenkit/bin/unit-gen.php'])
  assert.equal(existsSync(path.join(root, 'platform-repos.json')), false)
})

test('dotnet-line fe init skips /model skill', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-line-model-'))
  installHarness({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'dotnet-line',
  })
  assert.equal(
    existsSync(path.join(root, '.cursor', 'skills', 'model', 'SKILL.md')),
    false,
  )
  for (const skill of feSkillsForAdapter('dotnet-line')) {
    assert.ok(existsSync(path.join(root, '.cursor', 'skills', skill, 'SKILL.md')))
  }
  assert.equal(existsSync(path.join(root, 'platform-repos.json')), false)
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
  const manifest = JSON.parse(
    readFileSync(path.join(root, '.codegenkit', 'install-manifest.json'), 'utf8'),
  )
  assert.equal(manifest.adapters.fe, 'nextjs')
  assert.equal(manifest.adapters.be, 'fastapi')
  const registry = JSON.parse(
    readFileSync(path.join(root, 'registries', 'codegen.registry.json'), 'utf8'),
  )
  assert.match(registry.description, /FastAPI/)
})

test('optional integration contract is installed for every profile', () => {
  const installs = [
    { type: 'fe', feAdapter: 'nuxt4' },
    { type: 'be', beAdapter: 'laravel' },
    { type: 'fullstack', feAdapter: 'nextjs', beAdapter: 'fastapi' },
  ]

  for (const options of installs) {
    const root = mkdtempSync(
      path.join(os.tmpdir(), `codegenkit-${options.type}-optional-`),
    )
    const result = installHarness({ projectRoot: root, ...options })
    assert.equal(result.conflicts.length, 0)
    assert.ok(existsSync(path.join(root, OPTIONAL_SCHEMA_REL)))
    assert.ok(existsSync(path.join(root, OPTIONAL_RULE_REL)))
  }

  const schema = JSON.parse(
    readFileSync(
      'harness/shared/schemas/codegenkit/missing-optional-event.schema.json',
      'utf8',
    ),
  )
  assert.equal(schema.properties.event.const, 'codegenkit.missing-optional')
  assert.equal(schema.properties.package.const, '@platform/codegenkit')
  assert.deepEqual(schema.properties.optional.enum, ['ArtifactGraph', 'CodeGraph'])
  assert.deepEqual(schema.required, [
    'event',
    'package',
    'runId',
    'optional',
    'reason',
    'fallback',
    'metrics',
  ])
  assert.deepEqual(schema.properties.metrics.required, [
    'fileReads',
    'contextBytes',
  ])
  assert.equal(schema.properties.metrics.properties.fileReads.minimum, 0)
  assert.equal(schema.properties.metrics.properties.contextBytes.minimum, 0)
})

test('profile switches retain shared optional contract ownership', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-profile-switch-'))
  const schemaPath = path.join(root, OPTIONAL_SCHEMA_REL)
  const rulePath = path.join(root, OPTIONAL_RULE_REL)

  installHarness({ projectRoot: root, type: 'fe', feAdapter: 'nuxt4' })
  const switched = installHarness({
    projectRoot: root,
    type: 'be',
    beAdapter: 'laravel',
  })
  assert.equal(switched.stale.includes(schemaPath), false)
  assert.equal(switched.stale.includes(rulePath), false)

  const status = harnessStatus(root)
  assert.ok(status.healthy.includes(schemaPath))
  assert.ok(status.healthy.includes(rulePath))
  assert.equal(status.stale.includes(schemaPath), false)
  assert.equal(status.stale.includes(rulePath), false)

  const prune = pruneHarness({ projectRoot: root, yes: true })
  assert.equal(prune.removed.includes(schemaPath), false)
  assert.equal(prune.removed.includes(rulePath), false)
  assert.ok(existsSync(schemaPath))
  assert.ok(existsSync(rulePath))
})

test('profile switches preserve modified shared optional contract safely', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-shared-conflict-'))
  const schemaPath = path.join(root, OPTIONAL_SCHEMA_REL)

  installHarness({ projectRoot: root, type: 'fe', feAdapter: 'nextjs' })
  const customized = `${readFileSync(schemaPath, 'utf8')}\n`
  writeFileSync(schemaPath, customized)

  const switched = installHarness({
    projectRoot: root,
    type: 'fullstack',
    feAdapter: 'nextjs',
    beAdapter: 'fastapi',
  })
  assert.ok(switched.conflicts.includes(schemaPath))
  assert.equal(switched.stale.includes(schemaPath), false)
  assert.equal(readFileSync(schemaPath, 'utf8'), customized)
  assert.ok(harnessStatus(root).modified.includes(schemaPath))
})

test('optional fallback rule requires completion, deduplication, and actual metrics', () => {
  const rule = readFileSync(
    'harness/shared/rules/codegenkit-optional-integrations.mdc',
    'utf8',
  )
  assert.match(rule, /must never abort/)
  assert.match(rule, /Complete the fallback before emitting telemetry/)
  assert.match(rule, /exactly one event for each `\(runId, optional\)` pair/)
  assert.match(rule, /including across\s+retries/)
  assert.match(rule, /number of successful fallback file reads/)
  assert.match(rule, /total UTF-8 bytes/)
  assert.match(rule, /never estimate, predict, or copy planned values/)
})

test('adapter switch marks obsolete BE registry assets stale', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-adapter-switch-'))
  installHarness({
    projectRoot: root,
    type: 'be',
    beAdapter: 'fastapi',
  })
  const fastapiOnlyRegistry = path.join(root, 'registries', 'common.registry.json')
  assert.ok(existsSync(fastapiOnlyRegistry))

  const switched = installHarness({
    projectRoot: root,
    type: 'be',
    beAdapter: 'laravel',
  })
  assert.ok(switched.stale.includes(fastapiOnlyRegistry))
  const status = harnessStatus(root)
  assert.equal(status.adapters.be, 'laravel')
  assert.ok(status.stale.includes(fastapiOnlyRegistry))
  assert.ok(status.healthy.includes(path.join(root, 'registries', 'codegen.registry.json')))

  const manifest = JSON.parse(
    readFileSync(path.join(root, '.codegenkit', 'install-manifest.json'), 'utf8'),
  )
  assert.equal(manifest.files['registries/common.registry.json'].stale, true)
  assert.equal(manifest.files['registries/codegen.registry.json'].stale, undefined)
})

test('prune is dry-run by default and --yes preserves modified stale files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-prune-'))
  installHarness({
    projectRoot: root,
    type: 'be',
    beAdapter: 'fastapi',
  })
  const removable = path.join(root, 'registries', 'common.registry.json')
  const modified = path.join(root, '.cursor', 'skills', 'api', 'SKILL.md')
  const unmanaged = path.join(root, 'unmanaged.txt')
  const platformRepos = path.join(root, 'platform-repos.json')
  writeFileSync(unmanaged, 'not in the install manifest\n')
  writeFileSync(platformRepos, '{"keep":true}\n')

  installHarness({
    projectRoot: root,
    type: 'fe',
    feAdapter: 'nextjs',
  })
  writeFileSync(modified, `${readFileSync(modified, 'utf8')}\nlocal customization\n`)

  const dryRun = pruneHarness({ projectRoot: root })
  assert.ok(dryRun.removable.includes(removable))
  assert.ok(dryRun.modified.includes(modified))
  assert.deepEqual(dryRun.removed, [])
  assert.ok(existsSync(removable))

  const cliDryRun = spawnSync(
    process.execPath,
    ['bin/codegenkit.mjs', 'prune', '--project-root', root],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  )
  assert.equal(cliDryRun.status, 0, cliDryRun.stderr)
  assert.match(cliDryRun.stdout, /would remove/)
  assert.match(cliDryRun.stdout, /Dry-run only/)
  assert.ok(existsSync(removable))

  const cliPrune = spawnSync(
    process.execPath,
    ['bin/codegenkit.mjs', 'prune', '--project-root', root, '--yes'],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  )
  assert.equal(cliPrune.status, 0, cliPrune.stderr)
  assert.match(cliPrune.stdout, /removed/)
  assert.match(cliPrune.stdout, /keep modified/)
  assert.equal(existsSync(removable), false)
  assert.ok(existsSync(modified))
  assert.equal(readFileSync(unmanaged, 'utf8'), 'not in the install manifest\n')
  assert.equal(readFileSync(platformRepos, 'utf8'), '{"keep":true}\n')

  const statusResult = spawnSync(
    process.execPath,
    ['bin/codegenkit.mjs', 'status', '--project-root', root],
    { cwd: path.resolve('.'), encoding: 'utf8' },
  )
  assert.equal(statusResult.status, 0, statusResult.stderr)
  const status = JSON.parse(statusResult.stdout)
  assert.equal(status.compat, 'ok')
  assert.ok(status.modified.includes(modified))
  assert.equal(status.stale.includes(removable), false)
})

test('status reports missing installs and package compatibility', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-status-'))
  const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
  assert.deepEqual(harnessStatus(root), {
    projectRoot: root,
    packageVersion,
    installed: false,
    packageVersionInstalled: null,
    type: null,
    adapters: null,
    toolApi: null,
    harnessApi: null,
    healthy: [],
    missing: [],
    modified: [],
    stale: [],
    warnings: [],
    gitignore: [],
    mcp: [],
    compat: 'warn',
  })

  installHarness({ projectRoot: root, type: 'fe', feAdapter: 'nuxt4' })
  const missingTarget = path.join(root, '.cursor', 'skills', 'prototype', 'SKILL.md')
  rmSync(missingTarget)
  assert.ok(harnessStatus(root).missing.includes(missingTarget))
  const manifestPath = path.join(root, '.codegenkit', 'install-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.packageVersion = '0.0.0'
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  assert.equal(harnessStatus(root).compat, 'warn')
  manifest.toolApi = 99
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  assert.equal(harnessStatus(root).compat, 'fail')
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

test('FastAPI multi-entity dry-run reports the full batch and writes nothing', () => {
  const { root, spec } = fastApiFixture()
  const result = runFastApi(root, spec, { dryRun: true })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /fast-gen: entities=2/)
  assert.match(result.stdout, /catalog_admin\/product\/router\.py/)
  assert.match(result.stdout, /catalog_admin\/category\/router\.py/)
  assert.match(result.stdout, /would-write/)
  assert.equal(existsSync(path.join(root, 'src')), false)
  assert.equal(existsSync(path.join(root, 'generated')), false)
})

test('FastAPI multi-entity write records schema-v2 ownership hashes', () => {
  const { root, spec } = fastApiFixture()
  const result = runFastApi(root, spec)
  assert.equal(result.status, 0, result.stderr)
  assert.ok(existsSync(path.join(root, 'src/app/modules/catalog_admin/product/router.py')))
  assert.ok(existsSync(path.join(root, 'src/app/modules/catalog_admin/category/router.py')))
  const routerIndex = readFileSync(path.join(root, 'src/app/generated_routers.py'), 'utf8')
  assert.match(routerIndex, /app\.modules\.catalog_admin\.product/)
  assert.match(routerIndex, /app\.modules\.catalog_admin\.category/)
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'generated/codegen.manifest.json'), 'utf8'),
  )
  assert.equal(manifest.schemaVersion, 2)
  assert.equal(manifest.packageVersion, '0.6.0')
  assert.equal(manifest.generator, 'fastapi-codegen')
  assert.equal(manifest.entities.length, 2)
  assert.ok(manifest.files['src/app/generated_routers.py'])
  for (const metadata of Object.values(manifest.files)) {
    assert.match(metadata.sha256, /^[a-f0-9]{64}$/)
    assert.ok(metadata.template)
    assert.ok(metadata.layer)
  }
})

test('FastAPI unchanged rerun preserves files and reports unchanged', () => {
  const { root, spec } = fastApiFixture()
  assert.equal(runFastApi(root, spec).status, 0)
  const target = path.join(root, 'src/app/modules/catalog_admin/product/router.py')
  const before = readFileSync(target, 'utf8')
  const result = runFastApi(root, spec)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /unchanged: src\/app\/modules\/catalog_admin\/product\/router\.py/)
  assert.equal(readFileSync(target, 'utf8'), before)
})

test('FastAPI local modification conflicts, stays intact, and force overwrites', () => {
  const { root, spec } = fastApiFixture()
  assert.equal(runFastApi(root, spec).status, 0)
  const target = path.join(root, 'src/app/modules/catalog_admin/product/router.py')
  writeFileSync(target, '# local customization\n')
  const blocked = runFastApi(root, spec)
  assert.notEqual(blocked.status, 0)
  assert.match(blocked.stderr, /locally modified conflicts/)
  assert.equal(readFileSync(target, 'utf8'), '# local customization\n')
  const forced = runFastApi(root, spec, { force: true })
  assert.equal(forced.status, 0, forced.stderr)
  assert.match(forced.stdout, /force: src\/app\/modules\/catalog_admin\/product\/router\.py/)
  assert.doesNotMatch(readFileSync(target, 'utf8'), /local customization/)
})

test('FastAPI unmanaged existing file blocks the entire write batch', () => {
  const { root, spec } = fastApiFixture()
  const target = path.join(root, 'src/app/modules/catalog_admin/product/router.py')
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, '# unmanaged\n')
  const result = runFastApi(root, spec)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unmanaged/)
  assert.equal(readFileSync(target, 'utf8'), '# unmanaged\n')
  assert.equal(
    existsSync(path.join(root, 'src/app/modules/catalog_admin/category/router.py')),
    false,
  )
  assert.equal(existsSync(path.join(root, 'generated/codegen.manifest.json')), false)
})

test('FastAPI rejects traversal identifiers and symlink ancestors before writes', () => {
  const traversal = fastApiFixture()
  writeFileSync(
    traversal.spec,
    'modules:\n  - name: ../escape\n    entities:\n      - name: Product\n',
  )
  const invalid = runFastApi(traversal.root, traversal.spec)
  assert.notEqual(invalid.status, 0)
  assert.match(invalid.stderr, /Invalid module for Python identifier/)
  assert.equal(existsSync(path.join(traversal.root, 'src')), false)

  const linked = fastApiFixture()
  const outside = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-fastapi-outside-'))
  mkdirSync(path.join(linked.root, 'src/app'), { recursive: true })
  symlinkSync(outside, path.join(linked.root, 'src/app/modules'))
  const rejected = runFastApi(linked.root, linked.spec)
  assert.notEqual(rejected.status, 0)
  assert.match(rejected.stderr, /Unsafe symlink/)
  assert.equal(existsSync(path.join(outside, 'catalog_admin')), false)
  assert.equal(existsSync(path.join(linked.root, 'generated')), false)
})

test('FastAPI unitgen manages both entities and blocks modified owned tests', () => {
  const { root, spec } = fastApiFixture()
  const written = runFastApi(root, spec, { kind: 'unitgen' })
  assert.equal(written.status, 0, written.stderr)
  const product = path.join(root, 'tests/unit/test_product_service.py')
  const category = path.join(root, 'tests/unit/test_category_service.py')
  assert.ok(existsSync(product))
  assert.ok(existsSync(category))
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'generated/unit.manifest.json'), 'utf8'),
  )
  assert.equal(manifest.schemaVersion, 2)
  assert.equal(manifest.entities.length, 2)
  assert.match(manifest.files['tests/unit/test_product_service.py'].sha256, /^[a-f0-9]{64}$/)
  writeFileSync(product, '# modified unit\n')
  const blocked = runFastApi(root, spec, { kind: 'unitgen' })
  assert.notEqual(blocked.status, 0)
  assert.equal(readFileSync(product, 'utf8'), '# modified unit\n')
  assert.equal(runFastApi(root, spec, { kind: 'unitgen', force: true }).status, 0)
  assert.doesNotMatch(readFileSync(product, 'utf8'), /modified unit/)
})

test('FastAPI codegen.entity selector generates only the matching entity', () => {
  const { root, spec } = fastApiFixture()
  const original = readFileSync(spec, 'utf8')
  writeFileSync(
    spec,
    original.replace('codegen:\n  profile: crud-standard', 'codegen:\n  profile: crud-standard\n  entity: category'),
  )
  const result = runFastApi(root, spec)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /fast-gen: entities=1/)
  assert.ok(existsSync(path.join(root, 'src/app/modules/catalog_admin/category/router.py')))
  assert.equal(
    existsSync(path.join(root, 'src/app/modules/catalog_admin/product')),
    false,
  )
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'generated/codegen.manifest.json'), 'utf8'),
  )
  assert.equal(manifest.entities.length, 1)
  assert.equal(manifest.entities[0].entity, 'Category')

  const unit = runFastApi(root, spec, { kind: 'unitgen' })
  assert.equal(unit.status, 0, unit.stderr)
  assert.ok(existsSync(path.join(root, 'tests/unit/test_category_service.py')))
  assert.equal(existsSync(path.join(root, 'tests/unit/test_product_service.py')), false)
})

test('FastAPI unmatched codegen selector fails with available targets and no writes', () => {
  const { root, spec } = fastApiFixture()
  const original = readFileSync(spec, 'utf8')
  writeFileSync(
    spec,
    original.replace('codegen:\n  profile: crud-standard', 'codegen:\n  profile: crud-standard\n  module: Billing\n  entity: Invoice'),
  )
  const result = runFastApi(root, spec)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /matches no module\/entity/)
  assert.match(result.stderr, /Catalog Admin\.Product/)
  assert.match(result.stderr, /Catalog Admin\.Category/)
  assert.equal(existsSync(path.join(root, 'src')), false)
  assert.equal(existsSync(path.join(root, 'generated')), false)
})

test('FastAPI ambiguous multi-entity endpoints warn and use isolated CRUD routes', () => {
  const { root, spec } = fastApiFixture()
  writeFileSync(
    spec,
    `modules:
  - name: Commerce
    entities:
      - name: Product
      - name: Category
api:
  endpoints:
    - action: create
      method: POST
      path: /api/session
`,
  )
  const result = runFastApi(root, spec)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /No unambiguous endpoints for Commerce\.Product/)
  assert.match(result.stderr, /No unambiguous endpoints for Commerce\.Category/)
  assert.match(
    readFileSync(path.join(root, 'src/app/modules/commerce/product/router.py'), 'utf8'),
    /prefix="\/products"/,
  )
  assert.match(
    readFileSync(path.join(root, 'src/app/modules/commerce/category/router.py'), 'utf8'),
    /prefix="\/categories"/,
  )
})

test('installers pin the released tag and enforce lockfiles', () => {
  const shell = readFileSync('install.sh', 'utf8')
  const powershell = readFileSync('install.ps1', 'utf8')
  for (const script of [shell, powershell]) {
    assert.match(script, /v0\.6\.0/)
    assert.match(script, /pnpm install --frozen-lockfile/)
    assert.match(script, /npm ci/)
    assert.doesNotMatch(script, /(?:REF:-main|Ref = "main")/)
  }
})

test('nextjs init syncs contract-field registry', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-nextjs-contract-'))
  installHarness({ projectRoot: root, type: 'fe', feAdapter: 'nextjs' })
  assert.ok(
    existsSync(path.join(root, 'registries', 'contract-field.registry.json')),
  )
})

test('contract-gen dry-run / force / registry / docs-root discovery', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-contract-'))
  installHarness({ projectRoot: root, type: 'fe', feAdapter: 'nextjs' })

  const docsRoot = path.join(root, 'docs-hub')
  const irDir = path.join(docsRoot, 'product', 'components', 'CMP-01', 'code', 'W-01', 'ir')
  mkdirSync(irDir, { recursive: true })
  const spec = path.join(irDir, 'spec.yaml')
  copyFileSync('test/fixtures/contractgen/ir/spec.yaml', spec)

  const registry = runContractEngine({
    projectRoot: root,
    registry: true,
  })
  assert.equal(registry.status, 0, registry.stderr)
  assert.match(registry.stdout, /validate: OK/)

  const dry = runContractEngine({
    projectRoot: root,
    docsRoot,
    argv: ['--spec', spec],
    dryRun: true,
  })
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /\[contract-gen\] dry/)
  assert.equal(existsSync(path.join(root, 'packages')), false)

  const write = runContractEngine({
    projectRoot: root,
    argv: ['--spec', spec],
  })
  assert.equal(write.status, 0, write.stderr)
  const readSchema = path.join(root, 'packages/models/src/hotel/hotel.read.schema.ts')
  assert.ok(existsSync(readSchema))
  assert.ok(
    existsSync(path.join(path.dirname(path.dirname(spec)), 'generated', 'contract.manifest.json')),
  )

  const blocked = runContractEngine({
    projectRoot: root,
    argv: ['--spec', spec],
  })
  assert.equal(blocked.status, 0, blocked.stderr)
  assert.match(blocked.stdout, /skipped/)

  const forced = runContractEngine({
    projectRoot: root,
    argv: ['--spec', spec, '--force'],
  })
  assert.equal(forced.status, 0, forced.stderr)
  assert.match(forced.stdout, /written/)

  const discovered = runContractEngine({
    projectRoot: root,
    docsRoot,
    dryRun: true,
  })
  assert.equal(discovered.status, 0, discovered.stderr)
  assert.match(discovered.stdout, /\[contract-gen\] dry/)
})

test('status/prune removes legacy product-root contractgen', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'codegenkit-contract-legacy-'))
  installHarness({ projectRoot: root, type: 'fe', feAdapter: 'nextjs' })
  const legacy = path.join(root, 'contractgen', 'runners')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(path.join(legacy, 'generate.mjs'), '// stale\n')
  const status = harnessStatus(root)
  assert.ok(status.warnings.some((w) => w.includes('contractgen')))
  assert.equal(status.compat, 'warn')
  const dry = pruneHarness({ projectRoot: root })
  assert.ok(dry.removable.includes(path.join(root, 'contractgen')))
  assert.ok(existsSync(path.join(root, 'contractgen')))
  const yes = pruneHarness({ projectRoot: root, yes: true })
  assert.ok(yes.removed.includes(path.join(root, 'contractgen')))
  assert.equal(existsSync(path.join(root, 'contractgen')), false)
})
