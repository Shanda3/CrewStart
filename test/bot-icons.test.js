'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../public/bot-icons.js'), 'utf8');
const ctx = { self: {} };
ctx.self = ctx;
vm.runInNewContext(src, ctx);
const { iconKey, iconMarkup } = ctx.BotIcons;

test('known custom bots map by id even if renamed', () => {
  assert.equal(iconKey({ id: 'inbox', name: 'Pat', kind: 'custom' }), 'inbox');
  assert.equal(iconKey({ id: 'meetings', name: 'Notes pal', kind: 'custom' }), 'calendar');
  assert.equal(iconKey({ id: 'tracker', name: 'Board', kind: 'custom' }), 'projects-reports');
  assert.equal(iconKey({ id: 'research', name: 'Scout', kind: 'custom' }), 'research');
  assert.equal(iconKey({ id: 'writing', name: 'Editor', kind: 'custom' }), 'writing-social');
  assert.equal(iconKey({ id: 'writing', name: 'Bakery and Catering Content & Updates', kind: 'custom' }), 'writing-social');
  assert.equal(iconKey({ id: 'coach', name: 'Learning Coach', kind: 'custom' }), 'generic');
});

test('Personal Concierge uses travel.svg only when the job includes trips', () => {
  assert.equal(iconKey({ id: 'concierge', name: 'Personal Concierge', job: 'Plan meals and grocery lists and remind me about bills.', kind: 'custom' }), 'generic');
  assert.equal(iconKey({ id: 'concierge', name: 'Personal Concierge', job: 'Plan meals and help with trips.', kind: 'custom' }), 'travel');
});

test('templates follow the brand mapping; unmatched templates use template.svg', () => {
  assert.equal(iconKey({ id: 'eggbot', name: 'Dr. Eggbot', kind: 'eggbot' }), 'dr-eggbot');
  assert.equal(iconKey({ id: 'invoice-coordinator', name: 'Invoice Coordinator', kind: 'template' }), 'finance');
  assert.equal(iconKey({ id: 'sales-outbound', name: 'Sales Outbound', kind: 'template' }), 'sales-crm');
  assert.equal(iconKey({ id: 'recruiting-coordinator', name: 'Recruiting Coordinator', kind: 'template' }), 'hiring');
  assert.equal(iconKey({ id: 'ticket-triage-specialist', name: 'Ticket Triage Specialist', kind: 'template' }), 'support');
  assert.equal(iconKey({ id: 'researchy', name: 'Researchy', kind: 'template' }), 'research');
  assert.equal(iconKey({ id: 'presentation-designer', name: 'Presentation Designer', kind: 'template' }), 'writing-social');
  assert.equal(iconKey({ id: 'personal-site-builder', name: 'Personal Site Builder', kind: 'template' }), 'generic');
  assert.equal(iconKey({ id: 'travel-coordinator', name: 'Travel Coordinator', kind: 'template' }), 'travel');
  assert.equal(iconKey({ id: 'chief-of-staff', name: 'Chief of Staff', kind: 'template' }), 'template');
  assert.equal(iconKey({ id: 'gift-concierge', name: 'Gift Concierge', kind: 'template' }), 'template');
  assert.equal(iconKey({ id: 'contract-desk', name: 'Contract Desk', kind: 'template' }), 'template');
});

test('Usage Saver and unknown custom bots have the documented fallbacks', () => {
  assert.equal(iconKey({ kind: 'addon', name: 'Usage Saver' }), 'usage-saver');
  assert.equal(iconKey({ id: 'custom-xyz', name: 'Mystery Helper', job: 'Does something unique.', kind: 'custom' }), 'generic');
});

test('icon markup is decorative, stamped, and 32 px', () => {
  const html = iconMarkup('inbox', 'c0', 32);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /width="32"/);
  assert.match(html, /id="g-bot-inbox-c0"/);
  assert.match(html, /url\(#g-bot-inbox-c0\)/);
  assert.doesNotMatch(html, /id="g-bot-inbox"/);
  assert.match(html, /class="body"/);
  assert.match(html, /class="pupil"/);
});
