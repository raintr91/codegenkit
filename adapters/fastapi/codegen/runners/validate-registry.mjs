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
  const registryPath = path.join(target, 'registries/codegen.registry.json')
  const registry = JSON.parse(await readFile(registryPath, 'utf8'))
  const errors = []
  if (!registry.version || !registry.profiles || !registry.genTags) {
    errors.push('registry requires version, profiles and genTags')
  }
  for (const [tag, definition] of Object.entries(registry.genTags ?? {})) {
    const templates = [
      ...(definition.template ? [definition.template] : []),
      ...(definition.templates ?? []),
    ]
    if (!templates.length) errors.push(`${tag}: template/templates missing`)
    for (const template of templates) {
      if (!(await exists(path.join(adapter, 'templates', template)))) {
        errors.push(`${tag}: packaged template missing: ${template}`)
      }
    }
  }
  const commonPath = path.join(target, 'registries/common.registry.json')
  if (await exists(commonPath)) {
    const common = JSON.parse(await readFile(commonPath, 'utf8'))
    if (!common.version || !common.entries || !common.aliasIndex) {
      errors.push('common registry requires version, entries and aliasIndex')
    }
    for (const [alias, id] of Object.entries(common.aliasIndex ?? {})) {
      if (!common.entries?.[id]) errors.push(`common alias "${alias}" targets missing "${id}"`)
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(`fastapi-codegen.registry v${registry.version}: OK`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
