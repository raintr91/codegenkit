#!/usr/bin/env node
/**
 * Golden parity: Handlebars (reference) vs PHP stub renderer on the same .php.stub
 * templates under adapters/laravel/php/templates.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import Handlebars from 'handlebars'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stubDir = path.join(root, 'adapters/laravel/php/templates')
const outDir = path.join(root, 'test/fixtures/laravel-unitgen-golden')

const ctx = {
  module: 'Hotel',
  entity: 'Hotel',
  entityPascal: 'Hotel',
  moduleNamespace: 'Modules\\Hotel',
  moduleBaseRequestFqcn: 'Modules\\Hotel\\Http\\Requests\\HotelSearchRequest',
  moduleBaseRequestClass: 'HotelSearchRequest',
  moduleControllerFqcn: 'Modules\\Hotel\\Http\\Controllers\\HotelController',
  controllerFqcn: 'Modules\\Hotel\\Http\\Controllers\\HotelController',
  entityQueryFqcn: 'Modules\\Hotel\\Http\\Queries\\HotelQuery',
  entityActionFqcn: 'Modules\\Hotel\\Http\\Actions\\HotelAction',
  entityResourceFqcn: 'Modules\\Hotel\\Http\\Resources\\HotelResource',
  requestClass: 'HotelSearchRequest',
  requestFqcn: 'Modules\\Hotel\\Http\\Requests\\HotelSearchRequest',
  targetRelativePath: 'Modules/Hotel/Http/Requests/HotelSearchRequest.php',
  searchRequestFqcn: 'Modules\\Hotel\\Http\\Requests\\HotelSearchRequest',
  ruleKeys: ['page', 'per_page', 'name'],
  perPageDefault: 50,
  sessionScopeColumn: 'session_id',
  relationshipNames: ['managers', 'rooms'],
  openApiKeys: ['id', 'name'],
  nestedRelationKey: 'managers',
  modelFqcn: 'App\\Models\\Tenant\\Hotel',
}

Handlebars.registerHelper('eq', (a, b) => a === b)
Handlebars.registerHelper('json', (value) => JSON.stringify(value, null, 2))
Handlebars.registerHelper('phpStringArray', (items) => {
  const arr = Array.isArray(items) ? items : []
  const encoded = arr.map((item) => `'${String(item).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
  return `[${encoded.join(', ')}]`
})
Handlebars.registerHelper('phpFqcn', (fqcn) => {
  const name = String(fqcn ?? '')
  if (!name) return ''
  return name.startsWith('\\') ? name : `\\${name}`
})

function walk(dir, ext) {
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name)
    if (name.isDirectory()) out.push(...walk(p, ext))
    else if (name.name.endsWith(ext)) out.push(p)
  }
  return out
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(path.join(outDir, 'ref'), { recursive: true })
mkdirSync(path.join(outDir, 'php'), { recursive: true })

const ctxJsonPath = path.join(outDir, 'ctx.json')
writeFileSync(ctxJsonPath, JSON.stringify(ctx))

const stubFiles = walk(stubDir, '.stub')
let mismatches = 0

for (const stubPath of stubFiles) {
  const rel = path.relative(stubDir, stubPath).split(path.sep).join('/')
  const source = readFileSync(stubPath, 'utf8')
  const refOut = Handlebars.compile(source, { noEscape: true })(ctx).trim() + '\n'
  writeFileSync(path.join(outDir, 'ref', rel.replace(/\//g, '__') + '.out'), refOut)

  const phpScript = `<?php
require ${JSON.stringify(path.join(root, 'adapters/laravel/php/src/Autoload.php'))};
use Codegenkit\\Laravel\\UnitGen\\TemplateRenderer;
$ctx = json_decode(file_get_contents(${JSON.stringify(ctxJsonPath)}), true);
echo TemplateRenderer::render(${JSON.stringify(rel)}, $ctx);
`
  const phpFile = path.join(outDir, 'render-once.php')
  writeFileSync(phpFile, phpScript)
  const result = spawnSync('php', [phpFile], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error('PHP render failed for', rel, result.stderr || result.stdout)
    mismatches++
    continue
  }
  const phpOut = result.stdout
  writeFileSync(path.join(outDir, 'php', rel.replace(/\//g, '__') + '.out'), phpOut)
  if (refOut !== phpOut) {
    console.error('MISMATCH', rel)
    mismatches++
  } else {
    console.log('OK', rel)
  }
}

process.exit(mismatches ? 1 : 0)
