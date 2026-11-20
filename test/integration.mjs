// Integration tests against `wrangler dev` with local D1 (no remote resources).
// Spawns two local Workers: one with Turnstile's always-pass test secret, one with the always-fail test secret.
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const PASS = 'http://127.0.0.1:8787', FAIL = 'http://127.0.0.1:8788';
const FAIL_STATE = '/tmp/crewstart-fail-state';
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
delete env.OPENAI_API_KEY;
const results = [];

function wrangler(args) { return execFileSync('npx', ['wrangler', ...args], { cwd: ROOT, env, encoding: 'utf8' }); }
function d1(sql, persist) {
  const out = wrangler(['d1', 'execute', 'crewstart-db', '--local', '--json', '--command', sql, ...(persist ? ['--persist-to', persist] : [])]);
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
}
function start(port, extra) {
  const p = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', ...extra], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let log = '';
    const t = setTimeout(() => reject(new Error('wrangler dev did not start:\n' + log)), 60000);
    const on = (d) => { log += d; if (/Ready on/.test(log)) { clearTimeout(t); resolve(p); } };
    p.stdout.on('data', on); p.stderr.on('data', on);
  });
}
async function check(name, fn) {
  try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ': ' + e.message]); }
}
const body = (o) => ({ email: 'it-owner@example.com', first_name: 'Ana', turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX', ...o });
const post = (base, b) => fetch(base + '/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(b) });

// Fresh local state for both instances.
wrangler(['d1', 'migrations', 'apply', 'crewstart-db', '--local']);
d1('DELETE FROM subscribers; DELETE FROM rate_limits; DELETE FROM smart_email_counts; DELETE FROM smart_global_counts;');
rmSync(FAIL_STATE, { recursive: true, force: true }); mkdirSync(FAIL_STATE, { recursive: true });
wrangler(['d1', 'migrations', 'apply', 'crewstart-db', '--local', '--persist-to', FAIL_STATE]);
// Cloudflare's published Turnstile TEST secret that always fails; not a real credential.
writeFileSync('/tmp/crewstart-fail.env', 'TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA\n');

const procs = [];
try {
  procs.push(await start(8787, []));
  procs.push(await start(8788, ['--persist-to', FAIL_STATE, '--env-file', '/tmp/crewstart-fail.env']));

  await check('static site served with CSP', async () => {
    const r = await fetch(PASS + '/');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
  });

  const postSmart = (base, b) => fetch(base + '/api/smart', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(b) });
  await check('smart: missing token -> 403, not stored, not a fallback', async () => {
    const before = d1('SELECT COUNT(*) n FROM subscribers')[0].n;
    const r = await postSmart(PASS, { email: 'smart-notoken@example.com', profession: 'Realtor', location: 'Oklahoma City', turnstile_token: '' });
    assert.equal(r.status, 403);
    const j = await r.json();
    assert.equal(j.ok, false);
    assert.notEqual(j.fallback, true);
    assert.equal(d1('SELECT COUNT(*) n FROM subscribers')[0].n, before);
  });
  await check('smart: Turnstile pass without OpenAI key -> 200 fallback, not stored', async () => {
    const r = await postSmart(PASS, { email: 'smart-fallback@example.com', profession: 'Realtor', location: 'Oklahoma City', turnstile_token: 'XXXX.DUMMY.TOKEN.XXXX', marketing_consent: false });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ok, false);
    assert.equal(j.fallback, true);
    assert.ok(j.message);
    assert.equal(d1("SELECT COUNT(*) n FROM subscribers WHERE email='smart-fallback@example.com'")[0].n, 0);
  });
  d1('DELETE FROM rate_limits;');
  await check('email only (no marketing box) -> 200 {ok:true}, stored with marketing_consent=0, source=crewstart', async () => {
    const r = await post(PASS, body());
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    const rows = d1("SELECT email, first_name, role, industry, marketing_consent, consent_text, source, created_at FROM subscribers WHERE email='it-owner@example.com'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'crewstart');
    assert.equal(rows[0].marketing_consent, 0);
    assert.equal(rows[0].consent_text, null);
    assert.equal(rows[0].role, null);
    assert.match(rows[0].created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  });
  await check('marketing box ticked -> 200, marketing_consent=1 with consent text', async () => {
    const r = await post(PASS, body({ email: 'optin@example.com', marketing_consent: true, consent_version: '2026-11-20-v1' }));
    assert.equal(r.status, 200);
    const row = d1("SELECT marketing_consent, consent_text FROM subscribers WHERE email='optin@example.com'")[0];
    assert.equal(row.marketing_consent, 1);
    assert.match(row.consent_text, /^Yes, email me occasional AI tips/);
  });
  await check('missing email -> 400 {ok:false}, not stored', async () => {
    const before = d1('SELECT COUNT(*) n FROM subscribers')[0].n;
    const r = await post(PASS, body({ email: '' }));
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { ok: false });
    assert.equal(d1('SELECT COUNT(*) n FROM subscribers')[0].n, before);
  });
  await check('bad Turnstile (always-fail test secret) -> 403, not stored', async () => {
    const r = await post(FAIL, body({ email: 'badturnstile@example.com' }));
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), { ok: false });
    assert.equal(d1("SELECT COUNT(*) n FROM subscribers", FAIL_STATE)[0].n, 0);
  });
  await check('duplicate email (different case) -> 200, still one row', async () => {
    const r = await post(PASS, body({ email: 'IT-Owner@Example.com', first_name: 'Other' }));
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true });
    const rows = d1("SELECT first_name FROM subscribers WHERE email='it-owner@example.com'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].first_name, 'Ana');
  });
  await check('role/industry stored only with share box', async () => {
    const r = await post(PASS, body({ email: 'sharer@example.com', share_profile: true, role: 'Owner', industry: 'Bakery' }));
    assert.equal(r.status, 200);
    assert.deepEqual(d1("SELECT role, industry FROM subscribers WHERE email='sharer@example.com'")[0], { role: 'Owner', industry: 'Bakery' });
  });
  await check('admin export disabled -> 404, no emails (with or without an Access-style header)', async () => {
    for (const headers of [{}, { 'Cf-Access-Jwt-Assertion': 'a.b.c' }]) {
      const r = await fetch(PASS + '/admin/export.csv', { headers });
      assert.equal(r.status, 404);
      assert.doesNotMatch(await r.text(), /@/);
    }
  });
  await check('no other endpoint returns emails (GET /api/subscribe, /api/subscribers, /admin/)', async () => {
    for (const p of ['/api/subscribe', '/api/subscribers', '/admin/', '/admin/export.csv', '/admin/export.json']) {
      const r = await fetch(PASS + p);
      assert.ok(r.status >= 400, p + ' ' + r.status);
      assert.doesNotMatch(await r.text(), /example\.com/);
    }
  });
  await check('rate limit kicks in -> 429', async () => {
    let got429 = false;
    for (let i = 0; i < 8 && !got429; i++) got429 = (await post(PASS, body({ email: `rl${i}@example.com` }))).status === 429;
    assert.ok(got429);
  });
} finally {
  procs.forEach((p) => p.kill('SIGTERM'));
  // Leave the local DB clean for manual testing.
  try { d1('DELETE FROM rate_limits; DELETE FROM smart_email_counts; DELETE FROM smart_global_counts;'); } catch { /* ignore */ }
}

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} integration checks passed`);
process.exit(failed ? 1 : 0);
