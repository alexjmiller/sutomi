// sutomi-mcp — two doors onto sutomi's tasklists, one process:
//   POST /mcp    the MCP server (Streamable HTTP, stateless) for any MCP client — bearer MCP_TOKEN
//   POST /voice  the scripted conversation service for Siri Shortcuts         — bearer VOICE_TOKEN
//   GET  /voice/:id  what became of a conversation (for a Shortcut that lost a reply)
//   GET  /health
// The voice service is itself an MCP client of the same server (in-process), so everything that
// changes a list goes through the tools in tools.js. sutomi is reached with SUTOMI_TOKEN.
import express from 'express'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler, hostHeaderValidation } from '@modelcontextprotocol/node'
import { sutomiClient } from './sutomi.js'
import { buildServer } from './tools.js'
import { connectInProcess } from './mcp-client.js'
import { createVoice } from './voice.js'
import { bearerAuth, failureLimiter, visitorIp } from './auth.js'

const PROD = process.env.NODE_ENV === 'production'
const PORT = process.env.PORT || 3037
const SUTOMI_URL = process.env.SUTOMI_URL || 'http://localhost:3000'
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || (PROD ? 'sutomi.net' : 'localhost,127.0.0.1')).split(',').map((s) => s.trim()).filter(Boolean)

const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ')
const log = (tag) => (msg) => console.log(`[${tag}] ${stamp()} ${msg}`)

if (!process.env.SUTOMI_TOKEN) console.warn('[mcp] SUTOMI_TOKEN is not set — every tool call will be refused by sutomi')

const sutomi = sutomiClient({ url: SUTOMI_URL, token: process.env.SUTOMI_TOKEN || '' })
const { call } = await connectInProcess(buildServer(sutomi))
const voice = createVoice({ call, log: log('voice') })

const app = express()
app.set('trust proxy', 1) // Traefik in front
app.disable('x-powered-by')
app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); next() })
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))

// MCP: a fresh McpServer per request (stateless), host header checked against our own names.
const limiter = failureLimiter()
const mcpNode = toNodeHandler(createMcpHandler(() => buildServer(sutomi)))
const hostOk = hostHeaderValidation(ALLOWED_HOSTS)
app.all('/mcp', bearerAuth(process.env.MCP_TOKEN, { name: 'mcp', log: log('auth'), limiter }), (req, res) => {
  if (!hostOk(req, res)) return
  void mcpNode(req, res, req.body)
})

// Voice: one turn per request.
const voiceAuth = bearerAuth(process.env.VOICE_TOKEN, { name: 'voice', log: log('auth'), limiter })
app.post('/voice', voiceAuth, async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const out = await voice.handle({ conversation_id: body.conversation_id, text: body.text })
  log('voice')(`${visitorIp(req)} ${out.conversation_id} ${out.finished ? 'finished' : 'listening'}`)
  res.json(out)
})
app.get('/voice/:id', voiceAuth, (req, res) => {
  const s = voice.status(req.params.id)
  if (!s) return res.status(404).json({ error: 'unknown or expired conversation' })
  res.json(s)
})

app.use((_req, res) => res.status(404).json({ error: 'not found' }))

app.listen(PORT, () => console.log(`sutomi-mcp on port ${PORT} → ${SUTOMI_URL}`))
