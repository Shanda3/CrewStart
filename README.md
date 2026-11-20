# Crewstart (unofficial community tool)

Crewstart: a team builder for your Grok Bot. A short, one-question-per-screen questionnaire that recommends a
team of up to 10 bots (custom bots plus suggested templates) and produces a copy-ready setup prompt, a connection checklist, and next steps.

Crewstart is an unofficial community tool. It is not affiliated with, endorsed by, or sponsored by xAI, Grok, or Cursor.

**Status: not deployed.** D1 exists on Shanda's Cloudflare account; Turnstile widget and deploy are pending. See `DEPLOY.md`.

## Files
| Path | What |
|---|---|
| `public/index.html` | All screens (landing, 1a/1b/1c work, 2 personal, 3 check-ins, 4 review, 5 output with optional email opt-in) |
| `public/brand.js` | **One** place for the name (`APP_NAME`), tagline, title, official logo, disclaimer, download filename |
| `public/favicon.svg`, `public/fonts/` | Official favicon; self-hosted Plus Jakarta Sans, Inter, and JetBrains Mono |
| `public/mascots/`, `public/mascots.js` | Berry, Puddle, and Honey (decorative, aria-hidden); motion honors reduced motion |
| `public/theme.css` | **All** design tokens (`--cs-*`): approved ruby palette (November 20, 2026), self-hosted fonts |
| `public/styles.css` | Layout/components; uses only `--cs-*` tokens |
| `public/templates.js` | Curated Grok Bot template catalog (display names, catalog names, reasons, tags) |
| `public/logic.js` | Pure recommendation, template matching, and prompt logic (browser + Node) |
| `public/app.js` | UI wiring; state in memory, selections-only URL hash |
| `public/config.js` | Turnstile site key (real key only on crewstart.ai / www.crewstart.ai; test key elsewhere), consent text/version |
| `public/_headers`, `public/robots.txt` | CSP and security headers; robots |
| `src/worker.js`, `src/handlers.js` | Worker for `POST /api/subscribe` only; `/admin/*` is a disabled 404 stub |
| `migrations/0001_init.sql`, `0002_required_email.sql` | D1 schema (`subscribers` with `marketing_consent`, `rate_limits`) |
| `wrangler.jsonc` | Worker `crewstart` (account pinned, workers.dev off, logs off), assets `./public`, `run_worker_first` for `/api/*` and `/admin/*`, D1 `crewstart-db` |
| `test/logic.test.js`, `test/worker.test.mjs` | Unit tests (`npm test`) |
| `test/integration.mjs` | `wrangler dev` + local D1 integration checks |
| `tools/e2e.mjs`, `tools/lighthouse-flow.mjs`, `tools/contrast.mjs` | Browser click-through, Lighthouse/axe per screen, token contrast |
| `sample-prompt.txt` | Sample output for the small business owner persona |

## Run locally
```bash
npm install
npx wrangler d1 migrations apply crewstart-db --local
npx wrangler dev            # http://127.0.0.1:8787
```
Tests: `npm test`, `node test/integration.mjs` (stop other `wrangler dev` first; it starts its own on 8787/8788),
`cd tools && npm install && node e2e.mjs` and `node lighthouse-flow.mjs` (needs `wrangler dev` running).

## Rebrand
Change `APP_NAME` in `public/brand.js` and `"name"` in `wrangler.jsonc`; static fallbacks in `index.html`
(`<title>`, meta description, tagline) are overwritten at runtime. Design tokens live in `theme.css` (from the approved brand package).

## Safety and privacy choices
- **Email is optional (Shanda's decision, November 20, 2026):** no login, and the prompt, checklist, and next
  steps appear right after Review. Joining the list is a separate opt-in on the output screen; the prompt never
  depends on it. `POST /api/subscribe` is unchanged. The share link (URL hash) carries selections only, never
  the email, names, or which templates you removed.
- Suggested templates (always including Dr. Eggbot, plus up to three matches) count toward the hard cap of 10.
  Usage Saver is an optional add-on and never counts toward that cap, so it can be turned on even when the crew
  is already at 10. The prompt asks your bot to look templates up in Bot templates and offer an import link;
  nothing is imported from this site, and there are no `grokbot://` links.
- Marketing consent is a separate, optional, unchecked box with the brief's exact text, stored as
  `marketing_consent` 0/1 (plus the consent text, version, and time only when ticked). A repeat submission can
  opt in but never silently opts out. Role/industry are sent only if their own separate box is ticked.
- Everything else from the questionnaire stays in the browser. The privacy policy is a standalone page at `/privacy`.
- Turnstile loads on the output screen when the opt-in is shown and is verified server-side on submit, with a
  per-IP (hashed) rate limit. The production site key is used only on crewstart.ai and www.crewstart.ai;
  localhost and 127.0.0.1 keep the official test key.
- Never asks for passwords, keys, or tokens; free text that looks like a credential is flagged and dropped.
- The prompt never claims anything is connected; it tells the bot to check which connectors exist and skip declined ones.
- Bots always ask before sending messages or spending money (locked on).
- No access logs: Workers Logs are off, and no endpoint returns emails (`/admin/*` is a 404 stub).
