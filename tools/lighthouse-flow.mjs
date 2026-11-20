// Lighthouse accessibility for EVERY screen (snapshot mode) + axe-core, at desktop and mobile.
import puppeteer from 'puppeteer-core';
import { startFlow } from 'lighthouse';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8787/';
const axeSrc = readFileSync(new URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const out = {};

for (const [tag, formFactor, width, height] of [['desktop', 'desktop', 1280, 900], ['mobile', 'mobile', 390, 844]]) {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--headless=new'] });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: formFactor === 'mobile' ? 2 : 1, isMobile: formFactor === 'mobile' });
  const config = { extends: 'lighthouse:default', settings: { onlyCategories: ['accessibility'], formFactor, screenEmulation: { disabled: true } } };
  const flow = await startFlow(page, { config });
  await flow.navigate(BASE, { name: 'landing (navigation)' });
  const axe = {};
  const runAxe = async (name) => {
    await page.evaluate(axeSrc);
    const r = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v) => `${v.id} (${v.nodes.length})`));
    axe[name] = r;
  };
  const clickText = async (text) => {
    await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim() === t).click(), text);
    await new Promise((r) => setTimeout(r, 150));
  };
  const check = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
  await runAxe('landing');
  await clickText('Start');
  await page.type('#role', 'Owner'); await page.type('#industry', 'Home bakery');
  await flow.snapshot({ name: '1a about' }); await runAxe('1a');
  await clickText('Next');
  for (const id of ['email', 'scheduling', 'customers']) await check('#tasks-' + id);
  await flow.snapshot({ name: '1b tasks' }); await runAxe('1b');
  await clickText('Next');
  for (const id of ['gmail', 'gcal', 'crm']) await check('#tools-' + id);
  await flow.snapshot({ name: '1c tools' }); await runAxe('1c');
  await clickText('Next'); await check('#goals-meals');
  await flow.snapshot({ name: '2 personal' }); await runAxe('2');
  await clickText('Next');
  await flow.snapshot({ name: '3 preferences' }); await runAxe('3');
  await clickText('See my team');
  await flow.snapshot({ name: '4 review' }); await runAxe('4');
  await clickText('Build my prompt');
  await page.waitForFunction(() => !document.querySelector('[data-screen="5"]').hidden, { timeout: 20000 });
  await page.waitForFunction(() => (document.querySelector('[name="cf-turnstile-response"]') || {}).value, { timeout: 20000 }).catch(() => {});
  await flow.snapshot({ name: '5 output' }); await runAxe('5');
  await flow.navigate(new URL('privacy', BASE).href, { name: 'privacy (navigation)' });
  await runAxe('privacy');

  const result = JSON.parse(await flow.createFlowResult().then((r) => JSON.stringify(r)));
  out[tag] = {
    lighthouse: result.steps.map((s) => ({ step: s.name, a11y: Math.round(s.lhr.categories.accessibility.score * 100),
      failing: Object.values(s.lhr.audits).filter((a) => a.score === 0 && a.scoreDisplayMode === 'binary').map((a) => a.id) })),
    axe
  };
  writeFileSync(new URL(`../shots/lighthouse-flow-${tag}.html`, import.meta.url), await flow.generateReport());
  await browser.close();
}
console.log(JSON.stringify(out, null, 2));
