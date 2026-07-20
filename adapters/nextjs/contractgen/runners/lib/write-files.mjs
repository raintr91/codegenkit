import fs from 'node:fs/promises'
import path from 'node:path'

import { renderHandoffMarkdown, renderTemplate } from './render.mjs'

export async function writeOutputs(root, plan, { dryRun, force }) {
  const written = []
  const skipped = []

  for (const file of plan.files) {
    const absPath = path.join(root, file.relativePath)
    const content = await renderTemplate(file.template, {
      ...file.context,
      mode: file.context.mode ?? 'read'
    })

    if (!dryRun) {
      await fs.mkdir(path.dirname(absPath), { recursive: true })
      let exists = false
      try {
        await fs.access(absPath)
        exists = true
      } catch {
        exists = false
      }
      if (exists && !force) {
        skipped.push({ path: file.relativePath, reason: 'exists' })
        continue
      }
      await fs.writeFile(absPath, content, 'utf8')
    }
    written.push(file.relativePath)
  }

  return { written, skipped }
}

export async function writeManifest(root, plan, specPath, { dryRun, written, skipped }) {
  const manifest = {
    spec: path.relative(root, specPath),
    entities: plan.entities.map((e) => e.name),
    written,
    skipped,
    generatedAt: new Date().toISOString()
  }

  if (!dryRun) {
    await fs.mkdir(path.dirname(plan.manifestPath), { recursive: true })
    await fs.writeFile(plan.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    await fs.writeFile(plan.handoffPath, renderHandoffMarkdown(plan, specPath), 'utf8')
  }

  return manifest
}
