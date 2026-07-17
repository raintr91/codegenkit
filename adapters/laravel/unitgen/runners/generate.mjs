#!/usr/bin/env node
import path from 'node:path'

import { readSpecFile } from '../../codegen/runners/lib/read-spec.mjs'
import { runArtisan } from '../../codegen/runners/lib/exec-artisan.mjs'
import { buildUnitContext, buildUnitPlan } from './lib/plan.mjs'
import { readCodegenManifest } from './lib/read-codegen.mjs'
import { loadUnitTestRegistry, REGISTRY_REL } from './lib/unit-registry.mjs'
import {
  renderFileOutputs,
  renderUnitHandoffMarkdown,
  writeOutputs,
  writeUnitMeta
} from './lib/write-files.mjs'
import { adapterRoot, resolveLaravelProject } from '../../shared/project.mjs'

const { laravelRoot } = resolveLaravelProject()

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    spec: null,
    phase: 'all',
    execute: true
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry' || arg === '--dry-run') options.dryRun = true
    else if (arg === '--force') options.force = true
    else if (arg === '--plan-only') options.execute = false
    else if (arg === '--phase') options.phase = argv[++i] ?? 'all'
    else if (arg === '--spec') options.spec = argv[++i]
    else if (!arg.startsWith('-') && !options.spec) options.spec = arg
  }

  if (!options.spec) {
    throw new Error(
      'Usage: pnpm api:unit-gen --spec docs/features/{slug}/01-backend-spec.yaml [--dry-run] [--force] [--phase stub|enriched|behavioral|all] [--plan-only]'
    )
  }

  return options
}

async function runCommands(commands, options) {
  const results = []

  for (const cmd of commands) {
    const result = await runArtisan(cmd.artisan, { dryRun: options.dryRun })
    results.push({ ...cmd, ...result })
    if (result.code !== 0 && options.execute && !options.dryRun) {
      throw new Error(`Command failed: ${cmd.artisan}\n${result.stderr || result.stdout}`)
    }
  }

  return results
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { registry } = await loadUnitTestRegistry(adapterRoot)
  const { spec, specFile, featureDir } = await readSpecFile(options.spec)
  const { manifest: codegenManifest } = await readCodegenManifest(featureDir)

  const ctx = buildUnitContext(spec, specFile, codegenManifest, laravelRoot, { phase: options.phase })
  const plan = await buildUnitPlan(ctx, registry)

  console.log(`api-unit-gen: module=${ctx.module} entity=${ctx.entity} profile=${ctx.profile} phase=${ctx.phase}`)
  console.log(`  target: ${laravelRoot}`)
  console.log(`  spec: ${specFile}`)
  console.log(`  registry: ${REGISTRY_REL}`)
  if (options.dryRun) console.log('  mode: dry-run')
  if (options.force) console.log('  mode: force')

  if (plan.skippedPatterns.length) {
    console.log('\nSkipped patterns:')
    for (const item of plan.skippedPatterns) {
      const artisan = item.artisan ? ` → php artisan ${item.artisan}` : ''
      console.log(`  ${item.patternId}: ${item.reason}${artisan}`)
    }
  }

  if (plan.commands.length) {
    console.log('\nArtisan commands:')
    for (const cmd of plan.commands) {
      console.log(`  php artisan ${cmd.artisan}`)
    }
  }

  let commandResults = []
  if (options.execute && plan.commands.length) {
    const commands = options.force
      ? plan.commands.map((c) => ({ ...c, artisan: `${c.artisan} --force` }))
      : plan.commands
    commandResults = await runCommands(commands, options)
  }

  const rendered = await renderFileOutputs(plan.files, ctx)
  const { written, skipped } = await writeOutputs(laravelRoot, rendered, {
    dryRun: options.dryRun,
    force: options.force
  })

  const unitManifest = {
    generatedAt: new Date().toISOString(),
    specFile,
    phase: ctx.phase,
    profile: ctx.profile,
    module: ctx.module,
    entity: ctx.entity,
    feature: ctx.feature,
    codegenManifest: 'generated/codegen.manifest.json',
    unitRegistry: REGISTRY_REL,
    commands: plan.commands.map((c) => ({
      pattern: c.patternId,
      artisan: c.artisan,
      shell: `php artisan ${c.artisan}`
    })),
    files: plan.files.map((f) => ({
      layer: f.layer,
      path: f.relativePath,
      pattern: f.patternId,
      reqIds: f.reqIds
    })),
    written: written.map((w) => w.relativePath),
    skipped: skipped.map((s) => ({ path: s.relativePath, reason: s.reason })),
    skippedPatterns: plan.skippedPatterns,
    needsUnit: plan.needsUnit,
    mocks: ctx.unitTags.mocks.map((m) => `#test-mock:${m}`),
    execution: commandResults.map((r) => ({
      id: r.id,
      status: r.code === 0 ? 'OK' : `FAIL (${r.code})`,
      artisan: r.artisan
    }))
  }

  const handoff = renderUnitHandoffMarkdown(ctx, written, skipped, plan.needsUnit, plan.commands, plan.skippedPatterns)
  const meta = await writeUnitMeta(featureDir, unitManifest, handoff, { dryRun: options.dryRun })

  for (const w of written) {
    console.log(`  ${options.dryRun ? '[dry]' : 'write'}: ${w.relativePath}`)
  }
  for (const s of skipped) {
    console.log(`  skip: ${s.relativePath} (${s.reason})`)
  }
  for (const item of plan.needsUnit) {
    console.log(`  needs-unit: ${item.tag}`)
  }

  if (!options.dryRun && meta.manifestPath) {
    console.log(`  manifest: ${meta.manifestPath}`)
    console.log(`  handoff: ${meta.handoffPath}`)
  }

  console.log('\napi-unit-gen complete — verify with php artisan test; needsUnit should be [] for implemented patterns')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
