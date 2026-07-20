import fs from 'node:fs/promises'
import path from 'node:path'

import { renderHandoffMarkdown, renderTemplate } from './render.mjs'

export async function writeOutputs(repoRoot, plan, options) {
  const written = []
  const skipped = [...plan.skipped]

  for (const file of plan.files) {
    const absPath = path.join(repoRoot, file.relativePath)
    const content = await renderTemplate(file.template, plan.ctx)

    if (options.dryRun) {
      written.push(file.relativePath)
      continue
    }

    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, content, 'utf8')
    written.push(file.relativePath)
  }

  return { written, skipped }
}

export async function writeManifest(featureDir, plan, specPath, options, written) {
  const manifest = {
    spec: specPath,
    module: plan.ctx.module,
    entity: plan.ctx.entity,
    orm: plan.ctx.orm,
    files: plan.files.map((f) => ({ layer: f.layer, path: f.relativePath, template: f.template })),
    written,
    skipped: plan.skipped,
    generatedAt: new Date().toISOString()
  }

  const manifestPath = path.join(featureDir, 'generated', 'codegen.manifest.json')
  const handoffPath = path.join(featureDir, 'generated', 'HANDOFF.md')

  if (!options.dryRun) {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await fs.writeFile(handoffPath, renderHandoffMarkdown(plan, specPath), 'utf8')
  }

  return { manifestPath, handoffPath, manifest }
}
