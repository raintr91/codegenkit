import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export type AdapterId = 'nuxt4' | 'nextjs'

export function packageRoot(): string {
  return pkgRoot
}

export function packageVersion(): string {
  return (JSON.parse(readFileSync(path.join(pkgRoot, 'package.json'), 'utf8')) as { version?: string })
    .version ?? '0.0.0'
}

export function resolveProjectRoot(explicit?: string): string {
  const root = path.resolve(explicit ?? process.env.CODEGENKIT_ROOT ?? process.cwd())
  if (!existsSync(root)) throw new Error(`Codegenkit project root not found: ${root}`)
  return root
}

export function resolveAdapter(adapter?: string): AdapterId {
  const id = (adapter ?? process.env.CODEGENKIT_ADAPTER ?? 'nuxt4') as AdapterId
  if (id !== 'nuxt4' && id !== 'nextjs') throw new Error('--adapter must be nuxt4 | nextjs')
  const dir = path.join(pkgRoot, 'adapters', id)
  if (!existsSync(dir)) throw new Error(`Adapter missing: ${id}`)
  return id
}

export function adapterEngine(adapter: AdapterId, kind: 'codegen' | 'unitgen', script: string): string {
  return path.join(pkgRoot, 'adapters', adapter, kind, 'runners', script)
}
