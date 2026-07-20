import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Handlebars from 'handlebars'

const templatesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates')

Handlebars.registerHelper('eq', (a, b) => a === b)

export async function renderTemplate(templateName, context) {
  const source = await fs.readFile(path.join(templatesDir, templateName), 'utf8')
  return Handlebars.compile(source, { noEscape: true })(context)
}
