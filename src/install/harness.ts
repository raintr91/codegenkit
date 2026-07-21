import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  packageRoot,
  packageVersion,
  type BeAdapterId,
  type CodegenType,
  type FeAdapterId,
} from '../config/project-root.js'
import type { AgentMcpOwnership } from './agents.js'
import {
  canonicalGitignorePattern,
  ensureGitignoreEntries,
  mergeOwnedGitignore,
  removeGitignoreEntries,
  type OwnedGitignoreEntry,
} from './gitignore.js'
import { forgetInstall, recordInstall } from './ledger.js'

export const FE_SKILLS = [
  'prototype',
  'wire',
  'unit',
  'grill-prototype',
  'grill-unit',
  'model',
] as const
export const BE_SKILLS = ['api', 'grill-api'] as const

/** `/model` is web-FE only (Zod models); WinForms Line skips it. */
export function feSkillsForAdapter(
  adapter?: FeAdapterId,
): readonly (typeof FE_SKILLS)[number][] {
  if (adapter === 'dotnet-line') {
    return FE_SKILLS.filter((id) => id !== 'model')
  }
  return FE_SKILLS
}

function skipHarnessRel(opts: {
  type: CodegenType
  adapters: InstallManifest['adapters']
  rel: string
}): boolean {
  if (
    opts.adapters.fe === 'dotnet-line' &&
    opts.rel.split(path.sep).join('/').startsWith('skills/model/')
  ) {
    return true
  }
  return false
}

export interface InstallManifest {
  schemaVersion: 1
  package: '@platform/codegenkit'
  packageVersion: string
  type: CodegenType
  adapters: {
    fe?: FeAdapterId
    be?: BeAdapterId
  }
  toolApi: 1
  harnessApi: 1
  files: Record<string, { source: string; sha256: string; stale?: boolean }>
  /** Exact `.gitignore` entries Codegenkit ensured, with shared-ownership. */
  gitignore?: OwnedGitignoreEntry[]
  /** Per-agent MCP ownership so status/deinit can verify and unwire safely. */
  mcp?: Record<string, AgentMcpOwnership>
}

export interface GitignoreEntryStatus {
  pattern: string
  shared: boolean
  status: 'present' | 'missing'
}

export interface McpAgentStatus {
  agent: string
  file: string
  status: 'present' | 'missing' | 'modified'
}

export interface HarnessInstallResult {
  written: string[]
  unchanged: string[]
  conflicts: string[]
  skipped: string[]
  stale: string[]
  gitignore: OwnedGitignoreEntry[]
}

export interface HarnessStatus {
  projectRoot: string
  packageVersion: string
  installed: boolean
  packageVersionInstalled: string | null
  type: CodegenType | null
  adapters: InstallManifest['adapters'] | null
  toolApi: number | null
  harnessApi: number | null
  healthy: string[]
  missing: string[]
  modified: string[]
  stale: string[]
  /** Non-manifest leftovers (e.g. product-root contractgen/) */
  warnings: string[]
  gitignore: GitignoreEntryStatus[]
  mcp: McpAgentStatus[]
  compat: 'ok' | 'warn' | 'fail'
}

export interface PruneResult {
  removable: string[]
  modified: string[]
  removed: string[]
}

export interface HarnessUninstallResult {
  manifest: string
  dryRun: boolean
  removable: string[]
  removed: string[]
  modified: string[]
  missing: string[]
  manifestRemoved: boolean
  /** Exclusive gitignore patterns removed (or would remove). */
  gitignoreRemoved: string[]
}

function hash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Product-root engine trees retired in favor of toolkit package engines. */
function legacyProductEngineRoots(root: string): string[] {
  const legacy = ['contractgen']
  return legacy
    .map((name) => path.join(root, name))
    .filter((candidate) => {
      if (!existsSync(candidate)) return false
      // Treat as toolkit leftover when it still has runners/ (old product engine).
      return existsSync(path.join(candidate, 'runners'))
    })
}

function lexists(file: string): boolean {
  try {
    lstatSync(file)
    return true
  } catch {
    return false
  }
}

