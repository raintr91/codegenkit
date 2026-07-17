import {
  entityHasChainScope,
  entityHasRelationships
} from './workspace-tests.mjs'

/**
 * @param {ReturnType<typeof import('./plan.mjs').buildUnitContext>} ctx
 * @param {string|Record<string, unknown>|undefined} when
 */
export function matchesPatternWhen(ctx, when) {
  if (!when) {
    return true
  }

  if (typeof when === 'string') {
    return matchesLegacyWhen(ctx, when)
  }

  if (Array.isArray(when.any)) {
    return when.any.some((condition) => matchesCondition(ctx, condition))
  }

  if (Array.isArray(when.all)) {
    return when.all.every((condition) => matchesCondition(ctx, condition))
  }

  return matchesCondition(ctx, when)
}

/**
 * @param {ReturnType<typeof import('./plan.mjs').buildUnitContext>} ctx
 * @param {Record<string, unknown>} condition
 */
function matchesCondition(ctx, condition) {
  if (condition.manualAction) {
    return (ctx.manual.actions ?? []).includes(String(condition.manualAction))
  }

  if (condition.manualTest) {
    return (ctx.manual.tests ?? []).includes(String(condition.manualTest))
  }

  if (condition.manualService) {
    return (ctx.manual.services ?? []).includes(String(condition.manualService))
  }

  if (condition.entityScope === 'bySession') {
    return entityHasChainScope(ctx.spec, ctx.entity)
  }

  if (condition.hasRelationships === true) {
    return entityHasRelationships(ctx.spec, ctx.entity)
  }

  if (condition.hasModuleRequests === true) {
    return ctx.requestClasses.length > 0
  }

  if (condition.wire) {
    const wire = ctx.codegenManifest?.wire ?? ctx.spec.codegen?.wire ?? {}
    return wire[String(condition.wire)] === true
  }

  return false
}

/** @param {ReturnType<typeof import('./plan.mjs').buildUnitContext>} ctx @param {string} when */
function matchesLegacyWhen(ctx, when) {
  if (when.includes('manual-action:chain-scope') && ctx.manual.actions?.includes('chain-scope')) {
    return true
  }
  if (when.includes('entity.scope.bySession') && entityHasChainScope(ctx.spec, ctx.entity)) {
    return true
  }
  if (when.includes('relationships') && entityHasRelationships(ctx.spec, ctx.entity)) {
    return true
  }
  if (when.includes('manual-action:relationships') && ctx.manual.actions?.includes('relationships')) {
    return true
  }
  if (when.includes('module has Http/Requests')) {
    return ctx.requestClasses.length > 0
  }

  return false
}

/**
 * @param {Record<string, unknown>} registry
 * @param {string} topic
 */
export function resolvePatternIdForManualTopic(registry, topic) {
  const entry = registry.manualTopicMap?.[topic]
  if (!entry) {
    return null
  }

  if (typeof entry === 'string') {
    return entry
  }

  return entry.patternId ?? null
}
