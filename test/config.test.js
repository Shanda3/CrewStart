'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require('path').join(__dirname, '../public/config.js'), 'utf8');

function load(hostname) {
  const ctx = { location: { hostname }, self: {} };
  ctx.self = ctx;
  vm.runInNewContext(src, ctx);
  return ctx.APP_CONFIG;
}

const TEST = '1x00000000000000000000AA';
const PROD = '0x4AAAAAAGKlQIcVkmPM3-Z2';

test('production hostnames use the real Turnstile site key', () => {
  assert.equal(load('crewstart.ai').turnstileSiteKey, PROD);
  assert.equal(load('www.crewstart.ai').turnstileSiteKey, PROD);
  assert.equal(load('Crewstart.ai').turnstileSiteKey, PROD);
});

test('localhost, 127.0.0.1, and anything else keep the test site key', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'preview.example.com', '']) {
    assert.equal(load(host).turnstileSiteKey, TEST, host);
  }
  const cfg = load('127.0.0.1');
  assert.equal(cfg.turnstileSiteKeyFor('crewstart.ai'), PROD);
  assert.equal(cfg.turnstileSiteKeyFor('localhost'), TEST);
});

test('SOCIAL lists LinkedIn, X, and the official Grok Bot signup URL', () => {
  const cfg = load('crewstart.ai');
  assert.equal(cfg.SOCIAL.linkedin, 'https://www.linkedin.com/in/shanda-biggs');
  assert.equal(cfg.SOCIAL.x, 'https://x.com/BiggsShanda');
  assert.equal(cfg.SOCIAL.grokSignup, 'https://x.ai/bot');
});
