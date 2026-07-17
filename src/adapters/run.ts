import { spawnSync } from 'node:child_process'
import { adapterEngine, type AdapterId } from '../config/project-root.js'

export function runAdapterEngine(opts: {
  adapter: AdapterId
  kind: 'codegen' | 'unitgen'
  script: 'generate.mjs' | 'validate-registry.mjs'
  projectRoot: string
  docsRoot?: string
  argv?: string[]
  dryRun?: boolean
}): { status: number | null; stdout: string; stderr: string } {
  const engine = adapterEngine(opts.adapter, opts.kind, opts.script)
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
