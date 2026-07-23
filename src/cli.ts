import { lstatSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import {
  packageRoot,
  packageVersion,
  resolveBeAdapter,
  resolveFeAdapter,
  resolveProjectRoot,
} from './config/project-root.js'
import {
  installAgents,
  uninstallAgents,
} from './install/agents.js'
import { uninstallCursorMcp, type McpLocation } from './install/cursor-mcp.js'
import { generatedTargets } from './install/gitignore.js'
import {
  BE_SKILLS,
  FE_SKILLS,
  harnessStatus,
  installHarness,
  pruneHarness,
  readInstallManifest,
  uninstallHarness,
} from './install/harness.js'
import { resolveInitWizard } from './install/init-wizard.js'
import {
  discoverInstalls,
  ledgerPath,
  readLedger,
  removeLedger,
} from './install/ledger.js'
import { wirePlatformDnaCodegraph } from './install/platform-dna.js'
import { runAdapterEngine, runContractEngine } from './adapters/run.js'
import { runBeEngine } from './adapters/run-be.js'
import { validateCommonRegistry } from './registries/common.js'

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

  init [--type=fe|be|fullstack] [--adapter=…] [--fe-adapter=…] [--be-adapter=…]
       [--target=auto|all|none|cursor,…] [--docs-root <path>] [--with=ArtifactGraph]
       [--codegraph|--no-codegraph] [--codegraph-repos=key,…] [--project-root <path>]
       [--force] [--yes]
  status [--project-root <path>]
  prune [--project-root <path>] [--yes]    # dry-run by default
  deinit [--project-root <path>] [--yes]   # current repo harness + local MCP
  uninstall [--discover <dir>] [--yes]     # all repos + MCP local/global + CLI
  uninstall --scope=repo|all-repos|mcp-local|mcp-global|cli|all …
  gen|gen:dry [--adapter=…] [--docs-root=…] [--project-root=…] -- …engine args
  unit-gen|unit-gen:dry [--adapter=…] [--docs-root=…] [--project-root=…] -- …engine args
  api-gen|api-gen:dry [--adapter=fastapi|laravel|dotnet-integration|nestjs] [--project-root=…] -- --spec <path>
  api-unit-gen|api-unit-gen:dry [--adapter=fastapi|laravel|nestjs] [--project-root=…] -- --spec <path>
  api-registry [--adapter=fastapi|laravel|dotnet-integration|nestjs] [--project-root=…]
  api-unit-registry [--adapter=fastapi|laravel|nestjs] [--project-root=…]
  contract-gen|contract-gen:dry [--docs-root=…] [--project-root=…] -- --spec <path>
  contract-registry [--project-root=…]
  registry|unit-registry [--adapter=…] [--project-root=…]
  common-registry [--project-root=…] [--registry <path>]
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

type UninstallScope = 'repo' | 'all-repos' | 'mcp-local' | 'mcp-global' | 'cli' | 'all'

const UNINSTALL_SCOPES: UninstallScope[] = [
  'repo',
  'all-repos',
  'mcp-local',
  'mcp-global',
  'cli',
  'all',
]

interface UninstallFlags {
  yes: boolean
  projectRoot?: string
  discoverDir?: string
}

function lexists(file: string): boolean {
  try {
    lstatSync(file)
    return true
  } catch {
    return false
  }
}

function cliLayout(): { installDir: string; binDir: string } {
  return {
    installDir: process.env.CODEGENKIT_INSTALL_DIR
      ? path.resolve(process.env.CODEGENKIT_INSTALL_DIR)
      : path.join(os.homedir(), '.codegenkit'),
    binDir: process.env.CODEGENKIT_BIN_DIR
      ? path.resolve(process.env.CODEGENKIT_BIN_DIR)
      : path.join(os.homedir(), '.local', 'bin'),
  }
}

function removeCli(dryRun: boolean): {
  removed: string[]
  removable: string[]
  preserved: string[]
} {
  const { installDir, binDir } = cliLayout()
  const result = { removed: [] as string[], removable: [] as string[], preserved: [] as string[] }
  const targets = [
    path.join(binDir, 'codegenkit'),
    path.join(binDir, 'codegenkit-mcp'),
    path.join(binDir, 'codegenkit.cmd'),
    path.join(binDir, 'codegenkit-mcp.cmd'),
    installDir,
  ]
  for (const target of targets) {
    if (!lexists(target)) continue
    result.removable.push(target)
    if (!dryRun) {
      try {
        rmSync(target, { recursive: true, force: true })
        result.removed.push(target)
      } catch (error) {
        result.preserved.push(
          `${target} (${error instanceof Error ? error.message : String(error)})`,
        )
      }
    }
  }
  return result
}

function repoTargets(flags: UninstallFlags): string[] {
  const repos = new Set(readLedger())
  if (flags.discoverDir) {
    for (const repo of discoverInstalls(flags.discoverDir)) repos.add(repo)
  }
  return [...repos]
}

function runUninstallScope(scope: UninstallScope, flags: UninstallFlags): void {
  const cwd = path.resolve(flags.projectRoot ?? process.cwd())
  const doMcpLocal = (root: string): string[] => {
    const manifest = readInstallManifest(root)
    const result = uninstallAgents({
      projectRoot: root,
      yes: flags.yes,
      recorded: manifest?.mcp,
    })
    for (const line of result.removed) {
      console.log(`  ${flags.yes ? 'unwired' : 'would unwire'} MCP: ${line}`)
    }
    for (const line of result.preserved) {
      console.log(`  preserve modified MCP: ${line}`)
    }
    return result.removedPaths
  }
  const doHarness = (root: string): void => {
    console.log(`repo: ${root}`)
    // Unwire MCP first while the install manifest (and mcp ownership) still exists.
    const mcpRemovedPaths = doMcpLocal(root)
    const result = uninstallHarness({ projectRoot: root, yes: flags.yes, mcpRemovedPaths })
    for (const file of result.removable) {
      console.log(`  ${flags.yes ? 'removed' : 'would remove'}: ${file}`)
    }
    for (const file of result.modified) console.log(`  preserve modified: ${file}`)
    for (const file of result.missing) console.log(`  already missing: ${file}`)
    for (const pattern of result.gitignoreRemoved) {
      console.log(
        `  ${flags.yes ? 'removed' : 'would remove'}: .gitignore entry ${pattern}`,
      )
    }
    if (result.manifestRemoved) console.log(`  manifest removed: ${result.manifest}`)
    else if (result.dryRun && result.removable.length + result.modified.length + result.missing.length) {
      console.log(`  would remove manifest: ${result.manifest}`)
    }
  }
  const doMcp = (location: McpLocation, root: string): void => {
    if (location === 'local') {
      doMcpLocal(root)
      return
    }
    const result = uninstallCursorMcp({
      projectRoot: root,
      location,
      yes: flags.yes,
    })
    if (result.preserved) {
      console.log(`  preserve modified MCP config (${location}): ${result.path}`)
    } else if (result.removed) {
      console.log(`  ${flags.yes ? 'unwired' : 'would unwire'} MCP (${location}): ${result.path}`)
    }
  }
  const doRepos = (): void => {
    const repos = repoTargets(flags)
    if (!repos.length) console.log('  (no registered repos — try --discover <dir>)')
    for (const root of repos) {
      doHarness(root)
    }
  }
  const doCli = (): void => {
    const result = removeCli(!flags.yes)
    for (const file of flags.yes ? result.removed : result.removable) {
      console.log(`  ${flags.yes ? 'removed' : 'would remove'}: ${file}`)
    }
    for (const file of result.preserved) console.log(`  preserve: ${file}`)
  }

  switch (scope) {
    case 'repo':
      doHarness(cwd)
      break
    case 'all-repos':
      doRepos()
      break
    case 'mcp-local':
      doMcp('local', cwd)
      break
    case 'mcp-global':
      doMcp('global', cwd)
      break
    case 'cli':
      doCli()
      break
    case 'all':
      doRepos()
      doMcp('global', cwd)
      doCli()
      if (flags.yes) {
        if (removeLedger()) console.log(`  ledger removed: ${ledgerPath()}`)
      } else {
        console.log(`  would remove ledger: ${ledgerPath()}`)
      }
      break
  }
}

async function confirm(question: string): Promise<boolean> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await prompt.question(`${question} [y/N] `)
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes'
  } finally {
    prompt.close()
  }
}

