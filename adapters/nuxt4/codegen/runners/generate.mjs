import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildCodegenContext, buildFilePlan, enrichCodegenContext, applyRegistryToContext } from './lib/plan.mjs'
import { loadDesignRegistry } from './lib/design-registry.mjs'
import { upsertPageLifecycle, syncPageLifecycleFromManifests } from './lib/page-lifecycle.mjs'
import { readSpecFile } from './lib/read-spec.mjs'
import { resolveHubId } from './lib/resolve-hub-id.mjs'
import { renderTemplate } from './lib/render.mjs'
import { renderHandoffMarkdown, writeGeneratedMeta, writeOutputs } from './lib/write-files.mjs'
import { resolveProjectRoot } from './lib/resolve-hub-id.mjs'

const root = path.resolve(process.env.CODEGENKIT_ROOT || process.cwd())
const yamlRootFlag = process.argv.includes('--yaml-root')
  ? process.argv[process.argv.indexOf('--yaml-root') + 1]
  : null
function resolveDocsProductRoot() {
  const env = process.env.CODEGENKIT_DOCS_ROOT || process.env.DOCS_HUB_ROOT
  if (env) return path.join(path.resolve(env), 'product')
  if (process.env.CODEGENKIT_YAML_ROOT) return path.resolve(process.env.CODEGENKIT_YAML_ROOT)
  try {
    return path.join(resolveProjectRoot(root, 'docs'), 'product')
  } catch {
    try {
      return path.join(resolveProjectRoot(root, 'base-docs'), 'product')
    } catch {
      throw new Error(
        'Set CODEGENKIT_DOCS_ROOT or pass --yaml-root; no sibling docs hub is assumed',
      )
    }
  }
}
const IR_SPEC_GLOB_ROOT = path.resolve(yamlRootFlag ?? resolveDocsProductRoot())

function parseArgs(argv) {
  const options = { dryRun: false, force: false, spec: null, all: false, id: null }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run' || arg === '--dry') options.dryRun = true
    else if (arg === '--force') options.force = true
    else if (arg === '--all') options.all = true
    else if (arg === '--spec') options.spec = argv[++i]
    else if (arg === '--id') options.id = argv[++i]
    else if (arg === '--yaml-root') i++
    else if (!arg.startsWith('-') && !options.spec && !options.id) options.spec = arg
  }

  return options
}

async function listIrSpecFiles(dir) {
  const files = []
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listIrSpecFiles(entryPath)))
      continue
    }
    if (entry.isFile() && entry.name === 'spec.yaml' && entryPath.includes(`${path.sep}ir${path.sep}`)) {
      files.push(entryPath)
    }
  }

  return files.sort()
}

async function resolveSpecPaths(options) {
  if (options.id) {
    const resolved = resolveHubId(root, options.id, 'codegen')
    for (const n of resolved.notes) console.warn(`  note: ${n}`)
    if (!resolved.paths.length) {
      throw new Error(`--id ${options.id}: no codegen specs (need ir/spec.yaml under docs hub Code)`)
    }
    console.log(`portal-gen: --id ${options.id} → ${resolved.paths.length} spec(s) (${resolved.kind})`)
    return resolved.paths
  }
  if (options.spec) return [path.resolve(options.spec)]
  const discovered = await listIrSpecFiles(IR_SPEC_GLOB_ROOT)
  if (!discovered.length) {
    throw new Error(
      'No ir/spec.yaml. Prefer: pnpm portal:gen --id W-AD-AUTH-001|CMP-01\n' +
        'Or pass --spec <path> / set CODEGENKIT_DOCS_ROOT and split on docs hub.',
    )
  }
  return discovered
}

