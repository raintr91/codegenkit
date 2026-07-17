import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools.js'

export function createServer(): McpServer {
  const server = new McpServer({ name: 'codegenkit', version: '0.3.4' })
  registerTools(server)
  return server
}

export async function main(): Promise<void> {
  const server = createServer()
  await server.connect(new StdioServerTransport())
}

const entry = process.argv[1] ?? ''
if (entry.includes('mcp/server') || entry.includes('codegenkit-mcp')) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
