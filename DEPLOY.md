# Crewstart: deploy checklist

## Status (November 20, 2026, 11:20 AM CST)
- Account: Shanda's Cloudflare account. The account ID is not committed: put `CLOUDFLARE_ACCOUNT_ID=<id>` in a local,
  gitignored `.env` (Wrangler loads it) or export it before running Wrangler, so a deploy can't land in another account.
- DONE: D1 `crewstart-db` created (its `database_id` is in `wrangler.jsonc`); migrations `0001_init.sql` and
  `0002_required_email.sql` are applied remotely. Do not re-apply 0002 and do not otherwise touch remote D1.
- DONE: Turnstile widget for `crewstart.ai` and `www.crewstart.ai`. The public site key lives in
  `public/config.js` and is selected by hostname (real key only on those two hosts; official test key everywhere else).
- NOT DONE: Worker secrets and deploy. `workers_dev: false` and `preview_urls: false` stay set.
- Shanda's decisions: **no Cloudflare Access / Zero Trust** and no access logs. Workers Logs (`observability`) are off.
  `/admin/*` is a disabled stub that returns 404; no endpoint returns emails.
- `crewstart.app` is not a zone on this account. Attach nothing without Shanda's go-ahead.

Costs reflect Cloudflare's published free tiers as of November 20, 2026; double-check the pricing pages before launch.

## 1. D1 (done; free tier: 5 GB storage, 5M rows read/day, 100k rows written/day)
Future migrations: `npx wrangler d1 migrations apply crewstart-db --remote` (needs a token with D1 Edit).

## 2. Turnstile widget (free)
Either the dashboard: **Turnstile -> Add widget** -> name `crewstart`, hostnames = the production hostname(s), mode **Managed**,
or `npx wrangler turnstile widget create crewstart ...` (alpha).
- The public **site key** is already in `public/config.js`. It is used only when the page is served on
  `crewstart.ai` or `www.crewstart.ai`. Localhost, 127.0.0.1, and any other host keep the official test key
  so local dev and tests stay green. Do not replace the test-key fallback with the production key.
- Store the **secret key** only as a Workers secret, never in files or chat:
  `npx wrangler secret put TURNSTILE_SECRET_KEY`

## 3. Rate-limit salt (free)
`npx wrangler secret put RATE_LIMIT_SALT` (any long random string; salts the hashed IPs in `rate_limits`).

## 3b. OpenAI key for Smart AI suggestions (name only)
Store the key only as a Workers secret, never in files, chat, or `.dev.vars`:
`printf %s "$OPENAI_API_KEY" | npx wrangler secret put OPENAI_API_KEY`
Confirm with `npx wrangler secret list` (names only). Apply `0003_smart_counts.sql` remotely before relying on `/api/smart`:
`npx wrangler d1 migrations apply crewstart-db --remote`

## 4. Deploy (Workers free plan: 100k Worker requests/day; static asset requests are free) — ONLY after Shanda approves
```bash
npm test
# set "workers_dev": true (or add a custom domain) only when going live
npx wrangler deploy
```

## 5. Smoke checks after deploy
```bash
H=https://<hostname>
curl -s -o /dev/null -w "%{http_code}\n" $H/                    # 200
curl -s -o /dev/null -w "%{http_code}\n" $H/admin/export.csv    # 404 (disabled stub)
curl -s -X POST $H/api/subscribe -H 'Content-Type: application/json' -H "Origin: $H" \
  -d '{"email":"x@example.com","consent":false}'                  # {"ok":false}
```

## Reading sign-ups (until Shanda picks a method)
From a machine with a token that has D1 access:
`npx wrangler d1 execute crewstart-db --remote --command "SELECT email, first_name, role, industry, marketing_consent, consent_at, created_at FROM subscribers ORDER BY id"`
Only rows with `marketing_consent = 1` may receive marketing email.
Delete on request: `... --command "DELETE FROM subscribers WHERE email='person@example.com'"`

## Before ANY email is sent (out of scope for v1; nothing sends email today)
- Pick an email provider; set up double opt-in there.
- Every email needs Shanda's physical mailing address and a one-click unsubscribe (CAN-SPAM).
