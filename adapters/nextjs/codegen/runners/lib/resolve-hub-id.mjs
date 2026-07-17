/**
 * Resolve short hub IDs → filesystem paths (docs hub + tests hub).
 * IDs: W-* | API-* | UI-* | CMP-* | CTR-* | TC-* | SC-* | suite id (smoke, …)
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

function loadJson(file) {
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') {
      out[k] = deepMerge(base[k], v)
    } else out[k] = v
  }
  return out
}

export function loadPlatformRepos(repoRoot) {
  let doc = loadJson(path.join(repoRoot, 'platform-repos.json'))
  if (!doc) throw new Error(`Missing platform-repos.json in ${repoRoot}`)
  const local = loadJson(path.join(repoRoot, 'platform-repos.local.json'))
  if (local) doc = deepMerge(doc, local)
  return doc
}

export function resolveProjectRoot(repoRoot, projectId) {
  const doc = loadPlatformRepos(repoRoot)
  const proj = doc.projects?.[projectId]
  if (!proj?.root) throw new Error(`Unknown project "${projectId}" in platform-repos.json`)
  return path.resolve(repoRoot, proj.root)
}

export function loadDocsIndex(docsRoot) {
  const file = path.join(docsRoot, 'registries', 'docs-index.json')
  const idx = loadJson(file)
  if (!idx) throw new Error(`Missing ${file}`)
  return idx
}

export function loadTestsIndex(testsRoot) {
  const file = path.join(testsRoot, 'registries', 'tests-index.json')
  const idx = loadJson(file)
  if (!idx) {
    return buildTestsIndexFallback(testsRoot)
  }
  return idx
}

/** Scan cases/ + suites/ when index missing */
function buildTestsIndexFallback(testsRoot) {
  const codeIds = {}
  const casesDir = path.join(testsRoot, 'cases')
  const suites = {}
  if (existsSync(casesDir)) {
    for (const screen of readdirSync(casesDir, { withFileTypes: true })) {
      if (!screen.isDirectory() || screen.name.startsWith('.')) continue
      const screenPath = path.join(casesDir, screen.name)
      codeIds[screen.name] = path.relative(testsRoot, screenPath).split(path.sep).join('/')
      for (const f of readdirSync(screenPath)) {
        if (/^TC-.*\.ya?ml$/i.test(f)) {
          const id = f.replace(/\.ya?ml$/i, '')
          codeIds[id] = path.relative(testsRoot, path.join(screenPath, f)).split(path.sep).join('/')
        }
      }
    }
  }
  const suitesDir = path.join(testsRoot, 'suites')
  if (existsSync(suitesDir)) {
    for (const f of readdirSync(suitesDir)) {
      if (!f.endsWith('.yaml') && !f.endsWith('.yml')) continue
      const raw = readFileSync(path.join(suitesDir, f), 'utf8')
      const idMatch = raw.match(/^id:\s*(\S+)/m)
      const sid = idMatch?.[1] || f.replace(/\.ya?ml$/i, '')
      suites[sid] = path.relative(testsRoot, path.join(suitesDir, f)).split(path.sep).join('/')
    }
  }
  return { version: 1, codeIds, suites, scenarios: {} }
}

function absUnder(root, rel) {
  if (!rel) return null
  const abs = path.resolve(root, rel)
  if (!existsSync(abs)) return null
  return abs
}

/** Prefer ir/spec.yaml under a Code folder for portal:gen */
export function preferGenSpec(codeDir) {
  if (!codeDir || !existsSync(codeDir)) return null
  const ir = path.join(codeDir, 'ir', 'spec.yaml')
  if (existsSync(ir)) return ir
  // fallback: any *bundle.yaml (may not be gen-ready)
  for (const f of readdirSync(codeDir)) {
    if (f.endsWith('.bundle.yaml') || f === 'spec.yaml') return path.join(codeDir, f)
  }
  return null
}

/**
 * @param {string} repoRoot FE/BE code repo (usually portal)
 * @param {string} id
 * @param {'codegen'|'testcase'} mode
 * @returns {{ kind: string, id: string, paths: string[], notes: string[] }}
 */
