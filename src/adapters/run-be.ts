import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import {
  packageRoot,
  type BeAdapterId,
} from '../config/project-root.js'

export interface EngineResult {
  status: number | null
  stdout: string
  stderr: string
}

function resultOf(result: ReturnType<typeof spawnSync>): EngineResult {
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  }
}

function pythonExecutables(projectRoot: string): string[] {
  const configured = process.env.CODEGENKIT_PYTHON
  return [
    ...(configured ? [configured] : []),
    path.join(projectRoot, '.venv', 'bin', 'python'),
    path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
    'python3',
    'python',
  ].filter((candidate, index, all) =>
    all.indexOf(candidate) === index &&
    (!candidate.includes(path.sep) || existsSync(candidate)),
  )
}

export function runBeEngine(opts: {
  adapter: BeAdapterId
  projectRoot: string
  kind?: 'codegen' | 'unitgen' | 'registry' | 'unit-registry'
  argv?: string[]
  dryRun?: boolean
}): EngineResult {
  const kind = opts.kind ?? 'codegen'
  const argv = [...(opts.argv ?? [])]
  if (opts.dryRun && !argv.includes('--dry-run') && !argv.includes('--dry')) {
    argv.push('--dry-run')
  }
  const env = {
    ...process.env,
    CODEGENKIT_ROOT: opts.projectRoot,
    CODEGENKIT_TYPE: 'be',
    CODEGENKIT_BE_ADAPTER: opts.adapter,
  }

  if (opts.adapter === 'dotnet-integration') {
    if (kind === 'unitgen' || kind === 'unit-registry') {
      return {
        status: 1,
        stdout: '',
        stderr:
          'dotnet-integration bundles test outputs into api-gen; separate api-unit-gen/api-unit-registry is not supported.\n',
      }
    }
    const command = kind === 'registry' ? 'registry' : opts.dryRun ? 'dry' : 'write'
    const normalized = argv.filter(
      (value) => value !== '--dry-run' && value !== '--dry',
    )
    if (normalized[0] === 'registry' || normalized[0] === 'dry' || normalized[0] === 'write') {
      normalized.shift()
    }
    const project = path.join(
      packageRoot(),
      'adapters',
      'dotnet-integration',
      'codegen',
      'runners',
      'IntegrationGen',
      'IntegrationGen.csproj',
    )
    const executable = process.env.CODEGENKIT_DOTNET || 'dotnet'
    const result = spawnSync(
      executable,
      ['run', '--project', project, '--', command, ...normalized],
      { cwd: opts.projectRoot, encoding: 'utf8', env },
    )
    if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      return {
        status: 1,
        stdout: '',
        stderr:
          'No .NET runtime found; set CODEGENKIT_DOTNET or install dotnet (.NET 8 SDK required).\n',
      }
    }
    return resultOf(result)
  }

  if (opts.adapter === 'fastapi') {
    if (kind === 'registry' || kind === 'unit-registry') {
      const scope = kind === 'registry' ? 'codegen' : 'unitgen'
      const validator = path.join(
        packageRoot(),
        'adapters',
        'fastapi',
        scope,
        'runners',
        'validate-registry.mjs',
      )
      return resultOf(
        spawnSync(process.execPath, [validator, ...argv], {
          cwd: opts.projectRoot,
          encoding: 'utf8',
          env,
        }),
      )
    }
    const scope = kind === 'unitgen' ? 'unitgen' : 'codegen'
    const moduleName = kind === 'unitgen' ? 'fast_unit_gen.cli' : 'fast_gen.cli'
    const runners = path.join(
      packageRoot(),
      'adapters',
      'fastapi',
      scope,
      'runners',
    )
    const codegenRunners = path.join(
      packageRoot(),
      'adapters',
      'fastapi',
      'codegen',
      'runners',
    )
    const normalized = argv.filter(
      (value) => value !== '--dry-run' && value !== '--dry',
    )
    if (
      !normalized.includes('dry') &&
      !normalized.includes('write') &&
      !normalized.includes('registry') &&
      !normalized.includes('openapi')
    ) {
      normalized.unshift(opts.dryRun ? 'dry' : 'write')
    }
    for (const python of pythonExecutables(opts.projectRoot)) {
      const result = spawnSync(python, ['-m', moduleName, ...normalized], {
        cwd: opts.projectRoot,
        encoding: 'utf8',
        env: {
          ...env,
          PYTHONDONTWRITEBYTECODE: '1',
          PYTHONPATH: [runners, codegenRunners, process.env.PYTHONPATH]
            .filter(Boolean)
            .join(path.delimiter),
        },
      })
      if (!(result.error as NodeJS.ErrnoException | undefined)?.code?.includes('ENOENT')) {
        return resultOf(result)
      }
    }
    return {
      status: 1,
      stdout: '',
      stderr:
        'No Python runtime found; set CODEGENKIT_PYTHON or create target .venv',
    }
  }

  if (opts.adapter === 'nestjs') {
    const scope =
      kind === 'unitgen' || kind === 'unit-registry' ? 'nest-unitgen' : 'nestgen'
    const script =
      kind === 'registry' || kind === 'unit-registry'
        ? 'validate-registry.mjs'
        : 'generate.mjs'
    const engine = path.join(
      packageRoot(),
      'adapters',
      'nestjs',
      scope,
      'runners',
      script,
    )
    return resultOf(
      spawnSync(process.execPath, [engine, ...argv], {
        cwd: opts.projectRoot,
        encoding: 'utf8',
        env,
      }),
    )
  }

  // Laravel unitgen / unit-registry: PHP engine synced into src/.codegenkit/
  if (kind === 'unitgen' || kind === 'unit-registry') {
    return runLaravelPhpUnitgen({
      projectRoot: opts.projectRoot,
      kind,
      argv,
      env,
    })
  }

  const engine = path.join(
    packageRoot(),
    'adapters',
    'laravel',
    'codegen',
    'runners',
    kind === 'registry' ? 'validate-registry.mjs' : 'generate.mjs',
  )
  return resultOf(
    spawnSync(process.execPath, [engine, ...argv], {
      cwd: opts.projectRoot,
      encoding: 'utf8',
      env,
    }),
  )
}

