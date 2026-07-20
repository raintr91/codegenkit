#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

import { buildContractPlan } from './lib/plan.mjs'
import { parseArgs, readSpecFile } from './lib/naming.mjs'
import { writeManifest, writeOutputs } from './lib/write-files.mjs'

const root = path.resolve(process.env.CODEGENKIT_ROOT ?? process.cwd())

/**
 * Prefer explicit --yaml-root, then CODEGENKIT_DOCS_ROOT (+ optional /product),
 * then product-local docs/features/yaml under CODEGENKIT_ROOT.
 */
function resolveIrGlobRoots(options) {
  const roots = []
  if (options.yamlRoot) {
    roots.push(path.resolve(options.yamlRoot))
  }
  const docsRoot = process.env.CODEGENKIT_DOCS_ROOT || process.env.DOCS_HUB_ROOT
  if (docsRoot) {
    const abs = path.resolve(docsRoot)
    roots.push(path.join(abs, 'product'))
    roots.push(abs)
    roots.push(path.join(abs, 'docs', 'features', 'yaml'))
  }
  roots.push(path.join(root, 'docs', 'features', 'yaml'))
  return [...new Set(roots)]
}

async function listIrSpecFiles(dir) {
  const files = []
  let entries = []
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listIrSpecFiles(entryPath)))
      continue
    }
    if (entry.isFile() && entry.name === 'spec.yaml' && entryPath.includes(`${path.sep}ir${path.sep}`)) {
      files.push(entryPath)
    }
  }

  return files.sort()
}

async function resolveSpecPaths(options) {
  if (options.spec) return [path.resolve(options.spec)]
  for (const candidate of resolveIrGlobRoots(options)) {
    if (!existsSync(candidate)) continue
    const discovered = await listIrSpecFiles(candidate)
    if (discovered.length > 0) return discovered
  }
  throw new Error(
    'No ir/spec.yaml found — pass --spec <path>, --yaml-root <docs-hub>, or set CODEGENKIT_DOCS_ROOT',
  )
}

async function runForSpec(specPath, options) {
  const spec = await readSpecFile(specPath)
  const plan = buildContractPlan(spec, specPath)

  if (plan.files.length === 0) {
    console.warn(`[contract-gen] skip (no entities/fields): ${specPath}`)
    return { written: [], skipped: [] }
  }

  const { written, skipped } = await writeOutputs(root, plan, options)
  const manifest = await writeManifest(root, plan, specPath, { ...options, written, skipped })

  console.log(`[contract-gen] ${options.dryRun ? 'dry' : 'write'} ${specPath}`)
  console.log(`  files: ${written.length} written, ${skipped.length} skipped`)

  return manifest
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const specs = await resolveSpecPaths(options)

  for (const specPath of specs) {
    await runForSpec(specPath, options)
  }
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
