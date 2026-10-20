# sutomi.net

Personal website and article platform by Alexander Miller. No cookies, no tracking, no popups.

The site uses a custom handwriting font (Alexabet5) created from handwriting samples on a reMarkable tablet, processed through Glyphs.

## Stack

- React 19 + Vite 8
- Express 5 / Node 22
- Docker + Traefik v3
- Cloudflare DNS

## Development

```bash
npm install
npm run dev       # frontend (localhost:5173)
npm start         # backend (localhost:3000)
```

The Vite dev server proxies `/api` requests to the Express backend.

## Dashboard tools

Logged-in tools live under `src/tools/<name>/` as self-contained modules (component, logic, CSS) routed at `/tools/<name>`.

- **QR Creator** (`/tools/qr`) — turn a URL, text, or `lat,lon` into a QR code, download as SVG or PNG. Generated entirely in the browser.
- **Thinking Machine** (`/tools/thinking`) — a guided, non-AI sequence of questions: state an aim, uncover the smaller questions behind it, work on one at a time (clarify, find out, explore options, decide, test, or do), record what you learn and what it means for the aim, then export a brief in your own words. Questions live in `src/tools/thinking/flow.js`; briefs are saved server-side.
- **Tasklists** (`/tools/tasklists`) — simple lists in the spirit of llli.st (`~/Projects/listicles`): add an item, flag it low / medium / high, tick it off, park it for later, delete it; ticked items fade out a day later. Any number of lists, stored server-side; edits from different devices are merged item by item. Item text is edited in place. On a phone, swipe an item right to delete it or left to park it, and swipe a list right to delete it (after a yes / no).
- **Event Horizon** (`/tools/eventhorizon`) — a window onto the Event Horizon services: a scripted (non-AI) chat interview that turns life's predictable events into preparation chains (any question can be put aside with "later" and picked up from the home page when you have the details), with each event's chain editable on its map card before it is added, and a calendar (month grid, list, day view, chain detail, tick-off tasks) over the resulting map. sutomi only proxies the two services (`server/eventhorizon.js`); set `EVENTHORIZON_API_TOKEN` in `.env` on the server.

## Deployment

```bash
rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='data' . dedibox:/data/sutomi/
ssh dedibox "cd /data/sutomi && docker compose up -d --build"
```

## Environment

| Variable | Description |
|---|---|
| `SUTOMI_PASSWORD` | Bootstrap only: signs in while no passkey is registered, so the first one can be added. Sign-in is otherwise by passkey (Touch ID / Face ID), managed at `/tools/passkeys`. Lost every device? Delete `passkeys.json` in the data volume to reopen password sign-in |
| `SUTOMI_RP_ID`, `SUTOMI_ORIGIN` | WebAuthn relying-party id and allowed origin(s) (defaults: `sutomi.net` / `https://sutomi.net` in production, `localhost` and the two local dev origins otherwise) |
| `EVENTHORIZON_API_TOKEN` | Bearer token for the Event Horizon services, Default space (proxied by `server/eventhorizon.js`; optional, the tool just reports the services as unreachable without it) |
| `EVENTHORIZON_TEST_TOKEN` | Token for the Event Horizon Test space (optional; the Test option is disabled without it) |
| `PORT` | Server port (default: 3000) |
