// Unit tests for src/worker.js using node:sqlite as a tiny D1 stand-in and mocked fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { handleSubscribe, handleSmart, CONSENT_TEXT, CONSENT_VERSION, validateSmartOutput, buildSmartPayload, buildSmartMessages, stripUnsafe, cleanupSmartCounts, SMART_EMAIL_MAX, SMART_GLOBAL_MAX, SMART_FALLBACK, SMART_EMAIL_CAP_MSG, SMART_GLOBAL_CAP_MSG } from '../src/handlers.js';
import * as handlers from '../src/handlers.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const m of ['0001_init.sql', '0002_required_email.sql', '0003_smart_counts.sql']) db.exec(readFileSync(new URL('../migrations/' + m, import.meta.url), 'utf8'));
  const norm = (sql) => sql.replace(/\?(\d+)/g, '?');            // node:sqlite: positional ? params
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => {
      // Expand ?N references to positional args.
      const order = [...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]) - 1);
      return db.prepare(norm(sql)).get(...order.map((i) => args[i])) ?? null;
    },
    run: async () => {
      const order = [...sql.matchAll(/\?(\d+)/g)].map((m) => Number(m[1]) - 1);
      db.prepare(norm(sql)).run(...order.map((i) => args[i]));
      return { success: true };
    },
    all: async () => ({ results: db.prepare(norm(sql)).all(...args) })
  });
  return { prepare: (sql) => stmt(sql), _db: db };
}

const PASS_FETCH = async () => new Response(JSON.stringify({ success: true }));
const FAIL_FETCH = async () => new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }));

