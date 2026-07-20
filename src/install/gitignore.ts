import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Shared `.gitignore` contract (Platform DNA semantics):
 * idempotent, EOL-preserving, equivalence-aware.
 *
 * Destination repos never hand-maintain Codegenkit ignore blocks. Init merges
 * only the local artifacts this run actually wrote.
 */

export interface OwnedGitignoreEntry {
  pattern: string
  /**
   * Shared entries may be relied on by other toolkits (for example `.cursor/`).
   * Ensured on init but kept on deinit so removing Codegenkit never breaks
   * another toolkit still using them.
   */
  shared?: boolean
}

export interface EnsureGitignoreResult {
  file: string
  /** Entries newly written by this call (trimmed source form). */
  added: string[]
  changed: boolean
}

export interface RemoveGitignoreResult {
  file?: string
  removed: string[]
  changed: boolean
}

export interface GeneratedTargetInput {
  projectRoot: string
  /** Absolute paths Codegenkit actually wrote (agent configs, permissions, …). */
  written: string[]
  /** True when this run installed/updated the harness + `.codegenkit/` state. */
  harnessInstalled: boolean
  /** When set to laravel, also claim the synced PHP unitgen tree. */
  beAdapter?: string
}

const LEGACY_START = '# >>> codegenkit generated files'
const LEGACY_END = '# <<< codegenkit generated files'

/**
 * Canonical form so `.cursor/`, `/.cursor/` and `.cursor` compare equal.
 */
export function canonicalGitignorePattern(pattern: string): string {
  let value = pattern.trim()
  if (!value) return ''
  let negated = false
  if (value.startsWith('!')) {
    negated = true
    value = value.slice(1)
  }
  value = value.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')
  return `${negated ? '!' : ''}${value}`
}

function detectEol(content: string): '\r\n' | '\n' {
  return /\r\n/.test(content) ? '\r\n' : '\n'
}

function presentPatterns(content: string): Set<string> {
  const set = new Set<string>()
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    set.add(canonicalGitignorePattern(line))
  }
  return set
}

function gitignorePath(root: string): string {
  const file = path.join(path.resolve(root), '.gitignore')
  if (existsSync(file) && !lstatSync(file).isFile()) {
    throw new Error(`.gitignore is not a regular file: ${file}`)
  }
  return file
}

function linesOf(content: string): string[] {
  return content.split(/\r?\n/)
}

function withoutLegacyBlock(lines: string[]): { lines: string[]; changed: boolean } {
  const start = lines.indexOf(LEGACY_START)
  if (start < 0) return { lines, changed: false }
  const end = lines.indexOf(LEGACY_END, start + 1)
  if (end < 0) throw new Error(`Invalid .gitignore: missing "${LEGACY_END}"`)
  // Keep the entries that lived inside the block — only strip markers.
  const kept = [
    ...lines.slice(0, start),
    ...lines.slice(start + 1, end).filter((line) => {
      const trimmed = line.trim()
      return trimmed.length > 0
    }),
    ...lines.slice(end + 1),
  ]
  while (kept.length > 1 && kept.at(-1) === '' && kept.at(-2) === '') kept.pop()
  return { lines: kept, changed: true }
}

/**
 * Ensure every pattern is present exactly once. Creates the file when missing,
 * migrates the legacy owned block once, preserves member content and EOL.
 */
export function ensureGitignoreEntries(root: string, patterns: string[]): EnsureGitignoreResult {
  const file = gitignorePath(root)
  const existed = existsSync(file)
  const original = existed ? readFileSync(file, 'utf8') : ''
  const eol = existed ? detectEol(original) : '\n'
  const migrated = withoutLegacyBlock(linesOf(original))
  let content = original
  if (migrated.changed) {
    const trailing = /\r?\n$/.test(original)
    const body = migrated.lines.join(eol)
    content = body && trailing && !body.endsWith(eol) ? `${body}${eol}` : body
    writeFileSync(file, content, 'utf8')
  }

  const present = presentPatterns(content)
  const seen = new Set<string>()
  const added: string[] = []
  for (const pattern of patterns) {
    const canonical = canonicalGitignorePattern(pattern)
    if (!canonical || present.has(canonical) || seen.has(canonical)) continue
    seen.add(canonical)
    added.push(pattern.trim())
  }
  if (!added.length) return { file, added: [], changed: migrated.changed }

  const prefix = content.length > 0 && !/\r?\n$/.test(content) ? eol : ''
  writeFileSync(file, `${content}${prefix}${added.join(eol)}${eol}`)
  return { file, added, changed: true }
}

/**
 * Remove the given patterns (matched by equivalence) while preserving unrelated
 * member lines and the file's dominant EOL.
 */
