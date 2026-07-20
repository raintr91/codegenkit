import fs from 'node:fs/promises'

import yaml from 'yaml'

export function parseArgs(argv) {
  const options = { dryRun: false, force: false, spec: null, all: false, yamlRoot: null }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run' || arg === '--dry') options.dryRun = true
    else if (arg === '--force') options.force = true
    else if (arg === '--all') options.all = true
    else if (arg === '--spec') options.spec = argv[++i]
    else if (arg === '--yaml-root') options.yamlRoot = argv[++i]
    else if (!arg.startsWith('-') && !options.spec) options.spec = arg
  }

  return options
}

export async function readSpecFile(specPath) {
  const raw = await fs.readFile(specPath, 'utf8')
  return yaml.parse(raw)
}

export function resolveEntityKebab(entity, codegen = {}) {
  const fromCodegen = codegen.entity ?? codegen.namespace
  if (fromCodegen) {
    return String(fromCodegen)
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase()
  }
  return String(entity.name ?? 'entity')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function toPascalCase(value) {
  return String(value)
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (m) => m.toUpperCase())
}
