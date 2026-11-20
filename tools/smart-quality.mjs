// Real OpenAI quality check for Smart AI suggestions. Uses OPENAI_API_KEY from the
// environment only. Never prints the key. At most four calls: one each for a
// realtor in Oklahoma City and a restaurant owner in Tulsa, plus one retry each
// if the first result misses the quality bar.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildSmartPayload, buildSmartMessages, validateSmartOutput, SMART_MODEL, SMART_MAX_TOKENS, SMART_TIMEOUT_MS } from '../src/handlers.js';

const require = createRequire(import.meta.url);
const L = require('../public/logic.js');

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error('OPENAI_API_KEY is not set');
  process.exit(1);
}

const cases = [
  {
    id: 'realtor-okc',
    answers: {
      role: 'Realtor',
      industry: 'Residential real estate',
      location: 'Oklahoma City',
      tasks: ['email', 'scheduling', 'customers', 'research', 'writing', 'meetings'],
      tools: ['gmail', 'gcal', 'crm'],
      goals: ['finances'],
      briefingTime: '08:00',
      digestDay: 'Monday',
      extraAskFirst: ['delete']
    }
  },
  {
    id: 'restaurant-tulsa',
    answers: {
      role: 'Restaurant owner',
      industry: 'Restaurant',
      location: 'Tulsa',
      tasks: ['email', 'scheduling', 'customers', 'writing', 'research'],
      tools: ['gmail', 'gcal'],
      goals: ['meals', 'finances'],
      briefingTime: '08:00',
      digestDay: 'Monday',
      extraAskFirst: ['delete']
    }
  }
];

function labels(list, ids) {
  return ids.map((id) => {
    const row = list.find((x) => x.id === id);
    return row ? row.label : id;
  });
}

const TAKEN_SLOTS = /7:30\s*AM|8:00\s*AM|8:30\s*AM|Thursdays?\s+at\s+9:00\s*AM/i;
const GENERIC_JOB = /\b(sort and reply to emails?|inbox & calendar|meeting prep|meeting brief|personal concierge|remind me about bills|research scout|watch competitors and leads I care about)\b/i;
const XBOT = /Bot$|[A-Z][a-z]+[A-Z][a-z]+Bot/;

function qualityIssues(validated) {
  const issues = [];
  if (!validated || !validated.bots || validated.bots.length < 2) return ['did not validate'];
  for (const b of validated.bots) {
    if (XBOT.test(b.name)) issues.push('machine name: ' + b.name);
    if ((b.job || '').length < 40) issues.push('short job: ' + b.name);
    if (!/approv/i.test(b.job)) issues.push('no approval rule: ' + b.name);
    if (TAKEN_SLOTS.test(b.routine || '')) issues.push('clashing routine: ' + b.name + ' ' + b.routine);
    if (GENERIC_JOB.test((b.name || '') + ' ' + (b.job || ''))) issues.push('generic overlap: ' + b.name);
  }
  for (const t of validated.templates || []) {
    if (/a smart suggestion that fits this profession/i.test(t.reason || '')) issues.push('generic template reason: ' + t.name);
  }
  return issues;
}

async function callOpenAI(payload) {
  const messages = buildSmartMessages(payload);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SMART_TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: SMART_MODEL,
        response_format: { type: 'json_object' },
        max_tokens: SMART_MAX_TOKENS,
        messages
      }),
      signal: ac.signal
    });
  } finally {
    clearTimeout(timer);
  }
  const rawText = await res.text();
  let json;
  try { json = JSON.parse(rawText); } catch { json = null; }
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  return { status: res.status, content: content || '', error: res.ok ? '' : (json && json.error && json.error.message) || ('HTTP ' + res.status) };
}

function buildBody(answers) {
  const n = L.normalize(answers);
  const ruleBots = L.recommend(answers);
  const ruleTpls = L.suggestTemplates(answers);
  return {
    profession: n.role,
    industry: n.industry,
    location: n.location,
    tasks: labels(L.TASKS, n.tasks),
    tools: labels(L.TOOLS, n.tools),
    goals: labels(L.GOALS, n.goals),
    covered: ruleBots.map((b) => ({ name: b.name, job: b.job }))
      .concat(ruleTpls.map((t) => ({ name: t.name, job: t.reason || t.name })))
  };
}

const out = [];
let calls = 0;
for (const c of cases) {
  const body = buildBody(c.answers);
  const payload = buildSmartPayload(body);
  const ruleBots = L.recommend(c.answers);
  const ruleTpls = L.suggestTemplates(c.answers);
  let best = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    calls += 1;
    const call = await callOpenAI(payload);
    let parsed = null;
    if (call.content) {
      try { parsed = JSON.parse(call.content); } catch { parsed = call.content; }
    }
    const validated = call.content ? validateSmartOutput(call.content) : null;
    const issues = qualityIssues(validated);
    const row = { attempt, httpStatus: call.status, error: call.error, raw: parsed, validated, issues };
    console.log('--- ' + c.id + ' attempt ' + attempt + ' ---');
    console.log('http:', call.status, call.error || 'ok');
    console.log('issues:', issues.length ? issues.join('; ') : 'none');
    console.log('raw:', JSON.stringify(parsed, null, 2));
    if (!best || (issues.length < best.issues.length && row.httpStatus === 200 && validated)) best = row;
    if (row.httpStatus === 200 && validated && issues.length === 0) {
      best = row;
      break;
    }
  }
  const validated = best && best.validated;
  let prompt = '';
  let merged = null;
  if (validated) {
    merged = L.mergeSmartCrew(ruleBots, ruleTpls, validated.bots, validated.templates, false);
    prompt = L.buildPrompt(c.answers, merged.bots, merged.templates);
  }
  out.push({
    id: c.id,
    payload,
    httpStatus: best && best.httpStatus,
    error: best && best.error,
    issues: (best && best.issues) || [],
    raw: best && best.raw,
    validated,
    merged,
    prompt
  });
}

writeFileSync('/tmp/crewstart-smart-quality.json', JSON.stringify(out, null, 2));
for (const row of out) {
  if (!row.prompt) continue;
  writeFileSync('/tmp/crewstart-smart-quality-' + row.id + '-prompt.txt', row.prompt);
  console.log('\n--- setup prompt for ' + row.id + ' written ---');
}
console.log('calls used:', calls);
const failed = out.filter((r) => r.httpStatus !== 200 || !r.validated);
process.exit(failed.length ? 1 : 0);