function managedPath(root: string, relative: string): string {
  const target = path.resolve(root, ...relative.split('/'))
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Managed Codegenkit path escapes project root: ${relative}`)
  }
  let existing = target
  while (!lexists(existing) && existing !== root) existing = path.dirname(existing)
  const realRoot = realpathSync(root)
  const realExisting = realpathSync(existing)
  if (realExisting !== realRoot && !realExisting.startsWith(`${realRoot}${path.sep}`)) {
    throw new Error(`Managed Codegenkit path escapes project root through a symlink: ${relative}`)
  }
  return target
}

function walk(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const name of readdirSync(root)) {
    const file = path.join(root, name)
    if (statSync(file).isDirectory()) out.push(...walk(file))
    else out.push(file)
  }
  return out
}

export function manifestFile(root: string): string {
  return path.join(root, '.codegenkit', 'install-manifest.json')
}

/** Public read of the install manifest (null when absent). */
export function readInstallManifest(projectRoot?: string): InstallManifest | null {
  return readManifest(path.resolve(projectRoot ?? process.cwd()))
}

function validateManifestGitignore(value: unknown): OwnedGitignoreEntry[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    throw new Error('Invalid Codegenkit install manifest gitignore')
  }
  const seen = new Set<string>()
  const entries: OwnedGitignoreEntry[] = []
  for (const raw of value) {
    if (
      !raw
      || typeof raw !== 'object'
      || typeof (raw as OwnedGitignoreEntry).pattern !== 'string'
      || !(raw as OwnedGitignoreEntry).pattern.trim()
      || /[\r\n]/.test((raw as OwnedGitignoreEntry).pattern)
    ) {
      throw new Error('Invalid Codegenkit install manifest gitignore entry')
    }
    if (
      (raw as OwnedGitignoreEntry).shared !== undefined
      && typeof (raw as OwnedGitignoreEntry).shared !== 'boolean'
    ) {
      throw new Error('Invalid Codegenkit install manifest gitignore shared flag')
    }
    const pattern = (raw as OwnedGitignoreEntry).pattern.trim()
    const canonical = canonicalGitignorePattern(pattern)
    if (!canonical || seen.has(canonical)) continue
    seen.add(canonical)
    entries.push({
      pattern,
      ...((raw as OwnedGitignoreEntry).shared ? { shared: true } : {}),
    })
  }
  return entries
}

function validateManifestMcp(value: unknown): Record<string, AgentMcpOwnership> | undefined {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Codegenkit install manifest mcp')
  }
  const out: Record<string, AgentMcpOwnership> = {}
  for (const [agent, raw] of Object.entries(value as Record<string, unknown>)) {
    if (
      !raw
      || typeof raw !== 'object'
      || typeof (raw as AgentMcpOwnership).file !== 'string'
      || !(raw as AgentMcpOwnership).file.trim()
      || path.isAbsolute((raw as AgentMcpOwnership).file)
      || (raw as AgentMcpOwnership).file.includes('\\')
      || (raw as AgentMcpOwnership).file.split('/').some((part) => part === '' || part === '.' || part === '..')
      || typeof (raw as AgentMcpOwnership).sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test((raw as AgentMcpOwnership).sha256)
    ) {
      throw new Error(`Invalid Codegenkit install manifest mcp entry: ${agent}`)
    }
    out[agent] = {
      file: (raw as AgentMcpOwnership).file,
      sha256: (raw as AgentMcpOwnership).sha256,
    }
  }
  return Object.keys(out).length ? out : undefined
}

function readManifest(root: string, allowIncompatible = false): InstallManifest | null {
  const file = managedPath(root, '.codegenkit/install-manifest.json')
  if (!existsSync(file)) return null
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  const manifest = raw as unknown as InstallManifest
  if (
    manifest.package !== '@platform/codegenkit' ||
    !manifest.files ||
    typeof manifest.files !== 'object' ||
    Array.isArray(manifest.files) ||
    !allowIncompatible &&
    (manifest.schemaVersion !== 1 || manifest.toolApi !== 1 || manifest.harnessApi !== 1)
  ) {
    throw new Error(
      `Unsupported Codegenkit install manifest API at ${file}; upgrade Codegenkit or remove the stale manifest explicitly.`,
    )
  }
  for (const [relative, metadata] of Object.entries(manifest.files)) {
    if (
      path.isAbsolute(relative) ||
      relative.includes('\\') ||
      relative.split('/').some((part) => part === '' || part === '.' || part === '..') ||
      !metadata ||
      typeof metadata !== 'object' ||
      !/^[a-f0-9]{64}$/.test(metadata.sha256)
    ) {
      throw new Error(`Invalid managed path in Codegenkit install manifest: ${relative}`)
    }
    managedPath(root, relative)
  }
  const gitignore = validateManifestGitignore(raw.gitignore)
  const mcp = validateManifestMcp(raw.mcp)
  return {
    ...manifest,
    ...(gitignore.length ? { gitignore } : {}),
    ...(mcp ? { mcp } : {}),
  }
}

function profiles(type: CodegenType): Array<'fe' | 'be' | 'docs'> {
  return type === 'fullstack' ? ['fe', 'be'] : [type]
}

function managedSources(
  type: CodegenType,
  adapters: InstallManifest['adapters'],
): Array<{ root: string; targetPrefix: string }> {
  const selectedProfiles = profiles(type)
  const sources = [
    {
      root: path.join(packageRoot(), 'harness', 'shared'),
      targetPrefix: '.cursor',
    },
    ...selectedProfiles.map((profile) => ({
      root: path.join(packageRoot(), 'harness', profile),
      targetPrefix: '.cursor',
    })),
  ]
  for (const adapter of [
    ...(selectedProfiles.includes('fe') &&
    (adapters.fe === 'dotnet-line' || adapters.fe === 'nextjs')
      ? [adapters.fe]
      : []),
    ...(selectedProfiles.includes('be') && adapters.be ? [adapters.be] : []),
  ]) {
    const registryRoot = path.join(packageRoot(), 'adapters', adapter, 'registries')
    if (existsSync(registryRoot)) {
      sources.push({
        root: registryRoot,
        targetPrefix: 'registries',
      })
    }
  }
  // Laravel PHP unitgen engine → product src/.codegenkit/ (gitignored, regenerated).
  if (selectedProfiles.includes('be') && adapters.be === 'laravel') {
    const phpRoot = path.join(packageRoot(), 'adapters', 'laravel', 'php')
    if (existsSync(phpRoot)) {
      sources.push({
        root: phpRoot,
        targetPrefix: 'src/.codegenkit',
      })
    }
  }
  return sources
}

function currentTargets(manifest: Pick<InstallManifest, 'type' | 'adapters'>): Set<string> {
  const targets = new Set<string>()
  for (const entry of managedSources(manifest.type, manifest.adapters)) {
    for (const source of walk(entry.root)) {
      const rel = path.relative(entry.root, source)
      if (
        skipHarnessRel({
          type: manifest.type,
          adapters: manifest.adapters,
          rel,
        })
      ) {
        continue
      }
      targets.add(path.join(entry.targetPrefix, rel).split(path.sep).join('/'))
    }
  }
  return targets
}

export function installHarness(opts: {
  projectRoot: string
  type: CodegenType
  feAdapter?: FeAdapterId
  beAdapter?: BeAdapterId
  force?: boolean
  gitignoreEntries?: OwnedGitignoreEntry[]
  mcp?: Record<string, AgentMcpOwnership>
}): HarnessInstallResult {
  const root = path.resolve(opts.projectRoot)
  const previous = readManifest(root)
  const adapters: InstallManifest['adapters'] = {
    ...(opts.feAdapter ? { fe: opts.feAdapter } : {}),
    ...(opts.beAdapter ? { be: opts.beAdapter } : {}),
  }
  const result: HarnessInstallResult = {
    written: [],
    unchanged: [],
    conflicts: [] as string[],
    skipped: [] as string[],
    stale: [] as string[],
    gitignore: [] as string[],
  }
  const files: InstallManifest['files'] = {}
  const sources = managedSources(opts.type, adapters)

  for (const entry of sources) {
    const sourceRoot = entry.root
    for (const source of walk(sourceRoot)) {
      const rel = path.relative(sourceRoot, source)
      if (skipHarnessRel({ type: opts.type, adapters, rel })) continue
      const targetRel = path.join(entry.targetPrefix, rel).split(path.sep).join('/')
      const target = managedPath(root, targetRel)
      const content = readFileSync(source, 'utf8')
      files[targetRel] = {
        source: path.relative(packageRoot(), source).split(path.sep).join('/'),
        sha256: hash(content),
      }
      if (existsSync(target)) {
        const current = readFileSync(target, 'utf8')
        if (current === content) {
          result.unchanged.push(target)
          continue
        }
        // Shared config skills can overlap across toolkits; skip instead of conflict if already present
        if (
          targetRel.includes('configure-repo-maps') ||
          targetRel.includes('legacy-platform') ||
          targetRel.includes('configure-legacy-')
        ) {
          result.skipped.push(target)
          continue
        }
        const safe = previous?.files[targetRel]?.sha256 === hash(current)
        if (!opts.force && !safe) {
          result.conflicts.push(target)
          continue
        }
      }
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, content)
      result.written.push(target)
    }
  }

  for (const [targetRel, metadata] of Object.entries(previous?.files ?? {})) {
    if (files[targetRel]) continue
    files[targetRel] = { ...metadata, stale: true }
    result.stale.push(managedPath(root, targetRel))
  }

  // Merge ignore entries into .gitignore. Claim all requested toolkit targets
  // (Docskit/Platform DNA shared-ownership contract): deinit only removes
  // exclusive entries, so claiming a shared pattern already present is safe.
  const requestedIgnore = opts.gitignoreEntries ?? []
  const ensureResult = requestedIgnore.length
    ? ensureGitignoreEntries(root, requestedIgnore.map((entry) => entry.pattern))
    : { file: path.join(root, '.gitignore'), added: [] as string[], changed: false }
  if (ensureResult.changed) result.written.push(ensureResult.file)
  else if (requestedIgnore.length) result.unchanged.push(ensureResult.file)

  const gitignore = mergeOwnedGitignore(previous?.gitignore, requestedIgnore)
  result.gitignore = gitignore

  const mcp = mergeManifestMcp(previous?.mcp, opts.mcp)

  mkdirSync(path.dirname(manifestFile(root)), { recursive: true })
  const manifest: InstallManifest = {
    schemaVersion: 1,
    package: '@platform/codegenkit',
    packageVersion: packageVersion(),
    type: opts.type,
    adapters,
    toolApi: 1,
    harnessApi: 1,
    files,
    ...(gitignore.length ? { gitignore } : {}),
    ...(mcp ? { mcp } : {}),
  }
  writeFileSync(manifestFile(root), `${JSON.stringify(manifest, null, 2)}\n`)
  recordInstall(root)
  return result
}

function mergeManifestMcp(
  previous: Record<string, AgentMcpOwnership> | undefined,
  next: Record<string, AgentMcpOwnership> | undefined,
): Record<string, AgentMcpOwnership> | undefined {
  const merged = { ...(previous ?? {}), ...(next ?? {}) }
  return Object.keys(merged).length ? merged : undefined
}

export function harnessStatus(projectRoot?: string): HarnessStatus {
  const root = path.resolve(projectRoot ?? process.cwd())
  const currentPackageVersion = packageVersion()
  const previous = readManifest(root, true)
  const healthy: string[] = []
  const missing: string[] = []
  const modified: string[] = []
  const stale: string[] = []

  if (!previous) {
    return {
      projectRoot: root,
      packageVersion: currentPackageVersion,
      installed: false,
      packageVersionInstalled: null,
      type: null,
      adapters: null,
      toolApi: null,
      harnessApi: null,
      healthy,
      missing,
      modified,
      stale,
      warnings: legacyProductEngineRoots(root).map(
        (dir) => `legacy product engine present: ${path.relative(root, dir) || dir} (run codegenkit prune --yes)`,
      ),
      gitignore: [],
      mcp: [],
      compat: 'warn',
    }
  }

  const compatibleApis =
    previous.schemaVersion === 1 && previous.toolApi === 1 && previous.harnessApi === 1
  const selectedTargets = compatibleApis ? currentTargets(previous) : null
  for (const [targetRel, metadata] of Object.entries(previous.files)) {
    const target = managedPath(root, targetRel)
    if (!existsSync(target)) {
      missing.push(target)
      continue
    }
    const currentHash = hash(readFileSync(target))
    const isStale = selectedTargets
      ? !selectedTargets.has(targetRel)
      : metadata.stale === true
    if (isStale && currentHash === metadata.sha256) stale.push(target)
    else if (currentHash === metadata.sha256) healthy.push(target)
    else modified.push(target)
  }

  const warnings = legacyProductEngineRoots(root).map(
    (dir) =>
      `legacy product engine present: ${path.relative(root, dir) || dir} (run codegenkit prune --yes)`,
  )

  return {
    projectRoot: root,
    packageVersion: currentPackageVersion,
    installed: true,
    packageVersionInstalled: previous.packageVersion,
    type: previous.type,
    adapters: previous.adapters,
    toolApi: previous.toolApi,
    harnessApi: previous.harnessApi,
    healthy,
    missing,
    modified,
    stale,
    warnings,
    gitignore: gitignoreStatus(root, previous),
    mcp: mcpStatus(root, previous),
    compat: !compatibleApis
      ? 'fail'
      : previous.packageVersion === currentPackageVersion && warnings.length === 0
        ? 'ok'
        : 'warn',
  }
}

function gitignoreStatus(root: string, manifest: InstallManifest): GitignoreEntryStatus[] {
  const entries = manifest.gitignore ?? []
  if (!entries.length) return []
  const file = path.join(root, '.gitignore')
  const present = new Set<string>()
  if (existsSync(file) && lstatSync(file).isFile()) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) present.add(canonicalGitignorePattern(trimmed))
    }
  }
  return entries.map((entry) => ({
    pattern: entry.pattern,
    shared: Boolean(entry.shared),
    status: present.has(canonicalGitignorePattern(entry.pattern)) ? 'present' : 'missing',
  }))
}

function mcpEntryCanonicalHash(entry: unknown): string {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      return `{${entries.join(',')}}`
    }
    return JSON.stringify(value ?? null)
  }
  return createHash('sha256').update(canonical(entry)).digest('hex')
}

function mcpStatus(root: string, manifest: InstallManifest): McpAgentStatus[] {
  const mcp = manifest.mcp ?? {}
  const out: McpAgentStatus[] = []
  for (const [agent, ownership] of Object.entries(mcp)) {
    const file = managedPath(root, ownership.file)
    if (!existsSync(file)) {
      out.push({ agent, file: ownership.file, status: 'missing' })
      continue
    }
    const lower = ownership.file.toLowerCase()
    const isJsonMcp =
      lower.endsWith('.json')
      || lower.endsWith('mcp.json')
      || lower.endsWith('settings.json')
      || lower.endsWith('mcp_config.json')
    if (!isJsonMcp) {
      out.push({ agent, file: ownership.file, status: 'present' })
      continue
    }
    try {
      const doc = JSON.parse(readFileSync(file, 'utf8')) as { mcpServers?: Record<string, unknown> }
      const entry = doc.mcpServers?.codegenkit
      if (entry === undefined) {
        out.push({ agent, file: ownership.file, status: 'missing' })
      } else if (mcpEntryCanonicalHash(entry) === ownership.sha256) {
        out.push({ agent, file: ownership.file, status: 'present' })
      } else {
        out.push({ agent, file: ownership.file, status: 'modified' })
      }
    } catch {
      out.push({ agent, file: ownership.file, status: 'modified' })
    }
  }
  return out
}

export function pruneHarness(opts: {
  projectRoot?: string
  yes?: boolean
} = {}): PruneResult {
  const root = path.resolve(opts.projectRoot ?? process.cwd())
  const previous = readManifest(root)
  const result: PruneResult = { removable: [], modified: [], removed: [] }

  for (const legacy of legacyProductEngineRoots(root)) {
    result.removable.push(legacy)
    if (opts.yes) {
      rmSync(legacy, { recursive: true, force: true })
      result.removed.push(legacy)
    }
  }

  if (!previous) return result

  const selectedTargets = currentTargets(previous)
  for (const [targetRel, metadata] of Object.entries(previous.files)) {
    if (selectedTargets.has(targetRel)) continue
    const target = managedPath(root, targetRel)
    if (!existsSync(target)) continue
    if (hash(readFileSync(target)) !== metadata.sha256) {
      result.modified.push(target)
      continue
    }
    result.removable.push(target)
    if (opts.yes) {
      rmSync(target)
      result.removed.push(target)
    }
  }

  if (opts.yes && result.removed.length && previous) {
    for (const target of result.removed) {
      const targetRel = path.relative(root, target).split(path.sep).join('/')
      delete previous.files[targetRel]
    }
    writeFileSync(manifestFile(root), `${JSON.stringify(previous, null, 2)}\n`)
  }
  return result
}

function pruneEmptyDirs(root: string, files: string[]): void {
  const directories = new Set<string>()
  for (const file of files) {
    let directory = path.dirname(file)
    while (directory !== root && directory.startsWith(`${root}${path.sep}`)) {
      directories.add(directory)
      directory = path.dirname(directory)
    }
  }
  for (const directory of [...directories].sort((a, b) => b.length - a.length)) {
    try {
      if (existsSync(directory) && readdirSync(directory).length === 0) {
        rmSync(directory, { recursive: false })
      }
    } catch {
      // Keep non-empty or busy directories.
    }
  }
}

/**
 * Remove all manifest-owned harness assets, current and stale. Files whose
 * content no longer matches the recorded installed hash are preserved.
 * Exclusive gitignore entries are removed; shared entries are kept.
 */
export function uninstallHarness(opts: {
  projectRoot?: string
  yes?: boolean
} = {}): HarnessUninstallResult {
  const root = path.resolve(opts.projectRoot ?? process.cwd())
  const manifest = readManifest(root)
  const dryRun = !opts.yes
  const manifestPath = manifestFile(root)
  const result: HarnessUninstallResult = {
    manifest: manifestPath,
    dryRun,
    removable: [],
    removed: [],
    modified: [],
    missing: [],
    manifestRemoved: false,
    gitignoreRemoved: [],
  }
  if (!manifest) return result

  for (const [relative, metadata] of Object.entries(manifest.files)) {
    const target = managedPath(root, relative)
    if (!existsSync(target)) {
      result.missing.push(target)
      continue
    }
    if (hash(readFileSync(target)) !== metadata.sha256) {
      result.modified.push(target)
      continue
    }
    result.removable.push(target)
    if (opts.yes) {
      rmSync(target)
      result.removed.push(target)
    }
  }

  // Remove only exclusively-owned ignore entries; shared entries (for example
  // `.cursor/`) may still be relied on by another toolkit, so keep them.
  const exclusiveIgnore = (manifest.gitignore ?? [])
    .filter((entry) => !entry.shared)
    .map((entry) => entry.pattern)
  if (exclusiveIgnore.length) {
    if (dryRun) {
      const file = path.join(root, '.gitignore')
      const present =
        existsSync(file) && lstatSync(file).isFile()
          ? new Set(
              readFileSync(file, 'utf8')
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('#'))
                .map(canonicalGitignorePattern),
            )
          : new Set<string>()
      for (const pattern of exclusiveIgnore) {
        if (present.has(canonicalGitignorePattern(pattern))) {
          result.gitignoreRemoved.push(pattern)
        }
      }
    } else {
      const removed = removeGitignoreEntries(root, exclusiveIgnore)
      result.gitignoreRemoved.push(...removed.removed)
    }
  }

  if (!dryRun && existsSync(manifestPath)) {
    rmSync(manifestPath)
    result.manifestRemoved = true
    forgetInstall(root)
    pruneEmptyDirs(root, [...result.removed, manifestPath])
  }
  return result
}
