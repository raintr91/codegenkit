import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

export const REGISTRY_REL = 'registries/design.registry.json'

const TAG_PREFIX = {
  shell: '#shell:',
  ui: '#ui:',
  widget: '#widget:',
  render: '#render:',
  shape: '#shape:',
  pattern: '#pattern:',
  style: '#style:',
  needsUi: '#needs-ui:'
}

/** @param {string} kebab */
export function folderToPascalCase(kebab) {
  return String(kebab)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * @param {string} root
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadDesignRegistry(root) {
  const registryPath = path.join(root, REGISTRY_REL)
  const raw = JSON.parse(await readFile(registryPath, 'utf8'))
  const components = await discoverShadcnComponents(root, raw)
  return { ...raw, components, registryPath }
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} raw
 */
async function discoverShadcnComponents(root, raw) {
  const uiDir = path.join(root, 'components/ui')
  const aliases = raw.componentAliases ?? {}
  /** @type {Record<string, object>} */
  const components = {}

  let entries = []
  try {
    entries = await readdir(uiDir, { withFileTypes: true })
  } catch {
    return components
  }

  const categoryByName = buildCategoryIndex(raw.componentCategories ?? {})

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const canonical = folderToPascalCase(entry.name)
    const extra = aliases[canonical] ?? {}
    components[canonical] = {
      canonical,
      category: categoryByName[canonical] ?? 'ui',
      tags: [`#ui: ${canonical}`],
      aliases: extra.aliases ?? {},
      patterns: extra.patterns ?? [],
      disambiguate: extra.disambiguate,
      portal: {
        layer: 'ui',
        path: `components/ui/${entry.name}`,
        status: 'implemented'
      }
    }
  }

  return components
}

/** @param {Record<string, string[]>} categories */
function buildCategoryIndex(categories) {
  /** @type {Record<string, string>} */
  const index = {}
  for (const [category, names] of Object.entries(categories)) {
    for (const name of names) {
      index[name] = category
    }
  }
  return index
}

/**
 * @param {string[]} tags
 */
export function parseDesignTags(tags = []) {
  const parsed = {
    shell: [],
    ui: [],
    widget: [],
    render: [],
    shape: [],
    pattern: [],
    style: [],
    needsUi: [],
    raw: tags
  }

  for (const tag of tags) {
    const text = String(tag).trim()
    if (text.startsWith(TAG_PREFIX.shell)) {
      parsed.shell.push(text.slice(TAG_PREFIX.shell.length).trim())
    } else if (text.startsWith(TAG_PREFIX.ui)) {
      parsed.ui.push(text.slice(TAG_PREFIX.ui.length).trim())
    } else if (text.startsWith(TAG_PREFIX.widget)) {
      parsed.widget.push(text.slice(TAG_PREFIX.widget.length).trim())
    } else if (text.startsWith(TAG_PREFIX.render)) {
      parsed.render.push(text.slice(TAG_PREFIX.render.length).trim())
    } else if (text.startsWith(TAG_PREFIX.shape)) {
      parsed.shape.push(text.slice(TAG_PREFIX.shape.length).trim())
    } else if (text.startsWith(TAG_PREFIX.pattern)) {
      parsed.pattern.push(text.slice(TAG_PREFIX.pattern.length).trim())
    } else if (text.startsWith(TAG_PREFIX.style)) {
      parsed.style.push(text.slice(TAG_PREFIX.style.length).trim())
    } else if (text.startsWith(TAG_PREFIX.needsUi)) {
      parsed.needsUi.push(text.slice(TAG_PREFIX.needsUi.length).trim())
    }
  }

  return parsed
}

/**
 * Normalize free text → canonical registry key via aliasIndex.
 * @param {string} input
 * @param {Record<string, unknown>} registry
 */
export function lookupAlias(input, registry) {
  const key = String(input).trim().toLowerCase()
  if (!key) return null

  const aliasIndex = registry.aliasIndex ?? {}
  if (aliasIndex[key]) return aliasIndex[key]

  if (registry.shells?.[input]) return input
  if (registry.components?.[input]) return input
  if (registry.fieldWidgets?.[input]) return input

  const pascal = folderToPascalCase(key.replace(/\s+/g, '-'))
  if (registry.components?.[pascal]) return pascal
  if (registry.shells?.[pascal]) return pascal

  return null
}

/**
 * @param {{
 *   profile: string
 *   composition?: { pattern?: string, overrideCommonPattern?: boolean }
 *   designTags: ReturnType<typeof parseDesignTags>
 *   registry: Record<string, unknown>
 * }} options
 */
