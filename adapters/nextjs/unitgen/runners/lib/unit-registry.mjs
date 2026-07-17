export const REGISTRY_REL = 'registries/unit-test.registry.json'

/**
 * @param {string} root workspace root
 */
export async function loadUnitTestRegistry(root) {
  const { readFile } = await import('node:fs/promises')
  const path = await import('node:path')
  const registryPath = path.join(root, REGISTRY_REL)
  const raw = await readFile(registryPath, 'utf8')
  const registry = JSON.parse(raw)

  if (!registry.version || !registry.patterns) {
    throw new Error(`Invalid unit test registry: ${REGISTRY_REL}`)
  }

  return { registry, registryPath: REGISTRY_REL }
}

/**
 * @param {Record<string, unknown>} registry
 * @param {string} patternId
 */
export function getPattern(registry, patternId) {
  const pattern = registry.patterns?.[patternId]
  if (!pattern) {
    throw new Error(`Unknown unit test pattern [${patternId}]`)
  }
  return pattern
}

/**
 * @param {string} outputPattern e.g. tests/unit/models/{entity}/{entity}.schema.test.ts
 * @param {{ entity: string, entityPascal: string }} ctx
 */
export function resolveOutputPath(outputPattern, ctx) {
  return outputPattern
    .replaceAll('{entity}', ctx.entity)
    .replaceAll('{EntityPascal}', ctx.entityPascal)
    .replaceAll('{entityPascal}', ctx.entityCamel)
}

/**
 * @param {string} tag
 * @param {{ entity: string, entityPascal: string, entityCamel: string }} ctx
 */
export function expandTagTemplate(tag, ctx) {
  return tag
    .replaceAll('{entity}', ctx.entity)
    .replaceAll('{EntityPascal}', ctx.entityPascal)
    .replaceAll('{entityPascal}', ctx.entityCamel)
}
