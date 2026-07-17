import { readFile, writeFile } from 'node:fs/promises'
import { parse, stringify } from 'yaml'

/**
 * Merge `#needs-unit-test:*` from unit-gen manifest into spec `tags:` (idempotent).
 * @param {string} specFile absolute path
 * @param {{ tag: string }[]} needsUnit
 */
export async function writeSpecTags(specFile, needsUnit = []) {
  const tagsToAdd = needsUnit
    .map((item) => item.tag)
    .filter((tag) => typeof tag === 'string' && tag.startsWith('#needs-unit-test:'))

  if (!tagsToAdd.length) {
    return { added: [], changed: false }
  }

  const raw = await readFile(specFile, 'utf8')
  const spec = parse(raw) ?? {}
  const existing = new Set((spec.tags ?? []).map((tag) => String(tag).trim()))
  const added = []

  for (const tag of tagsToAdd) {
    if (!existing.has(tag)) {
      existing.add(tag)
      added.push(tag)
    }
  }

  if (!added.length) {
    return { added: [], changed: false }
  }

  spec.tags = [...existing]
  await writeFile(specFile, stringify(spec, { lineWidth: 0 }))
  return { added, changed: true }
}