export function resolveShell({ profile, composition = {}, designTags, registry }) {
  const shells = registry.shells ?? {}
  const defaults = registry.defaults ?? {}
  const shellByProfile = defaults.shellByProfile ?? {}

  let shellName =
    designTags.shell[0] ??
    (composition.pattern && composition.pattern !== 'custom' ? composition.pattern : null) ??
    shellByProfile[profile] ??
    (profile === 'list' ? defaults.listShell : null) ??
    null

  if (shellName === 'custom') {
    shellName = profile === 'list' ? 'DataListPage' : shellName
  }

  const shellEntry = shellName ? shells[shellName] : null
  const overrideCommonPattern = composition.overrideCommonPattern === true
  const patternCustom = composition.pattern === 'custom'
  const tagCustom = designTags.shell.includes('custom')

  const useCustomVariant =
    profile === 'list' &&
    (overrideCommonPattern || patternCustom || tagCustom)

  let listPageTemplate = null
  if (profile === 'list' && shells.DataListPage?.portalGen) {
    const gen = shells.DataListPage.portalGen
    listPageTemplate = useCustomVariant ? gen.templateCustom : gen.templateStandard
  }

  return {
    shell: shellName,
    shellEntry,
    variant: useCustomVariant ? 'custom' : 'standard',
    useCustomShell: useCustomVariant,
    listPageTemplate,
    commonSpecRef: shellEntry?.commonSpecRef ?? shells.DataListPage?.commonSpecRef ?? null
  }
}

/**
 * Suggest default design tags for grill when missing from spec.
 * @param {Record<string, unknown>} spec
 * @param {Record<string, unknown>} registry
 */
export function suggestDesignTags(spec, registry) {
  const profile = spec.codegen?.profile ?? 'list'
  const existing = new Set((spec.tags ?? []).map((t) => String(t).trim()))
  const suggested = []

  const shellResolution = resolveShell({
    profile,
    composition: spec.ui?.composition ?? {},
    designTags: parseDesignTags(spec.tags ?? []),
    registry
  })

  const shellTag = `#shell: ${shellResolution.variant === 'custom' && profile === 'list' ? 'DataListPage' : shellResolution.shell ?? 'DataListPage'}`
  if (![...existing].some((t) => t.startsWith(TAG_PREFIX.shell))) {
    suggested.push(shellTag)
  }

  if (profile === 'list' && !suggested.some((t) => t.includes('DataListPage')) && !existing.has(shellTag)) {
    suggested.push('#shell: DataListPage')
  }

  if (![...existing].some((t) => t.startsWith(TAG_PREFIX.pattern))) {
    suggested.push('#pattern: CRUD')
  }

  for (const style of registry.defaults?.style ?? []) {
    const tag = `#style: ${style}`
    if (![...existing].some((t) => t.startsWith(TAG_PREFIX.style) && t.includes(style))) {
      suggested.push(tag)
    }
  }

  return [...new Set(suggested)]
}

/**
 * @param {ReturnType<typeof buildCodegenContext>} ctx
 * @param {Record<string, unknown>} registry
 */
export function applyDesignRegistry(ctx, registry) {
  const designTags = parseDesignTags(ctx.spec?.tags ?? [])
  const shellResolution = resolveShell({
    profile: ctx.profile,
    composition: ctx.spec?.ui?.composition ?? {},
    designTags,
    registry
  })

  ctx.designTags = designTags
  ctx.shell = shellResolution.shell
  ctx.shellVariant = shellResolution.variant
  ctx.shellEntry = shellResolution.shellEntry
  ctx.commonSpecRef = shellResolution.commonSpecRef
  ctx.suggestedDesignTags = suggestDesignTags(ctx.spec, registry)

  if (ctx.profile === 'list') {
    ctx.useCustomShell = shellResolution.useCustomShell
    if (shellResolution.listPageTemplate) {
      ctx.listPageTemplate = shellResolution.listPageTemplate
    }
  }

  return ctx
}

/**
 * @param {ReturnType<typeof buildCodegenContext>} ctx
 * @param {Record<string, unknown>} registry
 * @param {{ strict?: boolean }} options
 */
export function validateSpecDesign(ctx, registry, options = {}) {
  const errors = []
  const warnings = []
  const { designTags } = ctx

  for (const shell of designTags.shell) {
    if (shell === 'custom') continue
    if (!registry.shells?.[shell]) {
      errors.push(`Unknown #shell: ${shell} — see registries/design.registry.json shells`)
    }
  }

  for (const ui of designTags.ui) {
    if (!registry.components?.[ui] && !registry.shells?.[ui]) {
      errors.push(`Unknown #ui: ${ui} — not in shadcn components or shells`)
    }
  }

  for (const widget of designTags.widget) {
    const entry = registry.fieldWidgets?.[widget]
    if (!entry) {
      errors.push(`Unknown #widget: ${widget}`)
      continue
    }
    if (entry.portal?.status === 'planned' && !designTags.needsUi.includes(widget)) {
      warnings.push(
        `#widget: ${widget} is planned — add #needs-ui: ${widget} or implement molecule first`
      )
    }
  }

  if (ctx.profile === 'list' && !ctx.shell && options.strict) {
    errors.push('List profile requires shell — add #shell: DataListPage or ui.composition.pattern: DataListPage')
  }

  if (
    ctx.useCustomShell &&
    ctx.shell === 'DataListPage' &&
    !ctx.spec?.notes?.length &&
    !(ctx.spec?.openQuestions?.length)
  ) {
    warnings.push(
      'DataListPage custom variant: document reason in notes (embedded blocks, toolbar overrides, etc.)'
    )
  }

  return { errors, warnings }
}
