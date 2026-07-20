import { accessSync } from 'node:fs'
import path from 'node:path'

import { toKebab } from './read-spec.mjs'

export function inferWireFromSpec(spec) {
  const wire = {
    search: false,
    detail: false,
    create: false,
    update: false,
    delete: false,
    'bulk-delete': false,
    selectItems: false,
    ...(spec.codegen?.wire ?? {})
  }

  for (const endpoint of spec.api?.endpoints ?? []) {
    const action = endpoint.action
    if (action && Object.prototype.hasOwnProperty.call(wire, action)) {
      wire[action] = true
    }
    if (action === 'list') {
      wire.search = true
    }
    if (action === 'custom' && /select/i.test(endpoint.path ?? '')) {
      wire.selectItems = true
    }
  }

  return wire
}

export function resolveWorkspacePaths(ctx, repoRoot) {
  const moduleKebab = toKebab(ctx.module)
  const entityKebab = toKebab(ctx.entity)
  const moduleRoot = path.join(repoRoot, 'server/src/modules', moduleKebab)
  const entityRoot = path.join(moduleRoot, entityKebab)

  return {
    moduleFile: path.join(moduleRoot, `${moduleKebab}.module.ts`),
    controller: path.join(entityRoot, `${entityKebab}.controller.ts`),
    resource: path.join(entityRoot, `${entityKebab}.resource.ts`),
    searchQuery: path.join(entityRoot, 'queries', `search-${entityKebab}.query.ts`),
    searchHandler: path.join(entityRoot, 'queries', `search-${entityKebab}.handler.ts`),
    entityOrm: path.join(entityRoot, `${entityKebab}.entity.ts`)
  }
}

function exists(filePath) {
  try {
    accessSync(filePath)
    return true
  } catch {
    return false
  }
}

export function analyzeWorkspace(ctx, spec, repoRoot) {
  const paths = resolveWorkspacePaths(ctx, repoRoot)
  const wire = inferWireFromSpec(spec)

  return {
    paths,
    wire,
    files: {
      module: exists(paths.moduleFile),
      controller: exists(paths.controller),
      resource: exists(paths.resource),
      searchQuery: exists(paths.searchQuery),
      searchHandler: exists(paths.searchHandler),
      entityOrm: exists(paths.entityOrm)
    }
  }
}
