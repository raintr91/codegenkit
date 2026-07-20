import path from 'node:path'

import { fieldInScope } from './field-zod.mjs'
import { resolveEntityKebab, toPascalCase } from './naming.mjs'

function inferFieldsFromColumns(spec) {
  const columns = spec.ui?.columns ?? []
  if (columns.length === 0) return []

  return columns.map((column) => {
    const key = column.key ?? column.name
    if (!key) return null

    if (key === 'managers' || column.type === 'relation') {
      return {
        key,
        kind: 'relation',
        cardinality: 'many',
        target: column.target ?? 'User',
        scopes: ['response'],
        contract: {
          read: { embed: ['id', 'full_name'], includeOn: ['list'] }
        },
        persistence: { type: 'hasMany', orm: 'typeorm' }
      }
    }

    return {
      key,
      kind: 'scalar',
      type: column.type === 'number' ? 'number' : 'string',
      scopes: ['response', 'form']
    }
  }).filter(Boolean)
}

function normalizeEntities(spec) {
  const entities = spec.entities ?? []
  if (entities.length > 0) {
    return entities.map((entity) => ({
      ...entity,
      fields: entity.fields ?? []
    }))
  }

  const entityName = toPascalCase(spec.codegen?.entity ?? 'entity')
  return [{
    name: entityName,
    table: spec.codegen?.module ?? `${entityName.toLowerCase()}s`,
    fields: inferFieldsFromColumns(spec)
  }]
}

export function deriveRelationships(entity) {
  return (entity.fields ?? [])
    .filter((f) => f.kind === 'relation' || f.kind === 'fk')
    .map((field) => ({
      entity: entity.name,
      field: field.key,
      kind: field.kind,
      type: field.persistence?.type ?? (field.kind === 'fk' ? 'belongsTo' : 'hasMany'),
      target: field.target,
      cardinality: field.cardinality ?? 'one',
      fkField: field.persistence?.fkField ?? null,
      pivot: field.persistence?.pivot ?? null,
      orm: field.persistence?.orm ?? 'typeorm',
      writable: Boolean(field.contract?.write),
      readEmbed: field.contract?.read?.embed ?? []
    }))
}

export function buildContractPlan(spec, specPath) {
  const entities = normalizeEntities(spec)
  const files = []

  for (const entity of entities) {
    const entityKebab = resolveEntityKebab(entity, spec.codegen)
    const entityPascal = toPascalCase(entity.name ?? entityKebab)

    const readFields = (entity.fields ?? []).filter((f) => {
      if (f.kind === 'fk') return fieldInScope(f, 'be') || fieldInScope(f, 'persistence')
      return fieldInScope(f, 'response') || !f.scopes
    })

    const writeFields = (entity.fields ?? []).filter((f) => {
      if (f.kind === 'relation') return f.contract?.write
      if (f.kind === 'fk') return fieldInScope(f, 'form')
      return fieldInScope(f, 'form') || (!f.scopes && f.kind !== 'relation')
    })

    files.push({
      layer: 'models',
      relativePath: `packages/models/src/${entityKebab}/${entityKebab}.read.schema.ts`,
      template: 'read.schema.ts.hbs',
      context: { entityKebab, entityPascal, fields: readFields, mode: 'read' }
    })

    if (writeFields.length > 0) {
      files.push({
        layer: 'models',
        relativePath: `packages/models/src/${entityKebab}/${entityKebab}.write.schema.ts`,
        template: 'write.schema.ts.hbs',
        context: { entityKebab, entityPascal, fields: writeFields, mode: 'write' }
      })
    }

    files.push({
      layer: 'models',
      relativePath: `packages/models/src/${entityKebab}/${entityKebab}.types.ts`,
      template: 'types.ts.hbs',
      context: { entityKebab, entityPascal, hasWrite: writeFields.length > 0 }
    })

    const relationships = deriveRelationships(entity)

    files.push({
      layer: 'models',
      relativePath: `packages/models/src/${entityKebab}/index.ts`,
      template: 'index.ts.hbs',
      context: {
        entityKebab,
        entityPascal,
        hasWrite: writeFields.length > 0,
        relationships: relationships.length > 0
      }
    })
    if (relationships.length > 0) {
      files.push({
        layer: 'meta',
        relativePath: `packages/models/src/${entityKebab}/${entityKebab}.relationships.meta.ts`,
        template: 'relationships.meta.ts.hbs',
        context: { entityKebab, entityPascal, relationships }
      })
    }
  }

  const functionDir = specPath.includes(`${path.sep}ir${path.sep}`)
    ? path.dirname(path.dirname(specPath))
    : path.dirname(specPath)

  return {
    entities,
    files,
    manifestPath: path.join(functionDir, 'generated', 'contract.manifest.json'),
    handoffPath: path.join(functionDir, 'generated', 'CONTRACT-HANDOFF.md')
  }
}
