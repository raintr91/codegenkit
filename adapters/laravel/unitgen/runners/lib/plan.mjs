import {
  hasExplicitGenTag,
  isLayerSkipped,
  parseUnitTags,
  patternGenKey
} from './parse-tags.mjs'
import {
  expandCommand,
  expandTagTemplate,
  getPattern,
  resolveOutputPath
} from './unit-registry.mjs'
import {
  collectRequirementIds,
  inferModuleBaseRequest,
  listModuleRequestClasses,
  resolveUnitPaths,
  shouldSkipModuleTestStub
} from './workspace-tests.mjs'
import { buildBehavioralContext } from './spec-extract.mjs'
import { matchesPatternWhen } from './when-eval.mjs'

/**
 * @param {object} spec
 * @param {string} specFile
 * @param {Record<string, unknown>} codegenManifest
 * @param {string} repoRoot
 * @param {{ phase?: string }} options
 */
export function buildUnitContext(spec, specFile, codegenManifest, repoRoot, options = {}) {
  const module = codegenManifest.module ?? spec.codegen?.module
  const entity = codegenManifest.entity ?? spec.codegen?.entity
  const profile = codegenManifest.profile ?? spec.codegen?.profile ?? 'crud-standard'

  if (!module || !entity) {
    throw new Error('unit-gen requires module + entity from codegen manifest or spec.codegen')
  }

  const tags = [
    ...(spec.tags ?? []),
    ...(codegenManifest.tags ?? []),
    ...(codegenManifest.manual?.tests?.map((t) => `#manual-test:${t}`) ?? [])
  ]
  const unitTags = parseUnitTags(tags)
  const paths = resolveUnitPaths({ module, entity, pathModel: codegenManifest.pathModel }, repoRoot)
  const baseRequest = inferModuleBaseRequest(paths.moduleRoot, module)
  const requestClasses = listModuleRequestClasses(paths.requestsDir, module)
  const behavioral = buildBehavioralContext(spec, specFile, module, entity)

  return {
    spec,
    specFile,
    feature: spec.feature?.id ?? null,
    title: spec.feature?.title ?? entity,
    module,
    entity,
    entityPascal: entity,
    profile,
    phase: options.phase ?? 'all',
    repoRoot,
    codegenManifest,
    unitTags,
    paths,
    moduleNamespace: `Modules\\${module}`,
    moduleBaseRequestFqcn: baseRequest.fqcn,
    moduleBaseRequestClass: baseRequest.className,
    moduleControllerFqcn: `Modules\\${module}\\Http\\Controllers\\${module}Controller`,
    requestClasses,
    requirementIds: collectRequirementIds(spec),
    manual: codegenManifest.manual ?? { actions: [], services: [], tests: [] },
    behavioral
  }
}

/**
 * @param {ReturnType<typeof buildUnitContext>} ctx
 * @param {Record<string, unknown>} registry
 */
export async function buildUnitPlan(ctx, registry) {
  const files = []
  const commands = []
  const needsUnit = []
  const skippedPatterns = []

  const phases = resolvePhases(ctx.phase, registry)

  for (const patternId of listPatternsForPhases(registry, phases)) {
    const pattern = getPattern(registry, patternId)
    appendPatternPlan(ctx, registry, patternId, pattern, {
      files,
      commands,
      needsUnit,
      skippedPatterns
    })
  }

  appendExplicitNeeds(ctx, needsUnit)

  return {
    files,
    commands,
    needsUnit: dedupeNeedsUnit(needsUnit),
    skippedPatterns
  }
}

/** @param {string} phaseOption @param {Record<string, unknown>} registry */
function resolvePhases(phaseOption, registry) {
  if (phaseOption === 'stub') return registry.defaults?.phaseStub ?? ['moduleTest.stub']
  if (phaseOption === 'enriched') return registry.defaults?.phaseEnriched ?? []
  if (phaseOption === 'behavioral') return registry.defaults?.phaseBehavioral ?? []
  return [
    ...(registry.defaults?.phaseStub ?? []),
    ...(registry.defaults?.phaseEnriched ?? []),
    ...(registry.defaults?.phaseBehavioral ?? [])
  ]
}

/** @param {Record<string, unknown>} registry @param {string[]} phases */
function listPatternsForPhases(registry, phases) {
  const ids = []
  const seen = new Set()

  for (const [id, pattern] of Object.entries(registry.patterns ?? {})) {
    if (!phases.includes(id) && !phases.includes(pattern.phase)) {
      continue
    }

    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    ids.push(id)
  }

  return ids
}

function hasExplicitGenForPattern(unitTags, patternId, pattern) {
  const keys = [patternGenKey(patternId), pattern.genTag].filter(Boolean)
  return keys.some((key) => hasExplicitGenTag(unitTags, key))
}