function req(body, { ip = '203.0.113.7', origin = 'http://localhost:8787', ct = 'application/json', method = 'POST' } = {}) {
  const headers = { 'Content-Type': ct, 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  return new Request('http://localhost:8787/api/subscribe', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined });
}
// Required email; marketing consent optional (defaults to false when omitted).
const good = (extra = {}) => ({ email: 'Owner@Example.com ', first_name: 'Ana', turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX', ...extra });
const optIn = { marketing_consent: true, consent_version: CONSENT_VERSION };
// Cloudflare's published Turnstile TEST secret (always passes); not a real credential.
const envWith = (db) => ({ DB: db, TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' });

test('subscribe: email only (no marketing box) -> ok, stored with marketing_consent=0 and no consent text', async () => {
  const db = fakeD1();
  const res = await handleSubscribe(req(good()), envWith(db), { fetch: PASS_FETCH, now: Date.UTC(2026, 10, 20, 15, 45) });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const row = db._db.prepare('SELECT * FROM subscribers').get();
  assert.equal(row.email, 'owner@example.com');
  assert.equal(row.first_name, 'Ana');
  assert.equal(row.role, null);
  assert.equal(row.industry, null);
  assert.equal(row.marketing_consent, 0);
  assert.equal(row.consent_text, null);
  assert.equal(row.consent_version, null);
  assert.equal(row.consent_at, null);
  assert.equal(row.source, 'crewstart');
  assert.equal(row.created_at, '2026-11-20T15:45:00.000Z');
});

test('subscribe: marketing box ticked -> marketing_consent=1 with exact consent text/version and time', async () => {
  const db = fakeD1();
  const res = await handleSubscribe(req(good(optIn)), envWith(db), { fetch: PASS_FETCH, now: Date.UTC(2026, 10, 20, 16, 0) });
  assert.equal(res.status, 200);
  const row = db._db.prepare('SELECT * FROM subscribers').get();
  assert.equal(row.marketing_consent, 1);
  assert.equal(row.consent_text, CONSENT_TEXT);
  assert.equal(row.consent_version, CONSENT_VERSION);
  assert.equal(row.consent_at, '2026-11-20T16:00:00.000Z');
});

test('subscribe: role/industry stored only when share_profile is true', async () => {
  const db = fakeD1();
  await handleSubscribe(req(good({ email: 'a@example.com', role: 'Owner', industry: 'Bakery' })), envWith(db), { fetch: PASS_FETCH });
  await handleSubscribe(req(good({ email: 'b@example.com', role: 'Owner', industry: 'Bakery', share_profile: true }), { ip: '1.1.1.2' }), envWith(db), { fetch: PASS_FETCH });
  const rows = db._db.prepare('SELECT email, role, industry FROM subscribers ORDER BY email').all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [
    { email: 'a@example.com', role: null, industry: null },
    { email: 'b@example.com', role: 'Owner', industry: 'Bakery' }
  ]);
});

test('subscribe: missing/bad email, non-boolean consent, or opt-in with wrong version -> 400, nothing stored', async () => {
  const db = fakeD1();
  const bad = [good({ email: undefined }), good({ email: '' }), good({ email: 'not-an-email' }),
    good({ marketing_consent: 'true' }), good({ marketing_consent: 1 }), good({ marketing_consent: true }),
    good({ marketing_consent: true, consent_version: 'old' })];
  for (const [i, b] of bad.entries()) {
    const res = await handleSubscribe(req(b, { ip: '10.0.0.' + i }), envWith(db), { fetch: PASS_FETCH });
    assert.equal(res.status, 400, JSON.stringify(b));
    assert.deepEqual(await res.json(), { ok: false });
  }
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM subscribers').get().n, 0);
});

test('subscribe: Turnstile failure, missing token, or missing secret -> 403', async () => {
  const db = fakeD1();
  assert.equal((await handleSubscribe(req(good()), envWith(db), { fetch: FAIL_FETCH })).status, 403);
  assert.equal((await handleSubscribe(req(good({ turnstile_token: '' }), { ip: '9.9.9.1' }), envWith(db), { fetch: PASS_FETCH })).status, 403);
  assert.equal((await handleSubscribe(req(good(), { ip: '9.9.9.2' }), { DB: db }, { fetch: PASS_FETCH })).status, 403);
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM subscribers').get().n, 0);
});

test('subscribe: duplicate email is idempotent (ok, one row, original kept)', async () => {
  const db = fakeD1();
  const r1 = await handleSubscribe(req(good()), envWith(db), { fetch: PASS_FETCH });
  const r2 = await handleSubscribe(req(good({ email: 'OWNER@example.com', first_name: 'Changed' }), { ip: '5.5.5.5' }), envWith(db), { fetch: PASS_FETCH });
  assert.deepEqual([r1.status, r2.status], [200, 200]);
  assert.deepEqual(await r2.json(), { ok: true });
  const rows = db._db.prepare('SELECT * FROM subscribers').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].first_name, 'Ana');
  assert.equal(rows[0].marketing_consent, 0);
});

test('subscribe: a repeat can opt IN to marketing but never silently opts out', async () => {
  const db = fakeD1();
  await handleSubscribe(req(good()), envWith(db), { fetch: PASS_FETCH });
  await handleSubscribe(req(good(optIn), { ip: '6.6.6.1' }), envWith(db), { fetch: PASS_FETCH });
  let row = db._db.prepare('SELECT * FROM subscribers').get();
  assert.equal(row.marketing_consent, 1);
  assert.equal(row.consent_text, CONSENT_TEXT);
  await handleSubscribe(req(good({ marketing_consent: false }), { ip: '6.6.6.2' }), envWith(db), { fetch: PASS_FETCH });
  row = db._db.prepare('SELECT * FROM subscribers').get();
  assert.equal(row.marketing_consent, 1);
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM subscribers').get().n, 1);
});

test('migration 0002 keeps existing rows as marketing opt-ins', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  db.prepare("INSERT INTO subscribers (email, consent_text, consent_version, created_at) VALUES ('old@example.com', 'x', 'v1', '2026-11-20T15:00:00.000Z')").run();
  db.exec(readFileSync(new URL('../migrations/0002_required_email.sql', import.meta.url), 'utf8'));
  const row = db.prepare('SELECT * FROM subscribers').get();
  assert.equal(row.marketing_consent, 1);
  assert.equal(row.consent_at, '2026-11-20T15:00:00.000Z');
});

test('subscribe: rate limit 5 per 10 minutes per IP -> 429; other IPs unaffected; window resets', async () => {
  const db = fakeD1();
  const t0 = Date.UTC(2026, 10, 20, 16, 0);
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await handleSubscribe(req(good({ email: `u${i}@example.com` })), envWith(db), { fetch: PASS_FETCH, now: t0 })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
  assert.equal((await handleSubscribe(req(good({ email: 'other@example.com' }), { ip: '198.51.100.1' }), envWith(db), { fetch: PASS_FETCH, now: t0 })).status, 200);
  assert.equal((await handleSubscribe(req(good({ email: 'later@example.com' })), envWith(db), { fetch: PASS_FETCH, now: t0 + 11 * 60 * 1000 })).status, 200);
  // raw IPs are never stored
  const keys = db._db.prepare('SELECT key FROM rate_limits').all().map((r) => r.key);
  assert.ok(keys.every((k) => /^[0-9a-f]{64}$/.test(k)));
});

