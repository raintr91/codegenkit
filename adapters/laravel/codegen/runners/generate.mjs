import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { readSpecFile, writeSpecFile } from './lib/read-spec.mjs'
import { buildCommandPlan, enrichSpecCodegen } from './lib/plan.mjs'
import { loadCodegenRegistry } from './lib/codegen-registry.mjs'
import { buildTagPlanWithRegistry } from './lib/tag-plan.mjs'
import { validateSpec } from './lib/validate.mjs'
import { runCommandPlan } from './lib/exec-artisan.mjs'
import { writeServiceStubs } from './lib/stub-services.mjs'
import { buildCodegenManifest, writeCodegenManifest } from './lib/write-manifest.mjs'
import { renderHandoffMarkdown, writeHandoff } from './lib/write-handoff.mjs'
import {
  adapterRoot,
  resolveLaravelProject
} from '../../shared/project.mjs'

const project = resolveLaravelProject()
const laravelRoot = project.laravelRoot

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const options = { dryRun: false, writeSpec: false, spec: null, execute: true, force: false }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry' || arg === '--dry-run') options.dryRun = true
    else if (arg === '--write-spec') options.writeSpec = true
    else if (arg === '--plan-only') options.execute = false
    else if (arg === '--force') options.force = true
    else if (arg === '--spec') options.spec = argv[++i]
    else if (!arg.startsWith('-') && !options.spec) options.spec = arg
  }

  if (!options.spec) {
    throw new Error(
      'Usage: pnpm api:gen --spec docs/features/{slug}/01-backend-spec.yaml [--dry-run] [--write-spec] [--plan-only] [--force]'
    )
  }

  return options
}

/** @param {object} spec @param {Record<string, unknown>} registry */
function shouldRunUnitGen(spec, registry) {
  if ((spec.tags ?? []).includes('#gen:test-unit')) {
    return true
  }

  const profile = spec.codegen?.profile ?? 'crud-standard'
  const defaults = registry.profiles?.[profile]?.defaultGenTags ?? []

  return defaults.includes('#gen:test-unit')
}

/** @param {string} specFile @param {{ force?: boolean }} options */
function runUnitGen(specFile, options) {
  const args = [path.join(adapterRoot, 'unitgen/runners/generate.mjs'), '--spec', specFile]
  if (options.force) {
    args.push('--force')
  }

  console.log('\napi-gen: running api:unit-gen...')
  const result = spawnSync(process.execPath, args, {
    cwd: laravelRoot,
    stdio: 'inherit',
    env: process.env
  })

  if (result.status !== 0) {
    throw new Error('api:unit-gen failed after api:gen')
  }
}

