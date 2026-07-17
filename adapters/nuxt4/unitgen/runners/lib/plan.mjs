import path from 'node:path'
import { access } from 'node:fs/promises'

import { buildCodegenContext } from '../../../codegen/runners/lib/plan.mjs'
import { findManifestLayerPath } from './read-codegen.mjs'
import { hasExplicitGenTag, isLayerSkipped, parseUnitTags } from './parse-tags.mjs'
import {
  expandTagTemplate,
  getPattern,
  resolveOutputPath
} from './unit-registry.mjs'

/**
 * @param {Record<string, unknown>} spec
 * @param {string} specFile
 * @param {Record<string, unknown>} codegenManifest
 * @param {{ phase?: string }} options
 */
export function buildUnitContext(spec, specFile, codegenManifest, options = {}) {
  const ctx = buildCodegenContext(spec, specFile)
  const unitTags = parseUnitTags([...(spec.tags ?? []), ...(codegenManifest.tags ?? [])])

  const failField = pickSchemaFailField(ctx.columns)
  const { requiredFormFields, validFormValues } = buildFormTestContext(ctx.formFields)
  const listRoutePath = String(ctx.route?.path ?? '').replace(/\/create$/, '') || '/'

  return {
    ...ctx,
    phase: options.phase ?? 'prototype',
    codegenManifest,
    unitTags,
    validRow: ctx.mockRowsPage1[0] ?? { id: 1, name: 'Sample' },
    failField,
    requiredFormFields,
    validFormValues,
    listRoutePath,
    requirementIds: (spec.requirements ?? []).map((r) => r.id).filter(Boolean)
  }
}

function buildFormTestContext(formFields = []) {
  const requiredFormFields = formFields.filter((field) => field.required !== false)
  const validFormValues = {}

  for (const field of formFields) {
    validFormValues[field.key] = field.type === 'number' ? 1 : `sample-${field.key}`
  }

  return { requiredFormFields, validFormValues }
}

function pickSchemaFailField(columns = []) {
  if (columns.some((c) => c.key === 'id')) return 'id'
  const first = columns[0]?.key
  return first ?? 'id'
}

function defaultLayersForProfile(registry, profile) {
  if (profile === 'create' || profile === 'edit') {
    return registry.defaults?.phaseCreate ?? ['schema', 'validation', 'composable']
  }
  return registry.defaults?.phasePrototype ?? []
}

/**
 * @param {ReturnType<typeof buildUnitContext>} ctx
 * @param {Record<string, unknown>} registry
 * @param {string} root
 */
export async function buildUnitFilePlan(ctx, registry, root) {
  const files = []
  const needsUnit = []
  const skippedPatterns = []

  await appendSchemaPlan(ctx, registry, files, needsUnit, skippedPatterns, root)
  await appendServiceSearchPlan(ctx, registry, files, needsUnit, skippedPatterns, root)
  await appendServiceExportPlan(ctx, registry, files, needsUnit, skippedPatterns, root)
  await appendComposableListPlan(ctx, registry, files, needsUnit, skippedPatterns, root)
  await appendValidationPlan(ctx, registry, files, needsUnit, skippedPatterns, root)
  await appendComposableFormPlan(ctx, registry, files, needsUnit, skippedPatterns, root)
  await appendServiceCreatePlan(ctx, registry, files, needsUnit, skippedPatterns, root)
  await appendWirePlan(ctx, registry, files, needsUnit, skippedPatterns, root)

  return { files, needsUnit, skippedPatterns }
}

