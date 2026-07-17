#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadUnitTestRegistry, REGISTRY_REL } from './lib/unit-registry.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function main() {
  const { registry } = await loadUnitTestRegistry(root)
  const errors = []
  const warnings = []

  console.log(`api-unit-test.registry v${registry.version}`)
  console.log(`  path: ${REGISTRY_REL}`)
  console.log(`  patterns: ${Object.keys(registry.patterns ?? {}).length}`)
  console.log(`  commonBaselines: ${registry.commonBaselines?.app?.length ?? 0}`)

  for (const [id, pattern] of Object.entries(registry.patterns ?? {})) {
    if (!pattern.status) warnings.push(`patterns.${id}: missing status`)
    if (pattern.status === 'implemented' && !pattern.command && !pattern.template) {
      errors.push(`patterns.${id}: implemented but no command or template`)
    }
    if (pattern.fallbackTag && !String(pattern.fallbackTag).startsWith('#needs-unit-test:')) {
      warnings.push(`patterns.${id}: fallbackTag should start with #needs-unit-test:`)
    }
  }

  for (const [topic, entry] of Object.entries(registry.manualTopicMap ?? {})) {
    const patternId = typeof entry === 'string' ? entry : entry?.patternId
    if (!patternId) {
      errors.push(`manualTopicMap.${topic}: missing patternId`)
      continue
    }
    if (!registry.patterns?.[patternId]) {
      errors.push(`manualTopicMap.${topic} → unknown pattern [${patternId}]`)
    }
  }

  for (const warning of warnings) {
    console.warn(`  warn: ${warning}`)
  }

  if (errors.length) {
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
