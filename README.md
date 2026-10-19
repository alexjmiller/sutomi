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
- **Thinking Machine** (`/tools/thinking`) — a guided sequence of questions (understand, define, explore, test) that turns a rough idea or problem into an outcome, ideas, a selected idea and a small test, then assembles a brief in your own words to copy or download. No AI: the questions live in `src/tools/thinking/flow.js`; briefs are saved server-side.

## Deployment

```bash
rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='data' . dedibox:/data/sutomi/
ssh dedibox "cd /data/sutomi && docker compose up -d --build"
```

## Environment

| Variable | Description |
|---|---|
| `SUTOMI_PASSWORD` | Password for login and article management |
| `PORT` | Server port (default: 3000) |
