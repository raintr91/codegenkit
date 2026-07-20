import path from 'node:path'

import { buildEnrichedPlan, enrichSpecCodegen } from './lib/plan.mjs'
import { parseArgs, readSpecFile } from './lib/read-spec.mjs'
import { writeManifest, writeOutputs } from './lib/write-files.mjs'

const repoRoot = path.resolve(process.env.CODEGENKIT_ROOT ?? process.cwd())

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { spec, specFile, featureDir } = await readSpecFile(options.spec)

  if (options.writeSpec) {
    enrichSpecCodegen(spec, { repoRoot, force: options.force })
    const yaml = (await import('yaml')).default
    const fs = await import('node:fs/promises')
    await fs.writeFile(specFile, yaml.stringify(spec), 'utf8')
  }

  if (options.openapi) {
    const { resolveCodegenContext } = await import('./lib/plan.mjs')
    const { buildOpenApiDocument, serializeOpenApi } = await import('./lib/openapi.mjs')
    const fs = await import('node:fs/promises')

    const ctx = resolveCodegenContext(spec)
    const document = buildOpenApiDocument(spec, ctx, { beAdapter: 'nestjs' })
    const yamlContent = serializeOpenApi(document)
    const outputPath = path.join(featureDir, 'backend', '02-openapi.yaml')

    console.log(`openapi-gen: module=${ctx.module} entity=${ctx.entity}`)
    console.log(`  spec: ${path.relative(repoRoot, specFile)}`)
    console.log(`  target: ${path.relative(repoRoot, outputPath)}`)
    if (options.dryRun) console.log('  mode: dry-run')
    if (options.force) console.log('  mode: force')

    if (options.dryRun) {
      console.log(`  [dry] would write: ${path.relative(repoRoot, outputPath)}`)
      return
    }

    let exists = false
    try {
      await fs.access(outputPath)
      exists = true
    } catch {}

    if (exists && !options.force) {
      const existingContent = await fs.readFile(outputPath, 'utf8')
      if (existingContent.trim() !== yamlContent.trim()) {
        throw new Error(
          `Refusing to overwrite modified file: ${path.relative(repoRoot, outputPath)}. Use --force to overwrite.`
        )
      } else {
        console.log(`  skip: ${path.relative(repoRoot, outputPath)} (no changes)`)
        return
      }
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, yamlContent, 'utf8')
    console.log(`  write: ${path.relative(repoRoot, outputPath)}`)
    return
  }

  const plan = await buildEnrichedPlan(spec, { repoRoot, force: options.force })

  console.log(`nest-gen: module=${plan.ctx.module} entity=${plan.ctx.entity} orm=${plan.ctx.orm}`)
  console.log(`  spec: ${path.relative(repoRoot, specFile)}`)
  if (options.dryRun) console.log('  mode: dry-run')
  if (options.force) console.log('  mode: force')

  const { written, skipped } = await writeOutputs(repoRoot, plan, options)
  const meta = await writeManifest(featureDir, plan, specFile, options, written)

  for (const w of written) {
    console.log(`  ${options.dryRun ? '[dry]' : 'write'}: ${w}`)
  }
  for (const s of skipped) {
    console.log(`  skip: ${s.relativePath} (${s.reason})`)
  }

  if (!options.dryRun) {
    console.log(`  manifest: ${path.relative(repoRoot, meta.manifestPath)}`)
  }
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
