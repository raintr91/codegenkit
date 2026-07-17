import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  packageRoot,
  type BeAdapterId,
  type CodegenType,
  type FeAdapterId,
} from '../config/project-root.js'

export function installCursorMcp(opts: {
  projectRoot: string
  type: CodegenType
  feAdapter?: FeAdapterId
  beAdapter?: BeAdapterId
  docsRoot?: string
}): { path: string; written: boolean } {
  const root = path.resolve(opts.projectRoot)
  const file = path.join(root, '.cursor', 'mcp.json')
  mkdirSync(path.dirname(file), { recursive: true })
  let config: { mcpServers?: Record<string, unknown> } = { mcpServers: {} }
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, 'utf8')) as typeof config
    } catch {
      config = { mcpServers: {} }
    }
  }
  if (!config.mcpServers) config.mcpServers = {}
  const env: Record<string, string> = {
    CODEGENKIT_ROOT: root,
    CODEGENKIT_TYPE: opts.type,
  }
  if (opts.feAdapter) env.CODEGENKIT_FE_ADAPTER = opts.feAdapter
  if (opts.beAdapter) env.CODEGENKIT_BE_ADAPTER = opts.beAdapter
  if (opts.docsRoot) env.CODEGENKIT_DOCS_ROOT = path.resolve(opts.docsRoot)
  const entry = {
    type: 'stdio',
    command: process.execPath,
    args: [path.join(packageRoot(), 'bin', 'codegenkit-mcp.mjs')],
    env,
  }
  if (JSON.stringify(config.mcpServers.codegenkit) === JSON.stringify(entry)) {
    return { path: file, written: false }
  }
  config.mcpServers.codegenkit = entry
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  return { path: file, written: true }
}
