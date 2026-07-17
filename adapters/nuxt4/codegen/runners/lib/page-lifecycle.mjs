import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const REGISTRY_REL = 'registries/page-lifecycle.registry.json'
const DOC_REL = 'docs/operational/PAGE-LIFECYCLE.md'
const STAGE_ORDER = ['design-spec', 'prototype', 'test', 'wire']

/**
 * pages/hotels/index.vue → /hotels
 * @param {string} relativePagePath
 */
export function routePathFromPageFile(relativePagePath) {
  const normalized = relativePagePath.replace(/\\/g, '/')
  const match = normalized.match(/^pages\/(.+)\/index\.vue$/)
  if (!match) return null
  return `/${match[1]}`
}

export function normalizeRoutePath(routePath) {
  if (!routePath) return '/'
  const trimmed = routePath.trim()
  if (trimmed === '/') return '/'
  return trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') || '/' : `/${trimmed}`
}

/**
 * @param {string} requested
 * @param {string | undefined} existingStage
 * @param {{ allowDowngrade?: boolean }} options
 */
export function resolveLifecycleStage(requested, existingStage, options = {}) {
  if (!existingStage) return requested
  if (options.allowDowngrade) return requested

  const reqIdx = STAGE_ORDER.indexOf(requested)
  const curIdx = STAGE_ORDER.indexOf(existingStage)
  if (reqIdx === -1) return existingStage
  if (curIdx === -1) return requested
  return curIdx > reqIdx ? existingStage : requested
}

async function loadRegistry(root) {
  const registryPath = path.join(root, REGISTRY_REL)
  try {
    return { data: JSON.parse(await readFile(registryPath, 'utf8')), registryPath }
  } catch {
    return { data: { routes: {} }, registryPath }
  }
}

async function saveRegistry(root, data) {
  const registryPath = path.join(root, REGISTRY_REL)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(registryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  await renderPageLifecycleDoc(root, data)
  return registryPath
}

/**
 * @param {string} root
 * @param {{ routePath: string, specFile?: string, title?: string, stage?: string, note?: string, allowDowngrade?: boolean }} entry
 */
export async function upsertPageLifecycle(root, entry) {
  const { data } = await loadRegistry(root)
  const routePath = normalizeRoutePath(entry.routePath)
  const existing = data.routes[routePath]
  const stage = resolveLifecycleStage(entry.stage ?? 'prototype', existing?.stage, {
    allowDowngrade: entry.allowDowngrade
  })

  data.routes[routePath] = {
    stage,
    spec:
      !entry.specFile || entry.specFile === 'manual'
        ? (existing?.spec ?? entry.specFile)
        : entry.specFile.replace(/\\/g, '/'),
    title: entry.title ?? existing?.title,
    updatedAt: new Date().toISOString(),
    note: entry.note ?? existing?.note
  }

  await saveRegistry(root, data)
  return { registryPath: REGISTRY_REL, routePath, stage }
}

/**
 * Hạ stage sau portal:remove — mặc định design-spec (chưa có prototype).
 * @param {string} root
 * @param {string} routePath
 * @param {{ specFile?: string, note?: string }} meta
 */
export async function demotePageLifecycle(root, routePath, meta = {}) {
  return upsertPageLifecycle(root, {
    routePath,
    specFile: meta.specFile ?? 'manual',
    stage: 'design-spec',
    allowDowngrade: true,
    note: meta.note ?? 'Prototype code removed — chạy portal:gen để tạo lại.'
  })
}

/**
 * Đồng bộ registry từ mọi codegen.manifest.json + kiểm tra page còn trên disk.
 * @param {string} root
 */
export async function syncPageLifecycleFromManifests(root) {
  const { data } = await loadRegistry(root)
  const manifests = await listManifestFiles(root)
  const touched = new Set()

  for (const manifestPath of manifests) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const pageEntry = manifest.files?.find((f) => f.layer === 'page')
    if (!pageEntry?.path) continue

    const routePath = routePathFromPageFile(pageEntry.path)
    if (!routePath) continue

    touched.add(routePath)
    const pageExists = await fileExists(path.join(root, pageEntry.path))
    const existing = data.routes[routePath]
    const stage = pageExists
      ? resolveLifecycleStage('prototype', existing?.stage)
      : resolveLifecycleStage('design-spec', existing?.stage, { allowDowngrade: true })

    data.routes[routePath] = {
      stage,
      spec: manifest.specFile?.replace(/\\/g, '/') ?? existing?.spec ?? 'unknown',
      title: existing?.title,
      updatedAt: new Date().toISOString(),
      note: pageExists ? existing?.note : 'Page file missing — sync demoted to design-spec.'
    }
  }

  for (const [routePath, entry] of Object.entries(data.routes)) {
    if (touched.has(routePath)) continue
    if (entry.stage !== 'prototype') continue

    const specDir = entry.spec ? path.dirname(path.join(root, entry.spec)) : null
    const manifestPath = specDir ? path.join(specDir, 'generated', 'codegen.manifest.json') : null
    const manifest = manifestPath && (await fileExists(manifestPath))
      ? JSON.parse(await readFile(manifestPath, 'utf8'))
      : null
    const pagePath = manifest?.files?.find((f) => f.layer === 'page')?.path
    const pageExists = pagePath ? await fileExists(path.join(root, pagePath)) : false

    if (!pageExists) {
      data.routes[routePath] = {
        ...entry,
        stage: 'design-spec',
        updatedAt: new Date().toISOString(),
        note: 'Prototype page removed — sync demoted to design-spec.'
      }
    }
  }

  await saveRegistry(root, data)
  return { updated: Object.keys(data.routes).length, manifests: manifests.length }
}

