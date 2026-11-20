// Short live e2e: no-token 403, privacy phrase, realtor (and restaurant) Review
// with intercepted Smart AI results from the quality fixture, at 1280 and 390.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787/';
const SHOTS = process.env.SHOTS
  ? (process.env.SHOTS.endsWith('/') ? process.env.SHOTS : process.env.SHOTS + '/')
  : new URL('../shots/', import.meta.url).pathname;
const FIXTURE = process.env.SMART_FIXTURE || '/tmp/crewstart-smart-quality.json';
mkdirSync(SHOTS, { recursive: true });

const quality = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const fixture = (id) => {
  const row = quality.find((r) => r.id === id);
  if (!row || !row.validated) throw new Error('missing quality fixture ' + id);
  return { ok: true, fallback: false, bots: row.validated.bots, templates: row.validated.templates };
};

const problems = [];

const personas = {
  'realtor-okc': {
    role: 'Realtor', industry: 'Residential real estate', location: 'Oklahoma City',
    tasks: ['Sort and reply to email', 'Schedule meetings and appointments', 'Follow up with customers or clients', 'Write posts, docs, or proposals', 'Research topics, competitors, or leads', 'Prep for meetings and take notes'],
    tools: ['Gmail', 'Google Calendar', 'CRM'],
    goals: ['Finances and bills'],
    expectNames: ['OKC New Listings Alert', 'Open House Coordinator', 'Client Anniversary Reminder', 'Market Trend Observer'],
    expectPrompt: [/Also ask before deleting anything\./, /Based in Oklahoma City/, /OKC New Listings Alert/, /Client Anniversary Reminder/, /Residential Real Estate Content & Updates/, /new listings, market updates, open houses/]
  },
  'restaurant-tulsa': {
    role: 'Restaurant owner', industry: 'Restaurant', location: 'Tulsa',
    tasks: ['Sort and reply to email', 'Schedule meetings and appointments', 'Follow up with customers or clients', 'Write posts, docs, or proposals', 'Research topics, competitors, or leads'],
    tools: ['Gmail', 'Google Calendar'],
    goals: ['Meals and groceries', 'Finances and bills'],
    expectNames: ['Tulsa Concert & Game Watcher', 'Seasonal Specials Planner', 'Food Trend Watcher'],
    expectPrompt: [/Also ask before deleting anything\./, /Based in Tulsa/, /Tulsa Concert & Game Watcher/, /Food Trend Watcher/, /Restaurant Content & Updates/, /content ideas for my restaurant/, /specials, seasonal menus, announcements/]
  }
};

async function noToken() {
  const origin = new URL(BASE).origin;
  const r = await fetch(origin + '/api/smart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ email: 'e2e-notoken@example.com', profession: 'Realtor', location: 'Oklahoma City', turnstile_token: '' })
  });
  if (r.status !== 403) problems.push('smart no-token status ' + r.status);
  const j = await r.json().catch(() => null);
  if (!j || j.ok !== false || j.fallback === true) problems.push('smart no-token body unexpected: ' + JSON.stringify(j));
}

async function run(width, height, tag, personaId) {
  const persona = personas[personaId];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: tag.startsWith('mobile') ? 2 : 1 });
  const page = await ctx.newPage();
  const shot = (name, full = true) => page.screenshot({ path: `${SHOTS}${tag}-${name}.png`, fullPage: full });

  await page.goto(BASE);
  if (personaId === 'realtor-okc') {
    await page.locator('.cs-footer__link[href="/privacy"]').click();
    await page.waitForURL(/\/privacy/);
    for (const phrase of ['Smart AI suggestions', 'OpenAI', 'salted hash', 'Nothing is saved to our email list unless you join it']) {
      if (!(await page.getByText(phrase, { exact: false }).first().isVisible())) problems.push(`[${tag}] /privacy missing: ${phrase}`);
    }
    await shot('privacy');
    await page.goto(BASE);
  }

  await page.getByRole('button', { name: 'Start' }).click();
  await page.locator('#role').fill(persona.role);
  await page.locator('#industry').fill(persona.industry);
  await page.locator('#location').fill(persona.location);
  await page.getByRole('button', { name: 'Next' }).click();
  for (const t of persona.tasks) {
    const box = page.getByLabel(t);
    if (await box.isEnabled()) await box.click();
  }
  await page.getByRole('button', { name: 'Next' }).click();
  for (const t of persona.tools) {
    const box = page.getByLabel(t, { exact: true });
    if (await box.isEnabled()) await box.click();
  }
  await page.getByRole('button', { name: 'Next' }).click();
  for (const t of persona.goals) {
    const box = page.getByLabel(t);
    if (await box.isEnabled()) await box.click();
  }
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'See my team' }).click();

  if (!(await page.getByRole('heading', { name: 'Smart AI suggestions' }).isVisible())) {
    problems.push(`[${tag}] Smart AI heading missing`);
  }

  await page.route('**/api/smart', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(fixture(personaId))
    });
  });
  await page.locator('#smart-email').fill(`e2e-smart-${tag}@example.com`);
  await page.evaluate(() => {
    const el = document.querySelector('#smart-turnstile-token');
    if (el) el.value = 'e2e-dummy-token';
  });
  await page.locator('#smart-card').scrollIntoViewIfNeeded();
  const appeared = page.locator('#smart-loading').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: 'Get smart suggestions' }).click();
  try { await appeared; } catch (e) { problems.push(`[${tag}] loader did not appear: ${e.message}`); }
  await shot('4-smart-loading');
  try { await page.locator('#smart-loading').waitFor({ state: 'hidden', timeout: 10000 }); } catch (e) { problems.push(`[${tag}] loader did not clear: ${e.message}`); }

  for (const name of persona.expectNames) {
    const input = page.locator('#bot-list input[data-rename]').filter({ hasText: name }).first();
    const found = await page.locator(`#bot-list input[value="${name}"]`).count();
    if (!found) problems.push(`[${tag}] missing AI bot on Review: ${name}`);
  }
  if (!(await page.getByText('Smart suggestion').first().isVisible())) {
    problems.push(`[${tag}] Smart suggestion badge missing`);
  }
  await page.locator('#bot-list').scrollIntoViewIfNeeded();
  await shot('4-smart-review');

  await page.getByRole('button', { name: 'Build my prompt' }).click();
  const prompt = (await page.locator('#prompt-out').textContent()) || '';
  for (const re of persona.expectPrompt) {
    if (!re.test(prompt)) problems.push(`[${tag}] prompt missing ${re}: ${prompt.slice(0, 180)}`);
  }
  await shot('5-smart-output');
  await browser.close();
}

await noToken();
await run(1280, 900, 'desktop-realtor', 'realtor-okc');
await run(390, 844, 'mobile-realtor', 'realtor-okc');
await run(1280, 900, 'desktop-restaurant', 'restaurant-tulsa');
await run(390, 844, 'mobile-restaurant', 'restaurant-tulsa');
console.log(JSON.stringify({ problems }, null, 2));
process.exit(problems.length ? 1 : 0);