async function appendSchemaPlan(ctx, registry, files, needsUnit, skippedPatterns, root) {
  const patternId = 'schema.parseListColumns'
  const pattern = registry.patterns?.[patternId]

  if (!pattern) return

  if (isLayerSkipped(ctx.unitTags, 'models') || isLayerSkipped(ctx.unitTags, 'schema')) {
    skippedPatterns.push({ patternId, reason: '#skip-unit-test' })
    return
  }

  const explicit = hasExplicitGenTag(ctx.unitTags, 'schema')
  const defaultPhase = registry.defaults?.phasePrototype ?? []
  const inDefault = defaultPhase.includes('schema')
  const profileOk = !pattern.profiles?.length || pattern.profiles.includes(ctx.profile)

  if (ctx.phase === 'wire' && !explicit) return

  if (!explicit && !(inDefault && profileOk && pattern.status === 'implemented')) {
    if (pattern.status !== 'implemented') {
      needsUnit.push({
        tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:models:${ctx.entity}`, ctx),
        reason: `pattern ${patternId} status=${pattern.status}`
      })
    }
    return
  }

  if (pattern.status !== 'implemented') {
    needsUnit.push({
      tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:models:${ctx.entity}`, ctx),
      reason: `pattern ${patternId} not implemented`
    })
    return
  }

  const modelPath = findManifestLayerPath(ctx.codegenManifest, 'models') ??
    `models/${ctx.entity}/${ctx.entity}.schema.ts`
  const absoluteModel = path.join(root, modelPath)

  try {
    await access(absoluteModel)
  } catch {
    throw new Error(`Model file missing: ${modelPath} — run portal:gen first`)
  }

  const relativePath = resolveOutputPath(pattern.output, ctx)

  files.push({
    layer: 'models',
    patternId,
    relativePath,
    template: pattern.template,
    reqIds: ctx.requirementIds
  })
}

function resolveServiceSearchPatternId(ctx, registry) {
  const method = String(ctx.listEndpoint?.method ?? 'GET').toUpperCase()
  const id = method === 'POST' ? 'service.searchPost' : 'service.searchGet'
  const pattern = registry.patterns?.[id]
  if (!pattern || pattern.status !== 'implemented') return null
  if (pattern.method && pattern.method !== method) return null
  return { patternId: id, pattern }
}

async function appendServiceSearchPlan(ctx, registry, files, needsUnit, skippedPatterns, root) {
  if (ctx.profile !== 'list') return

  if (isLayerSkipped(ctx.unitTags, 'service')) {
    skippedPatterns.push({ patternId: 'service.search', reason: '#skip-unit-test' })
    return
  }

  const resolved = resolveServiceSearchPatternId(ctx, registry)
  if (!resolved) {
    needsUnit.push({
      tag: expandTagTemplate('#needs-unit-test:service:{entity}', ctx),
      reason: 'no implemented service.search pattern for list method'
    })
    return
  }

  const { patternId, pattern } = resolved
  const explicit = hasExplicitGenTag(ctx.unitTags, 'service')
  const defaultPhase = registry.defaults?.phasePrototype ?? []
  const inDefault = defaultPhase.includes('service')

  if (ctx.phase === 'wire' && !explicit) return

  if (!explicit && !inDefault) return

  const servicePath =
    findManifestLayerPath(ctx.codegenManifest, 'service') ?? `services/${ctx.entity}.service.ts`
  const absoluteService = path.join(root, servicePath)

  try {
    await access(absoluteService)
  } catch {
    throw new Error(`Service file missing: ${servicePath} — run portal:gen first`)
  }

  if (!ctx.listEndpoint?.path) {
    needsUnit.push({
      tag: expandTagTemplate(pattern.fallbackTag ?? '#needs-unit-test:service:{entity}', ctx),
      reason: 'missing api.endpoints list path in spec'
    })
    return
  }

  const relativePath = resolveOutputPath(pattern.output, ctx)

  files.push({
    layer: 'service',
    patternId,
    relativePath,
    template: pattern.template,
    reqIds: ctx.requirementIds
  })
}