export function resolveHubId(repoRoot, id, mode = 'testcase') {
  if (!id || typeof id !== 'string') throw new Error('Missing --id')
  const notes = []
  const docsRoot = process.env.CODEGENKIT_DOCS_ROOT
    ? path.resolve(process.env.CODEGENKIT_DOCS_ROOT)
    : (() => {
        try { return resolveProjectRoot(repoRoot, 'docs') } catch {
          return resolveProjectRoot(repoRoot, 'base-docs')
        }
      })()
  let testsRoot
  try {
    testsRoot = process.env.CODEGENKIT_TESTS_ROOT
      ? path.resolve(process.env.CODEGENKIT_TESTS_ROOT)
      : (() => {
          try { return resolveProjectRoot(repoRoot, 'tests') } catch {
            return resolveProjectRoot(repoRoot, 'base-tests')
          }
        })()
  } catch (error) {
    if (mode === 'codegen') {
      testsRoot = docsRoot // unused for pure codegen W-* paths
    } else {
      throw error
    }
  }
  const docsIdx = loadDocsIndex(docsRoot)
  const testsIdx = loadTestsIndex(testsRoot)

  // Suite
  if (testsIdx.suites?.[id]) {
    const suitePath = absUnder(testsRoot, testsIdx.suites[id])
    const raw = readFileSync(suitePath, 'utf8')
    const caseIds = [...raw.matchAll(/^\s*-\s+(TC-[\w-]+)/gm)].map((m) => m[1])
    const paths = []
    for (const cid of caseIds) {
      const rel = testsIdx.codeIds?.[cid]
      const p = absUnder(testsRoot, rel)
      if (p) paths.push(p)
      else notes.push(`suite ${id}: missing case ${cid}`)
    }
    return { kind: 'suite', id, paths, notes, suitePath }
  }

  // TC-* file
  if (/^TC-/i.test(id)) {
    const rel = testsIdx.codeIds?.[id]
    const p = absUnder(testsRoot, rel)
    if (!p) throw new Error(`Unknown testcase id ${id} — update base-tests/registries/tests-index.json`)
    return { kind: 'testcase', id, paths: [p], notes }
  }

  // Screen / API / UI code folder on docs
  if (/^(W|API|UI)-/i.test(id)) {
    if (mode === 'testcase') {
      const screenRel = testsIdx.codeIds?.[id] || `cases/${id}`
      const screenDir = absUnder(testsRoot, screenRel)
      if (!screenDir) throw new Error(`No cases folder for ${id} under base-tests`)
      const paths = readdirSync(screenDir)
        .filter((f) => /^TC-.*\.ya?ml$/i.test(f))
        .map((f) => path.join(screenDir, f))
        .sort()
      if (!paths.length) throw new Error(`No TC-*.yaml under ${screenDir}`)
      return { kind: 'screen-cases', id, paths, notes }
    }
    // codegen
    const rel = docsIdx.codeIds?.[id]
    if (!rel) throw new Error(`Unknown code id ${id} in base-docs registries/docs-index.json`)
    const codeDir = absUnder(docsRoot, rel)
    const spec = preferGenSpec(codeDir)
    if (!spec) throw new Error(`No ir/spec.yaml or bundle under ${rel}`)
    notes.push(`codegen input: ${path.relative(repoRoot, spec)}`)
    return { kind: 'code', id, paths: [spec], notes, codeDir }
  }

  // CMP-* → all code children
  if (/^CMP-/i.test(id)) {
    const cmp = (docsIdx.components || []).find(
      (c) => c.id === id || c.id.startsWith(id) || (c.slug && id.toLowerCase().includes(c.slug)),
    )
    if (!cmp) throw new Error(`Unknown component ${id}`)
    const paths = []
    if (mode === 'testcase') {
      for (const screen of cmp.screens || []) {
        const sub = resolveHubId(repoRoot, screen, 'testcase')
        paths.push(...sub.paths)
        notes.push(...sub.notes)
      }
      return { kind: 'component-cases', id, paths, notes }
    }
    for (const screen of cmp.screens || []) {
      try {
        const sub = resolveHubId(repoRoot, screen, 'codegen')
        paths.push(...sub.paths)
        notes.push(...sub.notes)
      } catch (e) {
        notes.push(String(e.message || e))
      }
    }
    for (const api of cmp.apis || []) {
      notes.push(`skip API ${api} for portal:gen (FE codegen); design lives in docs hub`)
    }
    if (!paths.length) {
      throw new Error(`CMP ${id}: no gen-ready W-* specs (need ir/spec.yaml after /dev-grill-docs)`)
    }
    return { kind: 'component-code', id, paths, notes }
  }

  // CTR-* → screens linked in docs index containers map (optional)
  if (/^CTR-/i.test(id)) {
    const screens = docsIdx.containers?.[id]?.screens || testsIdx.targets?.[id]?.screens || []
    if (!screens.length) {
      // default admin web → pilot screens
      if (id === 'CTR-admin-web') {
        return resolveHubId(repoRoot, 'CMP-01', mode)
      }
      throw new Error(`No screens mapped for ${id} in docs-index.containers or tests-index.targets`)
    }
    const paths = []
    for (const screen of screens) {
      const sub = resolveHubId(repoRoot, screen, mode)
      paths.push(...sub.paths)
      notes.push(...sub.notes)
    }
    return { kind: 'container', id, paths, notes }
  }

  // SC-* scenario → cases listed in tests index
  if (/^SC-/i.test(id)) {
    const sc = testsIdx.scenarios?.[id]
    if (!sc?.cases?.length) {
      throw new Error(`Unknown scenario ${id} — add scenarios.${id}.cases in tests-index.json`)
    }
    const paths = []
    for (const cid of sc.cases) {
      const sub = resolveHubId(repoRoot, cid, 'testcase')
      paths.push(...sub.paths)
    }
    return { kind: 'scenario', id, paths, notes }
  }

  throw new Error(
    `Unrecognized id "${id}". Use W-|API-|UI-|CMP-|CTR-|TC-|SC-* or suite id (smoke, regression-auth).`,
  )
}
