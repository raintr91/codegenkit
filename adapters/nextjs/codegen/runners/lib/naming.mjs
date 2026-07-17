/**
 * Naming helpers for portal-gen (entity hotel → Hotel, hotels, useHotelList).
 */

export function toPascalCase(value) {
  return String(value)
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (m) => m.toUpperCase())
}

export function toCamelCase(value) {
  const pascal = toPascalCase(value)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

export function toKebabCase(value) {
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}

export function pluralize(entity) {
  if (entity.endsWith('y') && !/[aeiou]y$/i.test(entity)) {
    return `${entity.slice(0, -1)}ies`
  }
  if (entity.endsWith('s')) return entity
  return `${entity}s`
}

/**
 * Resolve filesystem / type namespace so chain-hotel and admin hotel do not collide.
 * Priority: codegen.namespace → distinct codegen.module → codegen.entity
 */
export function resolveCodegenNamespace(codegen = {}) {
  if (codegen.namespace) {
    return toKebabCase(codegen.namespace)
  }

  const entityKebab = toKebabCase(codegen.entity ?? 'entity')
  const moduleKebab = codegen.module ? toKebabCase(codegen.module) : pluralize(entityKebab)
  const entityPlural = pluralize(entityKebab)

  if (moduleKebab !== entityPlural) {
    if (moduleKebab.endsWith('s')) {
      return moduleKebab.slice(0, -1)
    }
    return moduleKebab
  }

  return entityKebab
}

/**
 * Build prototype mock rows from list endpoint response.data[0] when present.
 * @param {Record<string, unknown>} spec
 */
export function buildMockRowsFromSpec(spec, title = 'Item') {
  const listEp = listEndpoint(spec)
  const sample = listEp?.response?.data?.[0]
  if (!sample || typeof sample !== 'object' || isOpenApiShape(sample)) {
    return [
      { id: 1, name: `${title} A`, managers: [{ id: 101, full_name: 'Manager A' }] },
      { id: 2, name: `${title} B`, managers: [{ id: 102, full_name: 'Manager B' }] },
      { id: 3, name: `${title} C`, managers: [{ id: 103, full_name: 'Manager C' }] }
    ]
  }

  const clone = (suffix) => hydrateMockRow(sample, title, suffix)
  return [clone(1), clone(2), clone(3)]
}

function isOpenApiShape(sample) {
  return Object.values(sample).some((value) => {
    if (typeof value === 'string') {
      return ['number', 'string', 'boolean'].includes(value) || value.includes('|')
    }
    if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
      return isOpenApiShape(value[0])
    }
    return false
  })
}

function hydrateMockRow(sample, title, suffix) {
  const row = {}

  for (const [key, value] of Object.entries(sample)) {
    if (key === 'id') {
      row.id = suffix
      continue
    }
    if (key === 'name') {
      row.name = `${title} ${String.fromCharCode(64 + suffix)}`
      continue
    }
    if (key === 'managers' && Array.isArray(value)) {
      row.managers = value.map((manager, index) => ({
        id: suffix * 10 + index + 1,
        full_name: `Manager ${String.fromCharCode(64 + suffix)}${index + 1}`
      }))
      continue
    }
    if (typeof value === 'string') {
      row[key] = value.includes('|') ? null : value
      continue
    }
    row[key] = value
  }

  return row
}

import { routeToAppPagePath } from './web-paths.mjs'

export function routeToPagePath(routePath) {
  return routeToAppPagePath(routePath)
}

export function zodFieldForColumn(column) {
  const key = column.key
  if (key === 'id') return 'fields.id'
  if (key === 'email') return 'fields.email'
  if (key === 'status') return 'fields.status.optional()'
  if (key === 'managers') {
    return 'z.array(z.object({ id: fields.id, full_name: fields.optionalNullableString }))'
  }
  if (key.endsWith('_at') || key.includes('date')) return 'fields.createdAt'
  if (column.type === 'number') return 'z.number()'
  return 'fields.optionalNullableString'
}

