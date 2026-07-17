import { accessSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function pathExists(filePath) {
  try {
    accessSync(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * @param {{ module: string, entity: string, pathModel: string }} ctx
 * @param {string} repoRoot
 */
export function detectExistingCodegen(ctx, repoRoot = defaultRepoRoot) {
  const src = repoRoot
  const moduleJson = path.join(src, 'Modules', ctx.module, 'module.json')
  const modelPath = path.join(src, 'app/Models', ctx.pathModel, `${ctx.entity}.php`)
  const controllerPath = path.join(
    src,
    'Modules',
    ctx.module,
    'Http/Controllers',
    `${ctx.entity}Controller.php`
  )
  const testsMarker = path.join(src, 'Modules', ctx.module, 'Tests/Feature/ModuleRouteFilesTest.php')

  return {
    module: { exists: pathExists(moduleJson), path: moduleJson },
    model: { exists: pathExists(modelPath), path: modelPath },
    controller: { exists: pathExists(controllerPath), path: controllerPath },
    tests: { exists: pathExists(testsMarker), path: testsMarker }
  }
}

const COMMAND_LAYER = {
  module: 'module',
  model: 'model',
  'controller-wizard': 'controller',
  'module-test': 'tests'
}

/**
 * @param {{ commands: object[], artisanLines: string[], ctx: object, manual: object }} plan
 * @param {ReturnType<typeof detectExistingCodegen>} existing
 * @param {{ force?: boolean, repoRoot?: string }} options
 */
export function applyExistingSkips(plan, existing, options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot
  if (options.force) {
    return { ...plan, skipped: [], existing }
  }

  const skipped = []
  const commands = []

  for (const cmd of plan.commands) {
    const layer = COMMAND_LAYER[cmd.id] ?? null
    if (layer && existing[layer]?.exists) {
      skipped.push({
        id: cmd.id,
        artisan: cmd.artisan,
        layer,
        reason: 'already exists',
        path: path.relative(repoRoot, existing[layer].path)
      })
      continue
    }
    commands.push(cmd)
  }

  return {
    ...plan,
    commands,
    artisanLines: commands.map((c) => `php artisan ${c.artisan}`),
    skipped,
    existing
  }
}
