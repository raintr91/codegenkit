import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'yaml'

export function parseArgs(argv) {
  const options = { dryRun: false, writeSpec: false, spec: null, force: false, execute: true }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run' || arg === '--dry') options.dryRun = true
    else if (arg === '--write-spec') options.writeSpec = true
    else if (arg === '--plan-only') options.execute = false
    else if (arg === '--force') options.force = true
    else if (arg === '--spec') options.spec = argv[++i]
    else if (!arg.startsWith('-') && !options.spec) options.spec = arg
  }

  if (!options.spec) {
    throw new Error('Usage: pnpm nest:gen --spec docs/features/yaml/.../backend/01-backend-spec.yaml')
  }

  return options
}

export async function readSpecFile(specPath) {
  const abs = path.resolve(specPath)
  const raw = await fs.readFile(abs, 'utf8')
  const spec = yaml.parse(raw)
  const featureDir = abs.includes(`${path.sep}backend${path.sep}`)
    ? path.dirname(path.dirname(abs))
    : path.dirname(abs)
  return { spec, specFile: abs, featureDir }
}

export function toKebab(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function toPascal(value) {
  return String(value)
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (m) => m.toUpperCase())
}
