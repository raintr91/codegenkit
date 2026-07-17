import { readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

const commonEntrySchema = z.object({
  status: z.enum(['planned', 'implemented', 'deprecated']),
  tag: z.string().min(1),
  kind: z.string().min(1),
  path: z.string().min(1),
  symbol: z.string().min(1).optional(),
  summary: z.string().min(1),
  usedBy: z.array(z.string()),
  specRefs: z.array(z.string()),
  tests: z.string().min(1).optional(),
}).passthrough()

export const commonRegistrySchema = z.object({
  version: z.number().int().positive(),
  description: z.string().min(1).optional(),
  entries: z.record(z.string().min(1), commonEntrySchema),
  aliasIndex: z.record(z.string().min(1), z.string().min(1)),
}).passthrough()

export interface CommonRegistryValidation {
  path: string
  version: number
  entries: number
  aliases: number
}

export function validateCommonRegistry(
  projectRoot: string,
  explicitPath?: string,
): CommonRegistryValidation {
  const registryPath = path.resolve(
    explicitPath ?? path.join(projectRoot, 'registries', 'common.registry.json'),
  )
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(registryPath, 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Cannot read common registry at ${registryPath}: ${detail}`)
  }

  const parsed = commonRegistrySchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid common registry at ${registryPath}:\n${issues}`)
  }

  const errors: string[] = []
  for (const [alias, id] of Object.entries(parsed.data.aliasIndex)) {
    if (!parsed.data.entries[id]) {
      errors.push(`aliasIndex.${alias}: target "${id}" does not exist in entries`)
    }
  }
  if (errors.length) {
    throw new Error(`Invalid common registry at ${registryPath}:\n${errors.join('\n')}`)
  }

  return {
    path: registryPath,
    version: parsed.data.version,
    entries: Object.keys(parsed.data.entries).length,
    aliases: Object.keys(parsed.data.aliasIndex).length,
  }
}
