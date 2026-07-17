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

function pythonExecutable(projectRoot: string): string {
  const configured = process.env.CODEGENKIT_PYTHON
  if (configured) return configured
  const candidates = [
    path.join(projectRoot, '.venv', 'bin', 'python'),
    path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
  ]
  return candidates.find(existsSync) ?? 'python3'
}

export function runBeEngine(opts: {
  adapter: BeAdapterId
  projectRoot: string
  argv?: string[]
  dryRun?: boolean
}): EngineResult {
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

  if (opts.adapter === 'fastapi') {
    const runners = path.join(
      packageRoot(),
      'adapters',
      'fastapi',
      'codegen',
      'runners',
    )
    const normalized = argv.filter(
      (value) => value !== '--dry-run' && value !== '--dry',
    )
    if (!normalized.includes('dry') && !normalized.includes('write') && !normalized.includes('registry')) {
      normalized.unshift(opts.dryRun ? 'dry' : 'write')
    }
    return resultOf(
      spawnSync(pythonExecutable(opts.projectRoot), ['-m', 'fast_gen.cli', ...normalized], {
        cwd: opts.projectRoot,
        encoding: 'utf8',
        env: {
          ...env,
          PYTHONPATH: [runners, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
        },
      }),
    )
  }

  const engine = path.join(
    packageRoot(),
    'adapters',
    'laravel',
    'apigen',
    'runners',
    'generate.mjs',
  )
  return resultOf(
    spawnSync(process.execPath, [engine, ...argv], {
      cwd: opts.projectRoot,
      encoding: 'utf8',
      env,
    }),
  )
}
