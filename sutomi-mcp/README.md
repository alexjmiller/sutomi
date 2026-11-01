# sutomi-mcp

Talk to sutomi.net by voice. A small Node service with two doors onto the site's tasklists:

```
Siri Shortcut ──POST /voice──▶ conversation service ──MCP (in-process)──▶ MCP server ──HTTP + API token──▶ sutomi
any MCP client ──POST /mcp (Streamable HTTP, bearer)────────────────────▶ MCP server
```

- **MCP server** (`tools.js`): `list_tasklists`, `get_tasklist`, `add_task` over sutomi's tasklists; `list_calendar` and `add_calendar_task` over Event Horizon (through sutomi's substrate proxy, Default space, dates in Europe/London — `dates.js` does the zone maths without a library). `add_calendar_task` makes a plain task (or `kind: event`) on a day, all-day or timed (`time`, and `end_time` or `duration_minutes`), with a reminder (09:00 for all-day, at the start of a timed task, 30 min before a timed event); the substrate chooses the id, so it remembers recent `request_key`s and treats an open item of the same kind, title and day as already added. Every tool returns a spoken-friendly text line and `structuredContent` matching its `outputSchema`. `add_task` takes a `request_key`; the item's id is derived from it and sutomi ignores an add whose id already exists, so a repeated request (lost connection, Shortcut retry) returns the original item instead of a duplicate.
- **Conversation service** (`voice.js`, `script.js`): scripted, not a language model. It knows a few shapes — "add X to Y", "add X tomorrow at 2.30", "what's on Friday", "what's on the shopping list", a list name, a day, yes, no — asks when something is missing or a name fits several lists, reads the draft back ("Add milk to Shopping. Is that correct?") and commits only on yes, as that exact stored draft. A Shortcut sends a **`mode`** so the conversation opens with its job's question and keeps to it: `task` ("What would you like to add?" → a tasklist), `event` ("What's the event, and when?" → an event on the calendar; "Which day?" if no day was said), `tasks` ("Which list?" → reads it), `events` ("For which day?" → today, tomorrow, Monday, next Tuesday, next week, the weekend, the 12th of March… → reads the calendar). Without a mode the mixed script works the intent out from the words (a day at the end of an add means the calendar, as a task). A quiet conversation expires after 10 minutes without committing; a finished one keeps its last reply for an hour so a retry hears the same answer. The service is an MCP client of the same server (in-process, `mcp-client.js`), so nothing changes a list except through the tools.
- **sutomi** (`sutomi.js`): reached with `SUTOMI_TOKEN`, which sutomi's `requireAuth` accepts as `Authorization: Bearer …` (set `SUTOMI_API_TOKEN` on the sutomi side). That token can read and write tools data but can never manage passkeys.

Built on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, `/client`, `/node`; spec 2026-07-28), Express 5, zod 4. Node ≥ 20.

## Endpoints

| | |
|---|---|
| `POST /voice` | body `{ "conversation_id"?: string, "text": string }` → `{ conversation_id, reply, finished, next }` where `next` is `"listen"` (ask the user and post again with the same `conversation_id`) or `"stop"`. Bearer `VOICE_TOKEN`. |
| `GET /voice/:id` | `{ conversation_id, finished, outcome, reply, next }` or 404 — for a Shortcut that lost a reply. Bearer `VOICE_TOKEN`. |
| `POST /mcp` | MCP Streamable HTTP, stateless (a fresh server per request). Bearer `MCP_TOKEN`. The `Host` header must be one of `ALLOWED_HOSTS`. |
| `GET /health` | `{ ok: true }` (not routed publicly). |

The two bearer tokens are deliberately separate: the one in the Shortcut can only do what the script does (add a task after a yes); the MCP token drives every tool. A missing token disables its endpoint (503) rather than opening it. Refused tokens are counted per visitor IP and throttled; nothing secret is logged.

## Environment

| Variable | Meaning |
|---|---|
| `PORT` | 3037 in dev (registered in port-authority for dev.lan), 3000 in the container |
| `SUTOMI_URL` | `http://localhost:3000` in dev, `http://sutomi:3000` in compose |
| `SUTOMI_TOKEN` | = `SUTOMI_API_TOKEN` on sutomi |
| `MCP_TOKEN` | bearer for `/mcp` |
| `VOICE_TOKEN` | bearer for `/voice` |
| `ALLOWED_HOSTS` | Host header allow-list for `/mcp`; `localhost,127.0.0.1` in dev, `sutomi.net` in production |

In production all of these come from `/data/sutomi/.env` through `docker-compose.yml` (`SUTOMI_API_TOKEN`, `SUTOMI_MCP_TOKEN`, `SUTOMI_VOICE_TOKEN`). Traefik routes `sutomi.net/mcp` and `sutomi.net/voice` to this container and everything else to sutomi.

## The Siri Shortcut

