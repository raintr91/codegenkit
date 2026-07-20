import path from 'node:path'
import { access } from 'node:fs/promises'

/**
 * Resolve contract:gen model entry file (read.schema or legacy .schema.ts).
 * @param {string} root workspace root
 * @param {string} entity kebab entity namespace
 */
export async function resolveModelPackagePath(root, entity) {
  const candidates = [
    `packages/models/src/${entity}/${entity}.read.schema.ts`,
    `packages/models/src/${entity}/${entity}.schema.ts`,
    `packages/models/src/${entity}/index.ts`
  ]

  for (const relativePath of candidates) {
    try {
      await access(path.join(root, relativePath))
      return relativePath
    } catch {
      /* try next */
    }
  }

  throw new Error(
    `Model package missing for ${entity} — run codegenkit contract-gen --spec <ir/spec.yaml> first`
  )
}
