/*
 * Crewstart Worker logic (imported by src/worker.js; separate so tests can import named exports).
 * Crewstart Worker. Static assets are served by Workers static assets; this script
 * only runs first for /api/* and /admin/* (see wrangler.jsonc run_worker_first).
 *
 *   POST /api/subscribe     required email (gates the prompt in the UI) + optional marketing consent
 *                           -> D1 `subscribers`. Returns only {ok}.
 *   POST /api/smart         optional Smart AI suggestions. Requires email + Turnstile.
 *                           Email is used as a salted hash for daily caps unless the visitor
 *                           opts into the list. Answers (not the email) go to OpenAI.
 *                           On cap or model failure, returns {ok:false, fallback:true, message}.
 *
 * No endpoint returns emails. /admin/* is a disabled stub (404) until Shanda picks how to read sign-ups
 * (for now: `wrangler d1 execute crewstart-db --remote` from her own machine). This Worker sends no email.
 * Secrets / vars (never in code):
 *   TURNSTILE_SECRET_KEY  (Workers secret; .dev.vars locally with Cloudflare's test secret)
 *   RATE_LIMIT_SALT       salts the IP hash and the smart-suggestion email hash
 *   OPENAI_API_KEY        Workers secret; used only server-side for /api/smart
 */

export const CONSENT_VERSION = '2026-11-20-v1';
export const CONSENT_TEXT = "Yes, email me occasional AI tips and updates about Shanda Biggs's AI consulting. Unsubscribe anytime.";
export const SOURCE = 'crewstart';

const RATE_LIMIT_MAX = 5;          // sign-up attempts
const RATE_LIMIT_WINDOW = 600;     // per 10 minutes, per IP
const MAX_BODY_BYTES = 4096;
const SMART_BODY_BYTES = 8192;
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function reply(ok, status) {
  return new Response(JSON.stringify({ ok }), { status, headers: JSON_HEADERS });
}

