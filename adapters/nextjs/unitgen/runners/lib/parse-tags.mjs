const TAG_PREFIX = {
  genTest: '#gen:test-',
  needsUnit: '#needs-unit-test:',
  skipUnit: '#skip-unit-test:',
  testMock: '#test-mock:'
}

/** @param {string[]} tags */
export function parseUnitTags(tags = []) {
  const parsed = {
    gen: new Set(),
    skip: new Set(),
    needs: [],
    mocks: [],
    raw: tags
  }

  for (const tag of tags) {
    const text = String(tag).trim()
    if (text.startsWith(TAG_PREFIX.genTest)) {
      parsed.gen.add(text.slice(TAG_PREFIX.genTest.length).trim())
    } else if (text.startsWith(TAG_PREFIX.skipUnit)) {
      parsed.skip.add(text.slice(TAG_PREFIX.skipUnit.length).trim().toLowerCase())
    } else if (text.startsWith(TAG_PREFIX.needsUnit)) {
      parsed.needs.push(text)
    } else if (text.startsWith(TAG_PREFIX.testMock)) {
      parsed.mocks.push(text.slice(TAG_PREFIX.testMock.length).trim())
    }
  }

  return parsed
}

const LAYER_SKIP_ALIASES = {
  hook: ['composable', 'composable-list', 'composable-form'],
  composable: ['hook'],
  schema: ['models'],
  models: ['schema']
}

/**
 * @param {import('./parse-tags.mjs').ReturnType<typeof parseUnitTags>} unitTags
 * @param {string} layer e.g. models, schema
 */
export function isLayerSkipped(unitTags, layer) {
  const key = layer.toLowerCase()
  if (unitTags.skip.has(key) || unitTags.skip.has('all')) return true
  const aliases = LAYER_SKIP_ALIASES[key] ?? []
  return aliases.some((alias) => unitTags.skip.has(alias))
}

const GEN_TAG_ALIASES = {
  hook: ['composable', 'composable-list', 'composable-form'],
  composable: ['hook'],
  'composable-list': ['hook'],
  'composable-form': ['hook']
}

/**
 * @param {import('./parse-tags.mjs').ReturnType<typeof parseUnitTags>} unitTags
 * @param {string} genKey e.g. schema
 */
export function hasExplicitGenTag(unitTags, genKey) {
  if (unitTags.gen.has(genKey)) return true
  const aliases = GEN_TAG_ALIASES[genKey] ?? []
  return aliases.some((alias) => unitTags.gen.has(alias))
}