function appendPatternPlan(ctx, registry, patternId, pattern, bag) {
  const layer = pattern.layer ?? patternId.split('.')[0]

  if (isLayerSkipped(ctx.unitTags, layer)) {
    bag.skippedPatterns.push({ patternId, reason: `#skip-unit-test:${layer}` })
    return
  }

  if (pattern.profiles?.length && !pattern.profiles.includes(ctx.profile)) {
    return
  }

  const explicit = hasExplicitGenForPattern(ctx.unitTags, patternId, pattern)
  const inDefaultPhase = ctx.phase === 'all' || ctx.phase === pattern.phase
  const whenMatched = matchesPatternWhen(ctx, pattern.when)

  if (pattern.status !== 'implemented') {
    if (shouldEmitPlannedNeed(ctx, pattern, explicit, inDefaultPhase, whenMatched)) {
      bag.needsUnit.push(buildNeed(ctx, pattern, patternId, `pattern ${patternId} status=${pattern.status}`))
    }
    return
  }

  if (patternId === 'moduleTest.stub') {
    const explicit = hasExplicitGenForPattern(ctx.unitTags, patternId, pattern)
    const skipStub = shouldSkipModuleTestStub(ctx, { explicitGen: explicit })

    if (skipStub.skip) {
      bag.skippedPatterns.push({
        patternId,
        reason: skipStub.reason,
        artisan: expandCommand(pattern.command, ctx)
      })
      return
    }

    bag.commands.push({
      id: 'module-test-stub',
      patternId,
      layer,
      artisan: expandCommand(pattern.command, ctx),
      reqIds: ctx.requirementIds
    })
    return
  }

  if (!whenMatched) {
    return
  }

  if (patternId === 'request.validationHooks') {
    appendRequestHookFiles(ctx, pattern, patternId, bag)
    return
  }

  if (patternId === 'controller.invokeAll') {
    appendSingleFile(ctx, pattern, patternId, bag, {
      controllerFqcn: `Modules\\${ctx.module}\\Http\\Controllers\\${ctx.entity}Controller`,
      entityQueryFqcn: `Modules\\${ctx.module}\\Http\\Queries\\${ctx.entity}Query`,
      entityActionFqcn: `Modules\\${ctx.module}\\Http\\Actions\\${ctx.entity}Action`
    })
    return
  }

  if (pattern.phase === 'behavioral') {
    appendBehavioralFile(ctx, pattern, patternId, bag)
    return
  }

  appendSingleFile(ctx, pattern, patternId, bag, {})
}

function appendBehavioralFile(ctx, pattern, patternId, bag) {
  if (patternId === 'query.chainScope' && !ctx.behavioral.sessionScopeColumn) {
    return
  }

  if (patternId === 'action.relationshipSync' && !ctx.behavioral.relationshipNames.length) {
    return
  }

  if (patternId === 'resource.nestedRelations' && !ctx.behavioral.hasManyRelations.length) {
    return
  }

  const relativePath = resolveOutputPath(pattern.output, ctx)
  bag.files.push({
    patternId,
    layer: pattern.layer,
    template: pattern.template,
    relativePath,
    reqIds: ctx.requirementIds,
    context: { ...ctx.behavioral }
  })
}

function shouldEmitPlannedNeed(ctx, pattern, explicit, inDefaultPhase, whenMatched) {
  if (!whenMatched && pattern.when) {
    return false
  }
  if (explicit) {
    return true
  }
  if (pattern.phase === 'behavioral' && inDefaultPhase) {
    return true
  }
  if (ctx.phase === 'behavioral' || ctx.phase === 'all') {
    return true
  }
  return false
}

function appendRequestHookFiles(ctx, pattern, patternId, bag) {
  const classes = ctx.requestClasses.length
    ? ctx.requestClasses
    : [`${ctx.entity}SearchRequest`, `${ctx.entity}CreateRequest`]

  for (const requestClass of [...new Set(classes)]) {
    const relativePath = resolveOutputPath(pattern.output, { ...ctx, requestClass })
    bag.files.push({
      patternId,
      layer: pattern.layer,
      template: pattern.template,
      relativePath,
      reqIds: ctx.requirementIds,
      context: {
        requestClass,
        requestFqcn: `Modules\\${ctx.module}\\Http\\Requests\\${requestClass}`,
        targetRelativePath: `Modules/${ctx.module}/Http/Requests/${requestClass}.php`
      }
    })
  }
}

function appendSingleFile(ctx, pattern, patternId, bag, extraContext) {
  const relativePath = resolveOutputPath(pattern.output, ctx)
  bag.files.push({
    patternId,
    layer: pattern.layer,
    template: pattern.template,
    relativePath,
    reqIds: ctx.requirementIds,
    context: extraContext
  })
}

function buildNeed(ctx, pattern, patternId, reason) {
  const tag = expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:${pattern.layer}:${ctx.entity}`, ctx)
  return { tag, reason, patternId, layer: pattern.layer, reqIds: ctx.requirementIds }
}

function appendExplicitNeeds(ctx, needsUnit) {
  for (const tag of ctx.unitTags.needs) {
    if (!needsUnit.some((n) => n.tag === tag)) {
      needsUnit.push({ tag, reason: 'explicit in spec tags', reqIds: ctx.requirementIds })
    }
  }
}

/** @param {{ tag: string }[]} items */
function dedupeNeedsUnit(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (seen.has(item.tag)) return false
    seen.add(item.tag)
    return true
  })
}
