import Handlebars from 'handlebars'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const templatesDir = path.join(rootDir, 'templates')
const partialsDir = path.join(templatesDir, 'partials')

let registered = false

async function registerPartials() {
  if (registered) return
  registered = true

  Handlebars.registerHelper('eq', (a, b) => a === b)
  Handlebars.registerHelper('json', (value) => JSON.stringify(value, null, 2))

  try {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(partialsDir)
    for (const file of entries) {
      if (!file.endsWith('.hbs')) continue
      const name = file.replace(/\.hbs$/, '')
      const source = await readFile(path.join(partialsDir, file), 'utf8')
      Handlebars.registerPartial(name, Handlebars.compile(source))
    }
  } catch {
    // optional partials
  }
}

/**
 * @param {string} templateRel e.g. list/page.vue.hbs
 * @param {Record<string, unknown>} context
 */
export async function renderTemplate(templateRel, context) {
  await registerPartials()
  const templatePath = path.join(templatesDir, templateRel)
  const source = await readFile(templatePath, 'utf8')
  const template = Handlebars.compile(source, { noEscape: true })
  return `${template(context).trim()}\n`
}

export function getTemplatesRoot() {
  return templatesDir
}
