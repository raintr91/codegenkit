/**
 * Parse #needs-component tags and map slots → components for page templates.
 */

/**
 * @param {string} name
 */
export function normalizeComponentName(name) {
  const trimmed = String(name).trim()
  if (!trimmed) return ''
  return trimmed.startsWith('Mo') ? trimmed : `Mo${trimmed}`
}

/**
 * @param {string} entry e.g. MoXxx | cell-status:MoXxx | cell-status:MoXxx:label
 */
export function parseNeedsComponentEntry(entry) {
  const parts = String(entry)
    .split(/[:/]/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length >= 2) {
    return {
      slot: parts[0],
      component: normalizeComponentName(parts[1]),
      valueProp: parts[2] ?? 'value'
    }
  }

  return {
    slot: null,
    component: normalizeComponentName(parts[0] ?? entry),
    valueProp: 'value'
  }
}

/**
 * @param {string[]} customSlots
 * @param {string[]} needsComponentTags raw tag values (without prefix)
 * @param {Array<Record<string, unknown>>} columns
 */
export function buildSlotBindings(customSlots, needsComponentTags, columns) {
  const columnByKey = Object.fromEntries(columns.map((col) => [col.key, col]))
  /** @type {Map<string, { component: string, valueProp: string }>} */
  const componentBySlot = new Map()
  /** @type {Array<{ component: string, valueProp: string, slot: string | null }>} */
  const unbound = []

  for (const raw of needsComponentTags) {
    const parsed = parseNeedsComponentEntry(raw)
    if (parsed.slot) {
      componentBySlot.set(parsed.slot, {
        component: parsed.component,
        valueProp: parsed.valueProp
      })
    } else {
      unbound.push(parsed)
    }
  }

  for (const col of columns) {
    if (!col.component) continue
    componentBySlot.set(`cell-${col.key}`, {
      component: normalizeComponentName(col.component),
      valueProp: col.componentProp ?? col.componentValueProp ?? 'value'
    })
  }

  const slots = [...new Set(customSlots)]

  if (unbound.length === 1 && slots.length === 1 && !componentBySlot.has(slots[0])) {
    componentBySlot.set(slots[0], {
      component: unbound[0].component,
      valueProp: unbound[0].valueProp
    })
    unbound.length = 0
  }

  for (const item of unbound) {
    for (const slot of slots) {
      if (!slot.startsWith('cell-') || componentBySlot.has(slot)) continue
      const columnKey = slot.slice(5)
      const col = columnByKey[columnKey]
      if (col?.render === 'custom') {
        componentBySlot.set(slot, {
          component: item.component,
          valueProp: item.valueProp
        })
        break
      }
    }
  }

  return slots.map((slot) => {
    const columnKey = slot.startsWith('cell-') ? slot.slice(5) : null
    const col = columnKey ? columnByKey[columnKey] : null
    const mapped = componentBySlot.get(slot)
    const component = mapped?.component ?? (col?.component ? normalizeComponentName(col.component) : null)
    const valueProp = mapped?.valueProp ?? col?.componentProp ?? col?.componentValueProp ?? 'value'

    return {
      slot,
      columnKey,
      component,
      valueProp,
      wired: Boolean(component)
    }
  })
}

/**
 * @param {ReturnType<typeof buildSlotBindings>} slotBindings
 */
export function collectUniqueComponents(slotBindings) {
  const names = new Set()
  for (const binding of slotBindings) {
    if (binding.component) names.add(binding.component)
  }
  return [...names]
}
