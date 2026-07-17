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

/**
 * @param {import('./parse-tags.mjs').ReturnType<typeof parseUnitTags>} unitTags
 * @param {string} layer e.g. models, schema
 */
export function isLayerSkipped(unitTags, layer) {
  const key = layer.toLowerCase()
  return unitTags.skip.has(key) || unitTags.skip.has('all')
}

/**
 * @param {import('./parse-tags.mjs').ReturnType<typeof parseUnitTags>} unitTags
 * @param {string} genKey e.g. schema
 */
export function hasExplicitGenTag(unitTags, genKey) {
  return unitTags.gen.has(genKey)
}
