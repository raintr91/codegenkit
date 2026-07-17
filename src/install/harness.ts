import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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

export const FE_SKILLS = ['prototype', 'wire', 'unit', 'grill-prototype', 'grill-unit'] as const
export const BE_SKILLS = ['api', 'grill-api'] as const

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

function hash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
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
  const file = manifestFile(root)
  if (!existsSync(file)) return null
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as InstallManifest
  if (
    !allowIncompatible &&
    (manifest.schemaVersion !== 1 || manifest.toolApi !== 1 || manifest.harnessApi !== 1)
  ) {
    throw new Error(
      `Unsupported Codegenkit install manifest API at ${file}; upgrade Codegenkit or remove the stale manifest explicitly.`,
    )
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
  const sources = selectedProfiles.map((profile) => ({
    root: path.join(packageRoot(), 'harness', profile),
    targetPrefix: '.cursor',
  }))
  if (selectedProfiles.includes('be') && adapters.be) {
    sources.push({
      root: path.join(packageRoot(), 'adapters', adapters.be, 'registries'),
      targetPrefix: 'registries',
    })
  }
  return sources
}

function currentTargets(manifest: Pick<InstallManifest, 'type' | 'adapters'>): Set<string> {
  const targets = new Set<string>()
  for (const entry of managedSources(manifest.type, manifest.adapters)) {
    for (const source of walk(entry.root)) {
      const rel = path.relative(entry.root, source)
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
      const targetRel = path.join(entry.targetPrefix, rel).split(path.sep).join('/')
      const target = path.join(root, targetRel)
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
    result.stale.push(path.join(root, targetRel))
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
    const target = path.join(root, targetRel)
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
    const target = path.join(root, targetRel)
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