export function removeGitignoreEntries(root: string, patterns: string[]): RemoveGitignoreResult {
  const file = gitignorePath(root)
  if (!existsSync(file)) return { removed: [], changed: false }

  const content = readFileSync(file, 'utf8')
  const eol = detectEol(content)
  const drop = new Set(patterns.map(canonicalGitignorePattern).filter(Boolean))
  const hadTrailingNewline = /\r?\n$/.test(content)

  const removed: string[] = []
  const kept: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim()
    const canonical = trimmed && !trimmed.startsWith('#') ? canonicalGitignorePattern(trimmed) : ''
    if (canonical && drop.has(canonical)) {
      removed.push(trimmed)
      continue
    }
    kept.push(raw)
  }
  if (!removed.length) return { file, removed: [], changed: false }

  if (hadTrailingNewline && kept[kept.length - 1] === '') kept.pop()
  const body = kept.join(eol)
  writeFileSync(file, body.length && hadTrailingNewline ? `${body}${eol}` : body)
  return { file, removed, changed: true }
}

function isWithin(root: string, candidate: string): boolean {
  const absRoot = path.resolve(root)
  const abs = path.resolve(candidate)
  return abs === absRoot || abs.startsWith(`${absRoot}${path.sep}`)
}

/**
 * Map a repo-local written path to the coarsest ignore entry Codegenkit should own.
 */
export function ignorePatternForLocalPath(
  projectRoot: string,
  absolutePath: string,
): string | undefined {
  const cleaned = absolutePath.replace(/ \(permissions\)$/, '')
  if (!isWithin(projectRoot, cleaned)) return undefined
  const rel = path.relative(path.resolve(projectRoot), path.resolve(cleaned))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return undefined
  const posix = rel.split(path.sep).join('/')
  if (posix === 'src/.codegenkit' || posix.startsWith('src/.codegenkit/')) {
    return 'src/.codegenkit/'
  }
  const top = posix.split('/')[0]
  if (!top) return undefined

  if (top === '.cursor') return '.cursor/'
  if (top === '.codegenkit') return '.codegenkit/'
  if (top === '.claude.json') return '.claude.json'
  if (top === '.claude') return '.claude/'
  if (top === '.codex') return '.codex/'
  if (top === '.hermes') return '.hermes/'
  if (top === '.gemini') return '.gemini/'
  if (top === '.kiro') return '.kiro/'
  if (top === '.kilocode') return '.kilocode/'
  if (top === 'opencode.json') return 'opencode.json'
  if (top === 'opencode.jsonc') return 'opencode.jsonc'
  return undefined
}

/**
 * Single source of truth for ignore entries produced by a Codegenkit init run.
 * Only local, actually-written toolkit targets; never product `src/`/`generated/`
 * or `.codegraph*`.
 */
export function generatedTargets(input: GeneratedTargetInput): OwnedGitignoreEntry[] {
  const byCanonical = new Map<string, OwnedGitignoreEntry>()
  const add = (pattern: string, shared?: boolean): void => {
    const canonical = canonicalGitignorePattern(pattern)
    if (!canonical) return
    const existing = byCanonical.get(canonical)
    byCanonical.set(canonical, {
      pattern: existing?.pattern ?? pattern,
      ...(shared || existing?.shared ? { shared: true } : {}),
    })
  }

  if (input.harnessInstalled) {
    add('.cursor/', true)
    add('.codegenkit/', false)
  }
  if (input.beAdapter === 'laravel') {
    add('src/.codegenkit/', false)
  }

  for (const file of input.written) {
    const pattern = ignorePatternForLocalPath(input.projectRoot, file)
    if (!pattern) continue
    const shared = canonicalGitignorePattern(pattern) === canonicalGitignorePattern('.cursor/')
    add(pattern, shared)
  }

  return [...byCanonical.values()]
}

/**
 * Merge previous + next owned ignore entries. `shared` wins if either side
 * marks the pattern shared.
 */
export function mergeOwnedGitignore(
  previous: OwnedGitignoreEntry[] | undefined,
  next: OwnedGitignoreEntry[] | undefined,
): OwnedGitignoreEntry[] {
  const byCanonical = new Map<string, OwnedGitignoreEntry>()
  for (const entry of [...(previous ?? []), ...(next ?? [])]) {
    const canonical = canonicalGitignorePattern(entry.pattern)
    if (!canonical) continue
    const existing = byCanonical.get(canonical)
    byCanonical.set(canonical, {
      pattern: existing?.pattern ?? entry.pattern,
      ...(entry.shared || existing?.shared ? { shared: true } : {}),
    })
  }
  return [...byCanonical.values()]
}