function resolveLaravelAppRoot(projectRoot: string): string | null {
  const candidates = [projectRoot, path.join(projectRoot, 'src')]
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, 'artisan')) &&
      existsSync(path.join(candidate, 'composer.json'))
    ) {
      return candidate
    }
  }
  return null
}

function resolveLaravelPhpEngine(projectRoot: string): {
  script: string
  cwd: string
} | null {
  const laravelRoot = resolveLaravelAppRoot(projectRoot)
  const synced = path.join(projectRoot, 'src', '.codegenkit', 'bin')
  const kitFallback = path.join(
    packageRoot(),
    'adapters',
    'laravel',
    'php',
    'bin',
  )
  const binDir = existsSync(path.join(synced, 'unit-gen.php'))
    ? synced
    : existsSync(path.join(kitFallback, 'unit-gen.php'))
      ? kitFallback
      : null
  if (!binDir) return null
  return {
    script: binDir,
    cwd: laravelRoot ?? projectRoot,
  }
}

function runLaravelPhpUnitgen(opts: {
  projectRoot: string
  kind: 'unitgen' | 'unit-registry'
  argv: string[]
  env: NodeJS.ProcessEnv
}): EngineResult {
  const resolved = resolveLaravelPhpEngine(opts.projectRoot)
  if (!resolved) {
    return {
      status: 1,
      stdout: '',
      stderr:
        'Laravel PHP unitgen not found. Run `codegenkit init --type=be --adapter=laravel` to sync src/.codegenkit/, or ensure adapters/laravel/php exists in the toolkit.\n',
    }
  }
  const scriptName =
    opts.kind === 'unit-registry' ? 'validate-registry.php' : 'unit-gen.php'
  const script = path.join(resolved.script, scriptName)
  if (!existsSync(script)) {
    return {
      status: 1,
      stdout: '',
      stderr: `Missing PHP unitgen entry: ${script}\n`,
    }
  }
  const php = process.env.CODEGENKIT_PHP || 'php'
  const result = spawnSync(php, [script, ...opts.argv], {
    cwd: opts.projectRoot,
    encoding: 'utf8',
    env: opts.env,
  })
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    return {
      status: 1,
      stdout: '',
      stderr:
        'No PHP runtime found; set CODEGENKIT_PHP or install php on PATH.\n',
    }
  }
  return resultOf(result)
}
