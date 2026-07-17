import { loadCodegenRegistry, resolveTagDefinition } from './codegen-registry.mjs'

/**
 * @param {object} spec
 * @param {{ ctx: object, commands: object[], artisanLines: string[], manual: object }} plan
 * @param {Record<string, unknown>} registry
 */
export function buildTagPlan(spec, plan, registry) {
  const entries = []
  const commandById = Object.fromEntries(plan.commands.map((c) => [c.id, c]))
  const skippedById = Object.fromEntries((plan.skipped ?? []).map((s) => [s.id, s]))
  const seen = new Set()

  for (const tag of spec.tags ?? []) {
    if (seen.has(tag)) continue
    seen.add(tag)

    const def = resolveTagDefinition(tag, registry)
    const entry = {
      tag,
      phase: def.phase ?? 'unknown',
      layer: def.layer ?? null,
      owner: def.owner ?? (def.phase === 'codegen' ? 'script' : def.phase === 'handoff' ? 'agent' : null),
      match: def.match,
      commandId: resolveCommandId(tag, def, plan),
      artisan: null,
      handoffTopic: null,
      extract: def.extract ?? null,
      status: 'pending'
    }

    if (entry.commandId && commandById[entry.commandId]) {
      entry.artisan = commandById[entry.commandId].artisan
      entry.status = 'planned'
    } else if (entry.commandId && skippedById[entry.commandId]) {
      entry.artisan = skippedById[entry.commandId].artisan
      entry.status = 'skipped'
    } else if (def.phase === 'handoff' || tag.startsWith('#manual-')) {
      entry.handoffTopic = def.suffix ?? (tag.split(':').slice(1).join(':') || 'general')
      entry.status = 'handoff'
    } else if (def.phase === 'spec') {
      entry.status = 'spec-only'
    } else if (def.layer === 'skip') {
      entry.status = 'skipped'
      entry.handoffTopic = def.suffix
    } else if (def.phase === 'codegen' && !entry.commandId) {
      entry.status = 'skipped'
    }

    entries.push(entry)
  }

  for (const cmd of plan.commands) {
    if (!entries.some((e) => e.commandId === cmd.id)) {
      entries.push({
        tag: `(command:${cmd.id})`,
        phase: 'codegen',
        layer: cmd.id,
        owner: 'script',
        match: 'inferred',
        commandId: cmd.id,
        artisan: cmd.artisan,
        description: cmd.description,
        handoffTopic: null,
        extract: 'codegen.md',
        status: 'planned'
      })
    }
  }

  for (const topic of [...new Set(plan.manual.actions)]) {
    if (!entries.some((e) => e.handoffTopic === topic && e.phase === 'handoff')) {
      entries.push({
        tag: `#manual-action:${topic}`,
        phase: 'handoff',
        layer: 'action',
        owner: 'agent',
        match: 'inferred',
        commandId: null,
        artisan: null,
        handoffTopic: topic,
        extract: 'entity-relationship.md',
        status: 'handoff'
      })
    }
  }

  for (const id of [...new Set(plan.manual.services)]) {
    if (!entries.some((e) => e.handoffTopic === id && e.layer === 'service')) {
      entries.push({
        tag: `#manual-service:${id}`,
        phase: 'handoff',
        layer: 'service',
        owner: 'agent',
        match: 'inferred',
        commandId: null,
        artisan: null,
        handoffTopic: id,
        extract: 'call-external.md',
        status: 'handoff'
      })
    }
  }

  for (const id of [...new Set(plan.manual.tests)]) {
    entries.push({
      tag: `#manual-test:${id}`,
      phase: 'handoff',
      layer: 'tests',
      owner: 'unit',
      match: 'inferred',
      commandId: null,
      artisan: null,
      handoffTopic: id,
      extract: 'unit-coverage.md',
      status: 'handoff'
    })
  }

  return entries
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>} def
 * @param {{ commands: object[] }} plan
 */
function resolveCommandId(tag, def, plan) {
  if (def.commandId) return def.commandId

  if (tag.startsWith('#gen:action-')) {
    const action = tag.slice('#gen:action-'.length)
    const found = plan.commands.find((c) => c.id === `action-${action}` || c.artisan?.includes(` ${action}`))
    return found?.id ?? null
  }

  if (tag === '#gen:crud') return 'controller-wizard'
  if (tag === '#gen:module') return 'module'
  if (tag === '#gen:model-platform' || tag === '#gen:model-tenant') return 'model'
  if (tag === '#gen:test-module') return 'module-test'
  if (tag === '#gen:select-items') {
    return plan.commands.find((c) => c.id?.startsWith('select-items'))?.id ?? null
  }

  return null
}

/**
 * @param {object} spec
 * @param {{ ctx: object, commands: object[], artisanLines: string[], manual: object }} plan
 */
export async function buildTagPlanWithRegistry(spec, plan) {
  const registry = await loadCodegenRegistry()
  return { registry, tagPlan: buildTagPlan(spec, plan, registry) }
}
