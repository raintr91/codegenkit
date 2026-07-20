#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const productRoot = path.resolve(process.env.CODEGENKIT_ROOT ?? process.cwd())

async function resolveRegistry() {
  const name = 'registries/nest-codegen.registry.json'
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
  const registry = JSON.parse(raw)
  if (!registry.version) throw new Error('Invalid nest-codegen.registry.json')
  console.log(`nest-codegen.registry.json OK (v${registry.version})`)
  console.log(`  path: ${registryPath}`)
  console.log('  validate: OK')
}

main().catch((error) => {
  console.error(error.message ?? error)
  process.exit(1)
})
