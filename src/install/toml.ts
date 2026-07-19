/**
 * Narrow TOML helpers for Codex `config.toml` MCP server tables only.
 */

function quoteString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function buildTomlTable(
  header: string,
  values: Record<string, string | string[]>,
): string {
  const body = Object.entries(values).map(([key, value]) =>
    `${key} = ${Array.isArray(value) ? `[${value.map(quoteString).join(', ')}]` : quoteString(value)}`,
  )
  return `[${header}]\n${body.join('\n')}`
}

function headerIndex(content: string, header: string): number {
  const escaped = `[${header}]`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}\\s*(?:#.*)?$`, 'm').exec(content)?.index ?? -1
}

function blockEnd(content: string, start: number): number {
  const next = content.slice(start).search(/\n\[/m)
  return next === -1 ? content.length : start + next + 1
}

export function upsertTomlTable(content: string, header: string, block: string): string {
  const start = headerIndex(content, header)
  const normalized = block.endsWith('\n') ? block : `${block}\n`
  if (start === -1) {
    const trimmed = content.trimEnd()
    return `${trimmed}${trimmed ? '\n\n' : ''}${normalized}`
  }
  const end = blockEnd(content, start)
  if (content.slice(start, end) === normalized) return content
  return content.slice(0, start) + normalized + content.slice(end)
}

export function removeTomlTable(
  content: string,
  header: string,
): { content: string; removed: boolean } {
  const start = headerIndex(content, header)
  if (start === -1) return { content, removed: false }
  const end = blockEnd(content, start)
  const next = content.slice(0, start) + content.slice(end)
  return {
    content: next.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, ''),
    removed: true,
  }
}
