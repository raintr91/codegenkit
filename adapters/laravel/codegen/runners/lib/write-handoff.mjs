import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'

const MANUAL_HINTS = {
  relationships: 'Sync Eloquent relationships in Action — `entity-relationship.md`',
  'chain-scope': 'Scope Query by session chain_id — tenant/chain context in Query',
  'default-per-page': 'Set default per_page (e.g. 100) in SearchRequest or Query — assert in `/unit`',
  'nested-managers-resource': 'Map nested managers in Resource — align with OpenAPI `02-openapi.yaml`'
}

/**
 * @param {object} params
 */
export function renderHandoffMarkdown({
  spec,
  specFile,
  plan,
  tagPlan = [],
  commandResults = [],
  serviceStubs = [],
  dryRun = false
}) {
  const slug = spec.feature?.id ?? 'feature'
  const module = plan.ctx.module
  const lines = [
    `# HANDOFF — ${slug}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Spec: \`${specFile}\``,
    `Manifest: \`generated/codegen.manifest.json\``,
    dryRun ? '\nMode: **dry-run** (no files written, no artisan executed)\n' : '',
    '## Generator commands',
    '',
    ...(plan.artisanLines.length
      ? plan.artisanLines.map((l) => `- \`${l}\``)
      : ['- _(none — check codegen block)_']),
    ''
  ]

  if (tagPlan.length > 0) {
    lines.push('## Tag plan', '')
    lines.push('| Tag | Phase | Status | Next |')
    lines.push('|-----|-------|--------|------|')
    for (const entry of tagPlan) {
      const next =
        entry.artisan
          ? `\`${entry.artisan}\``
          : entry.handoffTopic
            ? `HANDOFF: ${entry.handoffTopic}`
            : entry.extract
              ? `see \`${entry.extract}\``
              : '—'
      lines.push(`| \`${entry.tag}\` | ${entry.phase} | ${entry.status} | ${next} |`)
    }
    lines.push('')
  }

  if (commandResults.length > 0) {
    lines.push('## Execution log', '')
    for (const r of commandResults) {
      const status = r.code === 0 ? 'OK' : `FAIL (${r.code})`
      lines.push(`- **${r.id}** [${status}]: \`php artisan ${r.artisan}\``)
      if (r.code !== 0 && r.stderr) {
        lines.push(`  - stderr: \`${r.stderr.trim().slice(0, 200)}\``)
      }
    }
    lines.push('')
  }

  const handoffEntries = tagPlan.filter((e) => e.status === 'handoff')
  const manualActions = [
    ...new Set([
      ...handoffEntries.filter((e) => e.layer === 'action').map((e) => e.handoffTopic),
      ...plan.manual.actions
    ])
  ].filter(Boolean)

  if (manualActions.length > 0) {
    lines.push('## Agent next — #manual-action', '')
    for (const item of manualActions) {
      const hint = MANUAL_HINTS[item] ?? 'Implement per spec notes and `entity-relationship.md`'
      lines.push(`- [ ] **${item}** — ${hint}`)
    }
    lines.push('')
  }

  const manualServices = [
    ...new Set([
      ...handoffEntries.filter((e) => e.layer === 'service').map((e) => e.handoffTopic),
      ...plan.manual.services
    ])
  ].filter(Boolean)

  if (manualServices.length > 0 || serviceStubs.length > 0) {
    lines.push('## Agent next — #manual-service', '')
    for (const id of manualServices) {
      lines.push(`- [ ] Implement service **${id}** — see \`call-external.md\` / \`cross-entity-service.md\``)
    }
    for (const stub of serviceStubs) {
      lines.push(`- Stub: \`${stub}\``)
    }
    lines.push('')
  }

  const manualTests = [
    ...new Set([
      ...handoffEntries.filter((e) => e.layer === 'tests').map((e) => e.handoffTopic),
      ...plan.manual.tests
    ])
  ].filter(Boolean)

  if (manualTests.length > 0) {
    lines.push('## Agent next — #manual-test', '')
    for (const t of manualTests) {
      lines.push(`- [ ] **${t}** — implement in `/unit` (\`unit-coverage.md\`)`)
    }
    lines.push('')
  }

  lines.push(
    '## Verify',
    '',
    '```bash',
    `php artisan test --filter=${module}`,
    '```',
    '',
    '## OpenAPI',
    '',
    'Resource fields must match `02-openapi.yaml`. Update YAML if contract fix found.',
    ''
  )

  return lines.join('\n')
}

/**
 * @param {string} featureDir
 * @param {string} content
 * @param {{ dryRun?: boolean }} options
 */
export async function writeHandoff(featureDir, content, options = {}) {
  const target = path.join(featureDir, 'generated', 'HANDOFF.md')
  if (options.dryRun) {
    return target
  }
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
  return target
}
