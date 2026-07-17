import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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

interface Manifest {
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
  files: Record<string, { source: string; sha256: string }>
}

function hash(content: string): string {
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

function manifestFile(root: string): string {
  return path.join(root, '.codegenkit', 'install-manifest.json')
}

export function installHarness(opts: {
  projectRoot: string
  type: CodegenType
  feAdapter?: FeAdapterId
  beAdapter?: BeAdapterId
  force?: boolean
}): { written: string[]; unchanged: string[]; conflicts: string[] } {
  const root = path.resolve(opts.projectRoot)
  const profiles: Array<'fe' | 'be'> =
    opts.type === 'fullstack' ? ['fe', 'be'] : [opts.type]
  const previous: Manifest | null = existsSync(manifestFile(root))
    ? (JSON.parse(readFileSync(manifestFile(root), 'utf8')) as Manifest)
    : null
  const result = { written: [] as string[], unchanged: [] as string[], conflicts: [] as string[] }
  const files: Manifest['files'] = { ...(previous?.files ?? {}) }
  const sources = profiles.map((profile) => ({
    root: path.join(packageRoot(), 'harness', profile),
    targetPrefix: '.cursor',
  }))
  if (profiles.includes('be') && opts.beAdapter) {
    sources.push({
      root: path.join(packageRoot(), 'adapters', opts.beAdapter, 'registries'),
      targetPrefix: 'registries',
    })
  }

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

  mkdirSync(path.dirname(manifestFile(root)), { recursive: true })
  writeFileSync(
    manifestFile(root),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        package: '@platform/codegenkit',
        packageVersion: packageVersion(),
        type: opts.type,
        adapters: {
          ...(opts.feAdapter ? { fe: opts.feAdapter } : {}),
          ...(opts.beAdapter ? { be: opts.beAdapter } : {}),
        },
        toolApi: 1,
        harnessApi: 1,
        files,
      } satisfies Manifest,
      null,
      2,
    )}\n`,
  )
  return result
}