async function runUninstall(defaultScope: 'repo' | 'all'): Promise<void> {
  const flags: UninstallFlags = {
    yes: has('--yes'),
    projectRoot: arg('--project-root'),
    discoverDir: arg('--discover'),
  }
  const requested = arg('--scope')
  if (requested && !UNINSTALL_SCOPES.includes(requested as UninstallScope)) {
    throw new Error(`--scope must be one of: ${UNINSTALL_SCOPES.join(', ')}`)
  }
  const scope: UninstallScope =
    defaultScope === 'repo' ? 'repo' : (requested as UninstallScope | undefined) ?? 'all'

  if (process.stdin.isTTY && !flags.yes) {
    console.log(`Preview (${scope}):`)
    runUninstallScope(scope, { ...flags, yes: false })
    const accepted = await confirm(
      defaultScope === 'repo'
        ? 'Apply codegenkit deinit for this repo?'
        : 'Apply global codegenkit uninstall (all repos + MCP + CLI)?',
    )
    if (!accepted) {
      console.log('Cancelled.')
      return
    }
    console.log(`Applying (${scope}):`)
    runUninstallScope(scope, { ...flags, yes: true })
    console.log(`Uninstalled (${scope}).`)
    return
  }

  runUninstallScope(scope, flags)
  console.log(
    flags.yes
      ? `Uninstalled (${scope}).`
      : `Dry-run (${scope}) — pass --yes to apply.`,
  )
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
    const root = resolveProjectRoot(arg('--project-root'))
    const interactive =
      !has('--yes')
      && Boolean(process.stdin.isTTY && process.stdout.isTTY)
      && !arg('--target')
      && !arg('--type')
    const wireFlag = has('--codegraph')
      ? true
      : has('--no-codegraph')
        ? false
        : undefined
    const withRaw = arg('--with')
    const selection = await resolveInitWizard({
      root,
      requestedTarget: arg('--target'),
      requestedType: arg('--type'),
      requestedAdapter: arg('--adapter'),
      requestedFeAdapter: arg('--fe-adapter'),
      requestedBeAdapter: arg('--be-adapter'),
      requestedDocsRoot: arg('--docs-root'),
      requestedWith: withRaw === undefined
        ? undefined
        : withRaw.trim() === '' || withRaw.trim().toLowerCase() === 'none'
          ? []
          : withRaw.split(/[,\s]+/).filter(Boolean),
      wireCodegraphFlag: wireFlag,
      interactive,
    })

    const agents = installAgents({
      projectRoot: root,
      type: selection.type,
      targets: selection.targets,
      feAdapter: selection.feAdapter,
      beAdapter: selection.beAdapter,
      docsRoot: selection.docsRoot,
    })
    console.log(
      `Wired Codegenkit → ${agents.targets.join(', ') || '(none)'} (local)`,
    )
    for (const written of agents.written) {
      console.log(`  ${written.agent}: ${written.path}`)
    }

    const ignoreEntries = generatedTargets({
      projectRoot: root,
      written: agents.written.map((entry) => entry.path),
      harnessInstalled: true,
      beAdapter: selection.beAdapter,
    })
    const harness = installHarness({
      projectRoot: root,
      type: selection.type,
      feAdapter: selection.feAdapter,
      beAdapter: selection.beAdapter,
      force: has('--force'),
      gitignoreEntries: ignoreEntries,
      mcp: agents.mcp,
      targets: agents.targets,
    })
    for (const file of harness.written) console.log(`  wrote: ${file}`)
    for (const file of harness.unchanged) console.log(`  unchanged: ${file}`)
    for (const file of harness.skipped) console.log(`  skipped: ${file}`)
    for (const file of harness.conflicts) console.log(`  conflict: ${file}`)
    for (const file of harness.stale) console.log(`  stale: ${file} (run codegenkit prune)`)
    if (harness.gitignore.length) {
      console.log(
        `gitignore: claimed ${harness.gitignore.map((entry) => entry.pattern).join(', ')}`,
      )
    }

    for (const optional of selection.withOptional) {
      if (optional === 'ArtifactGraph') {
        console.log(
          '  optional: ArtifactGraph selected — run `artifactgraph init --yes` in this repo to register it',
        )
      }
    }

    if (selection.wireCodegraph) {
      const codegraph = wirePlatformDnaCodegraph({
        projectRoot: root,
        filterKeys: arg('--codegraph-repos'),
      })
      if (codegraph.stdout) process.stdout.write(codegraph.stdout)
      if (codegraph.skipped === 'not-initialized') {
        console.log('  codegraph: skipped — run `platform-dna init` in this repo first')
      } else if (codegraph.skipped === 'command-unavailable') {
        console.log('  codegraph: skipped — `platform-dna` CLI is not available on PATH')
      } else if (codegraph.status !== 0) {
        const detail = codegraph.stderr.trim()
        console.error(
          `  codegraph: Platform DNA auto-wire failed${detail ? ` — ${detail}` : ''}`,
        )
      }
    }
    return
  }

  if (command === 'deinit') {
    await runUninstall('repo')
    return
  }
  if (command === 'uninstall') {
    await runUninstall('all')
    return
  }

  const root = resolveProjectRoot(arg('--project-root'))
  if (command === 'status') {
    const status = harnessStatus(root)
    console.log(JSON.stringify(status, null, 2))
    if (status.compat === 'fail') process.exit(1)
    return
  }
  if (command === 'prune') {
    const yes = has('--yes')
    const result = pruneHarness({ projectRoot: root, yes })
    for (const file of result.removable) {
      console.log(`  ${yes ? 'removed' : 'would remove'}: ${file}`)
    }
    for (const file of result.modified) console.log(`  keep modified: ${file}`)
    if (!yes && result.removable.length) {
      console.log('Dry-run only. Re-run with --yes to delete unmodified stale assets.')
    }
    console.log(
      `Prune: ${result.removed.length} removed, ${result.removable.length} removable, ${result.modified.length} modified kept`,
    )
    return
  }
  if (command === 'common-registry') {
    const result = validateCommonRegistry(root, arg('--registry'))
    console.log(
      `common.registry v${result.version}: OK (${result.entries} entries, ${result.aliases} aliases)`,
    )
    console.log(`  path: ${result.path}`)
    return
  }
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
  if (command === 'api-unit-gen' || command === 'api-unit-gen:dry') {
    printResult(
      runBeEngine({
        adapter: resolveBeAdapter(arg('--be-adapter') ?? arg('--adapter')),
        projectRoot: root,
        kind: 'unitgen',
        argv: passthrough(command),
        dryRun: command === 'api-unit-gen:dry' || has('--dry-run'),
      }),
    )
  }
  if (command === 'api-registry' || command === 'api-unit-registry') {
    printResult(
      runBeEngine({
        adapter: resolveBeAdapter(arg('--be-adapter') ?? arg('--adapter')),
        projectRoot: root,
        kind: command === 'api-registry' ? 'registry' : 'unit-registry',
        argv: passthrough(command),
      }),
    )
  }
  if (command === 'contract-gen' || command === 'contract-gen:dry') {
    printResult(
      runContractEngine({
        projectRoot: root,
        docsRoot,
        argv: passthrough(command),
        dryRun: command === 'contract-gen:dry' || has('--dry-run'),
      }),
    )
  }
  if (command === 'contract-registry') {
    printResult(
      runContractEngine({
        projectRoot: root,
        docsRoot,
        argv: passthrough(command),
        registry: true,
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