test('subscribe: missing or failed Turnstile tokens still count toward the rate limit', async () => {
  const db = fakeD1();
  const t0 = Date.UTC(2026, 10, 20, 16, 0);
  const env = envWith(db);
  const codes = [];
  for (let i = 0; i < 5; i++) {
    codes.push((await handleSubscribe(req(good({ email: `miss${i}@example.com`, turnstile_token: '' }), { ip: '203.0.113.9' }), env, { fetch: PASS_FETCH, now: t0 })).status);
  }
  assert.deepEqual(codes, [403, 403, 403, 403, 403]);
  assert.equal((await handleSubscribe(req(good({ email: 'miss5@example.com', turnstile_token: '' }), { ip: '203.0.113.9' }), env, { fetch: FAIL_FETCH, now: t0 })).status, 429);
  assert.equal((await handleSubscribe(req(good({ email: 'ok@example.com' }), { ip: '203.0.113.9' }), env, { fetch: PASS_FETCH, now: t0 })).status, 429);
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM subscribers').get().n, 0);
});

test('subscribe: cross-origin, non-JSON, GET, oversized -> rejected', async () => {
  const db = fakeD1();
  assert.equal((await handleSubscribe(req(good(), { origin: 'https://evil.example' }), envWith(db), { fetch: PASS_FETCH })).status, 403);
  assert.equal((await handleSubscribe(req(good(), { ct: 'text/plain', ip: '2.2.2.2' }), envWith(db), { fetch: PASS_FETCH })).status, 415);
  assert.equal((await handleSubscribe(req(null, { method: 'GET', ip: '3.3.3.3' }), envWith(db), { fetch: PASS_FETCH })).status, 405);
  assert.equal((await handleSubscribe(req(good({ first_name: 'x'.repeat(5000) }), { ip: '4.4.4.4' }), envWith(db), { fetch: PASS_FETCH })).status, 413);
});

test('admin export is a disabled stub: 404, never touches the DB, even with an Access-style header', async () => {
  const db = fakeD1();
  await handleSubscribe(req(good()), envWith(db), { fetch: PASS_FETCH });
  const env = { DB: { prepare: () => { throw new Error('DB must not be read'); } }, ASSETS: { fetch: async () => new Response('static') } };
  for (const hdrs of [{}, { 'Cf-Access-Jwt-Assertion': 'a.b.c' }]) {
    const res = await worker.fetch(new Request('https://x/admin/export.csv', { headers: hdrs }), env);
    assert.equal(res.status, 404);
    assert.doesNotMatch(await res.text(), /@/);
  }
  assert.equal(handlers.handleExport, undefined);
  assert.equal(handlers.verifyAccessJwt, undefined);
});

