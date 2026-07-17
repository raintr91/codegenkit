import path from 'node:path'
import { analyzeWorkspace, inferWireFromSpec } from './workspace-analysis.mjs'

const ADD_ACTIONS = new Set(['search', 'detail', 'create', 'update', 'delete', 'bulk-delete'])

/**
 * @param {Record<string, boolean>} wire
 */
function needsActionClass(wire) {
  return wire.create || wire.update || wire.delete
}

/**
 * @param {Record<string, boolean>} wire
 */
function buildControllerWizardCommand(ctx, wire, analysis, options = {}) {
  const { module, entity, pathModel, sharedModel } = ctx
  const flags = [
    `--shared-model=${sharedModel && !analysis.modelExists ? 'yes' : 'no'}`,
    `--path-model=${pathModel}`,
    `--create-request=${wire.create ? 'yes' : 'no'}`,
    `--search-request=${wire.search ? 'yes' : 'no'}`,
    `--action-class=${needsActionClass(wire) || analysis.files.action ? 'yes' : 'no'}`,
    `--query-class=${wire.search || wire.detail ? 'yes' : 'no'}`,
    `--resource-class=yes`,
    `--overwrite-controller=${options.force ? 'yes' : 'no'}`,
    `--wire-search=${wire.search ? 'yes' : 'no'}`,
    `--wire-detail=${wire.detail ? 'yes' : 'no'}`,
    `--wire-create=${wire.create ? 'yes' : 'no'}`,
    `--wire-update=${wire.update ? 'yes' : 'no'}`,
    `--wire-delete=${wire.delete ? 'yes' : 'no'}`,
    `--wire-multiple-delete=${wire['bulk-delete'] ? 'yes' : 'no'}`,
    `--select-items=${wire.selectItems ? 'yes' : 'no'}`,
    '--skip-questions'
  ]

  if (options.force) {
    flags.push('--force', '--yes')
  }

  return {
    id: 'controller-wizard',
    artisan: `m:controller ${module} ${entity} ${flags.join(' ')}`,
    description: analysis.controllerExists
      ? 'Controller wizard — keep existing files, wire missing endpoints'
      : 'CRUD controller wizard with wired endpoints'
  }
}

/**
 * @param {object} spec
 * @param {object} ctx from resolveCodegenContext
 * @param {ReturnType<typeof analyzeWorkspace>} analysis
 * @param {{ force?: boolean, profile?: string, skip?: Set<string> }} options
 */
export function resolveArtisanCommands(spec, ctx, analysis, options = {}) {
  const { module, entity, pathModel, profile } = ctx
  const skip = options.skip ?? ctx.skip ?? new Set()
  const force = options.force === true
  const wire = analysis.wire
  const commands = []
  const skipped = []

  const pushSkip = (id, artisan, layer, reason, filePath) => {
    skipped.push({
      id,
      artisan,
      layer,
      reason,
      path: filePath ? path.relative(options.repoRoot ?? '', filePath) : null
    })
  }

  // --- module ---
  const wantsModule = ctx.tags?.gen?.includes('#gen:module') || profile !== 'patch'
  const moduleArtisan = `m:module ${module}${force ? ' --force' : ''}`
  if (!wantsModule || skip.has('module')) {
    if (wantsModule) pushSkip('module', moduleArtisan, 'module', 'codegen.skip', null)
  } else if (analysis.moduleExists && !force) {
    pushSkip('module', moduleArtisan, 'module', 'already exists', analysis.paths.moduleJson)
  } else {
    commands.push({
      id: 'module',
      artisan: moduleArtisan,
      description: 'Create module scaffold + route smoke tests'
    })
  }

  // --- model ---
  const modelArtisan = `m:model ${entity} ${pathModel} --create-model=yes --create-migration=yes --create-factory=yes --create-seeder=no --skip-questions${force ? ' --force' : ''}`
  const modelTag = ctx.tags?.gen?.find((t) => t.startsWith('#gen:model-'))
  const needsModel =
    modelTag ||
    (!skip.has('model') && profile !== 'patch' && !ctx.tags?.skipGen?.includes('model'))

  if (!needsModel || skip.has('model')) {
    if (needsModel) pushSkip('model', modelArtisan, 'model', 'codegen.skip', null)
  } else if (analysis.modelExists && !force) {
    pushSkip('model', modelArtisan, 'model', 'already exists', analysis.paths.model)
  } else {
    commands.push({
      id: 'model',
      artisan: modelArtisan,
      description: `App model + migration (${pathModel})`
    })
  }

  // --- controller / wire ---
  const wantsCrud =
    ctx.tags?.gen?.includes('#gen:crud') || profile === 'crud-standard' || profile === 'patch'

  if (!skip.has('controller') && wantsCrud) {
    if (profile === 'patch' || analysis.controllerExists) {
      resolvePatchControllerCommands(spec, ctx, analysis, commands, skipped, { force, repoRoot: options.repoRoot })
    } else {
      commands.push(buildControllerWizardCommand(ctx, wire, analysis, { force }))
    }
  }

  // --- tests ---
  const testAllArtisan = `m:module-test ${module} --type=all${force ? ' --force' : ''}`
  const testControllerArtisan = `m:module-test ${module} --type=controller --class=${entity}${force ? ' --force' : ''}`

  if (!skip.has('tests') && (ctx.tags?.gen?.includes('#gen:test-module') || profile !== 'patch')) {
    if (analysis.files.controllerTest && !force) {
      pushSkip('module-test', testControllerArtisan, 'tests', 'already exists', analysis.paths.controllerTest)
    } else if (analysis.files.moduleRouteSmokeTest && analysis.controllerExists && !analysis.files.controllerTest) {
      commands.push({
        id: 'module-test',
        artisan: testControllerArtisan,
        description: `Controller test for ${entity}`
      })
    } else if (analysis.files.moduleRouteSmokeTest && !force) {
      pushSkip('module-test', testAllArtisan, 'tests', 'module tests already exist', analysis.paths.moduleRouteSmokeTest)
    } else {
      commands.push({
        id: 'module-test',
        artisan: testAllArtisan,
        description: 'Unit/feature tests per module class'
      })
    }
  }

  return {
    commands,
    skipped,
    artisanLines: commands.map((c) => `php artisan ${c.artisan}`),
    analysis
  }
}

