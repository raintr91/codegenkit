#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadCodegenRegistry, REGISTRY_REL, resolveTagDefinition } from './lib/codegen-registry.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function main() {
  const registry = await loadCodegenRegistry(root)
  const errors = []
  const warnings = []

  console.log(`api-codegen.registry v${registry.version}`)
  console.log(`  path: ${REGISTRY_REL}`)
  console.log(`  gen tags: ${Object.keys(registry.genTags ?? {}).length}`)
  console.log(`  prefix rules: ${Object.keys(registry.prefixRules ?? {}).length}`)
  console.log(`  domain tags: ${Object.keys(registry.domainTags ?? {}).length}`)
  console.log(`  profiles: ${Object.keys(registry.profiles ?? {}).join(', ')}`)

  for (const [tag, def] of Object.entries(registry.genTags ?? {})) {
    if (!def.phase) warnings.push(`genTags.${tag}: missing phase`)
    if (def.phase === 'codegen' && !def.commandId && !def.note) {
      warnings.push(`genTags.${tag}: codegen tag without commandId`)
    }
  }

  for (const [alias, canonical] of Object.entries(registry.aliases ?? {})) {
    const resolved = resolveTagDefinition(canonical, registry)
    if (resolved.match === 'unknown') {
      errors.push(`aliases "${alias}" → "${canonical}" — target not in registry`)
    }
  }

  for (const warning of warnings) {
    console.warn(`  warn: ${warning}`)
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`  error: ${error}`)
    }
    process.exit(1)
  }

  console.log('  validate: OK')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