test('router: unknown /api and /admin paths 404; static paths go to ASSETS', async () => {
  const env = { ASSETS: { fetch: async () => new Response('static') } };
  assert.equal((await worker.fetch(new Request('http://x/api/subscribers'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('http://x/admin/'), env)).status, 404);
  assert.equal(await (await worker.fetch(new Request('http://x/'), env)).text(), 'static');
});

function smartReq(body, { ip = '203.0.113.20', origin = 'http://localhost:8787', ct = 'application/json', method = 'POST' } = {}) {
  const headers = { 'Content-Type': ct, 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  return new Request('http://localhost:8787/api/smart', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined });
}
const smartBody = (extra = {}) => ({
  email: 'realtor@example.com',
  turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX',
  profession: 'Realtor',
  location: 'Oklahoma City',
  tasks: ['Follow up with customers or clients', 'Schedule meetings and appointments'],
  tools: ['Gmail', 'Google Calendar'],
  goals: ['Finances and bills'],
  ...extra
});
const SAMPLE_AI = {
  bots: [
    { name: 'OKC Listing Planner', job: 'Track new listings in Oklahoma City and prep showings for your clients.', routine: 'Weekdays at 8:00 AM: today\'s listings brief', needs: ['Google Calendar', 'MLS'] },
    { name: 'Local Market Brief', job: 'Send a weekly recap of Oklahoma City housing trends and upcoming open houses.', routine: 'Fridays at 4:00 PM: market recap', needs: [] }
  ],
  templates: ['Dr. Eggbot', 'Calendar Coordinator']
};
function openaiFetch({ fail = false, payload = SAMPLE_AI, inspected } = {}) {
  return async (url, opts) => {
    const u = String(url);
    if (u.includes('siteverify')) return new Response(JSON.stringify({ success: true }));
    if (u.includes('api.openai.com')) {
      if (inspected) inspected.called = true, inspected.body = opts && opts.body;
      if (fail) return new Response('nope', { status: 500 });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
    }
    return new Response('unexpected ' + u, { status: 500 });
  };
}
const smartEnv = (db, extra = {}) => ({
  DB: db,
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  RATE_LIMIT_SALT: 'test-salt',
  OPENAI_API_KEY: 'test-openai-key',
  ...extra
});

test('validateSmartOutput strips HTML and URLs, maps needs, and fills Eggbot to reach 3', () => {
  const out = validateSmartOutput({
    bots: [
      { name: 'Chef <script>Specials</script>', job: 'Plan weekly specials from what is in season and see https://evil.example/x plus www.bad.com ideas, then send me a short list for my approval.', routine: 'Fridays at 2:30 PM: weekly specials', needs: ['Gmail', 'Instagram'] },
      { name: 'Tulsa Events Scout', job: 'Watch local events in Tulsa that could fill the dining room.', needs: [] }
    ],
    templates: ['not a real template']
  });
  assert.ok(out);
  assert.equal(out.bots[0].name, 'Chef Specials');
  assert.doesNotMatch(out.bots[0].job, /https?:|www\.|<script>/i);
  assert.ok(out.bots[0].needs.some((n) => n.id === 'gmail'));
  assert.ok(out.bots[0].needs.some((n) => n.label === 'Instagram' && n.id === 'other'));
  assert.ok(out.bots.length >= 2);
  assert.ok(out.bots.length + out.templates.length >= 3);
  assert.ok(out.templates.some((t) => t.name === 'Dr. Eggbot'));
});

test('validateSmartOutput drops short or secret-looking output', () => {
  assert.equal(validateSmartOutput({ bots: [{ name: 'Only one', job: 'Too alone.' }] }), null);
  assert.equal(validateSmartOutput({ bots: [{ name: 'A', job: 'my password is hunter2' }, { name: 'B', job: 'Fine job here, more than forty characters long.' }] }), null);
  assert.equal(validateSmartOutput('not-json'), null);
});

test('validateSmartOutput keeps verified templates, drops unknown names, and uses a specific reason', () => {
  const out = validateSmartOutput({
    bots: [
      { name: 'OKC Market Watch', job: 'Watch new listings, price changes, days on market, and rates in Oklahoma City for the property types I work, and send me a short digest. I approve anything before you send it to a client.', routine: 'Tuesdays at 10:00 AM: weekly OKC market digest', needs: [] },
      { name: 'Listing Launch Planner', job: 'Plan open houses and listing launches, including a rundown and draft notes for my approval. I approve every message before it goes out.', routine: 'Wednesdays at 2:00 PM: open-house plan', needs: ['Google Calendar'] }
    ],
    templates: [
      { name: 'Social Media Manager', reason: 'It can draft listing-launch posts in your voice for you to approve.' },
      { name: 'Calendar Coordinator', reason: 'A smart suggestion that fits this profession.' },
      'Researchy',
      'Not A Real Template',
      'Calendar Foo'
    ]
  });
  assert.ok(out);
  const names = out.templates.map((t) => t.name);
  assert.ok(names.includes('Social Media Manager'));
  assert.ok(names.includes('Calendar Coordinator'));
  assert.ok(names.includes('Researchy'));
  assert.ok(!names.includes('Not A Real Template'));
  assert.ok(!names.includes('Calendar Foo'));
  const social = out.templates.find((t) => t.name === 'Social Media Manager');
  assert.equal(social.reason, 'It can draft listing-launch posts in your voice for you to approve.');
  const cal = out.templates.find((t) => t.name === 'Calendar Coordinator');
  assert.equal(cal.reason, 'It keeps your calendar organized and helps you find a time to meet.');
  assert.equal(cal.id, 'calendar-coordinator');
  const res = out.templates.find((t) => t.name === 'Researchy');
  assert.equal(res.id, 'researchy');
  assert.match(res.reason, /researches topics/i);
});

test('buildSmartPayload never includes email or names', () => {
  const p = buildSmartPayload({
    email: 'secret@example.com', first_name: 'Shanda', profession: 'Realtor', location: 'Oklahoma City',
    tasks: ['Schedule meetings'], tools: ['Gmail'], goals: [],
    covered: [{ name: 'Inbox & Calendar Assistant', job: 'Sort my inbox.' }, 'secret@example.com must drop']
  });
  assert.deepEqual(Object.keys(p).sort(), ['covered', 'goals', 'location', 'profession', 'tasks', 'tools']);
  const packed = JSON.stringify(p);
  assert.doesNotMatch(packed, /secret@example\.com|Shanda|email/i);
  assert.deepEqual(p.covered, ['Inbox & Calendar Assistant: Sort my inbox.']);
  const msgs = buildSmartMessages(p);
  assert.doesNotMatch(JSON.stringify(msgs), /secret@example\.com|Shanda/);
  assert.match(msgs[0].content, /do not copy/i);
  assert.match(msgs[0].content, /OKC Market Watch/);
  assert.match(msgs[0].content, /Tulsa Events & Specials/);
  assert.match(JSON.stringify(msgs[1]), /Inbox & Calendar Assistant/);
});

test('smart: missing token is 403 and does not call OpenAI or save the email', async () => {
  const db = fakeD1();
  const inspected = { called: false };
  const res = await handleSmart(smartReq(smartBody({ turnstile_token: '' })), smartEnv(db), { fetch: openaiFetch({ inspected }), now: Date.UTC(2026, 10, 20, 18, 0) });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { ok: false });
  assert.equal(inspected.called, false);
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM subscribers').get().n, 0);
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM smart_email_counts').get().n, 0);
});