export function zodFieldForFormField(field, commonMessages = {}) {
  const schema = buildFormFieldSchema(field, commonMessages)
  return schema
}

function buildFormFieldSchema(field = {}, commonMessages = {}) {
  if (field.key === 'email') return applyNullability('fields.email', field)

  let schema = baseFieldSchema(field)
  schema = applyValidation(schema, field, commonMessages)
  schema = applyNullability(schema, field)
  return schema
}

function baseFieldSchema(field) {
  const kind = baseFieldKind(field)

  if (kind === 'number') return 'z.coerce.number().int()'
  if (kind === 'boolean') return 'z.boolean()'
  if (kind === 'array') return 'z.array(z.union([z.string(), z.number()]))'
  return 'z.string()'
}

function baseFieldKind(field) {
  const type = String(field.type ?? '').toLowerCase()
  const widget = String(field.widget ?? '').toLowerCase()

  if (type === 'int' || widget === 'number') return 'number'
  if (type === 'bool' || widget === 'checkbox' || widget === 'switch') return 'boolean'
  if (type === 'array' || widget === 'multiselect') return 'array'
  if (type === 'date') return 'string'
  return 'string'
}

function applyValidation(schema, field, commonMessages = {}) {
  const validation = field.validation ?? {}
  const kind = baseFieldKind(field)
  const requiredMessage = messageFor(field, 'required', commonMessages)

  let out = schema

  if (field.required && kind === 'string') {
    out = `z.string().min(1${requiredMessage ? `, { message: ${JSON.stringify(requiredMessage)} }` : ''})`
  }

  if (typeof validation.minLength === 'number' && kind === 'string') {
    const msg = messageFor(field, 'minLength', commonMessages)
    out = `${out}.min(${validation.minLength}${msg ? `, { message: ${JSON.stringify(msg)} }` : ''})`
  }

  if (typeof validation.maxLength === 'number' && kind === 'string') {
    const msg = messageFor(field, 'maxLength', commonMessages)
    out = `${out}.max(${validation.maxLength}${msg ? `, { message: ${JSON.stringify(msg)} }` : ''})`
  }

  if (typeof validation.pattern === 'string' && kind === 'string') {
    const msg = messageFor(field, 'pattern', commonMessages)
    out = `${out}.regex(new RegExp(${JSON.stringify(validation.pattern)})${msg ? `, { message: ${JSON.stringify(msg)} }` : ''})`
  }

  if (typeof validation.min === 'number' && (kind === 'number' || kind === 'array')) {
    const msg = messageFor(field, 'min', commonMessages)
    out = `${out}.min(${validation.min}${msg ? `, { message: ${JSON.stringify(msg)} }` : ''})`
  }

  if (typeof validation.max === 'number' && (kind === 'number' || kind === 'array')) {
    const msg = messageFor(field, 'max', commonMessages)
    out = `${out}.max(${validation.max}${msg ? `, { message: ${JSON.stringify(msg)} }` : ''})`
  }

  if (field.required && kind === 'array') {
    const minMsg = requiredMessage ? `, { message: ${JSON.stringify(requiredMessage)} }` : ''
    out = `${out}.min(1${minMsg})`
  }

  return out
}

function applyNullability(schema, field) {
  let out = schema
  if (field.nullable) out += '.nullable()'
  if (!field.required) out += '.optional()'
  return out
}

function messageFor(field, key, commonMessages = {}) {
  const fieldMessages = field.messages ?? {}
  const value = fieldMessages[key] ?? commonMessages[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function listEndpoint(spec) {
  const endpoints = spec.api?.endpoints ?? []
  return (
    endpoints.find((e) => e.action === 'list') ??
    endpoints.find((e) => /search|list/i.test(e.path ?? '')) ??
    endpoints[0]
  )
}

export function createEndpoint(spec) {
  const endpoints = spec.api?.endpoints ?? []
  return endpoints.find((e) => e.action === 'create') ?? endpoints.find((e) => e.method === 'POST')
}
