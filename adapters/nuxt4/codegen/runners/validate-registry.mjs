#!/usr/bin/env node
import path from 'node:path'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  REGISTRY_REL,
  folderToPascalCase,
  loadDesignRegistry,
  lookupAlias
} from './lib/design-registry.mjs'

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
  const registry = await loadDesignRegistry(root)
  const errors = []
  const warnings = []

  console.log(`portal-design.registry v${registry.version} (${registry.canonicalSystem})`)
  console.log(`  path: ${REGISTRY_REL}`)
  console.log(`  shadcn components discovered: ${Object.keys(registry.components ?? {}).length}`)
  console.log(`  shells: ${Object.keys(registry.shells ?? {}).join(', ')}`)

  for (const [name, shell] of Object.entries(registry.shells ?? {})) {
    const portalPath = shell.portal?.path
    if (portalPath && shell.portal?.status === 'implemented') {
      const exists = await pathExists(portalPath)
      if (!exists) {
        errors.push(`shell ${name}: missing ${portalPath}`)
      }
    }
    if (portalPath?.endsWith('.vue') === false && shell.portal?.status === 'planned') {
      warnings.push(`shell ${name}: status planned (${portalPath})`)
    }
  }

  for (const [name, widget] of Object.entries(registry.fieldWidgets ?? {})) {
    const portal = widget.portal ?? {}
    const rel = portal.molecule
      ? `components/molecules/**/${portal.molecule.replace(/^Mo/, '')}.vue`
      : portal.ui
        ? `components/ui/${String(portal.ui).replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`
        : null
    if (portal.status === 'implemented' && portal.molecule) {
      const base = portal.molecule.replace(/^Mo/, '')
      const found = await findMolecule(root, base)
      if (!found) {
        errors.push(`fieldWidget ${name}: molecule ${portal.molecule} not found`)
      }
    }
    if (portal.status === 'planned') {
      warnings.push(`fieldWidget ${name}: planned (${portal.molecule ?? portal.ui ?? rel})`)
    }
  }

  for (const [alias, canonical] of Object.entries(registry.aliasIndex ?? {})) {
    const resolved =
      registry.shells?.[canonical] ||
      registry.components?.[canonical] ||
      registry.fieldWidgets?.[canonical] ||
      registry.detailRenders?.[canonical] ||
      lookupAlias(canonical, registry)
    if (!resolved && canonical !== 'MoFabButton' && canonical !== 'DataPageHeader') {
      warnings.push(`aliasIndex "${alias}" → "${canonical}" — target not verified in registry`)
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

async function findMolecule(root, baseName) {
  const { readdir } = await import('node:fs/promises')
  const moleculesDir = path.join(root, 'components/molecules')

  async function walk(dir) {
    let entries = []
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = await walk(entryPath)
        if (found) return found
      } else if (entry.isFile() && entry.name === `${baseName}.vue`) {
        return entryPath
      }
    }
    return null
  }

  return walk(moleculesDir)
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