async function listManifestFiles(root) {
  const files = []
  const featuresDir = path.join(root, 'docs/features')

  async function walk(dir) {
    let entries = []
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
        continue
      }
      if (entry.name === 'codegen.manifest.json') {
        files.push(entryPath)
      }
    }
  }

  await walk(featuresDir)
  return files.sort()
}

async function fileExists(filePath) {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * @param {string} root
 * @param {{ routes: Record<string, { stage: string, spec: string, title?: string, updatedAt: string, note?: string }> }} data
 */
export async function renderPageLifecycleDoc(root, data) {
  const rows = Object.entries(data.routes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([route, entry]) => {
      const auth = entry.stage === 'wire' ? 'required' : 'bypass'
      const note = entry.note ? ` ${entry.note}` : ''
      return `| ${route} | ${entry.stage} | ${auth} | \`${entry.spec}\` | ${entry.title ?? '—'} | ${entry.updatedAt.slice(0, 10)} |${note ? '' : ''}`
    })

  const markdown = `# Page lifecycle registry

Nguồn máy đọc: \`registries/page-lifecycle.registry.json\`.

**Tự cập nhật:** \`portal:gen\` → \`prototype\`; \`portal:remove\` → \`design-spec\`; \`pnpm portal:lifecycle sync\` quét manifest + page trên disk.

## Bước chính (không ghi sub-step)

| Stage | Ý nghĩa | Auth trên dev |
|-------|---------|---------------|
| \`design-spec\` | Spec/testcase có; chưa có prototype code | bypass |
| \`prototype\` | UI + mock API (\`portal:gen\`) | bypass |
| \`test\` | E2E/unit pass (vẫn mock API) | bypass |
| \`wire\` | Ghép API thật xong | **required** |

**Quy tắc:** \`stage\` = bước cao nhất đã đạt. Sửa spec / re-grill không tự hạ stage. \`portal:remove\` hoặc \`lifecycle sync\` (page mất) hạ về \`design-spec\`.

\`\`\`bash
pnpm portal:lifecycle sync
pnpm portal:lifecycle set /hotels test
pnpm portal:remove --spec docs/features/.../feature.spec.yaml
\`\`\`

## Routes

| Path | Stage | Auth | Spec | Title | Updated |
|------|-------|------|------|-------|---------|
${rows.length ? rows.join('\n') : '| _—_ | — | — | — | — | — |'}

## Liên quan

- Auth bypass: mọi stage **trừ** \`wire\` — \`middleware/auth.global.ts\`
- Xóa code: \`pnpm portal:remove --spec <file>\`
- Session handoff: \`.harness/progress.md\`
`

  const docPath = path.join(root, DOC_REL)
  await mkdir(path.dirname(docPath), { recursive: true })
  await writeFile(docPath, markdown, 'utf8')
}
