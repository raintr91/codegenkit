#!/usr/bin/env node
import path from 'node:path'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { loadUnitTestRegistry, REGISTRY_REL } from './lib/unit-registry.mjs'
import { getTemplatesRoot } from './lib/render.mjs'

const root = path.resolve(process.env.CODEGENKIT_ROOT || process.cwd())

async function pathExists(relativePath) {
  try {
    await access(path.join(root, relativePath))
    return true
  } catch {
    return false
  }
}

async function main() {
  const { registry } = await loadUnitTestRegistry(root)
  const errors = []
  const warnings = []

  console.log(`portal-unit-test.registry v${registry.version}`)
  console.log(`  path: ${REGISTRY_REL}`)
  console.log(`  patterns: ${Object.keys(registry.patterns ?? {}).join(', ')}`)

  for (const [id, pattern] of Object.entries(registry.patterns ?? {})) {
    if (!pattern.template) {
      errors.push(`pattern ${id}: missing template`)
      continue
    }

    const templatePath = path.join(getTemplatesRoot(), pattern.template)
    const relTemplate = path.relative(root, templatePath)
    const exists = await pathExists(path.relative(root, templatePath))

    if (pattern.status === 'implemented' && !exists) {
      errors.push(`pattern ${id}: missing template ${relTemplate}`)
    }
    if (pattern.status === 'planned' && !exists) {
      warnings.push(`pattern ${id}: planned — template ${relTemplate} not found yet`)
    }
    if (!pattern.output && pattern.status === 'implemented') {
      errors.push(`pattern ${id}: missing output path pattern`)
    }
  }

  for (const [name, relPath] of Object.entries(registry.fixtures ?? {})) {
    const exists = await pathExists(relPath)
    if (!exists) {
      errors.push(`fixture ${name}: missing ${relPath}`)
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

  console.log('portal:unit-registry OK')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
