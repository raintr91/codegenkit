#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const productRoot = path.resolve(process.env.CODEGENKIT_ROOT ?? process.cwd())

async function resolveRegistry() {
  const name = 'registries/nest-unit-test.registry.json'
  for (const root of [productRoot, adapterRoot]) {
    const candidate = path.join(root, name)
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // try next
    }
  }
  throw new Error(`Missing ${name}`)
}

async function main() {
  const registryPath = await resolveRegistry()
  const raw = await fs.readFile(registryPath, 'utf8')
  JSON.parse(raw)
  console.log('nest-unit-test.registry.json OK')
  console.log(`  path: ${registryPath}`)
  console.log('  validate: OK')
}

main().catch((e) => {
  console.error(e.message ?? e)
  process.exit(1)
})
