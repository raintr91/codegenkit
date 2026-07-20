import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * @param {string} root workspace root
 * @param {{ relativePath: string, content: string }[]} outputs
 * @param {{ dryRun?: boolean, force?: boolean }} options
 */
export async function writeOutputs(root, outputs, options = {}) {
  const written = []
  const skipped = []

  for (const { relativePath, content } of outputs) {
    const absolutePath = path.join(root, relativePath)
    const exists = await fileExists(absolutePath)

    if (exists && !options.force) {
      skipped.push({ relativePath, reason: 'exists (use --force)' })
      continue
    }

    if (options.dryRun) {
      written.push({ relativePath, dryRun: true })
      continue
    }

    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, content, 'utf8')
    written.push({ relativePath })
  }

  return { written, skipped }
}

async function fileExists(filePath) {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} featureDir
 * @param {Record<string, unknown>} manifest
 * @param {string} handoffMarkdown
 */
export async function writeUnitMeta(featureDir, manifest, handoffMarkdown, options = {}) {
  const generatedDir = path.join(featureDir, 'generated')
  const manifestPath = path.join(generatedDir, 'unit.manifest.json')
  const handoffPath = path.join(generatedDir, 'UNIT-HANDOFF.md')

  if (options.dryRun) {
    return { manifestPath, handoffPath, dryRun: true }
  }

  await mkdir(generatedDir, { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(handoffPath, handoffMarkdown, 'utf8')
  return { manifestPath, handoffPath }
}

export function renderUnitHandoffMarkdown(ctx, written, skipped, needsUnit) {
  const lines = [
    `# UNIT HANDOFF — ${ctx.title}`,
    '',
    `Generated from \`${ctx.specFile}\` (profile: **${ctx.profile}**, phase: **${ctx.phase}**).`,
    '',
    'Prerequisite: `codegenkit gen` + `generated/codegen.manifest.json`.',
    '',
    '## Test files',
    '',
    ...(written.length
      ? written.map((f) => `- \`${f.relativePath}\`${f.dryRun ? ' (dry-run)' : ''}`)
      : ['- _No files written._']),
    '',
    ...(skipped.length
      ? ['## Skipped (already exist)', '', ...skipped.map((s) => `- \`${s.relativePath}\` — ${s.reason}`), '']
      : []),
    '## Verify',
    '',
    '```bash',
    `pnpm exec vitest run ${written[0]?.relativePath ?? skipped[0]?.relativePath ?? 'tests/unit/'}`,
    '```',
    ''
  ]

  if (needsUnit.length) {
    lines.push('## Unit next — #needs-unit-test', '')
    for (const item of needsUnit) {
      lines.push(`- \`${item.tag}\` — ${item.reason}`)
    }
    lines.push('')
  }

  if (!written.length && skipped.length) {
    lines.push('## Note', '')
    lines.push('No new files — existing tests kept. Re-run with `--force` to overwrite.', '')
  }

  return lines.join('\n')
}