function cleanField(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------- Rate limit (D1, fixed window, hashed IP) ---------------- */
export async function rateLimited(env, ip, now = Date.now()) {
  const nowSec = Math.floor(now / 1000);
  const windowStart = nowSec - (nowSec % RATE_LIMIT_WINDOW);
  const key = await sha256Hex((env.RATE_LIMIT_SALT || '') + '|' + (ip || 'unknown'));
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < ?2 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < ?2 THEN ?2 ELSE rate_limits.window_start END
     RETURNING count`
  ).bind(key, windowStart).first();
  // Opportunistic cleanup of stale windows (cheap, bounded by index on PK scan).
  if (Math.random() < 0.05) {
    await env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?1').bind(windowStart - RATE_LIMIT_WINDOW).run();
  }
  return !row || row.count > RATE_LIMIT_MAX;
}

/* ---------------- Turnstile ---------------- */
export async function verifyTurnstile(env, token, ip, fetchImpl = fetch) {
  if (!env.TURNSTILE_SECRET_KEY) return false;                 // fail closed if not configured
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body: form });
    if (!res.ok) return false;
    const data = await res.json();
    return data && data.success === true;
  } catch {
    return false;
  }
}

/* ---------------- POST /api/subscribe ---------------- */
export async function handleSubscribe(request, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now || Date.now();
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false }), { status: 405, headers: { ...JSON_HEADERS, Allow: 'POST' } });

  // Same-origin only (blocks cross-site form posts).
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return reply(false, 403);
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return reply(false, 415);
  if (!env.DB) return reply(false, 500);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  // Increment first so missing or failed Turnstile tokens still count toward the limit.
  if (await rateLimited(env, ip, now)) return reply(false, 429);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return reply(false, 413);
    body = JSON.parse(raw);
  } catch {
    return reply(false, 400);
  }
  if (!body || typeof body !== 'object') return reply(false, 400);

  const email = cleanField(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return reply(false, 400);
  // Marketing consent is optional but must be an explicit boolean; when given, the version must match.
  if (body.marketing_consent !== undefined && typeof body.marketing_consent !== 'boolean') return reply(false, 400);
  const marketing = body.marketing_consent === true;
  if (marketing && body.consent_version !== CONSENT_VERSION) return reply(false, 400);

  const firstName = cleanField(body.first_name, 60) || null;
  const share = body.share_profile === true;
  const role = share ? cleanField(body.role, 60) || null : null;
  const industry = share ? cleanField(body.industry, 60) || null : null;

  if (!(await verifyTurnstile(env, body.turnstile_token, ip, fetchImpl))) return reply(false, 403);

  // Idempotent: a repeat submission with the same email returns ok and keeps the original row.
  // The only change a repeat can make is opting IN to marketing (never silently opting out;
  // unsubscribes go through the unsubscribe link / deletion request).
  const iso = new Date(now).toISOString();
  await env.DB.prepare(
    `INSERT INTO subscribers (email, first_name, role, industry, marketing_consent, consent_text, consent_version, source, created_at, consent_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT(email) DO UPDATE SET
       marketing_consent = 1, consent_text = excluded.consent_text,
       consent_version = excluded.consent_version, consent_at = excluded.consent_at
     WHERE excluded.marketing_consent = 1 AND subscribers.marketing_consent = 0`
  ).bind(email, firstName, role, industry, marketing ? 1 : 0,
    marketing ? CONSENT_TEXT : null, marketing ? CONSENT_VERSION : null, SOURCE, iso, marketing ? iso : null).run();

  if (Math.random() < 0.05) await cleanupSmartCounts(env, now).catch(() => {});

  return reply(true, 200);
}

export const SMART_EMAIL_MAX = 3;       // runs per email per UTC day
export const SMART_GLOBAL_MAX = 200;    // runs per UTC day, all visitors
export const SMART_TIMEOUT_MS = 20000;
export const SMART_MODEL = 'gpt-4o-mini';
export const SMART_MAX_TOKENS = 1400;
export const SMART_FALLBACK = 'We couldn\'t generate smart suggestions right now, so we\'re showing your regular team.';
export const SMART_EMAIL_CAP_MSG = 'You\'ve used today\'s smart suggestions (3 per day). Your regular team is still ready.';
export const SMART_GLOBAL_CAP_MSG = 'Smart suggestions are at today\'s limit. Your regular team is still ready.';
export const SMART_IP_CAP_MSG = 'Too many tries from this network just now. Your regular team is still ready. Please try again in a few minutes.';

// Keep in sync with public/templates.js (verified catalog, November 20, 2026).
export const KNOWN_TEMPLATES = [
  { id: 'eggbot', name: 'Dr. Eggbot', catalogName: 'dr eggbot', reason: 'For adding more bots later, after this team is set up.' },
  { id: 'inbox-manager', name: 'Inbox Manager', catalogName: 'Inbox Manager', reason: 'It sorts your inbox and drafts replies for you to approve.' },
  { id: 'calendar-coordinator', name: 'Calendar Coordinator', catalogName: 'Calendar Coordinator', reason: 'It keeps your calendar organized and helps you find a time to meet.' },
  { id: 'chief-of-staff', name: 'Chief of Staff', catalogName: 'Chief of Staff', reason: 'It sends a short readout of what matters today across your tools.' },
  { id: 'executive-assistant', name: 'Executive Assistant', catalogName: 'Executive Assistant', reason: 'It helps with email, scheduling, and the day\'s details, and asks before acting.' },
  { id: 'daily-briefing-writer', name: 'Daily Briefing Writer', catalogName: 'Daily Briefing Writer', reason: 'It writes a short morning brief of what you need to know today.' },
  { id: 'meeting-prep-buddy', name: 'Meeting Prep Buddy', catalogName: 'Meeting Prep Buddy', reason: 'It builds a short brief before meetings and captures notes afterward.' },
  { id: 'sales-outbound', name: 'Sales Outbound', catalogName: 'Sales Outbound', reason: 'It helps you follow up with leads and draft outreach for you to approve.' },
  { id: 'social-media-manager', name: 'Social Media Manager', catalogName: 'Social Media Manager', reason: 'It drafts posts in your voice and waits for your approval before anything goes out.' },
  { id: 'newsletter-writer', name: 'Newsletter Writer', catalogName: 'Newsletter Writer', reason: 'It drafts newsletter copy in your voice for you to review and send.' },
  { id: 'expense-manager', name: 'Expense Manager', catalogName: 'Expense Manager', reason: 'It helps you track spending and bills, and never pays anything without your OK.' },
  { id: 'invoice-coordinator', name: 'Invoice Coordinator', catalogName: 'Invoice Coordinator', reason: 'It helps you track invoices and follow up on unpaid bills, with your approval.' },
  { id: 'hiring-screener', name: 'Hiring Screener', catalogName: 'Hiring Screener', reason: 'It helps you review applicants and draft screening notes for your review.' },
  { id: 'recruiting-coordinator', name: 'Recruiting Coordinator', catalogName: 'Recruiting Coordinator', reason: 'It helps you schedule interviews and keep candidates moving, with your approval.' },
  { id: 'travel-coordinator', name: 'Travel Coordinator', catalogName: 'Travel Coordinator', reason: 'It researches trips and itineraries and never books without your approval.' },
  { id: 'subscription-cleaner', name: 'Subscription Cleaner', catalogName: 'Subscription Cleaner', reason: 'It helps you find unused subscriptions so you can decide what to cancel.' },
  { id: 'gift-concierge', name: 'Gift Concierge', catalogName: 'Gift Concierge', reason: 'It helps you remember occasions and suggest gifts, and never buys without your OK.' },
  { id: 'crm-operations-manager', name: 'CRM Operations Manager', catalogName: 'CRM Operations Manager', reason: 'It helps you keep contacts and deals in order and asks before changing records.' },
  { id: 'status-report-writer', name: 'Status Report Writer', catalogName: 'Status Report Writer', reason: 'It drafts status updates from your work so you can review and send them.' },
  { id: 'personal-site-builder', name: 'Personal Site Builder', catalogName: 'Personal Site Builder', reason: 'It helps you plan and draft pages for a personal or portfolio site.' },
  { id: 'presentation-designer', name: 'Presentation Designer', catalogName: 'Presentation Designer', reason: 'It helps you outline and draft slides for meetings and reviews.' },
  { id: 'ticket-triage-specialist', name: 'Ticket Triage Specialist', catalogName: 'Ticket Triage Specialist', reason: 'It helps you sort incoming requests and suggest what to handle first.' },
  { id: 'contract-desk', name: 'Contract Desk', catalogName: 'Contract Desk', reason: 'It helps you review and organize contracts and flags items for your review.' },
  { id: 'researchy', name: 'Researchy', catalogName: 'Researchy', reason: 'It researches topics, competitors, or leads and sends a short digest with sources.' },
  { id: 'order-concierge', name: 'Order Concierge', catalogName: 'Order Concierge', reason: 'It helps you plan orders and purchases, and never buys without your approval.' }
];
export const KNOWN_TEMPLATE_NAMES = KNOWN_TEMPLATES.map((t) => t.name);

const NEED_ALIASES = {
  gmail: 'gmail', 'google mail': 'gmail',
  outlook: 'outlook',
  email: 'email', 'e-mail': 'email',
  'google calendar': 'gcal', gcal: 'gcal', calendar: 'calendar',
  slack: 'slack',
  notion: 'notion',
  github: 'github',
  linear: 'linear',
  'google drive': 'gdrive', gdrive: 'gdrive', drive: 'gdrive',
  crm: 'crm', hubspot: 'crm', salesforce: 'crm'
};

export function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export async function cleanupSmartCounts(env, now = Date.now()) {
  if (!env.DB) return;
  const cutoff = utcDay(now - 2 * 24 * 60 * 60 * 1000);
  await env.DB.prepare('DELETE FROM smart_email_counts WHERE day < ?1').bind(cutoff).run();
  await env.DB.prepare('DELETE FROM smart_global_counts WHERE day < ?1').bind(cutoff).run();
}

export function stripUnsafe(v, max) {
  if (typeof v !== 'string') return '';
  var s = v.replace(/<[^>]*>/g, ' ')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return s.slice(0, max || 200);
}

function looksSecret(s) {
  return /password|api[\s_-]?key|secret|token|bearer\s+[a-z0-9]|sk-[a-z0-9]/i.test(String(s || ''));
}

function slugId(name, i) {
  var slug = String(name || 'bot').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
  return 'smart-' + (i + 1) + (slug ? '-' + slug : '');
}

function mapNeed(raw) {
  var label = stripUnsafe(String(raw || ''), 40);
  if (!label || looksSecret(label)) return null;
  var key = label.toLowerCase();
  var id = NEED_ALIASES[key];
  if (id) {
    const labels = {
      gmail: 'Gmail', outlook: 'Outlook', email: 'Email (Gmail or Outlook)',
      gcal: 'Google Calendar', calendar: 'Calendar (Google or Outlook)',
      slack: 'Slack', notion: 'Notion', github: 'GitHub', linear: 'Linear',
      gdrive: 'Google Drive', crm: 'CRM'
    };
    return { id: id, label: labels[id] || label, required: false };
  }
  // Unknown tools stay as a cleaned label so the prompt can still mention them,
  // but connectionChecklist will skip ids that are not in CONNECTORS.
  return { id: 'other', label: label, required: false };
}

function matchTemplate(raw) {
  var want = stripUnsafe(typeof raw === 'string' ? raw : (raw && raw.name) || '', 60).toLowerCase();
  if (!want) return null;
  for (const t of KNOWN_TEMPLATES) {
    if (t.name.toLowerCase() === want) return t;
    if (t.id === 'eggbot' && (want === 'dr eggbot' || want === 'eggbot' || want === 'dr. eggbot')) return t;
  }
  return null;
}

function catalogReason(t) {
  return t && t.reason ? t.reason : 'A ready-made template that fits this work.';
}

function sanitizeReason(raw, fallback) {
  var r = stripUnsafe(String(raw || ''), 160);
  if (!r || looksSecret(r) || r.length < 20) return fallback;
  if (/a smart suggestion that fits this profession/i.test(r)) return fallback;
  return r;
}

/** Answers-only payload sent to OpenAI. Never includes email or people's names. */
export function buildSmartPayload(body) {
  const profession = [stripUnsafe(body.profession || body.role, 60), stripUnsafe(body.industry, 60)]
    .filter(Boolean).join(' · ');
  const location = stripUnsafe(body.location, 80);
  const tasks = Array.isArray(body.tasks) ? body.tasks.map((t) => stripUnsafe(String(t), 80)).filter(Boolean).slice(0, 8) : [];
  const tools = Array.isArray(body.tools) ? body.tools.map((t) => stripUnsafe(String(t), 40)).filter(Boolean).slice(0, 10) : [];
  const goals = Array.isArray(body.goals) ? body.goals.map((t) => stripUnsafe(String(t), 40)).filter(Boolean).slice(0, 8) : [];
  const coveredIn = Array.isArray(body.covered) ? body.covered : [];
  const covered = coveredIn.map((c) => {
    if (typeof c === 'string') return stripUnsafe(c, 200);
    if (!c || typeof c !== 'object') return '';
    return stripUnsafe([c.name, c.job].filter(Boolean).join(': '), 200);
  }).filter((c) => c && !looksSecret(c) && !/@/.test(c)).slice(0, 12);
  return { profession, location, tasks, tools, goals, covered };
}

export function buildSmartMessages(payload) {
  const catalog = KNOWN_TEMPLATE_NAMES.join(', ');
  const system = [
    'You suggest Grok Bot team members for Crewstart, an unofficial community setup tool.',
    'Reply with JSON only, no markdown, shaped as {"bots":[{"name":"","job":"","routine":"","needs":[""]}],"templates":[{"name":"","reason":""}]}.',
    'Give 2 to 4 custom bots for jobs the rule-based team does NOT already cover. The "covered" list is already on the team. Do not add email, inbox, calendar, generic competitor-or-leads research, meeting prep, or bills/personal-concierge bots.',
    'Name concrete, profession- and location-specific jobs. Each name should be a short, natural phrase a person would say, often with the city or the work in it (for example, "OKC Market Watch" or "Tulsa Events & Specials"). Never use names that end in Bot, and never use CamelCase compounds like MarketResearchBot or RealtorBot.',
    'Each job is one to three full instruction sentences: what the bot watches or does, what it sends the user, and that the user approves anything before it is sent, posted, booked, or acted on.',
    'Each routine is a realistic cadence with a day and time, such as "Tuesdays at 10:00 AM: weekly local market digest". Do not use 7:30 AM, 8:00 AM, 8:30 AM, or Thursday 9:00 AM; those slots are already taken. Stagger the times so the new bots do not share a slot with each other.',
    'needs is a list of tools the user already uses, or an empty list. No URLs, no HTML, no people\'s names, no email addresses.',
    'Do not pick Hiring Screener, Recruiting Coordinator, or Sales Outbound unless the user\'s tasks or covered work clearly include hiring or finding new business clients.',
    'Pick 1 to 3 template names from this exact verified list only: ' + catalog + '. Do not invent names. Skip any template whose job is already in "covered" or overlaps a custom bot you are adding (in particular, skip Inbox Manager, Calendar Coordinator, Meeting Prep Buddy, Researchy, and Expense Manager when those jobs are already covered). For each template, give a specific one-line reason that starts with "It" and says why it fits this person. Do not write "A smart suggestion that fits this profession."',
    'Style examples follow. They show the kind of specificity to use. Do not copy the names, jobs, or wording blindly. If the user is a realtor or restaurant owner, write fresh copy for their city and work, in this same style.',
    'Realtor style: a local market watcher for their property types and neighborhoods (new listings, price changes, days on market, mortgage rates), an open-house and listing-launch planner, and a past-client nurture or anniversary planner. Example bots (do not copy verbatim): {"name":"OKC Market Watch","job":"Watch new listings, price changes, days on market, and mortgage-rate moves in Oklahoma City for the property types and neighborhoods I work, and send me a short digest of what changed and why it matters. I approve anything before you send it to a client.","routine":"Tuesdays at 10:00 AM: weekly OKC market digest","needs":[]}, {"name":"Listing Launch Planner","job":"Plan open houses and listing launches, including a rundown, a task list, and draft guest or neighbor notes for my approval. I approve every message and every post before it goes out.","routine":"Wednesdays at 2:00 PM: open-house and launch plan","needs":["Google Calendar"]}, {"name":"Past Client Nurture","job":"Track home anniversaries and closing dates for past clients, and draft a short check-in or reminder for my approval. Never send anything without my OK.","routine":"Fridays at 11:00 AM: weekly anniversary and nurture list","needs":[]}.',
    'Restaurant style: a local events watcher (concerts, games, festivals, and conventions in their city, with suggested specials and staffing), a specials planner tied to the weather, holidays, and events, and a food social trends scout. Example bots (do not copy verbatim): {"name":"Tulsa Events & Specials","job":"Watch concerts, games, festivals, and conventions in Tulsa, and send me a short list of what is coming with suggested specials and staffing notes. I approve any special or schedule change before it is posted.","routine":"Tuesdays at 10:30 AM: week-ahead Tulsa events brief","needs":[]}, {"name":"Weather & Holiday Specials","job":"Suggest menu specials tied to the forecast, holidays, and those local events, and draft the specials board copy for my approval. Do not post or print anything until I say so.","routine":"Fridays at 2:30 PM: weekend specials plan","needs":[]}, {"name":"Food Trends Scout","job":"Watch trending dishes, drinks, and food videos on social media that fit our kind of restaurant, and send me a short list of ideas I could try, with a note on why they would work here. I approve anything before we test or post it.","routine":"Wednesdays at 3:00 PM: weekly food trends roundup","needs":[]}.',
    'If the profession is a realtor or real estate agent, you must include these three kinds of jobs, written fresh for their city and property types, not copied from the examples: (1) a local market watcher that covers new listings, price changes, days on market, and mortgage rates for their property types and neighborhoods; (2) an open-house and listing-launch planner; (3) a past-client nurture or anniversary planner. A fourth bot is optional only if it is equally specific and not already covered.',
    'If the profession is a restaurant owner, chef, or similar, you must include these three kinds of jobs, written fresh for their city, not copied from the examples: (1) a local events watcher for concerts, games, festivals, and conventions in their city, with suggested specials and staffing; (2) a specials planner tied to the weather, holidays, and those events; (3) a scout for trending food, dishes, and drinks on social media. A fourth bot is optional only if it is equally specific and not already covered.',
    'For any other profession: invent 2 to 4 bots that are specific to that work and location the way the examples are specific to a realtor and a restaurant. Cover work the rule-based team does not: local conditions, customer or community rhythms, and the planning or outreach unique to that job. Do not copy the example names or jobs.'
  ].join(' ');
  const user = JSON.stringify({
    profession: payload.profession || 'not specified',
    location: payload.location || 'not specified',
    tasks: payload.tasks,
    tools: payload.tools,
    goals: payload.goals,
    covered: payload.covered || []
  });
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

/**
 * Sanitize a model JSON object into { bots, templates } or null if unusable.
 * Requires at least 2 custom bots after cleanup; caller may add templates to reach 3 total.
 */
export function gateSmartTemplates(templates, payload) {
  const blob = [
    payload && payload.profession,
    ...((payload && payload.tasks) || []),
    ...((payload && payload.goals) || []),
    ...((payload && payload.covered) || [])
  ].join(' ').toLowerCase();
  const hiring = /\b(hire|hiring|interview|recruit|talent)\b/.test(blob);
  const sales = /\b(sales|new business|outbound|business clients|account executive)\b/.test(blob);
  return (templates || []).filter((t) => {
    if ((t.id === 'hiring-screener' || t.id === 'recruiting-coordinator') && !hiring) return false;
    if (t.id === 'sales-outbound' && !sales) return false;
    return true;
  });
}

export function validateSmartOutput(raw, payload) {

  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  const incoming = Array.isArray(data.bots) ? data.bots : [];
  const bots = [];
  const seen = new Set();
  for (let i = 0; i < incoming.length && bots.length < 4; i++) {
    const src = incoming[i] || {};
    const name = stripUnsafe(src.name, 48);
    const job = stripUnsafe(src.job, 600);
    if (!name || !job || job.length < 40 || looksSecret(name) || looksSecret(job)) continue;
    const id = slugId(name, bots.length);
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const needsRaw = Array.isArray(src.needs) ? src.needs : (src.needs ? [src.needs] : []);
    const needs = [];
    const needSeen = new Set();
    needsRaw.forEach((n) => {
      const mapped = mapNeed(n);
      if (!mapped) return;
      const key = mapped.id + '|' + mapped.label.toLowerCase();
      if (needSeen.has(key)) return;
      needSeen.add(key);
      needs.push(mapped);
    });
    let routine = stripUnsafe(src.routine, 200);
    if (!routine || looksSecret(routine)) routine = 'Tuesdays at 10:00 AM: check in on this work';
    bots.push({ id, name, job, routine, needs, smart: true, defaultName: name, score: 0 });
  }
  if (bots.length < 2) return null;
  const templates = [];
  const tSeen = new Set();
  const tIn = Array.isArray(data.templates) ? data.templates : [];
  tIn.forEach((n) => {
    const t = matchTemplate(n);
    if (!t || tSeen.has(t.name)) return;
    tSeen.add(t.name);
    const reasonRaw = (n && typeof n === 'object') ? n.reason : '';
    templates.push({
      id: t.id,
      name: t.name,
      catalogName: t.catalogName,
      reason: sanitizeReason(reasonRaw, catalogReason(t)),
      always: t.id === 'eggbot',
      smart: true,
      score: 0
    });
  });
  // At least 3 bots total (custom plus templates). Add Dr. Eggbot if needed.
  if (bots.length + templates.length < 3 && !tSeen.has('Dr. Eggbot')) {
    templates.unshift({
      id: 'eggbot', name: 'Dr. Eggbot', catalogName: 'dr eggbot',
      reason: 'For adding more bots later, after this team is set up.',
      always: true, smart: true, score: 0
    });
  }
  if (bots.length + templates.length < 3) return null;
  // Cap this payload at 10; the client also caps against the existing crew.
  while (bots.length + templates.length > 10) {
    if (templates.length > 1) templates.pop();
    else if (bots.length > 2) bots.pop();
    else break;
  }
  const gated = payload ? gateSmartTemplates(templates, payload) : templates;
  if (bots.length + gated.length < 3 && !gated.some((t) => t.id === 'eggbot' || t.name === 'Dr. Eggbot')) {
    // After gating, still reach 3 total if we can add Eggbot.
    gated.unshift({
      id: 'eggbot', name: 'Dr. Eggbot', catalogName: 'dr eggbot',
      reason: 'For adding more bots later, after this team is set up.',
      always: true, smart: true, score: 0
    });
  }
  if (bots.length + gated.length < 3) return null;
  return { bots, templates: gated };
}

function fallbackReply(message) {
  return new Response(JSON.stringify({ ok: false, fallback: true, message: message || SMART_FALLBACK }), { status: 200, headers: JSON_HEADERS });
}

async function bumpEmailCount(env, email, now) {
  const day = utcDay(now);
  const key = await sha256Hex((env.RATE_LIMIT_SALT || '') + '|smart-email|' + email);
  const iso = new Date(now).toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO smart_email_counts (key, day, count, created_at) VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN smart_email_counts.day = ?2 THEN smart_email_counts.count + 1 ELSE 1 END,
       day = ?2,
       created_at = CASE WHEN smart_email_counts.day = ?2 THEN smart_email_counts.created_at ELSE ?3 END
     RETURNING count, day, key`
  ).bind(key, day, iso).first();
  return row;
}

async function bumpGlobalCount(env, now) {
  const day = utcDay(now);
  const iso = new Date(now).toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO smart_global_counts (day, count, created_at) VALUES (?1, 1, ?2)
     ON CONFLICT(day) DO UPDATE SET count = smart_global_counts.count + 1
     RETURNING count, day`
  ).bind(day, iso).first();
  return row;
}

async function saveSubscriberIfOptedIn(env, body, email, now) {
  if (body.marketing_consent !== true) return;
  if (body.consent_version !== CONSENT_VERSION) return;
  const iso = new Date(now).toISOString();
  await env.DB.prepare(
    `INSERT INTO subscribers (email, first_name, role, industry, marketing_consent, consent_text, consent_version, source, created_at, consent_at)
     VALUES (?1, NULL, NULL, NULL, 1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(email) DO UPDATE SET
       marketing_consent = 1, consent_text = excluded.consent_text,
       consent_version = excluded.consent_version, consent_at = excluded.consent_at
     WHERE subscribers.marketing_consent = 0`
  ).bind(email, CONSENT_TEXT, CONSENT_VERSION, SOURCE, iso).run();
}

async function callOpenAI(env, payload, fetchImpl) {
  if (!env.OPENAI_API_KEY) return { error: 'missing-key' };
  const ctrl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(SMART_TIMEOUT_MS)
    : undefined;
  try {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: SMART_MODEL,
        response_format: { type: 'json_object' },
        max_tokens: SMART_MAX_TOKENS,
        temperature: 0.6,
        messages: buildSmartMessages(payload)
      }),
      signal: ctrl
    });
    if (!res.ok) return { error: 'http-' + res.status };
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    return { text };
  } catch (err) {
    return { error: 'network' };
  }
}

/* ---------------- POST /api/smart ---------------- */
export async function handleSmart(request, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now || Date.now();
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false }), { status: 405, headers: { ...JSON_HEADERS, Allow: 'POST' } });

  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return reply(false, 403);
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) return reply(false, 415);
  if (!env.DB) return reply(false, 500);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  // IP hash limit is shared with /api/subscribe; failed tokens still count.
  if (await rateLimited(env, ip, now)) return fallbackReply(SMART_IP_CAP_MSG);

  let body;
  try {
    const raw = await request.text();
    if (raw.length > SMART_BODY_BYTES) return reply(false, 413);
    body = JSON.parse(raw);
  } catch {
    return reply(false, 400);
  }
  if (!body || typeof body !== 'object') return reply(false, 400);

  const email = cleanField(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return reply(false, 400);
  if (body.marketing_consent !== undefined && typeof body.marketing_consent !== 'boolean') return reply(false, 400);
  if (body.marketing_consent === true && body.consent_version !== CONSENT_VERSION) return reply(false, 400);

  if (!(await verifyTurnstile(env, body.turnstile_token, ip, fetchImpl))) return reply(false, 403);

  await cleanupSmartCounts(env, now).catch(() => {});

  const emailRow = await bumpEmailCount(env, email, now);
  if (!emailRow || emailRow.count > SMART_EMAIL_MAX) return fallbackReply(SMART_EMAIL_CAP_MSG);

  const globalRow = await bumpGlobalCount(env, now);
  if (!globalRow || globalRow.count > SMART_GLOBAL_MAX) return fallbackReply(SMART_GLOBAL_CAP_MSG);

  await saveSubscriberIfOptedIn(env, body, email, now);

  const payload = buildSmartPayload(body);
  const ai = await callOpenAI(env, payload, fetchImpl);
  if (ai.error) return fallbackReply(SMART_FALLBACK);
  const validated = validateSmartOutput(ai.text, payload);
  if (!validated) return fallbackReply(SMART_FALLBACK);

  return new Response(JSON.stringify({
    ok: true,
    fallback: false,
    bots: validated.bots,
    templates: validated.templates
  }), { status: 200, headers: JSON_HEADERS });
}
