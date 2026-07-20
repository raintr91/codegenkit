import path from 'node:path'

import { analyzeWorkspace, inferWireFromSpec } from './workspace-analysis.mjs'
import { enrichPlanContext } from './orm-fields.mjs'
import { toKebab, toPascal } from './read-spec.mjs'

const defaultRepoRoot = path.resolve(process.env.CODEGENKIT_ROOT ?? process.cwd())

export function resolveCodegenContext(spec) {
  const codegen = spec.codegen ?? {}
  const primaryModule = spec.modules?.[0]
  const flatEntity = spec.entities?.[0]
  const primaryEntity = primaryModule?.entities?.[0] ?? flatEntity

  return {
    module: codegen.module ?? primaryModule?.name ?? 'App',
    entity: codegen.entity ?? primaryEntity?.name ?? 'Entity',
    profile: codegen.profile ?? 'crud-standard',
    orm: codegen.orm ?? 'typeorm',
    skip: new Set(codegen.skip ?? []),
    wire: inferWireFromSpec(spec)
  }
}

export function buildFilePlan(spec, options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot
  const ctx = resolveCodegenContext(spec)
  const analysis = analyzeWorkspace(ctx, spec, repoRoot)
  const moduleKebab = toKebab(ctx.module)
  const entityKebab = toKebab(ctx.entity)
  const entityPascal = toPascal(ctx.entity)
  const modulePascal = toPascal(ctx.module)
  const files = []
  const skipped = []

  const add = (id, relativePath, template, layer) => {
    const abs = path.join(repoRoot, relativePath)
    if (!options.force && analysis.files[id]) {
      skipped.push({ id, relativePath, reason: 'exists' })
      return
    }
    files.push({ id, relativePath, template, layer })
  }

  const base = `server/src/modules/${moduleKebab}/${entityKebab}`
  const templateCtx = { ...ctx, moduleKebab, entityKebab, entityPascal, modulePascal, spec }

  add('module', `server/src/modules/${moduleKebab}/${moduleKebab}.module.ts`, 'module.module.ts.hbs', 'module')
  add('controller', `${base}/${entityKebab}.controller.ts`, 'entity.controller.ts.hbs', 'controller')
  add('resource', `${base}/${entityKebab}.resource.ts`, 'entity.resource.ts.hbs', 'resource')

  if (ctx.wire.search) {
    add('searchQuery', `${base}/queries/search-${entityKebab}.query.ts`, 'queries/search.query.ts.hbs', 'query')
    add(
      'searchHandler',
      `${base}/queries/search-${entityKebab}.handler.ts`,
      'queries/search.handler.ts.hbs',
      'handler'
    )
  }

  const commandsBase = `${base}/commands`
  if (ctx.wire.create) {
    add('createCommand', `${commandsBase}/create-${entityKebab}.command.ts`, 'commands/create.command.ts.hbs', 'command')
    add('createHandler', `${commandsBase}/create-${entityKebab}.handler.ts`, 'commands/create.handler.ts.hbs', 'handler')
  }
  if (ctx.wire.update) {
    add('updateCommand', `${commandsBase}/update-${entityKebab}.command.ts`, 'commands/update.command.ts.hbs', 'command')
    add('updateHandler', `${commandsBase}/update-${entityKebab}.handler.ts`, 'commands/update.handler.ts.hbs', 'handler')
  }
  if (ctx.wire.delete) {
    add('deleteCommand', `${commandsBase}/delete-${entityKebab}.command.ts`, 'commands/delete.command.ts.hbs', 'command')
    add('deleteHandler', `${commandsBase}/delete-${entityKebab}.handler.ts`, 'commands/delete.handler.ts.hbs', 'handler')
  }

  if (ctx.orm === 'prisma') {
    add('entityOrm', `${base}/${entityKebab}.entity.ts`, `orm/${ctx.orm}.entity.ts.hbs`, 'orm')
    add(
      'prismaModel',
      `server/prisma/models/${entityKebab}.prisma`,
      'orm/prisma.model.prisma.hbs',
      'orm'
    )
  } else if (ctx.orm === 'typeorm') {
    add('entityOrm', `${base}/${entityKebab}.entity.ts`, 'orm/typeorm.entity.ts.hbs', 'orm')
  }

  const searchEndpoint =
    spec.api?.endpoints?.find((e) => e.action === 'search') ??
    spec.api?.endpoints?.find((e) => e.action === 'list') ??
    spec.api?.endpoints?.find((e) => /search|list/i.test(e.path ?? ''))
  const rawPath = searchEndpoint?.path ?? `/${entityKebab}s`
  const searchPath = rawPath.replace(/^\//, '')

  return {
    ctx: { ...templateCtx, searchPath },
    files,
    skipped,
    analysis,
    artisanLines: files.map((f) => `nest-gen:${f.id} ${f.relativePath}`),
    spec
  }
}

export async function buildEnrichedPlan(spec, options = {}) {
  const plan = buildFilePlan(spec, options)
  const repoRoot = options.repoRoot ?? defaultRepoRoot
  plan.ctx = await enrichPlanContext(spec, plan.ctx, repoRoot)
  return plan
}

export function enrichSpecCodegen(spec, options = {}) {
  const plan = buildFilePlan(spec, options)
  spec.codegen = {
    ...(spec.codegen ?? {}),
    module: plan.ctx.module,
    entity: plan.ctx.entity,
    profile: plan.ctx.profile,
    orm: plan.ctx.orm,
    wire: plan.ctx.wire,
    commands: plan.artisanLines
  }
  return plan
}
