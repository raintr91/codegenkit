import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export type CodegenType = 'fe' | 'be' | 'fullstack'
export type FeAdapterId = 'nuxt4' | 'nextjs' | 'dotnet-line'
export type BeAdapterId = 'fastapi' | 'laravel' | 'dotnet-integration'
export type AdapterId = FeAdapterId | BeAdapterId

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

export function resolveType(type?: string): CodegenType {
  const value = type ?? process.env.CODEGENKIT_TYPE ?? 'fe'
  if (!['fe', 'be', 'fullstack'].includes(value)) {
    throw new Error('--type must be fe | be | fullstack (docs/tests are forbidden)')
  }
  return value as CodegenType
}

export function resolveFeAdapter(adapter?: string): FeAdapterId {
  const id = (adapter ??
    process.env.CODEGENKIT_FE_ADAPTER ??
    process.env.CODEGENKIT_ADAPTER ??
    'nuxt4') as FeAdapterId
  if (id !== 'nuxt4' && id !== 'nextjs' && id !== 'dotnet-line') {
    throw new Error('--fe-adapter/--adapter must be nuxt4 | nextjs | dotnet-line')
  }
  const dir = path.join(pkgRoot, 'adapters', id)
  if (!existsSync(dir)) throw new Error(`Adapter missing: ${id}`)
  return id
}

export function resolveBeAdapter(adapter?: string): BeAdapterId {
  const id = (adapter ??
    process.env.CODEGENKIT_BE_ADAPTER ??
    process.env.CODEGENKIT_ADAPTER ??
    'fastapi') as BeAdapterId
  if (id !== 'fastapi' && id !== 'laravel' && id !== 'dotnet-integration') {
    throw new Error('--be-adapter/--adapter must be fastapi | laravel | dotnet-integration')
  }
  const dir = path.join(pkgRoot, 'adapters', id)
  if (!existsSync(dir)) throw new Error(`Adapter missing: ${id}`)
  return id
}

/** Backward-compatible FE resolver. */
export function resolveAdapter(adapter?: string): FeAdapterId {
  return resolveFeAdapter(adapter)
}

export function adapterEngine(adapter: FeAdapterId, kind: 'codegen' | 'unitgen', script: string): string {
  return path.join(pkgRoot, 'adapters', adapter, kind, 'runners', script)
}
