import path from 'node:path'
import { access } from 'node:fs/promises'

import { toKebab, toPascal } from './read-spec.mjs'

const SCALAR_TS = {
  integer: 'number',
  int: 'number',
  number: 'number',
  float: 'number',
  boolean: 'boolean',
  datetime: 'Date',
  date: 'Date',
  string: 'string',
  text: 'string'
}

const SCALAR_COLUMN = {
  integer: 'int',
  int: 'int',
  number: 'int',
  float: 'float',
  boolean: 'boolean',
  datetime: 'timestamp',
  date: 'date',
  string: 'varchar',
  text: 'text'
}

function entityMatches(ctx, entityNode) {
  const name = entityNode?.name ?? ''
  return toKebab(name) === toKebab(ctx.entity) || toPascal(name) === toPascal(ctx.entity)
}

function resolveEntityNode(spec, ctx) {
  if (spec.entities?.length) {
    const entityNode =
      spec.entities.find((e) => entityMatches(ctx, e)) ?? spec.entities[0]
    return { moduleNode: null, entityNode }
  }

  const moduleNode =
    spec.modules?.find((m) => toKebab(m.name) === toKebab(ctx.module)) ?? spec.modules?.[0]
  const entityNode =
    moduleNode?.entities?.find((e) => entityMatches(ctx, e)) ?? moduleNode?.entities?.[0]
  return { moduleNode, entityNode }
}

function embedTsType(key) {
  if (key === 'id') return 'number'
  if (key.endsWith('_at')) return 'string | Date | null'
  return 'string | null'
}

function scalarTsType(field) {
  const base = SCALAR_TS[field.type] ?? 'string'
  if (field.nullable !== false && field.key !== 'id') return `${base} | null`
  return base
}

function buildResourceContext(entityNode) {
  const resourceScalars = []
  const resourceRelations = []

  for (const field of entityNode?.fields ?? []) {
    if (!field?.key || field.key === 'id') continue

    if (field.kind === 'relation') {
      const embedKeys = field.contract?.read?.embed ?? ['id']
      resourceRelations.push({
        key: field.key,
        embed: embedKeys.map((key) => ({ key, tsType: embedTsType(key) }))
      })
      continue
    }

    if (field.kind === 'fk') continue

    resourceScalars.push({
      key: field.key,
      tsType: scalarTsType(normalizeField(field) ?? { key: field.key, type: field.type ?? 'string' })
    })
  }

  return { resourceScalars, resourceRelations }
}

function normalizeField(field) {
  const key = field.key ?? field.name
  if (!key) return null
  return {
    key,
    type: field.type ?? 'string',
    readOnly: Boolean(field.readOnly ?? field.read_only),
    nullable: field.nullable !== false && key !== 'id'
  }
}

export function buildOrmContext(spec, ctx, repoRoot) {
  const { entityNode } = resolveEntityNode(spec, ctx)
  const tableName = entityNode?.table ?? `${toKebab(ctx.entity)}s`
  const rawFields = (entityNode?.fields ?? [])
    .filter((field) => field.kind !== 'relation' && field.kind !== 'fk')
    .map(normalizeField)
    .filter(Boolean)
  const rawRelations = [
    ...(entityNode?.relationships ?? []),
    ...(entityNode?.fields ?? [])
      .filter((field) => field.kind === 'relation')
      .map((field) => ({
        name: field.key,
        field: field.key,
        type: field.persistence?.type ?? 'hasMany',
        target: field.target ?? 'Entity',
        cardinality: field.cardinality ?? 'many',
        writable: field.contract?.write !== false
      }))
  ]
  const { resourceScalars, resourceRelations } = buildResourceContext(entityNode)

  const ormColumns = []
  const seen = new Set()

  for (const field of rawFields) {
    if (field.key === 'id') {
      ormColumns.push({
        key: 'id',
        property: 'id',
        tsType: 'number',
        decorators: ['@PrimaryGeneratedColumn()'],
        comment: null
      })
      seen.add('id')
      continue
    }

    const colType = SCALAR_COLUMN[field.type] ?? 'varchar'
    const tsType = SCALAR_TS[field.type] ?? 'string'
    const decorators = [`@Column({ type: '${colType}', nullable: ${field.nullable} })`]

    ormColumns.push({
      key: field.key,
      property: field.key,
      fieldType: field.type,
      tsType: field.nullable ? `${tsType} | null` : tsType,
      decorators,
      comment: field.readOnly ? 'read-only in contract' : null
    })
    seen.add(field.key)
  }

  if (!seen.has('id')) {
    ormColumns.unshift({
      key: 'id',
      property: 'id',
      tsType: 'number',
      decorators: ['@PrimaryGeneratedColumn()'],
      comment: 'default PK'
    })
  }

  if (!seen.has('created_at')) {
    ormColumns.push({
      key: 'created_at',
      property: 'created_at',
      fieldType: 'datetime',
      tsType: 'Date | null',
      decorators: ["@Column({ type: 'timestamp', nullable: true })"],
      comment: null
    })
  }

  if (!seen.has('updated_at')) {
    ormColumns.push({
      key: 'updated_at',
      property: 'updated_at',
      fieldType: 'datetime',
      tsType: 'Date | null',
      decorators: ["@Column({ type: 'timestamp', nullable: true })"],
      comment: null
    })
  }

  const ormRelations = rawRelations.map((rel) => ({
    field: rel.name ?? rel.field,
    type: rel.type ?? rel.persistence?.type ?? 'relation',
    target: rel.target ?? rel.targetEntity ?? 'Entity',
    writable: rel.writable !== false,
    cardinality: rel.cardinality ?? (rel.type === 'hasMany' ? 'many' : 'one')
  }))

  const prismaTypeMap = {
    integer: 'Int',
    int: 'Int',
    number: 'Int',
    float: 'Float',
    boolean: 'Boolean',
    datetime: 'DateTime',
    date: 'DateTime',
    string: 'String',
    text: 'String'
  }

  const prismaFields = ormColumns.map((col) => ({
    name: col.property,
    prismaType:
      col.property === 'id'
        ? 'Int'
        : (prismaTypeMap[col.fieldType] ?? 'String'),
    optional:
      col.property === 'id'
        ? ' @id @default(autoincrement())'
        : col.tsType.includes('null')
          ? '?'
          : ''
  }))

  const prismaRelations = ormRelations.map((rel) => {
    const isMany = rel.type === 'hasMany' || rel.cardinality === 'many'
    return {
      field: rel.field,
      target: rel.target,
      relationSuffix: isMany ? '[]' : '?'
    }
  })

  return {
    tableName,
    ormColumns,
    ormRelations,
    prismaFields,
    prismaRelations,
    resourceScalars,
    resourceRelations,
    relationshipsMetaImport: resolveRelationshipsMetaImport(ctx, repoRoot)
  }
}

function resolveRelationshipsMetaImport(ctx, repoRoot) {
  const entityKebab = toKebab(ctx.entity)
  const relative = `packages/models/src/${entityKebab}/${entityKebab}.relationships.meta.ts`
  const abs = path.join(repoRoot, relative)
  return access(abs).then(
    () => `@portal/models/${entityKebab}/${entityKebab}.relationships.meta`,
    () => null
  )
}

export async function enrichPlanContext(spec, ctx, repoRoot) {
  const orm = buildOrmContext(spec, ctx, repoRoot)
  const relationshipsMetaImport = await orm.relationshipsMetaImport
  return { ...ctx, ...orm, relationshipsMetaImport }
}
