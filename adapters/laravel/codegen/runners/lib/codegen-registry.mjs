import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const REGISTRY_REL = 'registries/codegen.registry.json'

/** @type {Record<string, unknown> | null} */
let cached = null

export async function loadCodegenRegistry(root = repoRoot) {
  if (cached) return cached
  const registryPath = path.join(root, REGISTRY_REL)
  const raw = JSON.parse(await readFile(registryPath, 'utf8'))
  cached = { ...raw, registryPath: REGISTRY_REL }
  return cached
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>} registry
 */
export function resolveTagDefinition(tag, registry) {
  const text = String(tag).trim()
  if (registry.domainTags?.[text]) {
    return { ...registry.domainTags[text], tag: text, match: 'exact-domain' }
  }
  if (registry.genTags?.[text]) {
    return { ...registry.genTags[text], tag: text, match: 'exact-gen' }
  }

  for (const [prefix, rule] of Object.entries(registry.prefixRules ?? {})) {
    if (text.startsWith(prefix)) {
      const suffix = text.slice(prefix.length)
      return { ...rule, tag: text, suffix, match: 'prefix', prefix }
    }
  }

  const alias = registry.aliases?.[text.toLowerCase()]
  if (alias) {
    return resolveTagDefinition(alias, registry)
  }

  return { tag: text, phase: 'unknown', match: 'unknown' }
}

/**
 * @param {string[]} tags
 * @param {Record<string, unknown>} registry
 */
export function validateTagsAgainstRegistry(tags, registry) {
  const warnings = []
  for (const tag of tags ?? []) {
    const def = resolveTagDefinition(tag, registry)
    if (def.match === 'unknown') {
      warnings.push(`Unknown tag "${tag}" — add to ${REGISTRY_REL} or fix typo`)
    }
  }
  return warnings
}
