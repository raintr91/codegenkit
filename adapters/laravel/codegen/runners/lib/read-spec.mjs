import { parse, stringify } from 'yaml'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * @param {string} specPath
 */
export async function readSpecFile(specPath) {
  const absolute = path.resolve(specPath)
  const raw = await readFile(absolute, 'utf8')
  const spec = parse(raw) ?? {}
  const parent = path.dirname(absolute)
  const featureDir = path.basename(parent) === 'backend' ? path.dirname(parent) : parent

  return {
    spec,
    specFile: absolute,
    featureDir,
    raw
  }
}

/**
 * @param {string} specFile
 * @param {object} spec
 */
export async function writeSpecFile(specFile, spec) {
  const content = stringify(spec, { lineWidth: 0 })
  await writeFile(specFile, content, 'utf8')
}
