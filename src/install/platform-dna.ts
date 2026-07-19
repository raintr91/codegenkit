import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

export interface PlatformDnaWireResult {
  attempted: boolean
  command: string
  args: string[]
  status?: number
  stdout: string
  stderr: string
  skipped?: 'not-initialized' | 'command-unavailable'
}

/**
 * Delegate cross-repo CodeGraph ownership to Platform DNA. Codegenkit never
 * reads project maps or writes `codegraph-*` MCP entries itself.
 */
export function wirePlatformDnaCodegraph(opts: {
  projectRoot: string
  filterKeys?: string
}): PlatformDnaWireResult {
  const root = path.resolve(opts.projectRoot)
  const command = process.env.PLATFORM_DNA_COMMAND?.trim() || 'platform-dna'
  const args = ['codegraph:wire', '--project-root', root, '--yes']
  if (opts.filterKeys?.trim()) args.push(`--codegraph-repos=${opts.filterKeys.trim()}`)

  if (!existsSync(path.join(root, '.platform-dna', 'install-manifest.json'))) {
    return {
      attempted: false,
      command,
      args,
      stdout: '',
      stderr: '',
      skipped: 'not-initialized',
    }
  }

  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    return {
      attempted: false,
      command,
      args,
      stdout: '',
      stderr: '',
      skipped: 'command-unavailable',
    }
  }
  return {
    attempted: true,
    command,
    args,
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  }
}