/**
 * @param {object} spec
 * @param {object} ctx
 * @param {ReturnType<typeof analyzeWorkspace>} analysis
 * @param {object[]} commands
 * @param {object[]} skipped
 * @param {{ force?: boolean, repoRoot?: string }} options
 */
function resolvePatchControllerCommands(spec, ctx, analysis, commands, skipped, options) {
  const { module, entity } = ctx
  const wire = analysis.wire
  const pending = analysis.pendingWire

  if (!analysis.controllerExists) {
    commands.push(buildControllerWizardCommand(ctx, wire, analysis, { force: options.force }))
    return
  }

  if (analysis.controllerComplete && !options.force) {
    skipped.push({
      id: 'controller-wizard',
      artisan: `m:controller ${module} ${entity} ...`,
      layer: 'controller',
      reason: 'controller wired for spec endpoints',
      path: path.relative(options.repoRoot ?? '', analysis.paths.controller)
    })
    return
  }

  for (const endpoint of spec.api?.endpoints ?? []) {
    const action = endpoint.action
    if (!action || action === 'custom' || action === 'setting' || action === 'select-items') continue
    if (!ADD_ACTIONS.has(action)) continue

    const wireKey = action === 'bulk-delete' ? 'bulk-delete' : action
    if (!wire[wireKey]) continue

    if (!pending[wireKey] && !options.force) {
      skipped.push({
        id: `action-${endpoint.id}`,
        artisan: `add:action ${module} ${entity} ${action}`,
        layer: 'controller',
        reason: 'endpoint already wired',
        path: path.relative(options.repoRoot ?? '', analysis.paths.controller)
      })
      continue
    }

    const flags = ['--skip-questions']
    if (options.force) flags.push('--yes')

    commands.push({
      id: `action-${endpoint.id}`,
      artisan: `add:action ${module} ${entity} ${action} ${flags.join(' ')}`,
      description: endpoint.purpose ?? `wire ${action}`
    })
  }

  if (wire.selectItems && pending.selectItems) {
    const flags = ['--skip-questions']
    if (options.force) flags.push('--yes')
    commands.push({
      id: 'select-items',
      artisan: `add:select-item ${module} ${entity} ${flags.join(' ')}`,
      description: 'Wire select-items endpoint'
    })
  }

  for (const endpoint of spec.api?.endpoints ?? []) {
    if (endpoint.action === 'setting' && endpoint.setting) {
      const { relation, method } = endpoint.setting
      commands.push({
        id: `setting-${endpoint.id}`,
        artisan: `m:add-createOrUpdate ${module} ${entity} ${relation} ${method}`,
        description: endpoint.purpose ?? 'hasOne setting'
      })
    } else if (endpoint.action === 'custom') {
      // manual — no artisan
    }
  }
}

export { inferWireFromSpec }