async function appendServiceExportPlan(ctx, registry, files, needsUnit, skippedPatterns, root) {
  const patternId = 'service.exportReport'
  const pattern = registry.patterns?.[patternId]
  if (!pattern || pattern.status !== 'implemented') return
  if (!ctx.exportEndpoint?.path) return
  if (ctx.profile !== 'list' && !pattern.profiles?.includes(ctx.profile)) return

  if (isLayerSkipped(ctx.unitTags, 'service') || isLayerSkipped(ctx.unitTags, 'service-export')) {
    skippedPatterns.push({ patternId, reason: '#skip-unit-test' })
    return
  }

  const explicit = hasExplicitGenTag(ctx.unitTags, 'service-export')
  const defaultPhase = registry.defaults?.phasePrototype ?? []
  const inDefault = defaultPhase.includes('service') || defaultPhase.includes('export')

  if (ctx.phase === 'wire' && !explicit) return

  if (!explicit && !inDefault) return

  const servicePath =
    findManifestLayerPath(ctx.codegenManifest, 'service') ?? `services/${ctx.entity}.service.ts`
  const absoluteService = path.join(root, servicePath)

  try {
    await access(absoluteService)
  } catch {
    throw new Error(`Service file missing: ${servicePath} — run portal:gen first`)
  }

  const relativePath = resolveOutputPath(
    pattern.output ?? `tests/unit/services/${ctx.entity}.service.export.test.ts`,
    ctx
  )

  files.push({
    layer: 'service',
    patternId,
    relativePath,
    template: pattern.template,
    reqIds: ctx.requirementIds
  })
}

async function appendComposableListPlan(ctx, registry, files, needsUnit, skippedPatterns, root) {
  const patternId = 'composable.useList'
  const pattern = registry.patterns?.[patternId]
  if (!pattern) return
  if (ctx.profile !== 'list') return

  if (isLayerSkipped(ctx.unitTags, 'composable') || isLayerSkipped(ctx.unitTags, 'composable-list')) {
    skippedPatterns.push({ patternId, reason: '#skip-unit-test' })
    return
  }

  const explicit = hasExplicitGenTag(ctx.unitTags, 'composable')
  const defaultPhase = registry.defaults?.phasePrototype ?? []
  const inDefault = defaultPhase.includes('composable')
  const profileOk = !pattern.profiles?.length || pattern.profiles.includes(ctx.profile)

  if (ctx.phase === 'wire' && !explicit) return

  if (!explicit && !(inDefault && profileOk && pattern.status === 'implemented')) {
    if (pattern.status !== 'implemented') {
      needsUnit.push({
        tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:composable:use${ctx.entityPascal}List`, ctx),
        reason: `pattern ${patternId} status=${pattern.status}`
      })
    }
    return
  }

  if (pattern.status !== 'implemented') {
    needsUnit.push({
      tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:composable:use${ctx.entityPascal}List`, ctx),
      reason: `pattern ${patternId} not implemented`
    })
    return
  }

  const composablePath =
    findManifestLayerPath(ctx.codegenManifest, 'composable') ??
    `composables/${ctx.entity}/use${ctx.entityPascal}List.ts`
  const absoluteComposable = path.join(root, composablePath)

  try {
    await access(absoluteComposable)
  } catch {
    throw new Error(`Composable file missing: ${composablePath} — run portal:gen first`)
  }

  const relativePath = resolveOutputPath(
    pattern.output ?? `tests/unit/composables/${ctx.entity}/use${ctx.entityPascal}List.test.ts`,
    ctx
  )

  files.push({
    layer: 'composable',
    patternId,
    relativePath,
    template: pattern.template,
    reqIds: ctx.requirementIds
  })
}

