# Sutomi - sutomi.net

Personal website for Alexander Miller. React + Express, deployed via Docker on dedibox.

## Stack
- React 19 + Vite 8 (frontend)
- Express 5 / Node 22 (backend, `server.js`)
- Docker on Debian 13 dedibox, Traefik v3 reverse proxy
- Domain: sutomi.net (Cloudflare DNS)

## Key Conventions
- Font: Alexabet5-Regular.ttf — Alexander's own handwriting, copyrighted. Located in `public/fonts/`
- Design source: Sketch cloud file (document called "sutomi")
- Colours: cream background `#faf5e4`, dark brown text `#46413d`, sun gradient yellow `#F9CF42` to red `#F53A1F`, link red `#d4532b`
- No cookies, no tracking, no popups — this is a core principle
- Articles stored server-side in JSON file (`/app/data/articles.json` inside Docker volume)
- Article IDs are URL slugs generated from titles (up to 30 chars), auto-update on title change
- Welcome message is a special article with `type: 'welcome'`

## Architecture
- Home page (`/`) and article view (`/article/:slug`) share a single component (`Home.jsx`) with animated transitions
- Transition phases: list -> step1 (collapse/grow) -> step2 (unroll) -> open, and reverse
- Unroll uses `clip-path` for a sheet-laying-down effect
- Right-click context menu in article editor for links and images (no toolbar)
- Native browser spellcheck preserved — custom menu only appears on text selection, links, or images
- Auth uses Bearer token (SUTOMI_PASSWORD env var), session stored in sessionStorage
- **Dashboard tools are modular:** each lives in its own folder under `src/tools/<name>/` (page component + pure logic + its own CSS), is routed at `/tools/<name>` in `App.jsx` (logged in only), and is linked from the `tools` array in `Dashboard.jsx`. Add new tools the same way; keep them self-contained and avoid touching `App.css`
- QR Creator (`src/tools/qr/`) generates codes client-side with the `qrcode` npm package — no server endpoint, nothing leaves the browser. Logic ported from `~/Projects/qr-creator` (Python); preview is brown-on-cream, downloads are black-on-white SVG/PNG

## Deployment
```bash
# Sync and rebuild
rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' --exclude='data' . dedibox:/data/sutomi/
ssh dedibox "cd /data/sutomi && docker compose up -d --build"

# Or sync individual files for faster deploys
rsync -av src/pages/Home.jsx dedibox:/data/sutomi/src/pages/Home.jsx
```

## Pages
- `/` — Home (welcome message + truncated article list with transitions)
- `/article/:slug` — Article view (same component as home, expanded state)
- `/login` — Password login
- `/dashboard` — Tools dashboard (logged in only)
- `/articles` — Manage articles with rich editor (logged in only)
- `/tools/qr` — QR Creator: url / text / geo to SVG or PNG (logged in only)

## API
- `GET /api/welcome` — welcome message
- `GET /api/articles` — live articles (excludes welcome)
- `GET /api/articles/all` — all articles including drafts (auth required)
- `POST /api/articles` — create article (auth)
- `PUT /api/articles/:id` — update article, re-slugs on title change (auth)
- `DELETE /api/articles/:id` — delete article (auth)
- `POST /api/login` — authenticate

## GitHub
- Repo: github.com/alexjmiller/sutomi (private)
