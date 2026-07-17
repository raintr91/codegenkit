import { accessSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function exists(filePath) {
  try {
    accessSync(filePath)
    return true
  } catch {
    return false
  }
}

/** @param {{ module: string, entity: string, pathModel?: string }} ctx @param {string} repoRoot */
export function resolveUnitPaths(ctx, repoRoot = defaultRepoRoot) {
  const src = repoRoot
  const moduleRoot = path.join(src, 'Modules', ctx.module)

  return {
    moduleRoot,
    supportDir: path.join(moduleRoot, 'Tests/Support'),
    requestsDir: path.join(moduleRoot, 'Http/Requests'),
    controllerInvokeTest: path.join(
      moduleRoot,
      'Tests/Feature/Http/Controllers',
      `${ctx.entity}ControllerInvokeTest.php`
    ),
    controllerTest: path.join(moduleRoot, 'Tests/Feature/Http/Controllers', `${ctx.entity}ControllerTest.php`),
    actionTest: path.join(moduleRoot, 'Tests/Unit/Http/Actions', `${ctx.entity}ActionTest.php`),
    queryTest: path.join(moduleRoot, 'Tests/Unit/Http/Queries', `${ctx.entity}QueryTest.php`),
    resourceTest: path.join(moduleRoot, 'Tests/Unit/Http/Resources', `${ctx.entity}ResourceTest.php`),
    exercisesHooks: path.join(moduleRoot, 'Tests/Support/ExercisesRequestValidationHooks.php'),
    controllerInvoker: path.join(moduleRoot, 'Tests/Support/ControllerMethodInvoker.php')
  }
}

/**
 * @param {string} requestsDir
 * @param {string} module
 */
export function listModuleRequestClasses(requestsDir, module) {
  if (!exists(requestsDir)) return []

  const baseNames = new Set([`${module}Request`, `${module}SearchRequest`])

  return readdirSync(requestsDir)
    .filter((name) => name.endsWith('.php') && !baseNames.has(name.replace(/\.php$/, '')))
    .map((name) => name.replace(/\.php$/, ''))
    .sort()
}

/**
 * Infer module base request FQCN for validation hook helper.
 * @param {string} moduleRoot
 * @param {string} module
 */
export function inferModuleBaseRequest(moduleRoot, module) {
  const searchPath = path.join(moduleRoot, 'Http/Requests', `${module}SearchRequest.php`)
  const requestPath = path.join(moduleRoot, 'Http/Requests', `${module}Request.php`)

  if (exists(searchPath)) {
    return {
      fqcn: `Modules\\${module}\\Http\\Requests\\${module}SearchRequest`,
      className: `${module}SearchRequest`
    }
  }

  if (exists(requestPath)) {
    return {
      fqcn: `Modules\\${module}\\Http\\Requests\\${module}Request`,
      className: `${module}Request`
    }
  }

  return {
    fqcn: `App\\Http\\Requests\\SearchRequest`,
    className: 'SearchRequest'
  }
}

/** @param {object} spec */
export function collectRequirementIds(spec) {
  return (spec.requirements?.covered ?? []).map((id) => String(id)).filter(Boolean)
}

/** @param {object} spec @param {string} entity */
export function entityHasRelationships(spec, entity) {
  for (const mod of spec.modules ?? []) {
    for (const ent of mod.entities ?? []) {
      if (ent.name === entity && (ent.relationships ?? []).length > 0) {
        return true
      }
    }
  }
  return false
}

/** @param {object} spec @param {string} entity */
export function entityHasChainScope(spec, entity) {
  for (const mod of spec.modules ?? []) {
    for (const ent of mod.entities ?? []) {
      if (ent.name === entity && ent.scope?.bySession) {
        return true
      }
    }
  }
  return false
}

/**
 * Structural stubs already satisfied via api:gen / m:controller per-layer gen?
 * @param {Record<string, unknown>} manifest
 */
export function structuralTestsSatisfiedByCodegen(manifest) {
  if (!manifest) {
    return { satisfied: false, reason: null }
  }

  const execution = manifest.execution ?? []
  const run = execution.find((entry) => entry.id === 'module-test')
  if (run && ['OK', 'SKIPPED'].includes(String(run.status))) {
    return {
      satisfied: true,
      reason: `codegen.manifest execution: module-test ${run.status}`
    }
  }

  const skipped = manifest.skipped ?? []
  const skippedEntry = skipped.find((entry) => entry.id === 'module-test')
  if (skippedEntry) {
    return {
      satisfied: true,
      reason: `codegen.manifest skipped: module-test (${skippedEntry.reason ?? 'already exists'})`
    }
  }

  const tagPlan = manifest.tagPlan ?? []
  const tagEntry = tagPlan.find((entry) => entry.tag === '#gen:test-module' && entry.status === 'skipped')
  if (tagEntry) {
    return {
      satisfied: true,
      reason: 'codegen.manifest tagPlan: #gen:test-module skipped'
    }
  }

  return { satisfied: false, reason: null }
}

/**
 * Fallback when codegen.manifest lacks execution — match prod class → *Test.php pairs.
 * @param {{ module: string, entity: string }} ctx
 * @param {string} repoRoot
 */
export function structuralTestsSatisfiedByWorkspace(ctx, repoRoot = defaultRepoRoot) {
  const paths = resolveUnitPaths(ctx, repoRoot)
  const layers = [
    { prod: `Http/Controllers/${ctx.entity}Controller.php`, test: paths.controllerTest },
    { prod: `Http/Actions/${ctx.entity}Action.php`, test: paths.actionTest },
    { prod: `Http/Queries/${ctx.entity}Query.php`, test: paths.queryTest },
    { prod: `Http/Resources/${ctx.entity}Resource.php`, test: paths.resourceTest }
  ]

  let required = 0
  let present = 0

  for (const layer of layers) {
    const prodPath = path.join(paths.moduleRoot, layer.prod)
    if (!exists(prodPath)) {
      continue
    }

    required++
    if (exists(layer.test)) {
      present++
    }
  }

  if (exists(paths.requestsDir)) {
    const entityPrefix = `${ctx.entity}`
    for (const name of readdirSync(paths.requestsDir)) {
      if (!name.endsWith('.php')) {
        continue
      }

      const className = name.replace(/\.php$/, '')
      if (!className.startsWith(entityPrefix)) {
        continue
      }

      const testPath = path.join(paths.moduleRoot, 'Tests/Unit/Http/Requests', `${className}Test.php`)
      required++
      if (exists(testPath)) {
        present++
      }
    }
  }

  if (required > 0 && present === required) {
    return {
      satisfied: true,
      reason: `workspace: structural tests ${present}/${required} for ${ctx.entity}`
    }
  }

  return { satisfied: false, reason: null }
}

/**
 * Skip duplicate m:module-test when api:gen (or wizard) already produced stubs.
 * @param {ReturnType<typeof import('./plan.mjs').buildUnitContext>} ctx
 * @param {{ explicitGen?: boolean }} options
 */
export function shouldSkipModuleTestStub(ctx, options = {}) {
  if (ctx.phase === 'stub') {
    return { skip: false, reason: null }
  }

  if (options.explicitGen) {
    return { skip: false, reason: null }
  }

  const fromCodegen = structuralTestsSatisfiedByCodegen(ctx.codegenManifest)
  if (fromCodegen.satisfied) {
    return { skip: true, reason: fromCodegen.reason }
  }

  const fromWorkspace = structuralTestsSatisfiedByWorkspace(ctx, ctx.repoRoot)
  if (fromWorkspace.satisfied) {
    return { skip: true, reason: fromWorkspace.reason }
  }

  return { skip: false, reason: null }
}

/** @param {string} openapiPath */
export function readOpenApiComponentKeys(openapiPath) {
  if (!exists(openapiPath)) return []

  try {
    const raw = readFileSync(openapiPath, 'utf8')
    const keys = []
    const propMatch = raw.match(/properties:\s*\n((?:\s{6,}\w+:\s*\n?)+)/g)
    if (!propMatch) return keys
    for (const block of propMatch) {
      for (const line of block.split('\n')) {
        const m = line.match(/^\s{4,}(\w+):/)
        if (m) keys.push(m[1])
      }
    }
    return [...new Set(keys)]
  } catch {
    return []
  }
}
