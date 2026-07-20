import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Handlebars from 'handlebars'

import { fieldInScope, zodForArray, zodForRelation, zodForScalar } from './field-zod.mjs'

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates')

Handlebars.registerHelper('zodField', (field, mode) => {
  if (!field) return 'z.unknown()'
  if (field.kind === 'relation') return zodForRelation(field, mode ?? 'read')
  if (field.kind === 'array') return zodForArray(field)
  if (field.kind === 'fk') return 'fields.id.optional()'
  return zodForScalar(field)
})

Handlebars.registerHelper('eq', (a, b) => a === b)

export async function renderTemplate(templateName, context) {
  const templatePath = path.join(templatesDir, templateName)
  const source = await fs.readFile(templatePath, 'utf8')
  const template = Handlebars.compile(source, { noEscape: true })
  return template(context)
}

export function renderHandoffMarkdown(plan, specPath) {
  const lines = [
    '# Contract gen — HANDOFF',
    '',
    `Spec: \`${specPath}\``,
    '',
    '## Entities',
    ''
  ]

  for (const entity of plan.entities) {
    lines.push(`- **${entity.name}** — ${entity.fields?.length ?? 0} fields`)
  }

  lines.push('', '## Files', '')
  for (const file of plan.files) {
    lines.push(`- \`${file.relativePath}\``)
  }

  lines.push(
    '',
    '## Manual follow-up',
    '',
    '- Confirm `kind: relation` + `persistence.type` when grill infers from columns only.',
    '- Backend scaffold: `codegenkit api-gen` / Nest `api-gen --adapter=nestjs` as needed.',
    '',
  )

  return lines.join('\n')
}
