import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const adapterRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

export function targetRoot() {
  const configured = process.env.CODEGENKIT_ROOT
  if (!configured) throw new Error('CODEGENKIT_ROOT is required for Laravel generation')
  return path.resolve(configured)
}

export function resolveLaravelProject() {
  const target = targetRoot()
  const candidates = [target, path.join(target, 'src')]
  const laravelRoot = candidates.find(
    (candidate) =>
      existsSync(path.join(candidate, 'artisan')) &&
      existsSync(path.join(candidate, 'composer.json')),
  )
  if (!laravelRoot) {
    throw new Error(
      `Laravel project not found under ${target}; expected artisan + composer.json at root or src/`,
    )
  }

  const composer = JSON.parse(
    readFileSync(path.join(laravelRoot, 'composer.json'), 'utf8'),
  )
  const packages = { ...(composer.require ?? {}), ...(composer['require-dev'] ?? {}) }
  const framework = packages['laravel/framework']
  if (!framework) throw new Error('Target composer.json does not require laravel/framework')
  if (!/(^|[^\d])12(?:\.|[^\d]|$)/.test(String(framework))) {
    throw new Error(
      `Laravel adapter profile modules-v1 requires Laravel 12 (found ${framework})`,
    )
  }
  if (!packages['nwidart/laravel-modules']) {
    throw new Error(
      'Laravel adapter profile modules-v1 requires nwidart/laravel-modules',
    )
  }

  return {
    targetRoot: target,
    laravelRoot,
    framework,
    profile: 'modules-v1',
  }
}

export function assertContained(root, candidate, label = 'path') {
  const base = path.resolve(root)
  const resolved = path.resolve(candidate)
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`${label} escapes target root: ${candidate}`)
  }
  return resolved
}
