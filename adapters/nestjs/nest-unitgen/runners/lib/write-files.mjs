import fs from 'node:fs/promises'
import path from 'node:path'

export async function writeOutputs(repoRoot, outputs, options) {
  const written = []
  const skipped = []

  for (const file of outputs) {
    const abs = path.join(repoRoot, file.relativePath)
    if (!options.dryRun && !options.force) {
      try {
        await fs.access(abs)
        skipped.push({ relativePath: file.relativePath, reason: 'exists' })
        continue
      } catch {
        // write
      }
    }
    if (!options.dryRun) {
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, file.content, 'utf8')
    }
    written.push(file.relativePath)
  }

  return { written, skipped }
}

export async function writeManifest(featureDir, plan, specPath, options, written) {
  const manifestPath = path.join(featureDir, 'generated', 'unit.manifest.json')
  const manifest = {
    spec: specPath,
    written,
    generatedAt: new Date().toISOString()
  }
  if (!options.dryRun) {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  }
}
