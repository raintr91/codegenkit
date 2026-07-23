/**
 * Wire Codegenkit MCP into supported agent configurations (local only).
 *
 * Agents: claude | cursor | codex | opencode | hermes | gemini | antigravity | kiro | kilo
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  packageRoot,
  type BeAdapterId,
  type CodegenType,
  type FeAdapterId,
} from '../config/project-root.js'
import { buildTomlTable, removeTomlTable, upsertTomlTable } from './toml.js'

export type AgentId =
  | 'claude'
  | 'cursor'
  | 'codex'
  | 'opencode'
  | 'hermes'
  | 'gemini'
  | 'antigravity'
  | 'kiro'
  | 'kilo'

export const AGENT_IDS: AgentId[] = [
  'claude',
  'cursor',
  'codex',
  'opencode',
  'hermes',
  'gemini',
  'antigravity',
  'kiro',
  'kilo',
]

export const AGENT_LABEL: Record<AgentId, string> = {
  claude: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex CLI',
  opencode: 'opencode',
  hermes: 'Hermes Agent',
  gemini: 'Gemini CLI',
  antigravity: 'Antigravity IDE',
  kiro: 'Kiro',
  kilo: 'Kilo Code',
}

const AGENT_ALIASES: Record<string, AgentId> = {
  claude: 'claude',
  cursor: 'cursor',
  codex: 'codex',
  opencode: 'opencode',
  hermes: 'hermes',
  gemini: 'gemini',
  antigravity: 'antigravity',
  agy: 'antigravity',
  kiro: 'kiro',
  kilo: 'kilo',
}

export const MCP_NAME = 'codegenkit'

type StdioEntry = {
  type?: 'stdio'
  command: string
  args: string[]
  env: Record<string, string>
}

export interface InstallAgentsOptions {
  projectRoot: string
  type: CodegenType
  targets: AgentId[]
  feAdapter?: FeAdapterId
  beAdapter?: BeAdapterId
  docsRoot?: string
}

export interface AgentMcpOwnership {
  file: string
  sha256: string
}

export interface InstallAgentsResult {
  targets: AgentId[]
  written: Array<{ agent: AgentId; path: string }>
  /** Repo-relative ownership keyed by agent id for the install manifest. */
  mcp: Record<string, AgentMcpOwnership>
}

export interface UninstallAgentsResult {
  dryRun: boolean
  removed: string[]
  removedPaths: string[]
  absent: string[]
  preserved: string[]
}

function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config')
}