test('smart: success returns sanitized bots, OpenAI sees no email, and unchecked opt-in does not join the list', async () => {
  const db = fakeD1();
  const inspected = { called: false };
  const res = await handleSmart(smartReq(smartBody({ marketing_consent: false })), smartEnv(db), { fetch: openaiFetch({ inspected }), now: Date.UTC(2026, 10, 20, 18, 0) });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, true);
  assert.equal(j.fallback, false);
  assert.ok(j.bots.length >= 2);
  assert.ok(j.bots.some((b) => b.name === 'OKC Listing Planner'));
  assert.ok(j.bots[0].smart);
  assert.ok(inspected.called);
  assert.doesNotMatch(inspected.body, /realtor@example\.com/);
  const keys = db._db.prepare('SELECT key FROM smart_email_counts').all().map((r) => r.key);
  assert.equal(keys.length, 1);
  assert.ok(/^[0-9a-f]{64}$/.test(keys[0]));
  assert.doesNotMatch(keys[0], /@|realtor/i);
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM subscribers').get().n, 0);
});

test('smart: opt-in checkbox saves the email to the list; hash still has no raw email', async () => {
  const db = fakeD1();
  const res = await handleSmart(smartReq(smartBody({ email: 'join@example.com', marketing_consent: true, consent_version: CONSENT_VERSION }), { ip: '203.0.113.21' }), smartEnv(db), { fetch: openaiFetch(), now: Date.UTC(2026, 10, 20, 18, 5) });
  assert.equal(res.status, 200);
  const row = db._db.prepare('SELECT email, marketing_consent, consent_text FROM subscribers').get();
  assert.equal(row.email, 'join@example.com');
  assert.equal(row.marketing_consent, 1);
  assert.equal(row.consent_text, CONSENT_TEXT);
});

test('smart: 4th run in the same day for one email falls back', async () => {
  const db = fakeD1();
  const t0 = Date.UTC(2026, 10, 20, 18, 10);
  const env = smartEnv(db);
  const codes = [];
  const flags = [];
  for (let i = 0; i < 4; i++) {
    const res = await handleSmart(smartReq(smartBody({ email: 'cap@example.com' }), { ip: '203.0.113.' + (30 + i) }), env, { fetch: openaiFetch(), now: t0 });
    const j = await res.json();
    codes.push(res.status);
    flags.push(j.fallback === true);
  }
  assert.deepEqual(codes, [200, 200, 200, 200]);
  assert.deepEqual(flags, [false, false, false, true]);
});

