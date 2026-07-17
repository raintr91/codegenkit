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
export async function writeGeneratedMeta(featureDir, manifest, handoffMarkdown, options = {}) {
  const generatedDir = path.join(featureDir, 'generated')
  const manifestPath = path.join(generatedDir, 'codegen.manifest.json')
  const handoffPath = path.join(generatedDir, 'HANDOFF.md')

  if (options.dryRun) {
    return { manifestPath, handoffPath, dryRun: true }
  }

  await mkdir(generatedDir, { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(handoffPath, handoffMarkdown, 'utf8')
  return { manifestPath, handoffPath }
}

export function renderHandoffMarkdown(ctx, written, skipped) {
  const lines = [
    `# HANDOFF — ${ctx.title}`,
    '',
    `Generated from \`${ctx.specFile}\` (profile: **${ctx.profile}**).`,
    '',
    '## Files',
    '',
    ...(written.length
      ? written.map((f) => `- \`${f.relativePath}\`${f.dryRun ? ' (dry-run)' : ''}`)
      : ['- _No files written._']),
    '',
    ...(skipped.length
      ? ['## Skipped (already exist)', '', ...skipped.map((s) => `- \`${s.relativePath}\` — ${s.reason}`), '']
      : [])
  ]

  if (ctx.handoffItems.length) {
    lines.push('## Prototype next (/prototype)', '')
    lines.push(
      '_portal:gen does not emit component code for `#needs-component` / `#needs-ui` — implement molecules in /prototype, then re-run gen._',
      ''
    )
    for (const item of ctx.handoffItems) {
      lines.push(`- **${item.type}**${item.name ? ` (\`${item.name}\`)` : ''}: ${item.detail}`)
    }
    lines.push('')
  } else {
    lines.push('## Prototype next (/prototype)', '', '- _No missing components — review generated code and run lint/typecheck._', '')
  }

  lines.push(
    '## Commands',
    '',
    '```bash',
    'bundlekit render / docs hub docs:render   # after spec edits',
    'pnpm portal:gen --spec ... --force  # re-generate after /prototype components',
    '```',
    '',
  )

  return lines.join('\n')
}