async function generateOne(options, registry, specPath) {
  const { spec, specFile, featureDir } = await readSpecFile(specPath)
  let ctx = buildCodegenContext(spec, specFile)
  ctx = applyRegistryToContext(ctx, registry, { validate: true })
  ctx = await enrichCodegenContext(ctx, root)
  const plan = buildFilePlan(ctx)

  const outputs = []
  for (const file of plan) {
    const templateContext =
      file.layer === 'component'
        ? { ...ctx, moName: file.moName, componentName: file.moName }
        : ctx
    const content = await renderTemplate(file.template, templateContext)
    outputs.push({ layer: file.layer, relativePath: file.relativePath, content })
  }

  const { written, skipped } = await writeOutputs(root, outputs, {
    dryRun: options.dryRun,
    force: options.force
  })

  const manifest = {
    generatedAt: new Date().toISOString(),
    specFile,
    profile: ctx.profile,
    entity: ctx.entity,
    module: ctx.module,
    shell: ctx.shell,
    shellVariant: ctx.shellVariant,
    commonSpecRef: ctx.commonSpecRef,
    designRegistry: registry.registryPath,
    slotBindings: ctx.slotBindings,
    componentFiles: ctx.componentFiles,
    files: plan.map((f) => ({ layer: f.layer, path: f.relativePath, template: f.template })),
    tags: ctx.parsedTags.raw,
    skipped: skipped.map((s) => s.relativePath)
  }

  const handoff = renderHandoffMarkdown(ctx, written, skipped)
  const meta = await writeGeneratedMeta(featureDir, manifest, handoff, { dryRun: options.dryRun })

  console.log(`portal-gen: profile=${ctx.profile} entity=${ctx.entity} shell=${ctx.shell} (${ctx.shellVariant})`)
  console.log(`  spec: ${specFile}`)
  if (options.dryRun) console.log('  mode: dry-run')

  for (const warning of ctx.designValidation?.warnings ?? []) {
    console.log(`  design warn: ${warning}`)
  }

  for (const binding of ctx.slotBindings) {
    if (binding.wired) {
      console.log(`  slot: #${binding.slot} → <${binding.component} :${binding.valueProp}>`)
    }
  }

  for (const w of written) {
    console.log(`  ${options.dryRun ? '[dry]' : 'write'}: ${w.relativePath}`)
  }
  for (const s of skipped) {
    console.log(`  skip: ${s.relativePath} (${s.reason})`)
  }

  if (!options.dryRun) {
    const pageWritten = written.find((w) => w.relativePath?.startsWith('pages/') && w.relativePath.endsWith('.vue'))
    if (pageWritten) {
      const lifecycle = await upsertPageLifecycle(root, {
        routePath: ctx.route.path,
        specFile: specFile,
        title: ctx.title,
        stage: 'prototype'
      })
      console.log(`  lifecycle: ${lifecycle.routePath} → stage=${lifecycle.stage} (${lifecycle.registryPath})`)
    }

    await syncPageLifecycleFromManifests(root)
    console.log(`  handoff: ${path.relative(root, meta.handoffPath)}`)
  }

  return { specFile, wrotePage: !options.dryRun && written.some((w) => w.relativePath?.startsWith('pages/')) }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const registry = await loadDesignRegistry(root)
  const specPaths = await resolveSpecPaths(options)

  if (specPaths.length > 1) {
    console.log(`portal-gen: ${specPaths.length} ir/spec.yaml file(s)`)
  }

  let docsRenderNeeded = false
  let failed = 0

  for (const specPath of specPaths) {
    try {
      const result = await generateOne(options, registry, specPath)
      if (result.wrotePage) docsRenderNeeded = true
      if (specPaths.length > 1) console.log('')
    } catch (error) {
      failed++
      console.error(`portal-gen: FAIL ${path.relative(root, specPath)}: ${error.message ?? error}`)
    }
  }

  if (!options.dryRun && docsRenderNeeded) runDocsRender()
  process.exit(failed > 0 ? 1 : 0)
}

/** Docs markdown render stays on the docs hub / Bundlekit — never assume sibling checkout. */
function runDocsRender() {
  console.log('  docs:render: handoff to docs hub / Bundlekit (not executed from Codegenkit)')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