test('smart: global daily cap falls back', async () => {
  const db = fakeD1();
  const t0 = Date.UTC(2026, 10, 20, 18, 20);
  db._db.prepare("INSERT INTO smart_global_counts (day, count, created_at) VALUES ('2026-11-20', 200, '2026-11-20T00:00:00.000Z')").run();
  const res = await handleSmart(smartReq(smartBody(), { ip: '203.0.113.40' }), smartEnv(db), { fetch: openaiFetch(), now: t0 });
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.ok, false);
  assert.equal(j.fallback, true);
  assert.equal(j.message, SMART_GLOBAL_CAP_MSG);
});

test('smart: OpenAI failure or missing key falls back without joining the list', async () => {
  const db = fakeD1();
  const t0 = Date.UTC(2026, 10, 20, 18, 30);
  let res = await handleSmart(smartReq(smartBody({ email: 'fail1@example.com' }), { ip: '203.0.113.41' }), smartEnv(db), { fetch: openaiFetch({ fail: true }), now: t0 });
  let j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.fallback, true);
  assert.equal(j.message, SMART_FALLBACK);
  res = await handleSmart(smartReq(smartBody({ email: 'fail2@example.com' }), { ip: '203.0.113.42' }), smartEnv(db, { OPENAI_API_KEY: '' }), { fetch: openaiFetch(), now: t0 });
  j = await res.json();
  assert.equal(j.fallback, true);
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM subscribers').get().n, 0);
});

test('smart: stale counters older than about 2 days are deleted', async () => {
  const db = fakeD1();
  db._db.prepare("INSERT INTO smart_email_counts (key, day, count, created_at) VALUES ('abc', '2026-11-17', 3, '2026-11-17T00:00:00.000Z')").run();
  db._db.prepare("INSERT INTO smart_global_counts (day, count, created_at) VALUES ('2026-11-17', 9, '2026-11-17T00:00:00.000Z')").run();
  await cleanupSmartCounts(smartEnv(db), Date.UTC(2026, 10, 20, 18, 0));
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM smart_email_counts').get().n, 0);
  assert.equal(db._db.prepare('SELECT COUNT(*) n FROM smart_global_counts').get().n, 0);
});

test('router: POST /api/smart without a token is 403', async () => {
  const db = fakeD1();
  const env = { ...smartEnv(db), ASSETS: { fetch: async () => new Response('static') } };
  const res = await worker.fetch(smartReq(smartBody({ turnstile_token: '' })), env);
  assert.equal(res.status, 403);
});

test('hiring and sales templates are dropped unless the answers include those jobs', () => {
  const bots = [
    { name: 'OKC Market Watch', job: 'Watch new listings, price changes, days on market, and mortgage rates in Oklahoma City for the property types I work, and send me a short digest. I approve anything before you send it to a client.', routine: 'Tuesdays at 10:00 AM: weekly OKC market digest', needs: [] },
    { name: 'Listing Launch Planner', job: 'Plan open houses and listing launches, including a rundown and draft notes for my approval. I approve every message before it goes out.', routine: 'Wednesdays at 2:00 PM: open-house plan', needs: [] }
  ];
  const dropped = validateSmartOutput({ bots, templates: ['Hiring Screener', 'Sales Outbound', 'Social Media Manager'] }, { profession: 'Realtor', tasks: ['Follow up with customers or clients'], goals: [], covered: [] });
  const names = dropped.templates.map((t) => t.name);
  assert.ok(!names.includes('Hiring Screener'));
  assert.ok(!names.includes('Sales Outbound'));
  assert.ok(names.includes('Social Media Manager'));
  const kept = validateSmartOutput({ bots, templates: ['Hiring Screener', 'Sales Outbound'] }, { profession: 'Realtor', tasks: ['Hire or interview people', 'Find new business clients'], goals: [], covered: [] });
  const keptNames = kept.templates.map((t) => t.name);
  assert.ok(keptNames.includes('Hiring Screener'));
  assert.ok(keptNames.includes('Sales Outbound'));
});
