import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { adapterEngine, packageRoot, type FeAdapterId } from '../config/project-root.js'

type EngineResult = { status: number | null; stdout: string; stderr: string }

function runDotnetLine(opts: {
  projectRoot: string
  script: 'generate.mjs' | 'validate-registry.mjs'
  kind: 'codegen' | 'unitgen'
  argv: string[]
  dryRun?: boolean
  env: NodeJS.ProcessEnv
}): EngineResult {
  if (opts.kind === 'unitgen') {
    return {
      status: 1,
      stdout: '',
      stderr: 'dotnet-line bundles test outputs into gen; separate unit-gen/unit-registry is not supported.\n',
    }
  }
  const command = opts.script === 'validate-registry.mjs' ? 'registry' : opts.dryRun ? 'dry' : 'write'
  const argv = opts.argv.filter((value) => value !== '--dry-run' && value !== '--dry')
  if (argv[0] === 'registry' || argv[0] === 'dry' || argv[0] === 'write') argv.shift()
  const project = path.join(
    packageRoot(),
    'adapters',
    'dotnet-line',
    'codegen',
    'runners',
    'LineGen',
    'LineGen.csproj',
  )
  const executable = process.env.CODEGENKIT_DOTNET || 'dotnet'
  const result = spawnSync(executable, ['run', '--project', project, '--', command, ...argv], {
    cwd: opts.projectRoot,
    encoding: 'utf8',
    env: opts.env,
  })
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return {
      status: 1,
      stdout: '',
      stderr: `No .NET runtime found; set CODEGENKIT_DOTNET or install dotnet (.NET 8 SDK required).\n`,
    }
  }
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

export function runAdapterEngine(opts: {
  adapter: FeAdapterId
  kind: 'codegen' | 'unitgen'
  script: 'generate.mjs' | 'validate-registry.mjs'
  projectRoot: string
  docsRoot?: string
  argv?: string[]
  dryRun?: boolean
}): { status: number | null; stdout: string; stderr: string } {
  const argv = [...(opts.argv ?? [])]
  if (opts.dryRun && opts.script === 'generate.mjs' && !argv.includes('--dry-run')) {
    argv.push('--dry-run')
  }
  const env = {
    ...process.env,
    CODEGENKIT_ROOT: opts.projectRoot,
    CODEGENKIT_ADAPTER: opts.adapter,
  } as NodeJS.ProcessEnv
  if (opts.docsRoot) env.CODEGENKIT_DOCS_ROOT = opts.docsRoot
  if (opts.adapter === 'dotnet-line') {
    return runDotnetLine({ ...opts, argv, env })
  }
  const engine = adapterEngine(opts.adapter, opts.kind, opts.script)
  const result = spawnSync(process.execPath, [engine, ...argv], {
    cwd: opts.projectRoot,
    encoding: 'utf8',
    env,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

/** Next.js (and fullstack) FE↔BE contract schemas — lives under adapters/nextjs/contractgen. */
export function runContractEngine(opts: {
  projectRoot: string
  docsRoot?: string
  argv?: string[]
  dryRun?: boolean
  registry?: boolean
}): EngineResult {
  const argv = [...(opts.argv ?? [])]
  if (opts.dryRun && !opts.registry && !argv.includes('--dry-run')) {
    argv.push('--dry-run')
  }
  const env = {
    ...process.env,
    CODEGENKIT_ROOT: opts.projectRoot,
    CODEGENKIT_ADAPTER: 'nextjs',
  } as NodeJS.ProcessEnv
  if (opts.docsRoot) env.CODEGENKIT_DOCS_ROOT = opts.docsRoot
  const script = opts.registry ? 'validate-registry.mjs' : 'generate.mjs'
  const engine = path.join(
    packageRoot(),
    'adapters',
    'nextjs',
    'contractgen',
    'runners',
    script,
  )
  const result = spawnSync(process.execPath, [engine, ...argv], {
    cwd: opts.projectRoot,
    encoding: 'utf8',
    env,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}
