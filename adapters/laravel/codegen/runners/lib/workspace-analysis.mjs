import { accessSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const WIRE_TRAITS = {
  search: 'EntrySearchTrait',
  detail: 'EntryDetailTrait',
  create: 'EntryCreateTrait',
  update: 'EntryUpdateTrait',
  delete: 'EntryDeleteTrait',
  'bulk-delete': 'EntryBulkDeleteTrait',
  selectItems: 'EntrySelectTrait'
}

function exists(filePath) {
  try {
    accessSync(filePath)
    return true
  } catch {
    return false
  }
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

/**
 * @param {{ module: string, entity: string, pathModel: string }} ctx
 * @param {string} repoRoot
 */
export function resolveWorkspacePaths(ctx, repoRoot = defaultRepoRoot) {
  const src = repoRoot
  const moduleRoot = path.join(src, 'Modules', ctx.module)
  const entity = ctx.entity

  return {
    moduleJson: path.join(moduleRoot, 'module.json'),
    model: path.join(src, 'app/Models', ctx.pathModel, `${entity}.php`),
    modelTest: path.join(src, 'tests/Unit/Models', ctx.pathModel, `${entity}ModelTest.php`),
    factory: path.join(src, 'database/factories', ctx.pathModel, `${entity}Factory.php`),
    controller: path.join(moduleRoot, 'Http/Controllers', `${entity}Controller.php`),
    createRequest: path.join(moduleRoot, 'Http/Requests', `${entity}CreateRequest.php`),
    searchRequest: path.join(moduleRoot, 'Http/Requests', `${entity}SearchRequest.php`),
    action: path.join(moduleRoot, 'Http/Actions', `${entity}Action.php`),
    query: path.join(moduleRoot, 'Http/Queries', `${entity}Query.php`),
    resource: path.join(moduleRoot, 'Http/Resources', `${entity}Resource.php`),
    routes: path.join(moduleRoot, 'Routes/api.php'),
    moduleRouteSmokeTest: path.join(moduleRoot, 'Tests/Feature/ModuleRouteFilesTest.php'),
    controllerTest: path.join(
      moduleRoot,
      'Tests/Feature/Http/Controllers',
      `${entity}ControllerTest.php`
    )
  }
}

/**
 * @param {string} controllerContent
 * @param {string} routesContent
 * @param {string} entity
 */
export function detectWiredActions(controllerContent, routesContent, entity) {
  const prefix = entity.toLowerCase()
  const wired = {
    search: false,
    detail: false,
    create: false,
    update: false,
    delete: false,
    'bulk-delete': false,
    selectItems: false
  }

  for (const [action, trait] of Object.entries(WIRE_TRAITS)) {
    if (controllerContent.includes(`use ${trait}`) || controllerContent.includes(`use ${trait};`)) {
      wired[action] = true
    }
  }

  const routeChecks = {
    search: [`'search'`, `"search"`, 'search('],
    detail: ['getDetail', 'detail/{id}'],
    create: ["Route::post('/',", 'Route::post("/"', ",'create'"],
    update: ["'update'", 'edit/{id}'],
    delete: ["'delete'", 'delete/{id}'],
    'bulk-delete': ['bulkDelete', 'bulk-delete'],
    selectItems: ['select-items', 'selectItems', 'EntrySelectTrait']
  }

  const routeScope = routesContent.includes(`prefix('${prefix}')`)
    ? routesContent.slice(routesContent.indexOf(`prefix('${prefix}')`))
    : routesContent

  for (const [action, needles] of Object.entries(routeChecks)) {
    if (needles.some((n) => routeScope.includes(n))) {
      wired[action] = true
    }
  }

  return wired
}

/**
 * @param {object} spec
 */
export function inferWireFromSpec(spec) {
  const wire = {
    search: false,
    detail: false,
    create: false,
    update: false,
    delete: false,
    'bulk-delete': false,
    selectItems: false
  }

  for (const endpoint of spec.api?.endpoints ?? []) {
    const action = endpoint.action
    if (action === 'search') wire.search = true
    if (action === 'detail') wire.detail = true
    if (action === 'create') wire.create = true
    if (action === 'update') wire.update = true
    if (action === 'delete') wire.delete = true
    if (action === 'bulk-delete') wire['bulk-delete'] = true
    if (action === 'select-items') wire.selectItems = true
  }

  return { ...wire, ...(spec.codegen?.wire ?? {}) }
}

/**
 * @param {{ module: string, entity: string, pathModel: string }} ctx
 * @param {object} spec
 * @param {string} repoRoot
 */
export function analyzeWorkspace(ctx, spec, repoRoot = defaultRepoRoot) {
  const paths = resolveWorkspacePaths(ctx, repoRoot)
  const controllerContent = readText(paths.controller)
  const routesContent = readText(paths.routes)
  const wire = inferWireFromSpec(spec)

  const files = {
    module: exists(paths.moduleJson),
    model: exists(paths.model),
    modelTest: exists(paths.modelTest),
    factory: exists(paths.factory),
    controller: exists(paths.controller),
    createRequest: exists(paths.createRequest),
    searchRequest: exists(paths.searchRequest),
    action: exists(paths.action),
    query: exists(paths.query),
    resource: exists(paths.resource),
    moduleRouteSmokeTest: exists(paths.moduleRouteSmokeTest),
    controllerTest: exists(paths.controllerTest)
  }

  const wired = files.controller
    ? detectWiredActions(controllerContent, routesContent, ctx.entity)
    : {
        search: false,
        detail: false,
        create: false,
        update: false,
        delete: false,
        'bulk-delete': false,
        selectItems: false
      }

  const pendingWire = {}
  for (const [key, wanted] of Object.entries(wire)) {
    if (!wanted) continue
    const wiredKey = key === 'selectItems' ? 'selectItems' : key
    pendingWire[key] = !wired[wiredKey]
  }

  return {
    paths,
    files,
    wire,
    wired,
    pendingWire,
    moduleExists: files.module,
    modelExists: files.model,
    controllerExists: files.controller,
    controllerComplete:
      files.controller &&
      (!wire.search || wired.search) &&
      (!wire.detail || wired.detail) &&
      (!wire.create || wired.create) &&
      (!wire.update || wired.update) &&
      (!wire.delete || wired.delete) &&
      (!wire['bulk-delete'] || wired['bulk-delete']) &&
      (!wire.selectItems || wired.selectItems)
  }
}
