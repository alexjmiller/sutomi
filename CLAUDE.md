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
- Thinking Machine (`src/tools/thinking/`) is **deliberately non-AI**: guidance comes from a structured question flow, the user does the thinking. v2 (2026-10-19) model: a brief has one **aim** (what, who, where things are, outcome, signs) and a list of **questions**; the aim itself is a question (`isAim`). Each question is worked on in a **loop**: what you know → "what's in the way" (the **route**: clarify / find / explore / decide / test / do / open) → the route's own prompts → dated learning → what it means for the aim → exit (answered / parked / became another question) → pick the next question or stop. Routes share outputs (`brief.criteria` from clarify feeds decide; tasks from any loop become next steps). Rendered as a plain running conversation grouped by aim / focus; past answers are clickable to edit. All steps are generated from brief state by `buildSteps()` in `flow.js` (stable keys, paths into the brief); position = `brief.current` + `brief.visited`. Questions, hints, examples, help prompts and route wording all live in `flow.js` — tweak the process there, not in the components. Saved server-side as whole objects via `server/thinking.js` (`data/thinking.json`); v1 flat briefs are migrated lazily on open by `migrateV1()` (explore answers → aim loop, test answers → a linked "Will X work?" question). Never rewrite or interpret the user's words; skipped steps show as "To explore". AI guidance was considered and parked

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
- `/tools/thinking` — Thinking Machine: list of saved briefs; `/tools/thinking/:id` one brief as a conversation (logged in only)

## API
- `GET /api/welcome` — welcome message
- `GET /api/articles` — live articles (excludes welcome)
- `GET /api/articles/all` — all articles including drafts (auth required)
- `POST /api/articles` — create article (auth)
- `PUT /api/articles/:id` — update article, re-slugs on title change (auth)
- `DELETE /api/articles/:id` — delete article (auth)
- `POST /api/login` — authenticate
- `GET|POST /api/thinking`, `GET|PUT|DELETE /api/thinking/:id` — Thinking Machine briefs (auth), router in `server/thinking.js`

## GitHub
- Repo: github.com/alexjmiller/sutomi (private)
