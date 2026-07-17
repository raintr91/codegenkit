import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import YAML from 'yaml'

/** @param {string} specFile */
export function resolveOpenApiPath(specFile) {
  const candidate = path.join(path.dirname(specFile), '02-openapi.yaml')
  return existsSync(candidate) ? candidate : null
}

/** @param {object} spec @param {string} entity */
export function findEntityInSpec(spec, entity) {
  for (const mod of spec.modules ?? []) {
    for (const ent of mod.entities ?? []) {
      if (ent.name === entity) {
        return { module: mod.name, entity: ent }
      }
    }
  }

  return null
}

/** @param {object} spec @param {string} entity */
export function extractSearchRequestRuleKeys(spec, entity) {
  const fromRequests = []

  for (const [name, def] of Object.entries(spec.requests ?? {})) {
    if (!name.includes('SearchRequest') && !name.toLowerCase().includes(entity.toLowerCase())) {
      continue
    }

    for (const field of def.fields ?? []) {
      if (field?.name) {
        fromRequests.push(String(field.name))
      }
    }
  }

  if (fromRequests.length) {
    return [...new Set(fromRequests)]
  }

  return ['page', 'per_page', 'order_by', 'sorted_by']
}

/** @param {object} spec */
export function extractPerPageDefault(spec) {
  for (const endpoint of spec.api?.endpoints ?? []) {
    if (endpoint.action === 'search' && endpoint.query?.perPageDefault != null) {
      return Number(endpoint.query.perPageDefault)
    }
  }

  return 100
}

/** @param {object} spec @param {string} entity */
export function extractSessionScopeColumn(spec, entity) {
  return findEntityInSpec(spec, entity)?.entity?.scope?.bySession ?? null
}

/** @param {object} spec @param {string} entity */
export function extractRelationshipNames(spec, entity) {
  const relationships = findEntityInSpec(spec, entity)?.entity?.relationships ?? []
  return relationships.map((rel) => String(rel.name)).filter(Boolean)
}

/** @param {object} spec @param {string} entity */
export function extractHasManyRelationships(spec, entity) {
  const relationships = findEntityInSpec(spec, entity)?.entity?.relationships ?? []
  return relationships.filter((rel) => rel.type === 'hasMany').map((rel) => String(rel.name))
}

/** @param {object} spec @param {string} module @param {string} entity */
export function extractResourceFieldKeys(spec, module, entity) {
  const resourceName = `${module}${entity}Resource`
  const def = spec.responses?.[resourceName]

  if (def?.fields?.length) {
    return def.fields.map((field) => String(field.name)).filter(Boolean)
  }

  return ['id', 'name']
}

/** @param {string|null} openapiPath @param {string} schemaName */
export function extractOpenApiSchemaKeys(openapiPath, schemaName) {
  if (!openapiPath || !existsSync(openapiPath)) {
    return []
  }

  try {
    const doc = YAML.parse(readFileSync(openapiPath, 'utf8'))
    const schema = doc?.components?.schemas?.[schemaName]
    if (!schema?.properties) {
      return []
    }

    return Object.keys(schema.properties)
  } catch {
    return []
  }
}

/** @param {string} module @param {string} entity */
export function resolveOpenApiEntitySchemaName(module, entity) {
  return `${module}${entity}`
}

/** @param {object} spec @param {string} entity @param {string} module */
export function inferModelFqcn(spec, entity, module) {
  const found = findEntityInSpec(spec, entity)
  const mode = found?.entity?.mode ?? 'Tenant'
  void module
  return `App\\Models\\${mode}\\${entity}`
}

/**
 * @param {object} spec
 * @param {string} specFile
 * @param {string} module
 * @param {string} entity
 */
export function buildBehavioralContext(spec, specFile, module, entity) {
  const openapiPath = resolveOpenApiPath(specFile)
  const openApiSchema = resolveOpenApiEntitySchemaName(module, entity)
  const openApiKeys = extractOpenApiSchemaKeys(openapiPath, openApiSchema)
  const resourceKeys = extractResourceFieldKeys(spec, module, entity)
  const displayKeys = openApiKeys.length ? openApiKeys : resourceKeys
  const hasManyRelations = extractHasManyRelationships(spec, entity)

  return {
    searchRequestClass: `${entity}SearchRequest`,
    searchRequestFqcn: `Modules\\${module}\\Http\\Requests\\${entity}SearchRequest`,
    ruleKeys: extractSearchRequestRuleKeys(spec, entity),
    perPageDefault: extractPerPageDefault(spec),
    sessionScopeColumn: extractSessionScopeColumn(spec, entity),
    relationshipNames: extractRelationshipNames(spec, entity),
    hasManyRelations,
    resourceKeys: displayKeys,
    openApiKeys: displayKeys,
    nestedRelationKey: hasManyRelations[0] ?? 'managers',
    modelFqcn: inferModelFqcn(spec, entity, module),
    entityQueryFqcn: `Modules\\${module}\\Http\\Queries\\${entity}Query`,
    entityActionFqcn: `Modules\\${module}\\Http\\Actions\\${entity}Action`,
    entityResourceFqcn: `Modules\\${module}\\Http\\Resources\\${entity}Resource`,
    openApiSchema
  }
}
