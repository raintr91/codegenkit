#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const target = path.resolve(process.env.CODEGENKIT_ROOT || process.cwd())
const adapter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function main() {
  const registryPath = path.join(target, 'registries/unit-test.registry.json')
  const registry = JSON.parse(await readFile(registryPath, 'utf8'))
  const errors = []
  if (!registry.version || !registry.layers) {
    errors.push('registry requires version and layers')
  }
  for (const [layer, definition] of Object.entries(registry.layers ?? {})) {
    if (!definition.template) {
      errors.push(`${layer}: template missing`)
      continue
    }
    const candidates = [
      path.join(adapter, 'templates', definition.template),
      path.join(adapter, '../codegen/templates', definition.template),
    ]
    if (!(await Promise.any(candidates.map(async (candidate) => {
      if (!(await exists(candidate))) throw new Error('missing')
      return true
    })).catch(() => false))) {
      errors.push(`${layer}: packaged template missing: ${definition.template}`)
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`fastapi-unit.registry v${registry.version}: OK`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
