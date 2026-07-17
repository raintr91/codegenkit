import {
  packageRoot,
  packageVersion,
  resolveAdapter,
  resolveProjectRoot,
} from './config/project-root.js'
import { installCursorMcp } from './install/cursor-mcp.js'
import { FE_SKILLS, installHarness } from './install/harness.js'
import { mergePlatformRepos } from './install/platform-repos.js'
import { runAdapterEngine } from './adapters/run.js'

function arg(name: string): string | undefined {
  const eq = process.argv.find((value) => value.startsWith(`${name}=`))
  if (eq) return eq.slice(name.length + 1)
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function has(name: string): boolean {
  return process.argv.includes(name)
}

function passthrough(after: string): string[] {
  const index = process.argv.indexOf(after)
  return index >= 0 ? process.argv.slice(index + 1) : process.argv.slice(3)
}

function usage(): never {
  console.log(`codegenkit ${packageVersion()}

  init --type=fe --adapter=nuxt4|nextjs [--project-root <path>] [--docs-root <path>] [--force] [--yes]
  gen|gen:dry [--adapter=…] [--docs-root=…] [--project-root=…] -- …engine args
  unit-gen|unit-gen:dry [--adapter=…] [--docs-root=…] [--project-root=…] -- …engine args
  registry|unit-registry [--adapter=…] [--project-root=…]
  version

Owned FE skills: ${FE_SKILLS.map((id) => `/${id}`).join(' ')}
Docs hub init is forbidden.
`)
  process.exit(1)
}

function printResult(result: { status: number | null; stdout: string; stderr: string }): never {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

async function main(): Promise<void> {
  const command = process.argv[2]
  if (!command || command === 'help' || command === '--help') usage()
  if (command === 'version' || command === '--version') {
    console.log(`codegenkit ${packageVersion()}`)
    console.log(`packageRoot ${packageRoot()}`)
    return
  }
  if (command === 'init') {
    const type = arg('--type') ?? 'fe'
    if (type !== 'fe') throw new Error('codegenkit only supports --type=fe (docs hub forbidden)')
    const adapter = resolveAdapter(arg('--adapter'))
    const root = resolveProjectRoot(arg('--project-root'))
    const docsRoot = arg('--docs-root')
    const mcp = installCursorMcp({ projectRoot: root, adapter, docsRoot })
    console.log(`${mcp.written ? 'wrote' : 'unchanged'}: ${mcp.path}`)
    const harness = installHarness({ projectRoot: root, adapter, force: has('--force') })
    for (const file of harness.written) console.log(`  wrote: ${file}`)
    for (const file of harness.unchanged) console.log(`  unchanged: ${file}`)
    for (const file of harness.conflicts) console.log(`  conflict: ${file}`)
    const maps = mergePlatformRepos({ projectRoot: root, adapter })
    console.log(`updated: ${maps.path}`)
    for (const warning of maps.warnings) console.warn(`warning: ${warning}`)
    return
  }

  const adapter = resolveAdapter(arg('--adapter'))
  const root = resolveProjectRoot(arg('--project-root'))
  const docsRoot = arg('--docs-root')
  if (command === 'gen' || command === 'gen:dry') {
    printResult(
      runAdapterEngine({
        adapter,
        kind: 'codegen',
        script: 'generate.mjs',
        projectRoot: root,
        docsRoot,
        argv: passthrough(command),
        dryRun: command === 'gen:dry' || has('--dry-run'),
      }),
    )
  }
  if (command === 'unit-gen' || command === 'unit-gen:dry') {
    printResult(
      runAdapterEngine({
        adapter,
        kind: 'unitgen',
        script: 'generate.mjs',
        projectRoot: root,
        docsRoot,
        argv: passthrough(command),
        dryRun: command.endsWith(':dry') || has('--dry-run'),
      }),
    )
  }
  if (command === 'registry') {
    printResult(
      runAdapterEngine({
        adapter,
        kind: 'codegen',
        script: 'validate-registry.mjs',
        projectRoot: root,
        docsRoot,
        argv: passthrough(command),
      }),
    )
  }
  if (command === 'unit-registry') {
    printResult(
      runAdapterEngine({
        adapter,
        kind: 'unitgen',
        script: 'validate-registry.mjs',
        projectRoot: root,
        docsRoot,
        argv: passthrough(command),
      }),
    )
  }
  usage()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
