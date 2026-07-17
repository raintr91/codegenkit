import {
  packageRoot,
  packageVersion,
  resolveBeAdapter,
  resolveFeAdapter,
  resolveProjectRoot,
  resolveType,
} from './config/project-root.js'
import { installCursorMcp } from './install/cursor-mcp.js'
import { BE_SKILLS, FE_SKILLS, installHarness } from './install/harness.js'
import { mergePlatformRepos } from './install/platform-repos.js'
import { runAdapterEngine } from './adapters/run.js'
import { runBeEngine } from './adapters/run-be.js'

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
  const separator = process.argv.indexOf('--')
  if (separator >= 0) return process.argv.slice(separator + 1)
  const index = process.argv.indexOf(after)
  return index >= 0 ? process.argv.slice(index + 1) : process.argv.slice(3)
}

function usage(): never {
  console.log(`codegenkit ${packageVersion()}

  init --type=fe --adapter=nuxt4|nextjs [--project-root <path>] [--docs-root <path>] [--force] [--yes]
  init --type=be --adapter=fastapi|laravel [--project-root <path>] [--force] [--yes]
  init --type=fullstack --fe-adapter=nuxt4|nextjs --be-adapter=fastapi|laravel …
  gen|gen:dry [--adapter=…] [--docs-root=…] [--project-root=…] -- …engine args
  unit-gen|unit-gen:dry [--adapter=…] [--docs-root=…] [--project-root=…] -- …engine args
  api-gen|api-gen:dry [--adapter=fastapi|laravel] [--project-root=…] -- --spec <path>
  registry|unit-registry [--adapter=…] [--project-root=…]
  version

Owned FE skills: ${FE_SKILLS.map((id) => `/${id}`).join(' ')}
Owned BE skills: ${BE_SKILLS.map((id) => `/${id}`).join(' ')}
Docs/tests init is forbidden.
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
    const type = resolveType(arg('--type'))
    const feAdapter =
      type === 'be'
        ? undefined
        : resolveFeAdapter(arg('--fe-adapter') ?? arg('--adapter'))
    const beAdapter =
      type === 'fe'
        ? undefined
        : resolveBeAdapter(arg('--be-adapter') ?? arg('--adapter'))
    const root = resolveProjectRoot(arg('--project-root'))
    const docsRoot = arg('--docs-root')
    const mcp = installCursorMcp({
      projectRoot: root,
      type,
      feAdapter,
      beAdapter,
      docsRoot,
    })
    console.log(`${mcp.written ? 'wrote' : 'unchanged'}: ${mcp.path}`)
    const harness = installHarness({
      projectRoot: root,
      type,
      feAdapter,
      beAdapter,
      force: has('--force'),
    })
    for (const file of harness.written) console.log(`  wrote: ${file}`)
    for (const file of harness.unchanged) console.log(`  unchanged: ${file}`)
    for (const file of harness.conflicts) console.log(`  conflict: ${file}`)
    const maps = mergePlatformRepos({
      projectRoot: root,
      type,
      feAdapter,
      beAdapter,
    })
    console.log(`updated: ${maps.path}`)
    for (const warning of maps.warnings) console.warn(`warning: ${warning}`)
    return
  }

  const root = resolveProjectRoot(arg('--project-root'))
  const docsRoot = arg('--docs-root')
  if (command === 'api-gen' || command === 'api-gen:dry') {
    printResult(
      runBeEngine({
        adapter: resolveBeAdapter(arg('--be-adapter') ?? arg('--adapter')),
        projectRoot: root,
        argv: passthrough(command),
        dryRun: command === 'api-gen:dry' || has('--dry-run'),
      }),
    )
  }
  const adapter = resolveFeAdapter(arg('--fe-adapter') ?? arg('--adapter'))
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
