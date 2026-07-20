import YAML from 'yaml'

const SCALAR_OPENAPI = {
  integer: 'integer',
  int: 'integer',
  number: 'number',
  float: 'number',
  boolean: 'boolean',
  datetime: 'string',
  date: 'string',
  string: 'string',
  text: 'string'
}

function schemaFromFields(fields = []) {
  const properties = {}
  const required = []

  for (const field of fields) {
    const name = field.name ?? field.key
    if (!name) continue
    const type = SCALAR_OPENAPI[field.type] ?? 'string'
    
    properties[name] = { type }
    if (field.readOnly) {
      properties[name].readOnly = true
    }
    if (field.nullable) {
      properties[name].nullable = true
    }
    if (!field.nullable && !field.readOnly) {
      required.push(name)
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {})
  }
}

function resolvePath(endpoint) {
  const raw = endpoint.path ?? '/'
  if (raw.startsWith('/api/') || raw === '/api') return raw
  return `/api${raw.startsWith('/') ? '' : '/'}${raw}`
}

export function buildOpenApiDocument(spec, ctx, options = {}) {
  const endpoints = spec.api?.endpoints ?? []
  const paths = {}
  const beTechnology = options.beAdapter ?? 'nestjs'
  
  // Set default port based on technology
  let defaultPort = '4000'
  if (beTechnology === 'fastapi') defaultPort = '8000'
  else if (beTechnology === 'laravel') defaultPort = '8000'
  
  const port = options.port ?? defaultPort

  for (const endpoint of endpoints) {
    const pathKey = resolvePath(endpoint)
    const method = String(endpoint.method ?? 'GET').toLowerCase()
    const action = endpoint.action ?? 'custom'

    const requestName = endpoint.request
    const responseName = endpoint.response
    const requestSchema = requestName ? spec.requests?.[requestName] : null
    const responseSchema = responseName ? spec.responses?.[responseName] : null

    const operation = {
      operationId: endpoint.id ?? `${ctx.entity}.${action}`,
      tags: [ctx.module],
      summary: `${action} ${ctx.entity}`,
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': {
              schema: responseSchema
                ? { $ref: `#/components/schemas/${responseName}` }
                : { type: 'object' }
            }
          }
        }
      }
    }

    if (method === 'get') {
      if (requestSchema?.fields?.length) {
        operation.parameters = requestSchema.fields.map((field) => ({
          name: field.name,
          in: 'query',
          schema: { type: SCALAR_OPENAPI[field.type] ?? 'string' }
        }))
      }
    } else if (['post', 'patch', 'put'].includes(method)) {
      const bodyName = requestName ?? `${ctx.entity}${action[0].toUpperCase()}${action.slice(1)}Request`
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: requestSchema
              ? { $ref: `#/components/schemas/${requestName}` }
              : { type: 'object' }
          }
        }
      }
    }

    paths[pathKey] = paths[pathKey] ?? {}
    paths[pathKey][method] = operation
  }

  const schemas = {}
  for (const [name, def] of Object.entries(spec.requests ?? {})) {
    schemas[name] = schemaFromFields(def.fields)
  }
  for (const [name, def] of Object.entries(spec.responses ?? {})) {
    if (def.envelope) {
      const itemRef = String(def.data ?? '').match(/of\s+(\w+)/)?.[1]
      schemas[name] = {
        type: 'object',
        properties: {
          data: itemRef
            ? { type: 'array', items: { $ref: `#/components/schemas/${itemRef}` } }
            : { type: 'array', items: { type: 'object' } },
          meta: { type: 'object' }
        }
      }
      continue
    }
    schemas[name] = schemaFromFields(def.fields)
  }

  return {
    openapi: options.openapiVersion ?? '3.0.3',
    info: {
      title: spec.feature?.title ?? `${ctx.module} API`,
      version: spec.feature?.version ?? '0.1.0'
    },
    servers: [{ url: `http://localhost:${port}`, description: 'Local dev' }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas
    },
    security: [{ bearerAuth: [] }]
  }
}

export function serializeOpenApi(document) {
  return YAML.stringify(document)
}
