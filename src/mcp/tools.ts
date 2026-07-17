import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveAdapter, resolveProjectRoot } from '../config/project-root.js'
import { runAdapterEngine } from '../adapters/run.js'

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function commonShape() {
  return {
    adapter: z.enum(['nuxt4', 'nextjs']).optional(),
    projectRoot: z.string().optional(),
    docsRoot: z.string().optional(),
    argv: z.array(z.string()).optional(),
  }
}

export function registerTools(server: McpServer): void {
  const register = (
    name: string,
    description: string,
    kind: 'codegen' | 'unitgen',
    script: 'generate.mjs' | 'validate-registry.mjs',
    dryRun = false,
  ) => {
    server.tool(name, description, commonShape(), async (input) => {
      try {
        const result = runAdapterEngine({
          adapter: resolveAdapter(input.adapter),
          kind,
          script,
          projectRoot: resolveProjectRoot(input.projectRoot),
          docsRoot: input.docsRoot,
          argv: input.argv,
          dryRun,
        })
        return text({
          ok: result.status === 0,
          status: result.status,
          stdout: result.stdout,
          stderr: result.stderr,
        })
      } catch (error) {
        return text({ ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    })
  }

  register('codegen_gen', 'Run FE portal codegen for the selected adapter.', 'codegen', 'generate.mjs')
  register(
    'codegen_gen_dry',
    'Dry-run FE portal codegen for the selected adapter.',
    'codegen',
    'generate.mjs',
    true,
  )
  register('unit_gen', 'Run FE unit codegen for the selected adapter.', 'unitgen', 'generate.mjs')
  register(
    'unit_gen_dry',
    'Dry-run FE unit codegen for the selected adapter.',
    'unitgen',
    'generate.mjs',
    true,
  )
  register(
    'codegen_registry_validate',
    'Validate FE design/codegen registries.',
    'codegen',
    'validate-registry.mjs',
  )
  register(
    'unit_registry_validate',
    'Validate FE unit registries.',
    'unitgen',
    'validate-registry.mjs',
  )
}