function hermesHome(): string {
  return process.env.HERMES_HOME
    ? path.resolve(process.env.HERMES_HOME)
    : path.join(os.homedir(), '.hermes')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

export function mcpEntryHash(entry: unknown): string {
  return createHash('sha256').update(canonicalJson(entry)).digest('hex')
}

export function agentConfigPath(agent: AgentId, projectRoot: string): string {
  const root = path.resolve(projectRoot)
  switch (agent) {
    case 'claude':
      return path.join(root, '.claude.json')
    case 'cursor':
      return path.join(root, '.cursor', 'mcp.json')
    case 'codex':
      return path.join(root, '.codex', 'config.toml')
    case 'opencode':
      return existsSync(path.join(root, 'opencode.json'))
        ? path.join(root, 'opencode.json')
        : path.join(root, 'opencode.jsonc')
    case 'hermes':
      return path.join(root, '.hermes', 'config.yaml')
    case 'gemini':
      return path.join(root, '.gemini', 'settings.json')
    case 'antigravity':
      return path.join(root, '.gemini', 'config', 'mcp_config.json')
    case 'kiro':
      return path.join(root, '.kiro', 'settings', 'mcp.json')
    case 'kilo':
      return path.join(root, '.kilocode', 'mcp.json')
  }
}

export function detectAgents(projectRoot = process.cwd()): AgentId[] {
  const root = path.resolve(projectRoot)
  const found: AgentId[] = []
  if (
    existsSync(path.join(os.homedir(), '.claude'))
    || existsSync(path.join(os.homedir(), '.claude.json'))
    || existsSync(path.join(root, '.claude.json'))
  ) {
    found.push('claude')
  }
  if (existsSync(path.join(os.homedir(), '.cursor')) || existsSync(path.join(root, '.cursor'))) {
    found.push('cursor')
  }
  if (existsSync(path.join(os.homedir(), '.codex')) || existsSync(path.join(root, '.codex'))) {
    found.push('codex')
  }
  if (
    existsSync(path.join(xdgConfigHome(), 'opencode'))
    || existsSync(path.join(root, 'opencode.jsonc'))
    || existsSync(path.join(root, 'opencode.json'))
  ) {
    found.push('opencode')
  }
  if (existsSync(hermesHome()) || existsSync(path.join(root, '.hermes'))) found.push('hermes')
  if (existsSync(path.join(os.homedir(), '.gemini')) || existsSync(path.join(root, '.gemini'))) {
    found.push('gemini')
  }
  if (
    existsSync(path.join(os.homedir(), '.antigravity-ide-server'))
    || existsSync(path.join(os.homedir(), '.gemini', 'config'))
    || existsSync(path.join(root, '.gemini', 'config'))
  ) {
    found.push('antigravity')
  }
  if (existsSync(path.join(os.homedir(), '.kiro')) || existsSync(path.join(root, '.kiro'))) {
    found.push('kiro')
  }
  if (existsSync(path.join(os.homedir(), '.kilocode')) || existsSync(path.join(root, '.kilocode'))) {
    found.push('kilo')
  }
  return found
}

export function parseAgentTargets(raw: string | undefined, detected: AgentId[]): AgentId[] {
  const value = (raw ?? 'auto').trim().toLowerCase()
  if (!value || value === 'auto') return detected.length > 0 ? detected : ['cursor']
  if (value === 'all') return [...AGENT_IDS]
  if (value === 'none') return []
  const targets: AgentId[] = []
  for (const item of value.split(/[,\s]+/).filter(Boolean)) {
    const target = AGENT_ALIASES[item]
    if (!target) {
      throw new Error(
        `Unknown agent "${item}". Known: ${AGENT_IDS.join(', ')}, agy, auto, all, none`,
      )
    }
    if (!targets.includes(target)) targets.push(target)
  }
  return targets
}

function buildMcpEntry(opts: InstallAgentsOptions): StdioEntry {
  const root = path.resolve(opts.projectRoot)
  const env: Record<string, string> = {
    CODEGENKIT_ROOT: root,
    CODEGENKIT_TYPE: opts.type,
  }
  if (opts.feAdapter) env.CODEGENKIT_FE_ADAPTER = opts.feAdapter
  if (opts.beAdapter) env.CODEGENKIT_BE_ADAPTER = opts.beAdapter
  if (opts.docsRoot) env.CODEGENKIT_DOCS_ROOT = path.resolve(opts.docsRoot)
  return {
    type: 'stdio',
    command: process.execPath,
    args: [path.join(packageRoot(), 'bin', 'codegenkit-mcp.mjs')],
    env,
  }
}

function shapedEntry(agent: AgentId, entry: StdioEntry): StdioEntry | Omit<StdioEntry, 'type'> {
  if (agent === 'antigravity') {
    return { command: entry.command, args: entry.args, env: entry.env }
  }
  return entry
}

function jsonDocument(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error(`Cannot merge invalid JSON agent config: ${file}`)
  }
}

function mergeMcpJson(file: string, entry: StdioEntry, omitType = false): { path: string; hash: string } {
  const document = jsonDocument(file)
  const servers = (document.mcpServers as Record<string, unknown> | undefined) ?? {}
  const shaped = omitType
    ? { command: entry.command, args: entry.args, env: entry.env }
    : entry
  servers[MCP_NAME] = shaped
  document.mcpServers = servers
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  return { path: file, hash: mcpEntryHash(shaped) }
}

function mergeCodex(file: string, entry: StdioEntry): { path: string; hash: string } {
  mkdirSync(path.dirname(file), { recursive: true })
  let content = existsSync(file) ? readFileSync(file, 'utf8') : ''
  content = upsertTomlTable(
    content,
    `mcp_servers.${MCP_NAME}`,
    buildTomlTable(`mcp_servers.${MCP_NAME}`, { command: entry.command, args: entry.args }),
  )
  const envHeader = `mcp_servers.${MCP_NAME}.env`
  const envBody = Object.entries(entry.env).map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
  content = upsertTomlTable(content, envHeader, `[${envHeader}]\n${envBody.join('\n')}`)
  writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
  return { path: file, hash: mcpEntryHash(entry) }
}

function parseJsonc(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  const raw = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '')
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error(`Cannot merge invalid JSONC agent config: ${file}`)
  }
}

function mergeOpencode(file: string, entry: StdioEntry): { path: string; hash: string } {
  const document = parseJsonc(file)
  document.$schema ??= 'https://opencode.ai/config.json'
  const mcp = (document.mcp as Record<string, unknown> | undefined) ?? {}
  const shaped = {
    type: 'local',
    command: [entry.command, ...entry.args],
    enabled: true,
    environment: entry.env,
  }
  mcp[MCP_NAME] = shaped
  document.mcp = mcp
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  return { path: file, hash: mcpEntryHash(shaped) }
}

