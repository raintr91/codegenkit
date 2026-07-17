import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parse } from 'yaml'

const root = path.resolve(process.env.CODEGENKIT_ROOT || process.cwd())

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function pascal(value) {
  return String(value || 'Entity')
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^./, (char) => char.toUpperCase())
}

function kebab(value) {
  return String(value || 'module')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

function contained(relativePath) {
  const target = path.resolve(root, relativePath)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Generated path escapes target root: ${relativePath}`)
  }
  return target
}

function context(spec) {
  const moduleName =
    spec.codegen?.module ?? spec.modules?.[0]?.name ?? spec.id?.split('-').slice(0, 2).join('-') ?? 'App'
  const entitySource = spec.codegen?.entity ?? spec.modules?.[0]?.entities?.[0] ?? spec.entities?.[0]
  const entityName =
    typeof entitySource === 'string' ? entitySource : entitySource?.name ?? entitySource?.id ?? 'Entity'
  const endpoints = Array.isArray(spec.api?.endpoints) ? spec.api.endpoints : []
  return {
    module: pascal(moduleName),
    moduleSlug: kebab(moduleName),
    entity: pascal(entityName),
    entityVar: kebab(entityName).replaceAll('-', '_'),
    endpoints,
  }
}

function endpointAction(endpoint) {
  if (endpoint.action) return pascal(endpoint.action)
  const method = String(endpoint.method || 'GET').toUpperCase()
  if (method === 'POST') return 'Create'
  if (method === 'PUT' || method === 'PATCH') return 'Update'
  if (method === 'DELETE') return 'Delete'
  return endpoint.path?.includes('{') ? 'Show' : 'Index'
}

function planFiles(ctx) {
  const actions = [...new Set(ctx.endpoints.map(endpointAction))]
  if (!actions.length) actions.push('Index')
  const routeLines = ctx.endpoints.map((endpoint) => {
    const method = String(endpoint.method || 'GET').toLowerCase()
    const action = endpointAction(endpoint)
    return `Route::${method}('${endpoint.path || '/'}', [${ctx.entity}Controller::class, '${action.toLowerCase()}']);`
  })
  const controllerMethods = actions.map(
    (action) => `  public function ${action.toLowerCase()}(${ctx.entity}Request $request): JsonResponse
  {
    return response()->json((new ${action}${ctx.entity}Action())($request->validated()));
  }`,
  )

  return [
    {
      path: `app/Http/Controllers/Generated/${ctx.module}/${ctx.entity}Controller.php`,
      content: `<?php

namespace App\\Http\\Controllers\\Generated\\${ctx.module};

use App\\Actions\\Generated\\${ctx.module}\\${ctx.entity}\\{${actions
        .map((action) => `${action}${ctx.entity}Action`)
        .join(', ')}};
use App\\Http\\Controllers\\Controller;
use App\\Http\\Requests\\Generated\\${ctx.module}\\${ctx.entity}Request;
use Illuminate\\Http\\JsonResponse;

final class ${ctx.entity}Controller extends Controller
{
${controllerMethods.join('\n\n')}
}
`,
    },
    {
      path: `app/Http/Requests/Generated/${ctx.module}/${ctx.entity}Request.php`,
      content: `<?php

namespace App\\Http\\Requests\\Generated\\${ctx.module};

use Illuminate\\Foundation\\Http\\FormRequest;

final class ${ctx.entity}Request extends FormRequest
{
  public function authorize(): bool { return true; } // TODO: replace with policy/ability
  public function rules(): array { return []; } // TODO: map backend contract validation
}
`,
    },
    ...actions.map((action) => ({
      path: `app/Actions/Generated/${ctx.module}/${ctx.entity}/${action}${ctx.entity}Action.php`,
      content: `<?php

namespace App\\Actions\\Generated\\${ctx.module}\\${ctx.entity};

final class ${action}${ctx.entity}Action
{
  public function __invoke(array $input): array
  {
    return $input; // TODO: implement domain behavior
  }
}
`,
    })),
    {
      path: `routes/generated/${ctx.moduleSlug}.php`,
      content: `<?php

use App\\Http\\Controllers\\Generated\\${ctx.module}\\${ctx.entity}Controller;
use Illuminate\\Support\\Facades\\Route;

${routeLines.join('\n')}
`,
    },
    {
      path: `tests/Feature/Generated/${ctx.module}/${ctx.entity}ApiTest.php`,
      content: `<?php

namespace Tests\\Feature\\Generated\\${ctx.module};

use Tests\\TestCase;

final class ${ctx.entity}ApiTest extends TestCase
{
  public function test_generated_contract_requires_review(): void
  {
    $this->markTestIncomplete('Review generated routes, auth and validation.');
  }
}
`,
    },
  ]
}

async function main() {
  const specPath = option('--spec')
  if (!specPath) throw new Error('--spec <ir/spec.yaml|backend spec> is required')
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry')
  const force = process.argv.includes('--force')
  const absoluteSpec = path.resolve(specPath)
  const spec = parse(await readFile(absoluteSpec, 'utf8'))
  const ctx = context(spec)
  const files = planFiles(ctx)

  console.log(`laravel-gen: module=${ctx.module} entity=${ctx.entity}`)
  console.log(`  spec: ${absoluteSpec}`)
  for (const file of files) {
    const target = contained(file.path)
    let exists = false
    try {
      await readFile(target)
      exists = true
    } catch {
      // Missing target.
    }
    if (exists && !force) {
      console.log(`  skip: ${file.path} (exists)`)
      continue
    }
    console.log(`  ${dryRun ? '[dry]' : 'write'}: ${file.path}`)
    if (!dryRun) {
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, file.content, 'utf8')
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
