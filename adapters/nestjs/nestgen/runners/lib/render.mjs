import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Handlebars from 'handlebars'

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates')

Handlebars.registerHelper('join', (items, sep) => {
  if (!Array.isArray(items)) return ''
  return items.join(typeof sep === 'string' ? sep : ', ')
})
Handlebars.registerHelper('eq', (a, b) => a === b)

export async function renderTemplate(templateName, context) {
  const source = await fs.readFile(path.join(templatesDir, templateName), 'utf8')
  return Handlebars.compile(source, { noEscape: true })(context)
}

export function renderHandoffMarkdown(plan, specPath) {
  const lines = [
    '# Nest codegen — HANDOFF',
    '',
    `Spec: \`${specPath}\``,
    '',
    '## Generated',
    ''
  ]

  for (const file of plan.files) {
    lines.push(`- \`${file.relativePath}\` (${file.layer})`)
  }

  if (plan.skipped.length) {
    lines.push('', '## Skipped (already exist)', '')
    for (const s of plan.skipped) {
      lines.push(`- \`${s.relativePath}\` — ${s.reason}`)
    }
  }

  lines.push(
    '',
    '## Manual',
    '',
    '- Wire repository in Query/Command handlers (TypeORM/Prisma).',
    '- Register module in `AppModule` if not auto-imported.',
    '- Relation sync: read `@portal/models` `*.relationships.meta.ts`.',
    ''
  )

  return lines.join('\n')
}
