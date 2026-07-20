#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const productRoot = path.resolve(process.env.CODEGENKIT_ROOT ?? process.cwd())
const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

async function resolveRegistryPath() {
  const name = 'registries/contract-field.registry.json'
  for (const root of [productRoot, adapterRoot]) {
    const candidate = path.join(root, name)
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // try next
    }
  }
  throw new Error(
    `Missing ${name} — sync via codegenkit init --adapter=nextjs or keep a product copy`,
  )
}

async function main() {
  const registryPath = await resolveRegistryPath()
  const raw = await fs.readFile(registryPath, 'utf8')
  const registry = JSON.parse(raw)
  const errors = []

  if (!registry.version) errors.push('missing version')
  if (!Array.isArray(registry.fieldKinds) || registry.fieldKinds.length === 0) {
    errors.push('fieldKinds must be a non-empty array')
  }
  if (!Array.isArray(registry.scopes) || registry.scopes.length === 0) {
    errors.push('scopes must be a non-empty array')
  }
  if (!registry.scalarTypes || typeof registry.scalarTypes !== 'object') {
    errors.push('scalarTypes must be an object')
  }

  console.log(`contract-field.registry.json OK (v${registry.version ?? '?'})`)
  console.log(`  path: ${registryPath}`)
  if (errors.length) {
    for (const error of errors) console.error(`  error: ${error}`)
    process.exit(1)
  }
  console.log('  validate: OK')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