The easiest way is the generated files: `SIGN_HOST=devbook python3 shortcut/build.py` writes and signs four Shortcuts in `shortcut/` — **create a task**, **create an event**, **tell me about my tasks**, **tell me about my events** (the name is what you say to Siri; each sends its `mode`) (signing needs a Mac signed into iCloud, so dev.lan hands it to devbook over ssh). AirDrop them to the phone, tap **Add Shortcut**, open each and replace the `PASTE-VOICE-TOKEN-HERE` text with the token from `ssh dedibox "grep ^SUTOMI_VOICE_TOKEN= /data/sutomi/.env"`. The files never contain the token. If Siri answers a name with its own Calendar or Reminders instead of running the Shortcut, rename the Shortcut on the phone (e.g. "sutomi event").

Built by hand, a Shortcut has these actions (add a constant `mode` field to the JSON body for one of the four jobs):

1. **Text** — leave empty → **Set Variable** `Conversation`
2. **Text** — leave empty → **Set Variable** `Said` (the first request carries no text; the server asks "What would you like to add?")
3. **Repeat** 6 times
   1. **Get Contents of URL** — `https://sutomi.net/voice`, Method **POST**, Headers: `Authorization` = `Bearer <token>`, Request Body **JSON** with two fields: `conversation_id` = variable `Conversation`, `text` = variable `Said`
   2. **Get Dictionary Value** `reply` from Contents of URL → **Set Variable** `Reply`
   3. **Get Dictionary Value** `conversation_id` → **Set Variable** `Conversation`
   4. **Get Dictionary Value** `next` → **If** it **is** `stop`
      - **Show Result** `Reply` (Siri reads it out) → **Stop This Shortcut**
   5. **Otherwise** — **Ask for Input** (Text) with Prompt `Reply` → **Set Variable** `Said` (when the Shortcut runs by voice, Siri speaks the prompt and listens for the answer)
   6. **End If**
4. **End Repeat**

Things that silently break it: the body must reference the **variables** `Conversation` and `Said` (not the empty Text actions they were first set from); `Conversation` must be set from the `conversation_id` dictionary value and nothing else, or every turn starts a new conversation; the If must compare the `next` dictionary value; and one Ask per turn. The service log shows each call as `new`, `resumed` or `lost` with the length of the text it received (`docker logs sutomi-mcp | grep voice`), which is the first thing to look at when the phone keeps hearing "What would you like to add?".

With **create an event**: "What's the event, and when?" — "dentist tomorrow at 2.30" — "Add dentist for tomorrow at 2:30pm. Is that correct?" — "yes" — "Added dentist for tomorrow at 2:30pm." A span works too: "UX Brighton on Friday at 9 till 7" → "Add UX Brighton for Friday at 9am to 7pm. Is that correct?" With **tell me about my events**: "For which day?" — "next week" — "Next week, 3 things. Monday: dentist at 2:30pm. Thursday: post the card and call the plumber." With **tell me about my tasks**: "Which list?" — "shopping" — "Shopping, 3 open: milk, eggs and bread."

A **create a task** conversation goes: "What would you like to add?" — "milk to the shopping list" — "Add milk to Shopping. Is that correct?" — "yes" — "Added milk to Shopping." You can say the whole thing in one go ("add call the plumber to house jobs"), answer with just the task and be asked for the list, or say no at the question to stop. Lists are never created by voice; make them on the site first.

## Connecting an MCP client

URL `https://sutomi.net/mcp`, header `Authorization: Bearer <SUTOMI_MCP_TOKEN>`. For Claude Code:

```bash
claude mcp add --transport http sutomi https://sutomi.net/mcp --header "Authorization: Bearer $TOKEN"
```

Clients that insist on OAuth (rather than a static bearer) are not supported yet; the SDK has the pieces when that becomes worth doing.

## Development

```bash
# sutomi, with the API token the service will use (from a clean data/ if you want the password bootstrap)
SUTOMI_PASSWORD=sutomi SUTOMI_API_TOKEN=localtoken PORT=3000 node server.js
# this service
cd sutomi-mcp && SUTOMI_TOKEN=localtoken MCP_TOKEN=mcptok VOICE_TOKEN=voicetok npm start
# a conversation
curl -s localhost:3037/voice -H 'Authorization: Bearer voicetok' -H 'Content-Type: application/json' -d '{"text":"add milk to shopping"}'
curl -s localhost:3037/voice -H 'Authorization: Bearer voicetok' -H 'Content-Type: application/json' -d '{"conversation_id":"<id>","text":"yes"}'
npm test   # unit tests: utterance parsing (script.js) and the conversation (voice.js) against fake tools
```

## Next

Event Horizon: tools for adding tasks there and reading what is coming up, with explicit dates and `Europe/London` times, probably with the same draft-and-confirm shape. Reading back a list by voice ("what's on my shopping list") is a small addition on top of `get_tasklist`.
