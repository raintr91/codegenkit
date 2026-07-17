import { spawn } from 'node:child_process'
import { spawnSync } from 'node:child_process'
import { resolveLaravelProject } from '../../../shared/project.mjs'

const { laravelRoot } = resolveLaravelProject()
const php = process.env.CODEGENKIT_PHP || 'php'

function splitCommand(line) {
  const args = []
  const pattern = /"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^\s]+)/g
  for (const match of line.matchAll(pattern)) {
    args.push((match[1] ?? match[2] ?? match[3]).replace(/\\(["'])/g, '$1'))
  }
  return args
}

export function assertArtisanCapabilities(commands) {
  const result = spawnSync(php, ['artisan', 'list', '--format=json'], {
    cwd: laravelRoot,
    encoding: 'utf8',
    env: process.env
  })
  if (result.status !== 0) {
    throw new Error(`Laravel Artisan preflight failed: ${result.stderr || result.stdout}`)
  }
  let listed
  try {
    listed = JSON.parse(result.stdout)
  } catch {
    throw new Error('Laravel Artisan preflight returned invalid JSON')
  }
  const names = new Set((listed.commands ?? []).map((entry) => entry.name))
  const missing = [...new Set(commands.map((entry) => splitCommand(
    entry.artisan.replace(/^php artisan\s+/, '').trim()
  )[0]))].filter((name) => !names.has(name))
  if (missing.length) {
    throw new Error(`Laravel modules-v1 commands missing: ${missing.join(', ')}`)
  }
}

/**
 * @param {string} artisanLine e.g. "m:module Admin" or full "php artisan m:module Admin"
 * @param {{ dryRun?: boolean }} options
 */
export function runArtisan(artisanLine, options = {}) {
  const line = artisanLine.replace(/^php artisan\s+/, '').trim()
  const [command, ...rest] = splitCommand(line)

  if (options.dryRun) {
    return Promise.resolve({ code: 0, stdout: `[dry-run] php artisan ${line}`, stderr: '' })
  }

  return new Promise((resolve, reject) => {
    const child = spawn(php, ['artisan', command, ...rest], {
      cwd: laravelRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

/**
 * @param {{ artisan: string, id: string }[]} commands
 * @param {{ dryRun?: boolean, stopOnError?: boolean }} options
 */
export async function runCommandPlan(commands, options = {}) {
  const results = []
  if (!options.dryRun && commands.length) assertArtisanCapabilities(commands)

  for (const item of commands) {
    const result = await runArtisan(item.artisan, { dryRun: options.dryRun })
    results.push({ ...item, ...result })
    if (result.code !== 0 && options.stopOnError !== false) {
      break
    }
  }

  return results
}
