import Handlebars from 'handlebars'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const templatesDir = path.join(rootDir, 'templates')

let registered = false

async function registerHelpers() {
  if (registered) return
  registered = true
  Handlebars.registerHelper('eq', (a, b) => a === b)
  Handlebars.registerHelper('json', (value) => JSON.stringify(value, null, 2))
}

/**
 * @param {string} templateRel e.g. models/schema.test.ts.hbs
 * @param {Record<string, unknown>} context
 */
export async function renderTemplate(templateRel, context) {
  await registerHelpers()
  const templatePath = path.join(templatesDir, templateRel)
  const source = await readFile(templatePath, 'utf8')
  const template = Handlebars.compile(source, { noEscape: true })
  return `${template(context).trim()}\n`
}

export function getTemplatesRoot() {
  return templatesDir
}
