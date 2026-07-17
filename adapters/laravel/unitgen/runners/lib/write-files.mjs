import { access, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { renderTemplate } from './render.mjs'
import { assertContained } from '../../../shared/project.mjs'

/** @param {string} filePath */
async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} repoRoot
 * @param {{ relativePath: string, content: string, layer: string, patternId: string }[]} outputs
 * @param {{ dryRun?: boolean, force?: boolean }} options
 */
export async function writeOutputs(repoRoot, outputs, options = {}) {
  const written = []
  const skipped = []

  for (const output of outputs) {
    const absolutePath = assertContained(
      repoRoot,
      path.join(repoRoot, output.relativePath),
      'unit output'
    )

    if (!options.force && (await fileExists(absolutePath))) {
      skipped.push({ relativePath: output.relativePath, reason: 'exists (use --force)' })
      continue
    }

    if (!options.dryRun) {
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, output.content, 'utf8')
    }

    written.push({ relativePath: output.relativePath, dryRun: !!options.dryRun })
  }

  return { written, skipped }
}

/**
 * @param {string} featureDir
 * @param {Record<string, unknown>} manifest
 * @param {string} handoffMarkdown
 * @param {{ dryRun?: boolean }} options
 */
export async function writeUnitMeta(featureDir, manifest, handoffMarkdown, options = {}) {
  const manifestPath = path.join(featureDir, 'generated', 'unit.manifest.json')
  const handoffPath = path.join(featureDir, 'generated', 'UNIT-HANDOFF.md')

  if (options.dryRun) {
    return { manifestPath, handoffPath }
  }

  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await writeFile(handoffPath, handoffMarkdown, 'utf8')

  return { manifestPath, handoffPath }
}

/** @param {object} ctx @param {object[]} written @param {object[]} skipped @param {object[]} needsUnit @param {object[]} commands @param {object[]} skippedPatterns */
export function renderUnitHandoffMarkdown(ctx, written, skipped, needsUnit, commands, skippedPatterns = []) {
  const testPaths = written.map((w) => w.relativePath)
  const filterHint = ctx.entity

  const lines = [
    `# UNIT HANDOFF — ${ctx.title}`,
    '',
    `Generated from \`${path.basename(ctx.specFile)}\` (profile: **${ctx.profile}**, phase: **${ctx.phase}**).`,
    '',
    'Prerequisite: `pnpm api:gen` + `generated/codegen.manifest.json`.',
    '',
    '## Commands (stub layer)',
    '',
    ...(commands.length
      ? commands.map((c) => `- \`php artisan ${c.artisan}\``)
      : ['- _No artisan commands planned._']),
    '',
    ...(skippedPatterns.length
      ? [
          '## Skipped patterns',
          '',
          ...skippedPatterns.map(
            (item) =>
              `- \`${item.patternId}\` — ${item.reason}${item.artisan ? ` (\`${item.artisan}\`)` : ''}`
          ),
          ''
        ]
      : []),
    '## Test files',
    '',
    ...(written.length
      ? written.map((f) => `- \`${f.relativePath}\`${f.dryRun ? ' (dry-run)' : ''}`)
      : ['- _No template files written._']),
    '',
    ...(skipped.length
      ? ['## Skipped (already exist)', '', ...skipped.map((s) => `- \`${s.relativePath}\` — ${s.reason}`), '']
      : []),
    '## Verify',
    '',
    '```bash',
    `php artisan test --testsuite=Module${ctx.module}`,
    testPaths.length
      ? `php artisan test ${testPaths.map((p) => p).join(' ')}`
      : `php artisan test --filter=${filterHint}`,
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

  return lines.join('\n')
}

/**
 * @param {ReturnType<typeof buildUnitPlan>['files']} files
 * @param {ReturnType<typeof buildUnitContext>} ctx
 */
export async function renderFileOutputs(files, ctx) {
  const outputs = []

  for (const file of files) {
    const context = {
      ...ctx,
      ...file.context,
      moduleNamespace: ctx.moduleNamespace,
      moduleBaseRequestFqcn: ctx.moduleBaseRequestFqcn,
      moduleBaseRequestClass: ctx.moduleBaseRequestClass,
      moduleControllerFqcn: ctx.moduleControllerFqcn
    }
    const content = await renderTemplate(file.template, context)
    outputs.push({
      relativePath: file.relativePath,
      content,
      layer: file.layer,
      patternId: file.patternId
    })
  }

  return outputs
}
