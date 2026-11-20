// End-to-end click-through with headless Chrome (playwright-core). Requires `npx wrangler dev` on :8787.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787/';
const SHOTS = process.env.SHOTS
  ? (process.env.SHOTS.endsWith('/') ? process.env.SHOTS : process.env.SHOTS + '/')
  : new URL('../shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const problems = [];
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'challenges.cloudflare.com',
  'static.cloudflareinsights.com',
  'cloudflareinsights.com'
]);


async function run(width, height, tag) {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: tag === 'mobile' ? 2 : 1, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  const page = await ctx.newPage();
  const external = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(u.hostname + u.pathname); });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // Local wrangler is http://127.0.0.1:PORT; the insights beacon CORS list is origin without a port.
    if (/ERR_FAILED/.test(text)) return;
    if (/cloudflareinsights\.com/.test(text) && /CORS policy|Access-Control-Allow-Origin/.test(text)) return;
    problems.push(`[${tag}] console: ${text}`);
  });
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message}`));

  let clicks = 0;
  const click = async (loc) => { await loc.click(); clicks++; };
  const shot = (name, full = true) => page.screenshot({ path: `${SHOTS}${tag}-${name}.png`, fullPage: full });

  await page.goto(BASE);
  if (!(await page.title()).startsWith("Crewstart: build")) problems.push(`[${tag}] title: ${await page.title()}`);
  const linkedin = page.locator('.cs-footer__social[data-social="linkedin"]');
  const xLink = page.locator('.cs-footer__social[data-social="x"]');
  if (!(await linkedin.isVisible())) problems.push(`[${tag}] LinkedIn footer link missing`);
  if ((await linkedin.getAttribute('href')) !== 'https://www.linkedin.com/in/shanda-biggs') {
    problems.push(`[${tag}] LinkedIn href: ${await linkedin.getAttribute('href')}`);
  }
  if ((await linkedin.getAttribute('target')) !== '_blank' || !/noopener/.test(await linkedin.getAttribute('rel') || '')) {
    problems.push(`[${tag}] LinkedIn target/rel`);
  }
  if ((await linkedin.getAttribute('aria-label')) !== 'Shanda Biggs on LinkedIn') {
    problems.push(`[${tag}] LinkedIn aria-label: ${await linkedin.getAttribute('aria-label')}`);
  }
  if (!(await xLink.isVisible())) problems.push(`[${tag}] X footer link missing`);
  if ((await xLink.getAttribute('href')) !== 'https://x.com/BiggsShanda') {
    problems.push(`[${tag}] X href: ${await xLink.getAttribute('href')}`);
  }
  if ((await xLink.getAttribute('target')) !== '_blank' || !/noopener/.test(await xLink.getAttribute('rel') || '')) {
    problems.push(`[${tag}] X target/rel`);
  }
  if ((await xLink.getAttribute('aria-label')) !== 'Shanda Biggs on X') {
    problems.push(`[${tag}] X aria-label: ${await xLink.getAttribute('aria-label')}`);
  }
  const privacyHref = page.locator('.cs-footer__link[href="/privacy"]');
  if (!(await privacyHref.isVisible())) problems.push(`[${tag}] footer Privacy link missing or not /privacy`);
  if (!(await page.getByText('Made by Shanda Biggs').first().isVisible())) {
    problems.push(`[${tag}] footer credit missing`);
  }
  const note = (await page.locator('.cs-footer__note').textContent() || '').trim();
  if (note !== 'Unofficial community tool. Not affiliated with xAI, Grok, or Cursor.') {
    problems.push(`[${tag}] unofficial footer line: ${note}`);
  }
  const official = page.locator('.hero .official a[data-social="grokSignup"]');
  if (!(await official.isVisible())) problems.push(`[${tag}] official Grok Bot link missing`);
  if ((await official.getAttribute('href')) !== 'https://x.ai/bot') {
    problems.push(`[${tag}] official href: ${await official.getAttribute('href')}`);
  }
  if ((await official.getAttribute('target')) !== '_blank' || !/noopener/.test(await official.getAttribute('rel') || '')) {
    problems.push(`[${tag}] official target/rel`);
  }
  const startBox = await page.getByRole('button', { name: 'Start' }).boundingBox();
  if (!startBox) problems.push(`[${tag}] Start button missing`);
  else if (startBox.y < 0 || startBox.y + startBox.height > height) {
    problems.push(`[${tag}] Start not fully above the fold: top=${startBox.y.toFixed(1)} bottom=${(startBox.y + startBox.height).toFixed(1)} viewport=${height}`);
  }
  await shot('0-landing');

  const privUrl = new URL('privacy', BASE).href;
  const privResp = await page.goto(privUrl, { waitUntil: 'domcontentloaded' });
  const privStatus = privResp && privResp.status();
  const privFinal = page.url();
  if (privStatus !== 200) problems.push(`[${tag}] /privacy status: ${privStatus}`);
  if (!/\/privacy\/?$/.test(new URL(privFinal).pathname)) problems.push(`[${tag}] /privacy redirected to ${privFinal}`);
  const privTitle = await page.title();
  if (!/^Privacy/.test(privTitle)) problems.push(`[${tag}] /privacy title: ${privTitle}`);
  if (await page.getByRole('button', { name: 'Start' }).count()) problems.push(`[${tag}] /privacy served the landing SPA`);
  if (!(await page.getByRole('heading', { level: 1, name: 'Privacy', exact: true }).isVisible())) {
    problems.push(`[${tag}] /privacy missing h1`);
  }
  for (const phrase of [
    'stay in the browser',
    'Nothing is saved to our email list unless you join it',
    'We count visits with Cloudflare Web Analytics',
    'no cookies',
    'no accounts',
    'Cloudflare D1',
    'Cloudflare Turnstile',
    'Smart AI suggestions',
    'OpenAI',
    'salted hash',
    '[contact email to come]',
  ]) {
    if (!(await page.getByText(phrase, { exact: false }).first().isVisible())) {
      problems.push(`[${tag}] /privacy missing: ${phrase}`);
    }
  }
  if (!(await page.locator('.cs-footer__social[data-social="linkedin"]').isVisible())) {
    problems.push(`[${tag}] /privacy LinkedIn footer link missing`);
  }
  if (!(await page.locator('.cs-footer__social[data-social="x"]').isVisible())) {
    problems.push(`[${tag}] /privacy X footer link missing`);
  }
  const privNote = (await page.locator('.cs-footer__note').textContent() || '').trim();
  if (privNote !== 'Unofficial community tool. Not affiliated with xAI, Grok, or Cursor.') {
    problems.push(`[${tag}] /privacy unofficial footer line: ${privNote}`);
  }
  if ((await page.locator('.cs-footer__link[href="/privacy"]').getAttribute('href')) !== '/privacy') {
    problems.push(`[${tag}] /privacy footer Privacy href is not /privacy`);
  }
  await shot('privacy');
  await page.goto(BASE);
  await click(page.getByRole('button', { name: 'Start' }));

  // Step 1: small business owner
  await page.locator('#role').fill('Owner');
  await page.locator('#industry').fill('Home bakery and catering');
  if (!(await page.locator('#location').isVisible())) problems.push(`[${tag}] location field missing on About me`);
  await page.locator('#location').fill('Tulsa');
  await shot('1a-about');
  await click(page.getByRole('button', { name: 'Next' }));
  for (const t of ['Sort and reply to email', 'Schedule meetings and appointments', 'Follow up with customers or clients', 'Write posts, docs, or proposals', 'Research topics, competitors, or leads']) await click(page.getByLabel(t));
  await shot('1b-tasks');
  await click(page.getByRole('button', { name: 'Next' }));
  for (const t of ['Gmail', 'Google Calendar', 'CRM']) await click(page.getByLabel(t, { exact: true }));
  await shot('1c-tools');
  await click(page.getByRole('button', { name: 'Next' }));

  // Step 2
  await click(page.getByLabel('Meals and groceries'));
  await click(page.getByLabel('Finances and bills'));
  await shot('2-personal');
  await click(page.getByRole('button', { name: 'Next' }));

  // Step 3: briefing at 7:30 AM to match the bakery sample
  await page.locator('#briefingTime').selectOption('07:30');
  await shot('3-preferences');
  await click(page.getByRole('button', { name: 'See my team' }));

  // Step 4
  const botCount = await page.locator('.bot-card').count();
  const tplCount = await page.locator('.tpl-row').count();
  const crew = botCount + tplCount;
  if (botCount < 1) problems.push(`[${tag}] no custom bots`);
  if (crew < 3 || crew > 10) problems.push(`[${tag}] crew count ${crew} (custom ${botCount}, templates ${tplCount})`);
  const crewText = await page.locator('#crew-count-text').textContent();
  if (!/Your crew:/.test(crewText) || !new RegExp(`${crew} of 10`).test(crewText)) problems.push(`[${tag}] crew text: ${crewText}`);
  if (!(await page.getByRole('heading', { name: 'Suggested templates' }).isVisible())) problems.push(`[${tag}] templates heading missing`);
  if (!(await page.getByText('Ready-made Grok Bot templates, picked from your answers.').isVisible())) problems.push(`[${tag}] templates subline`);
  if (!(await page.getByRole('heading', { name: /Dr\. Eggbot/ }).isVisible())) problems.push(`[${tag}] Dr. Eggbot missing`);
  if (!(await page.getByText('Always suggested').isVisible())) problems.push(`[${tag}] always-suggested pill missing`);
  if ((await page.locator('[aria-label="Remove Dr. Eggbot template"]').count()) !== 1) problems.push(`[${tag}] Eggbot remove label`);
  if (tplCount < 3) problems.push(`[${tag}] expected at least 3 templates, got ${tplCount}`);
  const contentName = await page.locator('#bot-name-writing').inputValue().catch(() => '');
  if (!/Content & Updates/.test(contentName)) {
    problems.push(`[${tag}] industry content bot missing: ${contentName || 'no writing bot'}`);
  }
  if (await page.getByRole('heading', { name: /Recruiting Coordinator|Hiring Screener|Sales Outbound/ }).count()) {
    problems.push(`[${tag}] bakery Review includes a hiring or sales template`);
  }
  const reasons = await page.locator('#tpl-list .tpl-txt p').allTextContents();
  if (reasons.length !== tplCount) problems.push(`[${tag}] template reasons ${reasons.length} vs ${tplCount} cards`);
  for (const r of reasons) {
    if (!r || r.trim().length < 20) problems.push(`[${tag}] weak template reason: ${r}`);
  }
  await shot('4-review');

  // Smart AI suggestions: card is optional, join-list is off, loader is hidden until submit
  if (!(await page.getByRole('heading', { name: 'Smart AI suggestions' }).isVisible())) {
    problems.push(`[${tag}] Smart AI suggestions heading missing`);
  }
  const smartConsent = page.locator('#smart-consent');
  if (!(await smartConsent.count())) problems.push(`[${tag}] Smart AI join-list checkbox missing`);
  else if (await smartConsent.isChecked()) problems.push(`[${tag}] Smart AI join-list pre-checked`);
  const loader = page.locator('#smart-loading');
  if (!(await loader.count())) problems.push(`[${tag}] Smart AI loading indicator missing from the DOM`);
  else {
    if (!(await loader.isHidden())) problems.push(`[${tag}] Smart AI loader visible before submit`);
    if (!(await page.getByText('Building your crew…').count())) problems.push(`[${tag}] Smart AI loader copy missing`);
  }
  if (!(await page.getByRole('button', { name: 'Get smart suggestions' }).isEnabled())) {
    problems.push(`[${tag}] Get smart suggestions disabled before submit`);
  }

  // Intercept the API so headless never hits caps or OpenAI. A dummy client token
  // lets the in-flight UI run; the server is not bypassed on live no-token checks.
  await page.route('**/api/smart', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise((r) => setTimeout(r, 1600));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        fallback: true,
        message: "We couldn't generate smart suggestions right now, so we're showing your regular team."
      })
    });
  });
  await page.locator('#smart-email').fill(`e2e-smart-${tag}@example.com`);
  await page.evaluate(() => {
    const el = document.querySelector('#smart-turnstile-token');
    if (el) el.value = 'e2e-dummy-token';
  });
  await page.locator('#smart-card').scrollIntoViewIfNeeded();
  const loadAppeared = page.locator('#smart-loading').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: 'Get smart suggestions' }).click();
  try {
    await loadAppeared;
  } catch (e) {
    problems.push(`[${tag}] Smart AI loader did not appear: ${e.message}`);
  }
  if ((await page.locator('#smart-form').getAttribute('aria-busy')) !== 'true') {
    problems.push(`[${tag}] Smart AI form missing aria-busy while loading`);
  }
  if ((await page.locator('#smart-submit').getAttribute('aria-busy')) !== 'true') {
    problems.push(`[${tag}] Get smart suggestions missing aria-busy`);
  }
  if (!(await page.locator('#smart-submit').isDisabled())) {
    problems.push(`[${tag}] Get smart suggestions still enabled while loading`);
  }
  if (!(await page.getByText('Building your crew…').first().isVisible())) {
    problems.push(`[${tag}] Building your crew… not visible while loading`);
  }
  await shot('4-smart-loading');
  try {
    await page.locator('#smart-loading').waitFor({ state: 'hidden', timeout: 10000 });
  } catch (e) {
    problems.push(`[${tag}] Smart AI loader did not clear: ${e.message}`);
  }
  if ((await page.locator('#smart-form').getAttribute('aria-busy')) === 'true') {
    problems.push(`[${tag}] Smart AI form still aria-busy after fallback`);
  }
  if (!(await page.locator('#smart-submit').isEnabled())) {
    problems.push(`[${tag}] Get smart suggestions still disabled after fallback`);
  }
  const fallbackText = (await page.locator('#smart-status').textContent()) || '';
  if (!/couldn.t generate smart suggestions|regular team/i.test(fallbackText)) {
    problems.push(`[${tag}] Smart AI fallback message missing: ${fallbackText}`);
  }
  await shot('4-smart-fallback');
  await page.unroute('**/api/smart');

  // Usage Saver: offered, off by default, never counts toward the 10-bot cap
  const saver = page.locator('#usage-saver');
  if (!(await page.getByRole('heading', { name: 'Usage Saver' }).isVisible())) problems.push(`[${tag}] Usage Saver heading missing`);
  if (!(await page.getByText('Keeps your plan usage down. Checks weekly which bots and routines use the most and suggests cuts for you to approve.').isVisible())) {
    problems.push(`[${tag}] Usage Saver card copy`);
  }
  if (await saver.isChecked()) problems.push(`[${tag}] Usage Saver pre-checked`);
  if (await saver.isDisabled()) problems.push(`[${tag}] Usage Saver disabled`);
  await saver.check();
  const crewTextOn = await page.locator('#crew-count-text').textContent();
  if (!new RegExp(`${crew} of 10`).test(crewTextOn) || !/\+ Usage Saver/.test(crewTextOn)) {
    problems.push(`[${tag}] crew text after Usage Saver: ${crewTextOn}`);
  }
  if (await saver.isDisabled()) problems.push(`[${tag}] Usage Saver disabled after turning on`);
  await shot('4-review-saver');

  await click(page.getByRole('button', { name: 'Build my prompt' }));

  // Step 5: prompt is shown immediately; email opt-in is optional and last
  if (await page.evaluate(() => document.querySelector('[data-screen="5"]').hidden)) problems.push(`[${tag}] output hidden after review`);
  const stepItems = page.locator('#out-steps li');
  if ((await stepItems.count()) !== 4) problems.push(`[${tag}] output steps count: ${await stepItems.count()}`);
  const stepTexts = await stepItems.allTextContents();
  if (!stepTexts[0] || !/Copy this prompt/.test(stepTexts[0])) problems.push(`[${tag}] step 1: ${stepTexts[0]}`);
  if (!stepTexts[1] || !/Open your Grok Bot/.test(stepTexts[1]) || !/Get it on the official site/.test(stepTexts[1])) {
    problems.push(`[${tag}] step 2: ${stepTexts[1]}`);
  }
  if (!stepTexts[2] || !/Paste it into the chat and press send/.test(stepTexts[2])) problems.push(`[${tag}] step 3: ${stepTexts[2]}`);
  if (!stepTexts[3] || !/Answer its questions/.test(stepTexts[3]) || !/asks before anything important/.test(stepTexts[3])) {
    problems.push(`[${tag}] step 4: ${stepTexts[3]}`);
  }
  const stepOfficial = page.locator('#out-steps a[data-social="grokSignup"]');
  if ((await stepOfficial.getAttribute('href')) !== 'https://x.ai/bot') {
    problems.push(`[${tag}] output official href: ${await stepOfficial.getAttribute('href')}`);
  }
  if ((await stepOfficial.getAttribute('target')) !== '_blank' || !((await stepOfficial.getAttribute('rel') || '').split(/\s+/).includes('noopener'))) {
    problems.push(`[${tag}] output official target/rel`);
  }
  const stepsBox = await page.locator('#out-steps').boundingBox();
  const copyBox = await page.getByRole('button', { name: 'Copy prompt' }).boundingBox();
  if (!stepsBox) problems.push(`[${tag}] output steps missing`);
  else if (stepsBox.y < 0 || stepsBox.y + stepsBox.height > height) {
    problems.push(`[${tag}] output steps not fully above the fold: top=${stepsBox.y.toFixed(1)} bottom=${(stepsBox.y + stepsBox.height).toFixed(1)} viewport=${height}`);
  }
  if (!copyBox) problems.push(`[${tag}] Copy prompt missing`);
  else if (copyBox.y < 0 || copyBox.y + copyBox.height > height) {
    problems.push(`[${tag}] Copy prompt not fully above the fold: top=${copyBox.y.toFixed(1)} bottom=${(copyBox.y + copyBox.height).toFixed(1)} viewport=${height}`);
  }
  if (stepsBox && copyBox && copyBox.y + 1 < stepsBox.y + stepsBox.height) {
    problems.push(`[${tag}] Copy prompt should sit under the steps`);
  }
  const howtoHidden = await page.locator('#watch').isHidden();
  const howtoHasSrc = await page.locator('#howto-video[src], #howto-video source[src]').count();
  if (howtoHidden) problems.push(`[${tag}] Watch how card hidden`);
  if (!howtoHasSrc) problems.push(`[${tag}] Watch how video source missing`);
  if (!(await page.locator('#howto-video track[kind="captions"]').count())) {
    problems.push(`[${tag}] Watch how captions track missing`);
  }
  if (!(await page.getByRole('heading', { name: 'What happens next' }).count())) problems.push(`[${tag}] What happens next heading missing`);
  const yOf = async (sel) => ((await page.locator(sel).boundingBox()) || {}).y;
  const orderYs = {
    steps: await yOf('#out-steps'),
    prompt: await yOf('.prompt-card'),
    watch: await yOf('#watch'),
    crew: await yOf('.crew-panel'),
    checklist: await yOf('#checklist'),
    tips: await yOf('#n-h'),
    optin: await yOf('.optin')
  };
  const order = Object.entries(orderYs);
  for (let i = 1; i < order.length; i++) {
    if (!(order[i - 1][1] < order[i][1])) {
      problems.push(`[${tag}] output order: ${order[i - 1][0]} (${order[i - 1][1]}) should be above ${order[i][0]} (${order[i][1]})`);
    }
  }
  const submit = page.getByRole('button', { name: 'Join the list' });
  if (!(await submit.isVisible())) problems.push(`[${tag}] join button missing`);
  if (await submit.isDisabled()) problems.push(`[${tag}] join button disabled before email`);
  if (!(await page.getByRole('heading', { name: 'Want occasional AI tips?' }).isVisible())) problems.push(`[${tag}] opt-in heading`);
  const crewIcons = page.locator('#out-crew-list svg.bot-icon');
  const iconCount = await crewIcons.count();
  if (iconCount < 4) problems.push(`[${tag}] output crew icons: ${iconCount}`);
  if ((await page.locator('#out-crew-list .crew-row', { hasText: 'Dr. Eggbot' }).locator('svg.bot-icon').count()) !== 1) {
    problems.push(`[${tag}] Dr. Eggbot output icon missing`);
  }
  if ((await page.locator('#out-crew-list .crew-row', { hasText: 'Content & Updates' }).locator('svg.bot-icon').count()) !== 1) {
    problems.push(`[${tag}] industry content bot output icon missing`);
  }
  if ((await page.locator('#out-crew-list .crew-row', { hasText: 'Usage Saver' }).locator('svg.bot-icon').count()) !== 1) {
    problems.push(`[${tag}] Usage Saver output icon missing`);
  }
  const unlabeled = await page.locator('#out-crew-list svg.bot-icon:not([aria-hidden="true"])').count();
  if (unlabeled) problems.push(`[${tag}] ${unlabeled} output icons missing aria-hidden`);
  if ((await page.locator('#out-crew-cluster svg.bot-icon').count()) < 1) {
    problems.push(`[${tag}] prompt header icon cluster missing`);
  }
  if (await page.locator('.bot-card svg.bot-icon').count()) {
    problems.push(`[${tag}] bot icons should not appear on Review cards`);
  }
  if (!(await page.getByText('Totally optional. Your prompt is yours either way.').isVisible())) problems.push(`[${tag}] opt-in subline`);
  const noteLink = page.locator('[data-screen="5"] .privacy-link a');
  if ((await noteLink.getAttribute('href')) !== '/privacy') {
    problems.push(`[${tag}] opt-in Privacy note href: ${await noteLink.getAttribute('href')}`);
  }
  if (await page.locator('#su-consent').isChecked()) problems.push(`[${tag}] marketing box pre-checked`);
  if (await page.locator('#su-share').isChecked()) problems.push(`[${tag}] share box pre-checked`);

  await submit.click(); // empty email should error; not part of the happy-path count
  const emptyErr = await page.locator('#su-email-error').textContent();
  if (emptyErr !== 'Error: Enter your email address to join the list.') problems.push(`[${tag}] empty email error: ${emptyErr}`);
  if (await page.evaluate(() => document.querySelector('[data-screen="5"]').hidden || !(function(el){ return el && (el.tagName === 'TEXTAREA' ? el.value : el.textContent); })(document.querySelector('#prompt-out')))) {
    problems.push(`[${tag}] prompt hidden after empty join attempt`);
  }
  await shot('5-optin-error', false);

  await page.waitForFunction(() => (document.querySelector('[name="cf-turnstile-response"]') || {}).value, null, { timeout: 20000 })
    .catch(() => problems.push(`[${tag}] turnstile token not ready`));

  // Server unreachable: retry message, prompt stays (mobile run only)
  if (tag === 'mobile') {
    await page.route('**/api/subscribe', (r) => r.abort());
    await page.locator('#su-email').fill('offline@example.com');
    await submit.click();
    await page.waitForFunction(() => /couldn't reach the server/.test(document.querySelector('#su-status').textContent), null, { timeout: 10000 })
      .catch(() => problems.push('[mobile] no retry message when offline'));
    if (await page.evaluate(() => document.querySelector('[data-screen="5"]').hidden || !(function(el){ return el && (el.tagName === 'TEXTAREA' ? el.value : el.textContent); })(document.querySelector('#prompt-out')))) {
      problems.push('[mobile] prompt hidden while server unreachable');
    }
    await shot('5-optin-offline', false);
    await page.unroute('**/api/subscribe');
    await page.waitForFunction(() => (document.querySelector('[name="cf-turnstile-response"]') || {}).value, null, { timeout: 20000 }).catch(() => {});
  }

  await page.locator('#su-email').fill(`e2e-${tag}@example.com`);   // typing, not a click
  await submit.click(); // not part of the happy-path click count (opt-in is optional)
  await page.waitForFunction(() => !document.querySelector('#optin-success').hidden, null, { timeout: 20000 })
    .catch(async () => problems.push(`[${tag}] opt-in success not shown: ` + await page.locator('#su-status').textContent()));
  const thanks = await page.locator('#optin-success').textContent();
  if (!/Thanks, you're on the list\./.test(thanks)) problems.push(`[${tag}] success copy: ${thanks}`);
  await shot('5-optin-success', false);

  // Step 5: output (Copy prompt is the only required primary action)
  await click(page.getByRole('button', { name: 'Copy prompt' }));
  await page.waitForFunction(() => /copied/i.test(document.querySelector('#copy-status').textContent));
  const happyClicks = clicks;
  const prompt = (await page.locator('#prompt-out').textContent()) || '';
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  if (clip !== prompt) problems.push(`[${tag}] clipboard mismatch`);
  if (!prompt.startsWith('Set up my Grok Bot team. Ask before anything that sends messages or spends money.')) problems.push(`[${tag}] prompt start`);
  if (/password|api key|token/i.test(prompt)) problems.push(`[${tag}] forbidden word in prompt`);
  if (/grokbot:\/\//i.test(prompt)) problems.push(`[${tag}] grokbot link in prompt`);
  if (!/Bot templates: look up these in Bot templates and offer me the import link for each:/.test(prompt)) problems.push(`[${tag}] missing templates prompt line`);
  if (!/Dr\. Eggbot \(listed as "dr eggbot"/.test(prompt)) problems.push(`[${tag}] missing Eggbot catalog name`);
  if (!/Keep my new bots to \d+ in total \(templates plus custom bots\), not counting this bot\./.test(prompt)) problems.push(`[${tag}] missing templates cap sentence`);
  if (!/Skip any template whose job one of my custom bots already covers\./.test(prompt)) problems.push(`[${tag}] missing overlap skip sentence`);
  if (!/Content & Updates/.test(prompt)) problems.push(`[${tag}] missing industry content bot in prompt`);
  if (!/Based in Tulsa/.test(prompt)) problems.push(`[${tag}] location missing from prompt`);
  if (/Recruiting Coordinator|Hiring Screener|Sales Outbound/.test(prompt)) problems.push(`[${tag}] prompt includes hiring or sales template`);
  if (!/Usage Saver: Once a week, check my plan usage/.test(prompt)) problems.push(`[${tag}] missing Usage Saver in prompt`);
  if (!/Keep every routine lean: no more often than needed, short outputs\./.test(prompt)) problems.push(`[${tag}] missing lean-routines line`);
  if (!/Routine: Fridays at 4:00 PM my local time: weekly usage check\./.test(prompt)) problems.push(`[${tag}] missing Usage Saver routine`);
  if (!/^\w+ \d{1,2}, \d{4}$/.test((await page.locator('#prepared-date').textContent()).replace(/^on /, ''))) problems.push(`[${tag}] date format`);
  await shot('5-output');
  await page.locator('#prompt-out').screenshot({ path: `${SHOTS}${tag}-5-prompt-box.png` });

  // Download
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .txt' }).click()]);
  if (!/^crewstart-setup-prompt-\d{4}-\d\d-\d\d\.txt$/.test(dl.suggestedFilename())) problems.push(`[${tag}] download name ${dl.suggestedFilename()}`);

  // Back to review, rename a custom bot, remove a template (frees a slot), rebuild
  await page.getByRole('button', { name: 'Return to Review' }).click();
  await page.locator('#bot-name-inbox').fill('Pip');
  const beforeTpl = await page.locator('.tpl-row').count();
  const removedTpl = (await page.locator('.tpl-row h3').last().evaluate((n) => (n.childNodes[0] || n).textContent.trim()));
  await page.locator('[data-remove-template]').last().click();
  const afterTpl = await page.locator('.tpl-row').count();
  if (!(afterTpl === beforeTpl - 1)) problems.push(`[${tag}] template not removed (${beforeTpl} -> ${afterTpl})`);
  const addSlotHidden = await page.locator('#add-slot').isHidden();
  const hasOverflowAdd = await page.locator('#add-slot [data-add-bot]').count();
  if (hasOverflowAdd && addSlotHidden) problems.push(`[${tag}] add slot not shown after freeing a cap slot`);
  if (!(await page.locator('#usage-saver').isChecked())) problems.push(`[${tag}] Usage Saver lost after template remove`);
  await page.getByRole('button', { name: 'Build my prompt' }).click();
  const p2 = (await page.locator('#prompt-out').textContent()) || '';
  if (!/\n1\. Pip: /.test(p2)) problems.push(`[${tag}] rename not reflected`);
  if (removedTpl && p2.includes(removedTpl)) problems.push(`[${tag}] removed template still in prompt: ${removedTpl}`);
  if (!/Usage Saver: Once a week, check my plan usage/.test(p2)) problems.push(`[${tag}] Usage Saver dropped after rebuild`);

  // Share link: selections only, no email; opening it starts at landing (prompt not pre-shown)
  await page.getByRole('button', { name: 'Copy share link' }).click();
  const shareUrl = await page.evaluate(() => navigator.clipboard.readText());
  if (/@|e2e-|Tulsa/.test(decodeURIComponent(shareUrl))) problems.push(`[${tag}] share link leaks email or location`);
  if (!/[?&#]u=1(?:&|$)/.test(shareUrl) && !/(?:^|[?#&])u=1(?:&|$)/.test(shareUrl.split('#')[1] || '')) {
    problems.push(`[${tag}] share link missing Usage Saver flag`);
  }
  const p3 = await ctx.newPage();
  await p3.goto(shareUrl);
  const fresh = async () => p3.evaluate(() => { var el = document.querySelector('#prompt-out'); var text = el ? (el.tagName === 'TEXTAREA' ? el.value : el.textContent) : ''; return document.querySelector('[data-screen="5"]').hidden && !text; });
  if (!(await fresh())) problems.push(`[${tag}] share link shows prompt`);
  await p3.getByRole('button', { name: 'Start' }).click();
  for (let i = 0; i < 6; i++) await p3.locator('[data-action="next"]').click();   // 1a,1b,1c,2,3 -> 4 -> output
  if (await p3.evaluate(() => document.querySelector('[data-screen="5"]').hidden)) problems.push(`[${tag}] share walkthrough did not reach output`);
  const sharePrompt = (await p3.locator('#prompt-out').textContent()) || '';
  if (!sharePrompt) problems.push(`[${tag}] share walkthrough has no prompt`);
  if (/@|e2e-/.test(sharePrompt)) problems.push(`[${tag}] prompt contains email`);
  if (!/Usage Saver: Once a week, check my plan usage/.test(sharePrompt)) problems.push(`[${tag}] share walkthrough missing Usage Saver`);
  await p3.close();

  // Keyboard: Tab from the top reaches skip link first
  await page.goto(BASE);
  await page.keyboard.press('Tab');
  const firstFocus = await page.evaluate(() => document.activeElement.className);
  if (!/skip-link/.test(firstFocus)) problems.push(`[${tag}] first tab stop: ${firstFocus}`);

  // Horizontal overflow check
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) problems.push(`[${tag}] horizontal overflow`);

  const baseHost = new URL(BASE).hostname;
  const unexpected = [...new Set(external.map((s) => s.split('/')[0]))].filter((h) => {
    if (h === baseHost || ALLOWED_EXTERNAL_HOSTS.has(h)) return false;
    if (h === 'challenges.cloudflare.com' || h.endsWith('.challenges.cloudflare.com')) return false;
    return true;
  });
  if (unexpected.length) problems.push(`[${tag}] unexpected external host: ${unexpected.join(', ')}`);

  await browser.close();
  return { happyClicks, botCount, externalAll: [...new Set(external)] };
}

{
  const origin = new URL(BASE).origin;
  try {
    const r = await fetch(origin + '/api/smart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        email: 'e2e-notoken@example.com',
        profession: 'Realtor',
        location: 'Oklahoma City',
        turnstile_token: ''
      })
    });
    if (r.status !== 403) problems.push(`smart no-token status ${r.status}`);
    const j = await r.json().catch(() => null);
    if (!j || j.ok !== false || j.fallback === true) {
      problems.push(`smart no-token body unexpected: ${JSON.stringify(j)}`);
    }
  } catch (e) {
    problems.push(`smart no-token request failed: ${e.message}`);
  }
}

const desktop = await run(1280, 900, 'desktop');
const mobile = await run(390, 844, 'mobile');
console.log(JSON.stringify({ desktop, mobile, problems }, null, 2));
process.exit(problems.length ? 1 : 0);
