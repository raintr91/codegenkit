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
  Handlebars.registerHelper('phpStringArray', (items) => {
    const arr = Array.isArray(items) ? items : []
    const encoded = arr.map((item) => `'${String(item).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
    return `[${encoded.join(', ')}]`
  })
  Handlebars.registerHelper('phpFqcn', (fqcn) => {
    const name = String(fqcn ?? '')
    if (!name) return ''
    return name.startsWith('\\') ? name : `\\${name}`
  })
}

/** @param {string} templateRel @param {Record<string, unknown>} context */
export async function renderTemplate(templateRel, context) {
  await registerHelpers()
  const templatePath = path.join(templatesDir, templateRel)
  const source = await readFile(templatePath, 'utf8')
  const template = Handlebars.compile(source, { noEscape: true })
  return `${template(context).trim()}\n`
}
