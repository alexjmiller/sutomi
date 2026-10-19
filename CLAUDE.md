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
- Event Horizon (`src/tools/eventhorizon/`) is a **pure client** over the two Event Horizon services (spec: `APP_SPEC.md` in the repo root, private — the product lives in `~/Projects/event-horizon-nexus`). sutomi's Express proxies them at `/api/eh` (`server/eventhorizon.js`, behind sutomi login): `/api/eh/interview/*` → the interview service, `/api/eh/substrate/*` → an allow-list of substrate calls (GET /events, GET|PATCH|DELETE /events/:id, GET /metrics), `/api/eh/health`. A token lands in a **space**: Default (the real map, `EVENTHORIZON_API_TOKEN`) or Test (a sandbox, `EVENTHORIZON_TEST_TOKEN`); the browser picks one with the `X-EH-Space` header (chosen on the tool's home page, kept in localStorage `eh_space`) and the proxy supplies the matching token; `/api/eh/whoami` names the space and user, shown in a badge on every page (amber for Test). The tokens and the service hosts (`EH_API_URL`, `EH_INTERVIEW_URL`; defaults: localhost:3022/3036 in dev, api./interview.eventhorizon.nexus in production) stay server-side — the browser never sees them, and no CORS change is needed on the services. No AI, no local data: the interview `state` is opaque and round-tripped untouched; the in-progress interview (`state` + transcript + instances) is kept in localStorage (`eh_interview:<space>:<script|node id>`) so a refresh resumes and a Test interview can't be committed into Default. **Later** (addendum rev 3): every question of a script interview has a "later — I'll come back to this" text button (`api.answer(state, '', true)` → `{ later: true }`); the transcript shows "put aside: X" and the map panel lists them; the service persists the list when the run finishes, `GET /interview/deferred` feeds the home page's "to come back to (n)" section, whose only action is continue → `interview/script/:id?later=1` (`POST /interview/start { script, deferredOnly: true }`, session key `later:<script>`); entries vanish on commit or when a resumed run finishes without them. No localStorage copy of that list. Single-node interviews have no later button. A session finished with nothing to commit is dropped. Views: home (entry points + unfinished interviews + to come back to), node library (`add` / `happened`), chat interview (`interview/script/:id`, `interview/node/:id`) with the growing map panel, calendar (`calendar?view=month|agenda&date=`) with month grid, agenda, filters, detail panel (chain timeline, complete/reopen, remove whole chain). Time rules in `time.js`: all-day items on their UTC date, timed items in the viewer's zone (Luxon), Monday-first, en-GB. Calendar conventions from the addendum (`APP_SPEC_ADDENDUM.md`): every occurrence has an explicit **`kind`** (`task` | `event` | `info`; `kindOf()` in `time.js` falls back to `is_task`/`transparent` for old data) and it drives rendering — month grid and list show tasks + events, information (term bands, bank holidays, INSET days) only with the "show information" checkbox or the information filter, the day list always has it as its own group; checkbox only on tasks; `period` items draw as background bands, `bank-holiday` items italic. Birthday series show "turns N" (N = occurrence year − `start_date` year, fetched once per series, none if the start year is this year or later); instances with `steps: 0` say "no tasks"; `Question.person` shows the "or 'me'" hint (the service resolves it); `time` questions get a time picker, `duration` questions chips (30m / 1h / 2h / 4h) plus a box, `number` a numeric box; a timed instance shows its `anchorTime` on the card. **Map cards list the chain** (`Instance.chain`): each step a tick (keep), a date (picker) and an editable title, plus "+ add a step" with a "just this time" toggle (chain-less cards such as a general event start empty with just that button); the editable rows live on the instance as `edit` in the saved session, and `editsFor()` turns them into the commit's `edits` (omitted when nothing changed); the commit response's `chain` is shown under each result. Once something is on the map, the calendar's chain panel has its own "+ add a step" (title, date defaulting to the day before, "just this time") via `POST /interview/instances/:tag/steps`; a recurring step is generated by the worker shortly after, a one-off appears at once. `useOccurrences.reset()` keeps the cached months on screen while they reload. Local dev needs the private repo's backend (`npm run dev` + `npm run worker` in `backend/`, postgres container `eventhorizon-postgres`) and interview service (`npm run serve` in `middleware/`) running
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
- `/tools/eventhorizon/*` — Event Horizon: home, `add`, `happened`, `interview/script/:id`, `interview/node/:id`, `calendar` (logged in only)

## API
- `GET /api/welcome` — welcome message
- `GET /api/articles` — live articles (excludes welcome)
- `GET /api/articles/all` — all articles including drafts (auth required)
- `POST /api/articles` — create article (auth)
- `PUT /api/articles/:id` — update article, re-slugs on title change (auth)
- `DELETE /api/articles/:id` — delete article (auth)
- `POST /api/login` — authenticate
- `GET|POST /api/thinking`, `GET|PUT|DELETE /api/thinking/:id` — Thinking Machine briefs (auth), router in `server/thinking.js`
- `GET /api/eh/health`, `/api/eh/interview/*`, `/api/eh/substrate/*` — Event Horizon proxy (auth), router in `server/eventhorizon.js`; needs `EVENTHORIZON_API_TOKEN` (and `EVENTHORIZON_TEST_TOKEN` for the Test space) in `.env` on the server; `X-EH-Space: default|test` picks the space

## GitHub
- Repo: github.com/alexjmiller/sutomi (private)
