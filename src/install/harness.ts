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
}

export interface HarnessInstallResult {
  written: string[]
  unchanged: string[]
  conflicts: string[]
  stale: string[]
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
}

function hash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
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

function readManifest(root: string, allowIncompatible = false): InstallManifest | null {
  const file = managedPath(root, '.codegenkit/install-manifest.json')
  if (!existsSync(file)) return null
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as InstallManifest
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
  return manifest
}

function profiles(type: CodegenType): Array<'fe' | 'be'> {
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
    ...(selectedProfiles.includes('fe') && adapters.fe === 'dotnet-line'
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
    conflicts: [],
    stale: [],
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

  mkdirSync(path.dirname(manifestFile(root)), { recursive: true })
  writeFileSync(
    manifestFile(root),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        package: '@platform/codegenkit',
        packageVersion: packageVersion(),
        type: opts.type,
        adapters,
        toolApi: 1,
        harnessApi: 1,
        files,
      } satisfies InstallManifest,
      null,
      2,
    )}\n`,
  )
  recordInstall(root)
  return result
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
    compat: !compatibleApis
      ? 'fail'
      : previous.packageVersion === currentPackageVersion
        ? 'ok'
        : 'warn',
  }
}

export function pruneHarness(opts: {
  projectRoot?: string
  yes?: boolean
} = {}): PruneResult {
  const root = path.resolve(opts.projectRoot ?? process.cwd())
  const previous = readManifest(root)
  const result: PruneResult = { removable: [], modified: [], removed: [] }
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

  if (opts.yes && result.removed.length) {
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

  if (!dryRun && existsSync(manifestPath)) {
    rmSync(manifestPath)
    result.manifestRemoved = true
    forgetInstall(root)
    pruneEmptyDirs(root, [...result.removed, manifestPath])
  }
  return result
}