function yamlDocument(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  const raw = readFileSync(file, 'utf8')
  if (!raw.trim()) return {}
  try {
    return (parseYaml(raw) as Record<string, unknown>) ?? {}
  } catch {
    throw new Error(`Cannot merge invalid YAML agent config: ${file}`)
  }
}

function mergeHermes(file: string, entry: StdioEntry): { path: string; hash: string } {
  const document = yamlDocument(file)
  const servers = (document.mcp_servers as Record<string, unknown> | undefined) ?? {}
  const shaped = {
    command: entry.command,
    args: entry.args,
    env: entry.env,
    timeout: 120,
    connect_timeout: 60,
    enabled: true,
  }
  servers[MCP_NAME] = shaped
  document.mcp_servers = servers
  const toolsets = (document.platform_toolsets as Record<string, unknown> | undefined) ?? {}
  const cli = Array.isArray(toolsets.cli) ? [...toolsets.cli] : ['hermes-cli']
  if (!cli.includes(`mcp-${MCP_NAME}`)) cli.push(`mcp-${MCP_NAME}`)
  toolsets.cli = cli
  document.platform_toolsets = toolsets
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, stringifyYaml(document), 'utf8')
  return { path: file, hash: mcpEntryHash(shaped) }
}

function mergeClaudePermissions(projectRoot: string): string | null {
  const file = path.join(projectRoot, '.claude', 'settings.json')
  const document = jsonDocument(file) as { permissions?: { allow?: string[] } }
  document.permissions ??= {}
  document.permissions.allow ??= []
  const permission = `mcp__${MCP_NAME}__*`
  if (document.permissions.allow.includes(permission)) return null
  document.permissions.allow.push(permission)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  return file
}

function relativeMcpFile(projectRoot: string, absolutePath: string): string {
  return path.relative(path.resolve(projectRoot), path.resolve(absolutePath)).split(path.sep).join('/')
}

export function installAgents(opts: InstallAgentsOptions): InstallAgentsResult {
  const root = path.resolve(opts.projectRoot)
  const entry = buildMcpEntry(opts)
  const written: InstallAgentsResult['written'] = []
  const mcp: InstallAgentsResult['mcp'] = {}

  for (const agent of opts.targets) {
    const file = agentConfigPath(agent, root)
    const shaped = shapedEntry(agent, entry) as StdioEntry
    let result: { path: string; hash: string }
    switch (agent) {
      case 'codex':
        result = mergeCodex(file, shaped)
        break
      case 'opencode':
        result = mergeOpencode(file, shaped)
        break
      case 'hermes':
        result = mergeHermes(file, shaped)
        break
      default:
        result = mergeMcpJson(file, shaped, agent === 'antigravity')
    }
    written.push({ agent, path: result.path })
    mcp[agent] = {
      file: relativeMcpFile(root, result.path),
      sha256: result.hash,
    }
    if (agent === 'claude') {
      const permissions = mergeClaudePermissions(root)
      if (permissions) written.push({ agent, path: `${permissions} (permissions)` })
    }
  }
  return { targets: opts.targets, written, mcp }
}

function readJsonMcpEntry(file: string): unknown | undefined {
  if (!existsSync(file)) return undefined
  try {
    const document = jsonDocument(file)
    const servers = document.mcpServers as Record<string, unknown> | undefined
    return servers?.[MCP_NAME]
  } catch {
    return undefined
  }
}

function removeJsonMcp(file: string, dryRun: boolean, expectedHash?: string): 'removed' | 'absent' | 'preserved' {
  if (!existsSync(file)) return 'absent'
  let document: Record<string, unknown>
  try {
    document = jsonDocument(file)
  } catch {
    return 'preserved'
  }
  const servers = document.mcpServers as Record<string, unknown> | undefined
  if (!servers || !(MCP_NAME in servers)) return 'absent'
  if (expectedHash && mcpEntryHash(servers[MCP_NAME]) !== expectedHash) return 'preserved'
  if (!dryRun) {
    delete servers[MCP_NAME]
    if (Object.keys(servers).length === 0) {
      delete document.mcpServers
    }
    if (Object.keys(document).length === 0) {
      rmSync(file, { force: true })
    } else {
      writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    }
  }
  return 'removed'
}

function removeCodex(file: string, dryRun: boolean): boolean {
  if (!existsSync(file)) return false
  const server = removeTomlTable(readFileSync(file, 'utf8'), `mcp_servers.${MCP_NAME}`)
  const env = removeTomlTable(server.content, `mcp_servers.${MCP_NAME}.env`)
  if (!server.removed && !env.removed) return false
  if (!dryRun) writeFileSync(file, env.content.endsWith('\n') ? env.content : `${env.content}\n`)
  return true
}

