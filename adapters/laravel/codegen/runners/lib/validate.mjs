import { parseTags } from './parse-tags.mjs'
import { validateTagsAgainstRegistry } from './codegen-registry.mjs'
import { resolveCodegenContext } from './plan.mjs'

/**
 * @param {object} spec
 * @param {{ requireApproved?: boolean, registry?: Record<string, unknown> }} options
 */
export function validateSpec(spec, options = {}) {
  const errors = []
  const warnings = []
  const ctx = resolveCodegenContext(spec)
  const tags = parseTags(spec.tags ?? [])

  if (!ctx.module) errors.push('Missing codegen.module (or modules[0].name)')
  if (!ctx.entity) errors.push('Missing codegen.entity (or modules[0].entities[0].name)')
  if (!ctx.pathModel) errors.push('Missing codegen.pathModel (Platform|Tenant)')
  const className = /^[A-Z][A-Za-z0-9]*$/
  if (ctx.module && !className.test(ctx.module)) {
    errors.push(`Invalid codegen.module "${ctx.module}" — expected a PHP class segment`)
  }
  if (ctx.entity && !className.test(ctx.entity)) {
    errors.push(`Invalid codegen.entity "${ctx.entity}" — expected a PHP class segment`)
  }
  if (ctx.pathModel && !className.test(ctx.pathModel)) {
    errors.push(`Invalid codegen.pathModel "${ctx.pathModel}"`)
  }

  const approval = spec.approval?.status
  if (options.requireApproved && approval !== 'approved') {
    errors.push(`approval.status must be "approved" (current: ${approval ?? 'missing'})`)
  } else if (!approval) {
    warnings.push('approval.status not set — grill should set draft|reviewed|approved')
  }

  const endpoints = spec.api?.endpoints ?? []
  if (endpoints.length === 0) {
    errors.push('api.endpoints is empty')
  }

  for (const endpoint of endpoints) {
    if (!endpoint.action) {
      errors.push(`Endpoint ${endpoint.id ?? endpoint.path} missing action (search|detail|create|update|delete|select-items|setting|custom)`)
    }
    if (endpoint.action === 'setting' && !endpoint.setting?.relation) {
      errors.push(`Endpoint ${endpoint.id} action=setting requires setting.relation and setting.method`)
    }
  }

  if (tags.domain.includes('call-external') || tags.raw.includes('#call-external')) {
    if (!(spec.externalCalls ?? []).length) {
      errors.push('#call-external tag requires externalCalls[] block')
    }
  }

  if (tags.domain.includes('cross-entity-service') || tags.raw.includes('#cross-entity-service')) {
    if (!(spec.services ?? []).length) {
      errors.push('#cross-entity-service tag requires services[] block')
    }
  }

  const openQuestions = spec.openQuestions ?? []
  if (openQuestions.length > 0) {
    warnings.push(`${openQuestions.length} openQuestions remain — resolve or accept before /api-code`)
  }

  const plan = spec.codegen?.commands ?? []
  if (plan.length === 0) {
    warnings.push('codegen.commands empty — run api:gen:dry --write-spec after grill to populate')
  }

  if (options.registry) {
    warnings.push(...validateTagsAgainstRegistry(spec.tags ?? [], options.registry))
  }

  return { ok: errors.length === 0, errors, warnings, ctx }
}