async function appendValidationPlan(ctx, registry, files, needsUnit, skippedPatterns, root) {
  const patternId = 'validation.createRequiredFields'
  const pattern = registry.patterns?.[patternId]
  if (!pattern) return
  if (ctx.profile !== 'create' && ctx.profile !== 'edit') return

  if (isLayerSkipped(ctx.unitTags, 'validation')) {
    skippedPatterns.push({ patternId, reason: '#skip-unit-test' })
    return
  }

  if (!ctx.formFields?.length) {
    needsUnit.push({
      tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:validation:${ctx.entity}`, ctx),
      reason: 'missing ui.form.fields in spec'
    })
    return
  }

  const explicit = hasExplicitGenTag(ctx.unitTags, 'validation')
  const defaultPhase = defaultLayersForProfile(registry, ctx.profile)
  const inDefault = defaultPhase.includes('validation')
  const profileOk = !pattern.profiles?.length || pattern.profiles.includes(ctx.profile)

  if (ctx.phase === 'wire' && !explicit) return

  if (!explicit && !(inDefault && profileOk && pattern.status === 'implemented')) {
    if (pattern.status !== 'implemented') {
      needsUnit.push({
        tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:validation:${ctx.entity}`, ctx),
        reason: `pattern ${patternId} status=${pattern.status}`
      })
    }
    return
  }

  if (pattern.status !== 'implemented') {
    needsUnit.push({
      tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:validation:${ctx.entity}`, ctx),
      reason: `pattern ${patternId} not implemented`
    })
    return
  }

  const validationPath =
    findManifestLayerPath(ctx.codegenManifest, 'validation') ??
    `validations/${ctx.entity}/schemas.ts`
  const absoluteValidation = path.join(root, validationPath)

  try {
    await access(absoluteValidation)
  } catch {
    throw new Error(`Validation file missing: ${validationPath} — run portal:gen first`)
  }

  const relativePath = resolveOutputPath(
    pattern.output ?? `tests/unit/validations/${ctx.entity}/schemas.test.ts`,
    ctx
  )

  files.push({
    layer: 'validations',
    patternId,
    relativePath,
    template: pattern.template,
    reqIds: ctx.requirementIds
  })
}

async function appendComposableFormPlan(ctx, registry, files, needsUnit, skippedPatterns, root) {
  const patternId = 'composable.useForm'
  const pattern = registry.patterns?.[patternId]
  if (!pattern) return
  if (ctx.profile !== 'create' && ctx.profile !== 'edit') return

  if (isLayerSkipped(ctx.unitTags, 'composable') || isLayerSkipped(ctx.unitTags, 'composable-form')) {
    skippedPatterns.push({ patternId, reason: '#skip-unit-test' })
    return
  }

  const explicit = hasExplicitGenTag(ctx.unitTags, 'composable-form') || hasExplicitGenTag(ctx.unitTags, 'composable')
  const defaultPhase = defaultLayersForProfile(registry, ctx.profile)
  const inDefault = defaultPhase.includes('composable')
  const profileOk = !pattern.profiles?.length || pattern.profiles.includes(ctx.profile)

  if (ctx.phase === 'wire' && !explicit) return

  if (!explicit && !(inDefault && profileOk && pattern.status === 'implemented')) {
    if (pattern.status !== 'implemented') {
      needsUnit.push({
        tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:composable:use${ctx.entityPascal}Form`, ctx),
        reason: `pattern ${patternId} status=${pattern.status}`
      })
    }
    return
  }

  if (pattern.status !== 'implemented') {
    needsUnit.push({
      tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:composable:use${ctx.entityPascal}Form`, ctx),
      reason: `pattern ${patternId} not implemented`
    })
    return
  }

  const composablePath =
    findManifestLayerPath(ctx.codegenManifest, 'composable') ??
    `composables/${ctx.entity}/use${ctx.entityPascal}Form.ts`
  const absoluteComposable = path.join(root, composablePath)

  try {
    await access(absoluteComposable)
  } catch {
    throw new Error(`Composable file missing: ${composablePath} — run portal:gen first`)
  }

  const relativePath = resolveOutputPath(
    pattern.output ?? `tests/unit/composables/${ctx.entity}/use${ctx.entityPascal}Form.test.ts`,
    ctx
  )

  files.push({
    layer: 'composable',
    patternId,
    relativePath,
    template: pattern.template,
    reqIds: ctx.requirementIds
  })
}

async function appendServiceCreatePlan(ctx, registry, files, needsUnit, skippedPatterns, root) {
  const patternId = 'service.create'
  const pattern = registry.patterns?.[patternId]
  if (!pattern || pattern.status !== 'implemented') return
  if (ctx.profile !== 'create' && ctx.profile !== 'edit') return

  if (isLayerSkipped(ctx.unitTags, 'service') || isLayerSkipped(ctx.unitTags, 'service-create')) {
    skippedPatterns.push({ patternId, reason: '#skip-unit-test' })
    return
  }

  if (!ctx.createEndpoint?.path) {
    needsUnit.push({
      tag: expandTagTemplate(pattern.fallbackTag ?? '#needs-unit-test:service-create:{entity}', ctx),
      reason: 'missing api.endpoints create path in spec'
    })
    return
  }

  const explicit =
    hasExplicitGenTag(ctx.unitTags, 'service-create') || hasExplicitGenTag(ctx.unitTags, 'service')
  const defaultPhase = defaultLayersForProfile(registry, ctx.profile)
  const inDefault = defaultPhase.includes('service')

  if (ctx.phase === 'wire' && !explicit) return

  if (!explicit && !inDefault) return

  const servicePath =
    findManifestLayerPath(ctx.codegenManifest, 'service') ?? `services/${ctx.entity}.service.ts`
  const absoluteService = path.join(root, servicePath)

  try {
    await access(absoluteService)
  } catch {
    throw new Error(`Service file missing: ${servicePath} — run portal:gen first`)
  }

  const relativePath = resolveOutputPath(
    pattern.output ?? `tests/unit/services/${ctx.entity}.service.create.test.ts`,
    ctx
  )

  files.push({
    layer: 'service',
    patternId,
    relativePath,
    template: pattern.template,
    reqIds: ctx.requirementIds
  })
}

async function appendWirePlan(ctx, registry, files, needsUnit, skippedPatterns, root) {
  if (ctx.phase !== 'wire') return

  const patternId = 'service.wireDelta'
  const pattern = registry.patterns?.[patternId]
  if (!pattern || pattern.status !== 'implemented') return

  if (isLayerSkipped(ctx.unitTags, 'service') || isLayerSkipped(ctx.unitTags, 'wire')) {
    skippedPatterns.push({ patternId, reason: '#skip-unit-test' })
    return
  }

  const defaultPhase = registry.defaults?.phaseWire ?? []
  const explicit = hasExplicitGenTag(ctx.unitTags, 'wire')
  if (!explicit && !defaultPhase.includes('service')) return

  const servicePath =
    findManifestLayerPath(ctx.codegenManifest, 'service') ?? `services/${ctx.entity}.service.ts`
  const absoluteService = path.join(root, servicePath)

  try {
    await access(absoluteService)
  } catch {
    throw new Error(`Service file missing: ${servicePath} — run portal:gen first`)
  }

  const relativePath = resolveOutputPath(
    pattern.output ?? `tests/unit/services/${ctx.entity}.service.wire.test.ts`,
    ctx
  )

  files.push({
    layer: 'service',
    patternId,
    relativePath,
    template: pattern.template,
    reqIds: ctx.requirementIds
  })
}

/**
 * Collect planned patterns still on registry as planned (for manifest needsUnit).
 * @param {ReturnType<typeof buildUnitContext>} ctx
 * @param {Record<string, unknown>} registry
 */
export function collectPlannedPatternTags(ctx, registry) {
  const items = []

  for (const [patternId, pattern] of Object.entries(registry.patterns ?? {})) {
    if (pattern.status !== 'planned') continue
    if (pattern.profiles?.length && !pattern.profiles.includes(ctx.profile)) continue
    if (patternId === 'schema.parseListColumns') continue
    if (patternId.startsWith('service.search')) continue
    if (patternId === 'service.exportReport') continue
    if (patternId === 'composable.useList') continue
    if (patternId === 'validation.createRequiredFields') continue
    if (patternId === 'composable.useForm') continue
    if (patternId === 'service.create') continue
    if (patternId === 'service.wireDelta') continue

    items.push({
      tag: expandTagTemplate(pattern.fallbackTag ?? `#needs-unit-test:${pattern.layer}:${ctx.entity}`, ctx),
      reason: `pattern ${patternId} planned — promote registry after /unit`
    })
  }

  return items
}