function printTagPlan(tagPlan) {
  if (!tagPlan.length) return
  console.log('\nTag plan:')
  for (const entry of tagPlan) {
    const detail = entry.artisan ?? (entry.handoffTopic ? `handoff:${entry.handoffTopic}` : entry.status)
    console.log(`  ${entry.tag} [${entry.phase}/${entry.status}] → ${detail}`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const registry = await loadCodegenRegistry(adapterRoot)
  const { spec, specFile, featureDir } = await readSpecFile(options.spec)

  const validation = validateSpec(spec, {
    requireApproved: !options.dryRun && options.execute,
    registry
  })
  const plan = buildCommandPlan(spec, { repoRoot: laravelRoot, force: options.force })
  const { tagPlan } = await buildTagPlanWithRegistry(spec, plan)

  console.log(`api-gen: module=${plan.ctx.module} entity=${plan.ctx.entity} profile=${plan.ctx.profile}`)
  console.log(`  target: ${laravelRoot} (${project.profile})`)
  console.log(`  spec: ${specFile}`)
  console.log(`  registry: ${registry.registryPath}`)
  if (options.dryRun) console.log('  mode: dry-run')
  if (options.force) console.log('  mode: force (overwrite existing via --force/--yes)')

  const analysis = plan.analysis
  if (analysis && !options.force) {
    const existingLayers = Object.entries(analysis.files)
      .filter(([, v]) => v)
      .map(([layer]) => layer)
    if (existingLayers.length) {
      console.log(`  workspace: ${existingLayers.join(', ')} already present`)
    }
    if (analysis.controllerExists && analysis.controllerComplete) {
      console.log('  controller: fully wired for spec endpoints')
    } else if (analysis.controllerExists && Object.values(analysis.pendingWire).some(Boolean)) {
      const pending = Object.entries(analysis.pendingWire)
        .filter(([, v]) => v)
        .map(([k]) => k)
      console.log(`  controller: pending wire — ${pending.join(', ')}`)
    }
  }

  if (validation.warnings.length) {
    console.log('\nWarnings:')
    for (const w of validation.warnings) console.log(`  ⚠ ${w}`)
  }

  if (validation.errors.length) {
    console.error('\nErrors:')
    for (const e of validation.errors) console.error(`  ✗ ${e}`)
    process.exit(1)
  }

  console.log('\nCommand plan:')
  if (plan.commands.length === 0) {
    console.log('  _(none — all layers exist or skipped)_')
  }
  for (const line of plan.artisanLines) {
    console.log(`  php artisan ${line.replace(/^php artisan\s+/, '')}`)
  }

  if (plan.skipped?.length) {
    console.log('\nSkipped (already exist):')
    for (const item of plan.skipped) {
      console.log(`  skip: ${item.id} — ${item.path}`)
    }
  }

  printTagPlan(tagPlan)

  const manifest = buildCodegenManifest({
    spec,
    specFile,
    plan,
    tagPlan,
    registry,
    dryRun: options.dryRun
  })

  const handoff = renderHandoffMarkdown({
    spec,
    specFile,
    plan,
    tagPlan,
    dryRun: options.dryRun || !options.execute
  })

  if (options.dryRun || !options.execute) {
    if (options.writeSpec) {
      enrichSpecCodegen(spec, { repoRoot: laravelRoot, force: options.force })
      await writeSpecFile(specFile, spec)
      console.log('\nUpdated codegen.commands in spec')

      const manifestPath = await writeCodegenManifest(featureDir, manifest, { dryRun: false })
      console.log(`Wrote ${manifestPath}`)

      const handoffPath = await writeHandoff(featureDir, handoff, { dryRun: false })
      console.log(`Wrote ${handoffPath}`)
    } else if (!options.dryRun) {
      await writeHandoff(featureDir, handoff, { dryRun: false })
      console.log(`\nWrote ${path.join(featureDir, 'generated/HANDOFF.md')}`)
    }
    console.log('\napi-gen:dry OK')
    return
  }

  const commandResults = await runCommandPlan(plan.commands, {
    dryRun: false,
    stopOnError: true
  })

  const skippedResults = (plan.skipped ?? []).map((item) => ({
    ...item,
    code: 0,
    stdout: `[skipped] ${item.reason}: ${item.path}`,
    stderr: ''
  }))
  const allResults = [...skippedResults, ...commandResults]

  const failed = commandResults.find((r) => r.code !== 0)
  if (failed) {
    console.error(`\nCommand failed: ${failed.id}`)
    console.error(failed.stderr || failed.stdout)
    process.exit(1)
  }

  const serviceStubs = await writeServiceStubs(spec, featureDir, {
    dryRun: false,
    laravelRoot
  })

  enrichSpecCodegen(spec, { repoRoot: laravelRoot, force: options.force })
  if (options.writeSpec) {
    await writeSpecFile(specFile, spec)
  }

  const finalManifest = buildCodegenManifest({
    spec,
    specFile,
    plan,
    tagPlan,
    registry,
    commandResults: allResults,
    serviceStubs,
    dryRun: false
  })

  const manifestPath = await writeCodegenManifest(featureDir, finalManifest, { dryRun: false })
  const handoffPath = await writeHandoff(
    featureDir,
    renderHandoffMarkdown({
      spec,
      specFile,
      plan,
      tagPlan,
      commandResults: allResults,
      serviceStubs
    })
  )

  console.log(`\nWrote ${manifestPath}`)
  console.log(`Wrote ${handoffPath}`)

  if (shouldRunUnitGen(spec, registry)) {
    runUnitGen(specFile, options)
  }

  console.log('api-gen complete — agent: finish #manual-* items in HANDOFF, then run tests')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
