import { readdir } from 'node:fs/promises'
import path from 'node:path'

import { toKebabCase } from './naming.mjs'

const WEB_MOLECULES = 'src/components/molecules'

/**
 * MoDataTable → mo-data-table.tsx
 * @param {string} moName
 */
function moleculeFileName(moName) {
  const base = moName.replace(/^Mo/, '')
  return `mo-${toKebabCase(base)}.tsx`
}

/**
 * Find existing molecule file for MoName under src/components/molecules.
 * @param {string} root
 * @param {string} moName e.g. MoStatusChip
 */
export async function findMoleculeComponent(root, moName) {
  const targetName = moleculeFileName(moName)
  const moleculesDir = path.join(root, WEB_MOLECULES)

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
        continue
      }
      if (entry.isFile() && entry.name === targetName) {
        return path.relative(root, entryPath).replace(/\\/g, '/')
      }
    }

    return null
  }

  return walk(moleculesDir)
}

/**
 * Default path for portal-gen component stub when molecule does not exist.
 * @param {string} moName
 */
export function defaultComponentStubPath(moName) {
  return `${WEB_MOLECULES}/custom/${moName}.tsx`
}

/**
 * @param {string} root
 * @param {string[]} componentNames
 */
export async function resolveComponentFiles(root, componentNames) {
  /** @type {Record<string, { exists: boolean, path: string | null, stubPath: string }>} */
  const map = {}

  for (const name of componentNames) {
    const existing = await findMoleculeComponent(root, name)
    const stubPath = defaultComponentStubPath(name)
    map[name] = {
      exists: Boolean(existing),
      path: existing,
      stubPath
    }
  }

  return map
}
