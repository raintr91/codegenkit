/**
 * Map spec field definitions → Zod expression strings for codegen.
 */

const SCALAR_ZOD = {
  integer: (field) => (field.key === 'id' ? 'fields.id' : 'z.number().int()'),
  number: () => 'z.number()',
  string: (field) => {
    if (field.key === 'email') return 'fields.email'
    if (field.key === 'status') return 'fields.status.optional()'
    if (field.key?.endsWith('_at')) return 'fields.createdAt'
    return 'fields.optionalNullableString'
  },
  boolean: () => 'z.boolean()',
  datetime: () => 'fields.createdAt'
}

function embedZod(embedFields) {
  const lines = (embedFields ?? ['id']).map((key) => {
    if (key === 'id') return '  id: fields.id,'
    if (key === 'full_name') return '  full_name: fields.optionalNullableString,'
    if (key === 'name') return '  name: fields.optionalNullableString,'
    if (key === 'email') return '  email: fields.email,'
    return `  ${key}: fields.optionalNullableString,`
  })
  return `z.object({\n${lines.join('\n')}\n})`
}

function zodForArrayItem(field) {
  if (field.kind === 'relation') return zodForRelation(field, 'read')
  if (field.kind === 'fk') return 'fields.id.optional()'
  return zodForScalar(field)
}

export function zodForArray(field) {
  const itemFields = field.items ?? []
  if (itemFields.length === 0) {
    return 'z.array(z.unknown())'
  }
  const lines = itemFields.map((item) => `  ${item.key}: ${zodForArrayItem(item)},`)
  const arrayExpr = `z.array(z.object({\n${lines.join('\n')}\n}))`
  return field.optional ? `${arrayExpr}.optional()` : arrayExpr
}

export function zodForScalar(field) {
  const type = field.type ?? 'string'
  if (type === 'array') return zodForArray(field)
  const mapper = SCALAR_ZOD[type] ?? SCALAR_ZOD.string
  let expr = mapper(field)
  if (field.readOnly && !expr.includes('.optional()')) {
    expr = expr.replace(/\)$/, '.optional()') === expr ? expr : expr
  }
  if (field.nullable && !expr.includes('nullable')) {
    expr = `${expr}.nullable()`
  }
  return expr
}

export function zodForRelation(field, mode = 'read') {
  const embed = field.contract?.read?.embed ?? field.embed ?? ['id', 'full_name']
  const embedSchema = embedZod(embed)

  if (mode === 'write') {
    const writeMode = field.contract?.write?.mode ?? 'syncIds'
    if (writeMode === 'fkOnly' && field.persistence?.fkField) {
      return 'fields.id'
    }
    if (field.cardinality === 'one') {
      return embedSchema
    }
    return `z.array(${embedZod(['id'])})`
  }

  if (field.cardinality === 'one') {
    return `${embedSchema}.optional()`
  }
  return `z.array(${embedSchema}).optional()`
}

export function fieldInScope(field, scope) {
  const scopes = field.scopes ?? ['form', 'response', 'persistence']
  return scopes.includes(scope)
}
