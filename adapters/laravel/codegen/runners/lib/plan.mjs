import { parseTags } from './parse-tags.mjs'
import { analyzeWorkspace } from './workspace-analysis.mjs'
import { resolveArtisanCommands, inferWireFromSpec } from './resolve-commands.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const ADD_ACTIONS = new Set(['search', 'detail', 'create', 'update', 'delete', 'bulk-delete'])

/**
 * @param {object} spec
 */
export function resolveCodegenContext(spec) {
  const codegen = spec.codegen ?? {}
  const primaryModule = spec.modules?.[0]
  const primaryEntity = primaryModule?.entities?.[0]

  const module = codegen.module ?? primaryModule?.name
  const entity = codegen.entity ?? primaryEntity?.name
  const pathModel = codegen.pathModel ?? primaryEntity?.mode ?? 'Platform'
  const sharedModel = codegen.sharedModel ?? true
  const profile = codegen.profile ?? 'crud-standard'
  const skip = new Set([...(codegen.skip ?? []), ...parseTags(spec.tags ?? []).skipGen])
  const tags = parseTags(spec.tags ?? [])

  return { module, entity, pathModel, sharedModel, profile, skip, tags, codegen }
}

/**
 * @param {object} spec
 */
function inferWireFromEndpoints(spec) {
  return inferWireFromSpec(spec)
}

/**
 * @param {object} spec
 * @param {{ repoRoot?: string, force?: boolean }} options
 */
export function buildCommandPlan(spec, options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot
  const ctx = resolveCodegenContext(spec)
  const manual = buildManualItems(spec, ctx)
  const analysis = analyzeWorkspace(ctx, spec, repoRoot)
  const resolved = resolveArtisanCommands(spec, ctx, analysis, {
    force: options.force,
    profile: ctx.profile,
    skip: ctx.skip,
    repoRoot
  })

  return {
    ctx,
    commands: resolved.commands,
    artisanLines: resolved.artisanLines,
    manual,
    skipped: resolved.skipped,
    existing: analysis.files,
    analysis,
    paths: analysis.paths
  }
}

/**
 * @param {object} spec
 * @param {object} ctx
 */
function buildManualItems(spec, ctx) {
  const manual = { actions: [], services: [], tests: [] }

  const hasRelationships = (spec.modules ?? []).some((m) =>
    (m.entities ?? []).some((e) => (e.relationships ?? []).length > 0)
  )
  if (hasRelationships || ctx.tags.manualActions.length > 0) {
    manual.actions.push(...ctx.tags.manualActions)
    if (hasRelationships && !manual.actions.includes('relationships')) {
      manual.actions.push('relationships')
    }
  }

  if ((spec.externalCalls ?? []).length > 0) {
    for (const call of spec.externalCalls) {
      manual.services.push(call.id ?? call.service ?? 'external')
    }
  }
  if ((spec.services ?? []).length > 0) {
    for (const svc of spec.services) {
      manual.services.push(svc.id ?? svc.class ?? 'cross-entity')
    }
  }
  manual.services.push(...ctx.tags.manualServices)
  manual.tests.push(...ctx.tags.manualTests)

  for (const endpoint of spec.api?.endpoints ?? []) {
    if (endpoint.action === 'custom') {
      manual.actions.push(endpoint.id)
    }
  }

  return manual
}

/**
 * @param {object} spec
 * @param {{ repoRoot?: string, force?: boolean }} options
 */
export function enrichSpecCodegen(spec, options = {}) {
  const plan = buildCommandPlan(spec, options)
  spec.codegen = {
    ...(spec.codegen ?? {}),
    module: plan.ctx.module,
    entity: plan.ctx.entity,
    pathModel: plan.ctx.pathModel,
    sharedModel: plan.ctx.sharedModel,
    profile: plan.ctx.profile,
    wire: { ...inferWireFromEndpoints(spec), ...(spec.codegen?.wire ?? {}) },
    skip: [...plan.ctx.skip],
    commands: plan.artisanLines
  }
  return spec
}
