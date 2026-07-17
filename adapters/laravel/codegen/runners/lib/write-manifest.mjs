import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * @param {object} params
 */
export function buildCodegenManifest({
  spec,
  specFile,
  plan,
  tagPlan,
  registry,
  commandResults = [],
  serviceStubs = [],
  dryRun = false
}) {
  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    specFile,
    feature: spec.feature?.id ?? null,
    approval: spec.approval?.status ?? null,
    profile: plan.ctx.profile,
    module: plan.ctx.module,
    entity: plan.ctx.entity,
    pathModel: plan.ctx.pathModel,
    registry: registry.registryPath ?? 'registries/codegen.registry.json',
    wire: spec.codegen?.wire ?? null,
    tags: spec.tags ?? [],
    tagPlan,
    commands: plan.commands.map((c) => ({
      id: c.id,
      artisan: c.artisan,
      description: c.description ?? null,
      shell: `php artisan ${c.artisan}`
    })),
    artisanLines: plan.artisanLines,
    existing: plan.existing ?? null,
    workspace: plan.analysis
      ? {
          files: plan.analysis.files,
          wired: plan.analysis.wired,
          pendingWire: plan.analysis.pendingWire,
          controllerComplete: plan.analysis.controllerComplete
        }
      : null,
    skipped: (plan.skipped ?? []).map((s) => ({
      id: s.id,
      layer: s.layer,
      artisan: s.artisan,
      reason: s.reason,
      path: s.path
    })),
    manual: plan.manual,
    serviceStubs,
    execution: commandResults.map((r) => ({
      id: r.id,
      status: r.stdout?.startsWith('[skipped]')
        ? 'SKIPPED'
        : r.code === 0
          ? 'OK'
          : `FAIL (${r.code})`,
      artisan: r.artisan
    }))
  }
}

/**
 * @param {string} featureDir
 * @param {Record<string, unknown>} manifest
 * @param {{ dryRun?: boolean }} options
 */
export async function writeCodegenManifest(featureDir, manifest, options = {}) {
  const target = path.join(featureDir, 'generated', 'codegen.manifest.json')
  if (options.dryRun) {
    return target
  }
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return target
}
