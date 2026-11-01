// An MCP client wired to a server in the same process. The voice service uses this so that every
// change it makes goes through the same tools (schemas, structured results, errors) an external
// MCP client would use — nothing talks to sutomi behind the protocol's back.
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'

export class ToolError extends Error {}

export async function connectInProcess(server, { name = 'sutomi-voice', version = '0.1.0' } = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name, version })
  await client.connect(clientTransport)

  /** Call a tool; returns its structuredContent, or throws ToolError with the tool's message. */
  async function call(toolName, args = {}) {
    const result = await client.callTool({ name: toolName, arguments: args })
    if (result.isError) {
      throw new ToolError((result.content || []).map((c) => c.text || '').join(' ').trim() || `${toolName} failed`)
    }
    return result.structuredContent
  }

  return { client, call }
}