function removeOpencode(file: string, dryRun: boolean): boolean {
  let document: Record<string, unknown>
  try {
    document = parseJsonc(file)
  } catch {
    return false
  }
  const mcp = document.mcp as Record<string, unknown> | undefined
  if (!mcp || !(MCP_NAME in mcp)) return false
  if (!dryRun) {
    delete mcp[MCP_NAME]
    if (Object.keys(mcp).length === 0) {
      delete document.mcp
    }
    if (Object.keys(document).filter(k => k !== '$schema').length === 0) {
      rmSync(file, { force: true })
    } else {
      writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    }
  }
  return true
}

function removeHermes(file: string, dryRun: boolean): boolean {
  let document: Record<string, unknown>
  try {
    document = yamlDocument(file)
  } catch {
    return false
  }
  const servers = document.mcp_servers as Record<string, unknown> | undefined
  const toolsets = document.platform_toolsets as Record<string, unknown> | undefined
  const cli = toolsets && Array.isArray(toolsets.cli) ? toolsets.cli : []
  const hasServer = Boolean(servers && MCP_NAME in servers)
  const hasTool = cli.includes(`mcp-${MCP_NAME}`)
  if (!hasServer && !hasTool) return false
  if (!dryRun) {
    if (hasServer) delete servers![MCP_NAME]
    if (hasTool) toolsets!.cli = cli.filter((item) => item !== `mcp-${MCP_NAME}`)
    writeFileSync(file, stringifyYaml(document), 'utf8')
  }
  return true
}

function removeClaudePermissions(projectRoot: string, dryRun: boolean): string | null {
  const file = path.join(projectRoot, '.claude', 'settings.json')
  let document: { permissions?: { allow?: string[] } }
  try {
    document = jsonDocument(file) as typeof document
  } catch {
    return null
  }
  const permission = `mcp__${MCP_NAME}__*`
  const allow = document.permissions?.allow
  if (!allow?.includes(permission)) return null
  if (!dryRun) {
    document.permissions!.allow = allow.filter((item) => item !== permission)
    writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  }
  return file
}

/**
 * Uninstall Codegenkit MCP entries. When `recorded` is provided, only those
 * agents are considered and JSON MCP entries are hash-gated.
 */
export function uninstallAgents(opts: {
  projectRoot: string
  yes?: boolean
  /** Manifest-recorded ownership; when absent, probe all agents by key. */
  recorded?: Record<string, AgentMcpOwnership>
}): UninstallAgentsResult {
  const root = path.resolve(opts.projectRoot)
  const dryRun = !opts.yes
  const removed: string[] = []
  const removedPaths: string[] = []
  const absent: string[] = []
  const preserved: string[] = []

  const agents: AgentId[] = opts.recorded
    ? (Object.keys(opts.recorded) as AgentId[]).filter((id) => AGENT_IDS.includes(id))
    : [...AGENT_IDS]

  for (const agent of agents) {
    const recorded = opts.recorded?.[agent]
    const file = recorded
      ? path.join(root, ...recorded.file.split('/'))
      : agentConfigPath(agent, root)
    const expectedHash = recorded?.sha256

    if (agent === 'codex') {
      if (removeCodex(file, dryRun)) {
        removed.push(`${agent}: ${file}`)
        removedPaths.push(file)
      } else absent.push(`${agent}: no ${MCP_NAME} entry`)
    } else if (agent === 'opencode') {
      if (removeOpencode(file, dryRun)) {
        removed.push(`${agent}: ${file}`)
        removedPaths.push(file)
      } else absent.push(`${agent}: no ${MCP_NAME} entry`)
    } else if (agent === 'hermes') {
      if (removeHermes(file, dryRun)) {
        removed.push(`${agent}: ${file}`)
        removedPaths.push(file)
      } else absent.push(`${agent}: no ${MCP_NAME} entry`)
    } else {
      const outcome = removeJsonMcp(file, dryRun, expectedHash)
      if (outcome === 'removed') {
        removed.push(`${agent}: ${file}`)
        removedPaths.push(file)
      } else if (outcome === 'preserved') preserved.push(`${agent}: ${file}`)
      else absent.push(`${agent}: no ${MCP_NAME} entry`)
    }

    if (agent === 'claude') {
      const permissions = removeClaudePermissions(root, dryRun)
      if (permissions) {
        removed.push(`claude: ${permissions} (permissions)`)
        removedPaths.push(permissions.replace(/ \(permissions\)$/, ''))
      }
    }
  }

  return { dryRun, removed, removedPaths, absent, preserved }
}

/** Read current JSON MCP entry hash (Cursor and similar). */
export function currentJsonMcpHash(file: string): string | null {
  const entry = readJsonMcpEntry(file)
  return entry === undefined ? null : mcpEntryHash(entry)
}
