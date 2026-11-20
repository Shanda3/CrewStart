/*
 * Crewstart (unofficial community tool) - recommendation + prompt logic. Name lives in brand.js.
 * Pure functions, no DOM, no network. Works in the browser (window.BotLogic)
 * and in Node (require('./logic.js')).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BotLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_BOTS = 10;
  var MAX_TEMPLATE_EXTRAS = 3;
  var USAGE_SAVER_PROMPT = 'Usage Saver: Once a week, check my plan usage and which bots and routines use the most, then suggest specific cuts (run a routine less often, shorten a digest, pause one I don\'t read) for my approval. Never change or pause anything without asking. Needs: none. Routine: Fridays at 4:00 PM my local time: weekly usage check.';
  var USAGE_SAVER_LEAN = 'Keep every routine lean: no more often than needed, short outputs.';
  var MIN_BOTS = 3;
  var BOT_NAME_MAX = 60;
  var MIN_SCORE = 2; // weak single signals do not earn a bot on their own

  /* ---------- Questionnaire catalogs (single source for UI + logic) ---------- */

  var TASKS = [
    { id: 'email', label: 'Sort and reply to email', short: 'email' },
    { id: 'scheduling', label: 'Schedule meetings and appointments', short: 'scheduling' },
    { id: 'meetings', label: 'Prep for meetings and take notes', short: 'meeting prep and notes' },
    { id: 'customers', label: 'Follow up with customers or clients', short: 'customer follow-ups' },
    { id: 'new-business', label: 'Find new business clients', short: 'finding new business clients' },
    { id: 'hiring', label: 'Hire or interview people', short: 'hiring and interviews' },
    { id: 'research', label: 'Research topics, competitors, or leads', short: 'research' },
    { id: 'writing', label: 'Write posts, docs, or proposals', short: 'writing posts and docs' },
    { id: 'projects', label: 'Track projects, tasks, and deadlines', short: 'project tracking' },
    { id: 'code', label: 'Review code, issues, and pull requests', short: 'code review' },
    { id: 'reports', label: 'Write status updates and reports', short: 'status reports' }
  ];

  var TOOLS = [
    { id: 'gmail', label: 'Gmail' },
    { id: 'outlook', label: 'Outlook' },
    { id: 'gcal', label: 'Google Calendar' },
    { id: 'slack', label: 'Slack' },
    { id: 'notion', label: 'Notion' },
    { id: 'github', label: 'GitHub' },
    { id: 'linear', label: 'Linear' },
    { id: 'gdrive', label: 'Google Drive' },
    { id: 'crm', label: 'CRM' },
    { id: 'other', label: 'Other' }
  ];

  var GOALS = [
    { id: 'meals', label: 'Meals and groceries' },
    { id: 'errands', label: 'Errands' },
    { id: 'travel', label: 'Travel' },
    { id: 'learning', label: 'Learning something new' },
    { id: 'fitness', label: 'Fitness' },
    { id: 'finances', label: 'Finances and bills' },
    { id: 'family', label: 'Family scheduling' }
  ];

  var LOCKED_ASK_FIRST = [
    { id: 'send', label: 'Sending messages (email, chat, texts, posts)' },
    { id: 'spend', label: 'Spending money (purchases, bookings, subscriptions)' }
  ];

  var EXTRA_ASK_FIRST = [
    { id: 'delete', label: 'Deleting anything', phrase: 'deleting anything' },
    { id: 'calendar', label: 'Accepting or changing calendar events', phrase: 'accepting or changing calendar events' },
    { id: 'share', label: 'Sharing files or documents', phrase: 'sharing files or documents' },
    { id: 'records', label: 'Changing records in my work tools', phrase: 'changing records in my work tools (CRM, issues, docs)' }
  ];

  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /* Connector catalog. Names are hedged: the bot checks what actually exists. */
  var CONNECTORS = {
    gmail:   { label: 'Gmail', allows: 'Read your email and draft replies. Your bot asks before sending anything.' },
    outlook: { label: 'Outlook', allows: 'Read your Outlook email and calendar and draft replies. Your bot asks before sending anything.' },
    email:   { label: 'Email (Gmail or Outlook)', allows: 'Read your email and draft replies. Your bot asks before sending anything.' },
    gcal:    { label: 'Google Calendar', allows: 'See your events and free time, and suggest new events. Your bot asks before adding or changing anything.' },
    calendar:{ label: 'Calendar (Google or Outlook)', allows: 'See your events and free time, and suggest new events. Your bot asks before adding or changing anything.' },
    slack:   { label: 'Slack', allows: 'Read the channels and messages you allow, and draft messages. Your bot asks before posting.' },
    notion:  { label: 'Notion', allows: 'Read and update the pages and databases you share with it.' },
    github:  { label: 'GitHub', allows: 'Read repositories, issues, and pull requests. Your bot asks before commenting or changing anything.' },
    linear:  { label: 'Linear', allows: 'Read and update issues and projects in the teams you allow.' },
    gdrive:  { label: 'Google Drive', allows: 'Find and read the files you share with it, and create new docs.' },
    crm:     { label: 'CRM', allows: 'Look up contacts, deals, and notes. Your bot asks before updating records.' }
  };

  /* ---------- Helpers ---------- */

  function has(list, id) { return Array.isArray(list) && list.indexOf(id) !== -1; }
  function any(list, ids) { for (var i = 0; i < ids.length; i++) if (has(list, ids[i])) return true; return false; }
  function andList(items) {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }
  function labelOf(catalog, id) { for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i].label; return id; }

  /** "08:30" -> "8:30 AM"; "" / "none" -> "" */
  function formatTime(hhmm) {
    if (!hhmm || hhmm === 'none') return '';
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
    if (!m) return '';
    var h = parseInt(m[1], 10), min = m[2];
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + min + ' ' + suffix;
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  /** Date -> "November 20, 2026" */
  function formatDate(d) {
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  /** Time options for the briefing picker, 5:00 AM to 9:00 PM in 30 min steps. */
  function timeOptions() {
    var out = [];
    for (var h = 5; h <= 21; h++) {
      ['00', '30'].forEach(function (mm) {
        if (h === 21 && mm === '30') return;
        var v = (h < 10 ? '0' : '') + h + ':' + mm;
        out.push({ value: v, label: formatTime(v) });
      });
    }
    return out;
  }

  var SECRET_RE = /(password|passcode|passwd|api[\s_-]?key|secret|token|bearer|sk-[a-z0-9]{8,}|ghp_[a-z0-9]{8,}|xox[abp]-|AKIA[0-9A-Z]{8,})/i;
  /** True when free text looks like it contains a credential or asks about one. */
  function looksLikeSecret(text) {
    if (!text) return false;
    if (SECRET_RE.test(text)) return true;
    // Long unbroken random-looking strings (keys, tokens).
    return /[A-Za-z0-9_\-]{28,}/.test(text) && /\d/.test(text) && /[A-Za-z]/.test(text);
  }

  /** Clean free text for the prompt: single line, trimmed, length-capped, secrets dropped. */
  function cleanText(text, max) {
    if (text == null) return '';
    var t = String(text).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
    if (looksLikeSecret(t)) return '';
    return t.slice(0, max || 80);
  }

  /** Normalize raw answers into a known shape with defaults. */
  function normalize(a) {
    a = a || {};
    var ids = function (list, catalog) {
      return (Array.isArray(list) ? list : []).filter(function (id) {
        return catalog.some(function (c) { return c.id === id; });
      });
    };
    var briefing = a.briefingTime === undefined ? '08:00' : a.briefingTime;
    var digest = a.digestDay === undefined ? 'Monday' : a.digestDay;
    return {
      role: cleanText(a.role, 60),
      industry: cleanText(a.industry, 60),
      location: cleanText(a.location, 80),
      tasks: ids(a.tasks, TASKS),
      otherTasks: cleanText(a.otherTasks, 120),
      tools: ids(a.tools, TOOLS),
      otherTool: cleanText(a.otherTool, 40),
      goals: ids(a.goals, GOALS),
      briefingTime: formatTime(briefing) ? briefing : 'none',
      digestDay: has(DAYS, digest) ? digest : 'none',
      extraAskFirst: ids(a.extraAskFirst, EXTRA_ASK_FIRST)
    };
  }

  function hasAnySignal(n) {
    return !!(n.role || n.industry || n.location || n.tasks.length || n.otherTasks || n.tools.length || n.goals.length);
  }

  /** Opt-in add-on, not part of normalize() so toggling it does not rebuild the recommended team. */
  function usageSaverOn(answers) { return !!(answers && answers.usageSaver); }


  /**
   * Merge rule-based and smart suggestions under the 10-bot cap.
   * Profession-specific smart bots take slots before lower-value generic rule bots
   * (research, meeting prep, personal concierge, learning). Overlaps are dropped.
   */
  var GENERIC_RULE_IDS = { research: true, meetings: true, concierge: true, learning: true };
  function overlapGroup(b) {
    var id = (b && b.id) ? String(b.id).toLowerCase() : '';
    if (id === 'inbox') return 'email';
    if (id === 'meetings') return 'meetings';
    if (id === 'research') return 'research';
    if (id === 'concierge') return 'bills';
    var t = (((b && b.name) || '') + ' ' + ((b && b.job) || '')).toLowerCase();
    if (/\b(inbox & calendar|sort my inbox|sort and reply to emails?|email and appointment)\b/.test(t)) return 'email';
    if (/\b(meeting prep|meeting brief|prepare a short brief before each meeting)\b/.test(t)) return 'meetings';
    if (/\b(research scout|watch competitors and leads I care about)\b/.test(t)) return 'research';
    if (/\b(personal concierge|remind me about bills)\b/.test(t)) return 'bills';
    return '';
  }
  function isGenericRuleBot(b) {
    if (!b || b.smart) return false;
    if (GENERIC_RULE_IDS[b.id]) return true;
    var g = overlapGroup(b);
    return g === 'research' || g === 'meetings' || g === 'bills';
  }
  function sameTemplate(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    return !!(a.name && b.name && a.name.toLowerCase() === b.name.toLowerCase());
  }
  function sameOrOverlappingBot(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id && a.id === b.id) return true;
    if (a.name && b.name && a.name.toLowerCase() === b.name.toLowerCase()) return true;
    var ga = overlapGroup(a), gb = overlapGroup(b);
    return !!(ga && ga === gb);
  }
  function mergeSmartCrew(ruleBots, ruleTemplates, smartBots, smartTemplates, usageSaver) {
    function kept(list) { return (list || []).filter(function (x) { return x && !x.removed; }); }
    ruleBots = kept(ruleBots);
    ruleTemplates = kept(ruleTemplates);
    smartBots = kept(smartBots);
    smartTemplates = kept(smartTemplates);
    var saver = usageSaver ? 1 : 0;
    var tpls = [];
    var bots = [];
    function room() { return MAX_BOTS - saver - tpls.length - bots.length; }
    function addTpl(t) {
      if (!t || tpls.some(function (x) { return sameTemplate(x, t); })) return false;
      if (room() <= 0) return false;
      tpls.push(t);
      return true;
    }
    function addBot(b) {
      if (!b || bots.some(function (x) { return sameOrOverlappingBot(x, b); })) {
        if (b) b.held = false;
        return false;
      }
      if (room() <= 0) { b.held = true; return false; }
      b.held = false;
      bots.push(b);
      return true;
    }
    (ruleTemplates.concat(smartTemplates)).forEach(function (t) {
      if (t.always || t.id === 'eggbot' || t.name === 'Dr. Eggbot') addTpl(t);
    });
    smartBots.forEach(addBot);
    var high = [], low = [];
    ruleBots.forEach(function (b) {
      if (smartBots.some(function (s) { return sameOrOverlappingBot(s, b); })) return;
      if (isGenericRuleBot(b)) low.push(b);
      else high.push(b);
    });
    high.forEach(addBot);
    ruleTemplates.forEach(addTpl);
    smartTemplates.forEach(addTpl);
    low.forEach(addBot);
    return { bots: bots, templates: tpls };
  }

  function crewCount(bots, templates, answers) {
    return (bots ? bots.length : 0) + (templates ? templates.length : 0) + (usageSaverOn(answers) ? 1 : 0);
  }

  /* ---------- Connector resolution ---------- */

  function emailConnectors(n) {
    var out = [];
    if (has(n.tools, 'gmail')) out.push('gmail');
    if (has(n.tools, 'outlook')) out.push('outlook');
    return out.length ? out : ['email'];
  }
  function calendarConnectors(n) {
    if (has(n.tools, 'gcal')) return ['gcal'];
    if (has(n.tools, 'outlook')) return ['outlook'];
    if (has(n.tools, 'gmail')) return ['gcal'];
    return ['calendar'];
  }
  function docsConnectors(n) {
    var out = [];
    if (has(n.tools, 'gdrive')) out.push('gdrive');
    if (has(n.tools, 'notion')) out.push('notion');
    return out;
  }
  function trackerConnectors(n) {
    var out = [];
    ['github', 'linear', 'notion'].forEach(function (t) { if (has(n.tools, t)) out.push(t); });
    return out;
  }

  /* Build a de-duplicated needs list; a connector listed as required wins over optional. */
  function needs(required, optional) {
    var map = {}, order = [];
    function add(id, req) {
      if (!CONNECTORS[id]) return;
      if (!(id in map)) { order.push(id); map[id] = req; }
      else if (req) map[id] = true;
    }
    (required || []).forEach(function (id) { add(id, true); });
    (optional || []).forEach(function (id) { add(id, false); });
    // "outlook" covers email + calendar, so drop generic duplicates.
    return order.map(function (id) { return { id: id, label: CONNECTORS[id].label, required: map[id] }; });
  }

  /* ---------- Routines ---------- */

  function addMinutes(hhmm, mins) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm));
    if (!m) return hhmm;
    var total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + mins;
    total = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
    var h = Math.floor(total / 60), min = total % 60;
    return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
  }

  /** True when the weekly digest falls on a weekday that also has a daily briefing. */
  function digestSameDayAsBriefing(n) {
    return n.briefingTime !== 'none' && n.digestDay !== 'none' &&
      n.digestDay !== 'Saturday' && n.digestDay !== 'Sunday';
  }

  /** Weekly digest time; 30 minutes after the daily briefing when they land on the same day. */
  function digestTime(n) {
    if (n.briefingTime === 'none') return '9:00 AM';
    var t = digestSameDayAsBriefing(n) ? addMinutes(n.briefingTime, 30) : n.briefingTime;
    return formatTime(t);
  }
  function dailyRoutine(n, what) {
    if (n.briefingTime === 'none') return null;
    return 'Weekdays at ' + formatTime(n.briefingTime) + ': ' + what;
  }
  function weeklyRoutine(n, what) {
    if (n.digestDay === 'none') return null;
    return n.digestDay + 's at ' + digestTime(n) + ': ' + what;
  }

  var GENERIC_ROLES = /^(owner|co-?owner|founder|co-?founder|manager|director|ceo|cto|cfo|coo|president|intern|employee|assistant|executive|lead|head|vp|vice president|partner)$/i;

  function hasContentField(n) {
    return !!(n.industry || (n.role && !GENERIC_ROLES.test(String(n.role).trim())));
  }

  function contentFieldLabel(n) {
    var raw = String(n.industry || n.role || '').trim();
    if (!raw) return '';
    raw = raw.replace(/\b(business|company|llc|inc)\.?\b/ig, ' ').replace(/\s+/g, ' ').trim();
    var lead = /^(a|an|the|my|our|home|small|local|independent)\s+/i;
    while (lead.test(raw)) raw = raw.replace(lead, '');
    raw = raw.replace(/[\s,]+$/g, '').trim();
    if (!raw) raw = String(n.industry || n.role).trim();
    var small = { and: 1, or: 1, of: 1, for: 1, the: 1, a: 1, an: 1 };
    return raw.split(' ').map(function (w, i) {
      if (/^[A-Z0-9]{2,}$/.test(w) || /[a-z][A-Z]/.test(w)) return w;
      var lower = w.toLowerCase();
      if (i > 0 && small[lower]) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join(' ');
  }

  function fieldToPhrase(field) {
    return String(field || '').split(' ').map(function (w) {
      if (/^[A-Z0-9]{2,}$/.test(w) || /[a-z][A-Z]/.test(w)) return w;
      return w.toLowerCase();
    }).join(' ');
  }

  var BARE_BUSINESS = /^(restaurants?|baker(?:y|ies)|cafes?|coffee shops?|diners?|bistros?|eateries?|bars?|pubs?|hotels?|motels?|inns?|salons?|spas?|gyms?|studios?|shops?|stores?|clinics?|farms?|brewer(?:y|ies)|wineries|caterers?)$/i;
  function contentIdeasFor(field) {
    var phrase = fieldToPhrase(field);
    if (!phrase) return 'for my work';
    if (BARE_BUSINESS.test(phrase)) return 'for my ' + phrase;
    if (/ industry$/i.test(phrase)) return 'for the ' + phrase;
    return 'for ' + phrase;
  }

  function contentUpdateExamples(n) {
    var blob = ((n && n.industry) || '') + ' ' + ((n && n.role) || '') + ' ' + contentFieldLabel(n || {});
    blob = blob.toLowerCase();
    if (/restaurant|bakery|cater|cafe|coffee|diner|bistro|eatery|bar|pub|food|hospitality|hotel|motel|inn|chef|cuisine|kitchen|grocery|brewery|winery/.test(blob)) {
      return 'specials, seasonal menus, announcements';
    }
    if (/real estate|realtor|realty|housing|propert(?:y|ies)|listings|broker|mortgage/.test(blob)) {
      return 'new listings, market updates, open houses';
    }
    return 'offers, seasonal updates, announcements';
  }

  var CONTENT_NAME_SUFFIX = ' Content & Updates';
  function contentBotName(field) {
    var label = String(field || '').trim();
    var budget = BOT_NAME_MAX - CONTENT_NAME_SUFFIX.length;
    if (label.length > budget) label = label.slice(0, budget).replace(/[\s&,-]+$/g, '');
    return label + CONTENT_NAME_SUFFIX;
  }

  /** Weekly content roundup on Thursday at 9:00 AM, or Wednesday if Thursday is already the digest day. */
  function contentRoutine(n) {
    var day = n.digestDay === 'Thursday' ? 'Wednesday' : 'Thursday';
    return day + 's at 9:00 AM: weekly content roundup';
  }

  function likelyInvoicesCustomers(n) {
    var text = [n.industry, n.role, n.otherTasks].filter(Boolean).join(' ').toLowerCase();
    return /(cater|freelance|freelancer|consultant|contractor|\bservice|\bstudio\b|\bagency\b|invoice|billing|bookkeep|accountan|lawyer|attorney|photographer|designer|architect)/.test(text);
  }

  /* ---------- Archetypes ---------- */

  var ARCHETYPES = [
    {
      id: 'inbox',
      name: 'Inbox & Calendar Assistant',
      score: function (n) {
        var s = 0;
        if (has(n.tasks, 'email')) s += 3;
        if (has(n.tasks, 'scheduling')) s += 3;
        if (has(n.tasks, 'customers')) s += 2;
        if (any(n.tools, ['gmail', 'outlook'])) s += 2;
        if (has(n.tools, 'gcal')) s += 1;
        if (has(n.goals, 'family')) s += 2;
        return s;
      },
      build: function (n) {
        var job = 'Sort my inbox, draft replies for my approval, and keep my calendar organized';
        var inc = [];
        if (has(n.tasks, 'customers')) inc.push('customer follow-ups');
        if (has(n.goals, 'family')) inc.push('family plans');
        if (inc.length) job += ', including ' + inc.join(' and ');
        var opt = has(n.tools, 'crm') ? ['crm'] : [];
        if (has(n.tools, 'slack')) opt.push('slack');
        return {
          job: job + '.',
          needs: needs(emailConnectors(n).concat(calendarConnectors(n)), opt),
          routine: dailyRoutine(n, 'morning briefing of important email and today\'s calendar')
        };
      }
    },
    {
      id: 'meetings',
      name: 'Meeting Prep & Notes',
      score: function (n) {
        var s = 0;
        if (has(n.tasks, 'meetings')) s += 4;
        if (has(n.tasks, 'scheduling')) s += 1;
        if (has(n.tasks, 'customers')) s += 1;
        if (has(n.tasks, 'reports')) s += 1;
        if (any(n.tools, ['gcal', 'outlook'])) s += 1;
        return s;
      },
      build: function (n) {
        return {
          job: 'Prepare a short brief before each meeting and write up notes from notes or transcripts I paste, or from meetings I ask you to join.',
          needs: needs(calendarConnectors(n), docsConnectors(n).concat(has(n.tools, 'slack') ? ['slack'] : [])),
          routine: 'About 30 minutes before each meeting: short meeting brief'
        };
      }
    },
    {
      id: 'tracker',
      name: 'Project Tracker',
      score: function (n) {
        var s = 0;
        if (has(n.tasks, 'projects')) s += 3;
        if (has(n.tasks, 'code')) s += 3;
        if (has(n.tasks, 'reports')) s += 2;
        if (has(n.tools, 'github')) s += 2;
        if (has(n.tools, 'linear')) s += 2;
        if (has(n.tools, 'notion')) s += 1;
        return s;
      },
      build: function (n) {
        var t = trackerConnectors(n);
        var where = t.length ? ' across ' + andList(t.map(function (id) { return CONNECTORS[id].label; })) : '';
        return {
          job: 'Track tasks, issues, and deadlines' + where + ', flag what is stuck, and draft my status updates.',
          needs: needs(t, has(n.tools, 'slack') ? ['slack'] : []),
          routine: weeklyRoutine(n, 'weekly project status digest')
        };
      }
    },
    {
      id: 'research',
      name: 'Research Scout',
      score: function (n) {
        var s = 0;
        if (has(n.tasks, 'research')) s += 4;
        if (has(n.tasks, 'customers')) s += 1;
        if (has(n.tasks, 'writing')) s += 1;
        return s;
      },
      build: function (n) {
        var topic = n.industry ? ' in my industry (' + n.industry + ')' : '';
        return {
          job: 'Watch competitors and leads I care about' + topic + ' and send me a short digest with sources. Before your first digest, ask me for 3 to 5 competitors or leads to watch.',
          needs: needs([], docsConnectors(n)),
          routine: weeklyRoutine(n, 'weekly research digest')
        };
      }
    },
    {
      id: 'writing',
      name: 'Content & Writing Editor',
      score: function (n) {
        var s = 0;
        if (hasContentField(n)) s += 4;
        if (has(n.tasks, 'writing')) s += 4;
        if (has(n.tasks, 'reports')) s += 1;
        if (has(n.tools, 'notion') || has(n.tools, 'gdrive')) s += 1;
        return s;
      },
      build: function (n) {
        var writingJob = 'Draft and edit posts, docs, and proposals in my voice. Ask me for 2 or 3 samples of my writing first. I approve everything before it is published or sent.';
        var field = contentFieldLabel(n);
        if (hasContentField(n) && field) {
          var job = 'Send me a weekly roundup of news, trends, seasonal ideas, and content ideas ' + contentIdeasFor(field) + ', and draft posts or customer updates (' + contentUpdateExamples(n) + ') for my approval. Before the first roundup, ask me what I sell and who my customers are.';
          if (has(n.tasks, 'writing') || has(n.tasks, 'reports')) {
            job += ' Also ' + writingJob.charAt(0).toLowerCase() + writingJob.slice(1);
          }
          return {
            name: contentBotName(field),
            job: job,
            needs: needs([], docsConnectors(n)),
            routine: contentRoutine(n)
          };
        }
        return {
          job: writingJob,
          needs: needs([], docsConnectors(n)),
          routine: null
        };
      }
    },
    {
      id: 'concierge',
      name: 'Personal Concierge',
      score: function (n) {
        var s = 0;
        if (has(n.goals, 'meals')) s += 3;
        if (has(n.goals, 'errands')) s += 3;
        if (has(n.goals, 'travel')) s += 3;
        if (has(n.goals, 'finances')) s += 2;
        if (has(n.goals, 'family')) s += 2;
        return s;
      },
      build: function (n) {
        var parts = [];
        if (has(n.goals, 'meals')) parts.push('plan meals and grocery lists');
        if (has(n.goals, 'errands')) parts.push('organize errands');
        if (has(n.goals, 'travel')) parts.push('research trips');
        if (has(n.goals, 'finances')) parts.push('remind me about bills');
        if (has(n.goals, 'family')) parts.push('coordinate family plans');
        if (!parts.length) parts = ['plan meals', 'organize errands', 'research trips'];
        var job = andList(parts);
        job = job.charAt(0).toUpperCase() + job.slice(1) + '. Never buys or books anything without my approval.';
        if (has(n.goals, 'finances')) {
          job += ' Ask me which bills and due dates to track (or find them in Gmail if connected).';
        }
        return {
          job: job,
          needs: needs([], calendarConnectors(n).concat(emailConnectors(n))),
          routine: weeklyRoutine(n, 'plan the week ahead')
        };
      }
    },
    {
      id: 'coach',
      name: 'Learning Coach',
      score: function (n) {
        var s = 0;
        if (has(n.goals, 'learning')) s += 4;
        if (has(n.goals, 'fitness')) s += 3;
        return s;
      },
      build: function (n) {
        var what = [];
        if (has(n.goals, 'learning') || !has(n.goals, 'fitness')) what.push('learning');
        if (has(n.goals, 'fitness')) what.push('fitness');
        return {
          name: what.length === 2 ? 'Learning & Fitness Coach' : (what[0] === 'fitness' ? 'Fitness Coach' : 'Learning Coach'),
          job: 'Build a simple ' + what.join(' and ') + ' plan, check in on progress, and keep me motivated.',
          needs: needs([], calendarConnectors(n)),
          routine: weeklyRoutine(n, 'progress check-in and plan for the week')
        };
      }
    }
  ];

  /* Fill order when there are fewer than MIN_BOTS with a signal. */
  var DEFAULT_ORDER_WORK = ['inbox', 'research', 'writing', 'meetings', 'tracker'];
  var DEFAULT_ORDER_PERSONAL = ['concierge', 'inbox', 'coach', 'research', 'writing'];

  function archetypeById(id) {
    for (var i = 0; i < ARCHETYPES.length; i++) if (ARCHETYPES[i].id === id) return ARCHETYPES[i];
    return null;
  }

  /* ---------- Templates (count toward MAX_BOTS) ---------- */

  function templateCatalog() {
    var src = (typeof CrewstartTemplates !== 'undefined')
      ? CrewstartTemplates
      : (typeof require === 'function' ? require('./templates.js') : null);
    return src || { EGGBOT_ID: 'eggbot', CATALOG: [] };
  }

  function roleHits(role, keywords) {
    var r = (role || '').toLowerCase();
    if (!r || !keywords || !keywords.length) return 0;
    var n = 0;
    for (var i = 0; i < keywords.length; i++) {
      var raw = String(keywords[i] || '').toLowerCase();
      if (!raw) continue;
      var k = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      if (new RegExp('\\b' + k + '\\b').test(r)) n++;
    }
    return n;
  }

  function scoreTemplate(t, n) {
    var s = 0;
    (t.tasks || []).forEach(function (id) { if (has(n.tasks, id)) s += 3; });
    (t.tools || []).forEach(function (id) { if (has(n.tools, id)) s += 2; });
    (t.goals || []).forEach(function (id) { if (has(n.goals, id)) s += 3; });
    s += roleHits(n.role, t.roles) * 2;
    return s;
  }

  var HIRING_TEMPLATE_IDS = ['hiring-screener', 'recruiting-coordinator'];
  var HIRING_ROLES = ['recruiter', 'recruiting', 'hiring', 'talent', 'hr', 'people'];
  var SALES_OUTBOUND_ROLES = ['sales', 'account executive', 'account manager', 'business development'];

  function hasHiringSignal(n) {
    return has(n.tasks, 'hiring') || has(n.goals, 'hiring') || roleHits(n.role, HIRING_ROLES) > 0;
  }

  function hasSalesOutboundSignal(n) {
    return has(n.tasks, 'new-business') || roleHits(n.role, SALES_OUTBOUND_ROLES) > 0;
  }

  /* Extra templates need a strong match: a role or goal hit, not just a shared tool or task.
   * Hiring and recruiting templates also need a hiring task, goal, or role.
   * Sales Outbound needs a sales-type role or the "find new business clients" task.
   */
  function isStrongTemplateMatch(t, n, score) {
    if (score < MIN_SCORE) return false;
    if (HIRING_TEMPLATE_IDS.indexOf(t.id) !== -1) return hasHiringSignal(n);
    if (t.id === 'sales-outbound') return hasSalesOutboundSignal(n);
    var role = roleHits(n.role, t.roles) > 0;
    var goal = (t.goals || []).some(function (id) { return has(n.goals, id); });
    return role || goal;
  }

  function templateRecord(t, score, reason) {
    return {
      id: t.id,
      name: t.name,
      catalogName: t.catalogName || t.name,
      reason: reason || t.reason,
      always: !!t.always,
      score: score || 0
    };
  }

  /* Templates whose job is already covered by a given custom-bot id.
   * Chief of Staff, Executive Assistant, Inbox Manager, and Calendar Coordinator
   * overlap with the inbox/calendar custom bot; none of them fully covers that
   * bot (inbox + calendar + follow-ups), so we keep the custom bot and skip them.
   */
  var TEMPLATE_COVERED_BY = {
    'inbox-manager': 'inbox',
    'calendar-coordinator': 'inbox',
    'chief-of-staff': 'inbox',
    'executive-assistant': 'inbox',
    'daily-briefing-writer': 'inbox',
    'researchy': 'research',
    'meeting-prep-buddy': 'meetings',
    'gift-concierge': 'concierge',
    'order-concierge': 'concierge',
    'travel-coordinator': 'concierge',
    'expense-manager': 'concierge',
    'subscription-cleaner': 'concierge'
  };
  var INBOX_OVERLAP_GROUP = ['inbox-manager', 'calendar-coordinator', 'chief-of-staff', 'executive-assistant'];
  var CUSTOM_GOAL_COVER = {
    concierge: ['meals', 'errands', 'travel', 'finances', 'family'],
    coach: ['learning', 'fitness'],
    inbox: ['family']
  };

  function templateCoveredByCustom(t, customIds) {
    var covers = TEMPLATE_COVERED_BY[t.id];
    return !!(covers && customIds.indexOf(covers) !== -1);
  }

  /**
   * Pick Eggbot + 0-3 extras, skipping templates a kept custom bot already covers.
   * At most one of the inbox/calendar overlap group, and only if that custom bot is absent.
   */
  var HIRING_OR_SALES_IDS = ['hiring-screener', 'recruiting-coordinator', 'sales-outbound'];
  var FILL_AFTER_CONTENT = ['daily-briefing-writer', 'travel-coordinator', 'gift-concierge', 'order-concierge', 'subscription-cleaner'];

  function catalogById(id) {
    var catalog = (templateCatalog().CATALOG || []);
    for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
    return null;
  }

  function templateReason(t, n) {
    var field = contentFieldLabel(n);
    var phrase = fieldToPhrase(field);
    var yours = phrase ? ' for your ' + phrase : '';
    if (t.id === 'social-media-manager') {
      return 'It can draft social posts and customer updates' + (yours || ' in your voice') + ', for you to approve.';
    }
    if (t.id === 'newsletter-writer') {
      return 'It can draft newsletters and customer updates' + (yours || ' in your voice') + ', for you to approve.';
    }
    if (t.id === 'invoice-coordinator') {
      if (/cater/.test(phrase) || /cater/.test((n.industry || '').toLowerCase())) {
        return 'It can track invoices and follow up when catering clients haven\'t paid, with your approval.';
      }
      return 'It can track invoices and follow up when customers or clients haven\'t paid, with your approval.';
    }
    if (t.id === 'daily-briefing-writer') {
      return 'It writes a short morning brief of what you need to know today.';
    }
    if (t.id === 'travel-coordinator') {
      return 'It researches trips and itineraries and never books without your approval.';
    }
    if (t.id === 'gift-concierge') {
      return 'It helps you remember occasions and suggest gifts, and never buys without your OK.';
    }
    if (t.id === 'order-concierge') {
      return 'It helps you plan orders and purchases, and never buys without your approval.';
    }
    if (t.id === 'subscription-cleaner') {
      return 'It helps you find unused subscriptions so you can decide what to cancel.';
    }
    if (t.id === 'personal-site-builder') {
      return 'It can help you plan and draft pages for a personal or portfolio site.';
    }
    if (t.id === 'researchy') {
      return phrase
        ? 'It researches competitors and leads in ' + phrase + ' and sends a short digest with sources.'
        : 'It researches competitors or leads and sends a short digest with sources.';
    }
    return t.reason;
  }

  function contentFillWinner(n) {
    var social = 0, news = 0;
    if (has(n.tasks, 'writing')) { social += 3; news += 2; }
    if (has(n.tasks, 'customers')) { social += 3; news += 2; }
    if (has(n.tasks, 'email')) { news += 2; }
    if (hasContentField(n)) { social += 2; news += 1; }
    if (news > social) return { first: 'newsletter-writer', second: 'social-media-manager' };
    return { first: 'social-media-manager', second: 'newsletter-writer' };
  }

  function fillRelevance(id, n) {
    if (id === 'social-media-manager' || id === 'newsletter-writer') {
      return (has(n.tasks, 'writing') ? 3 : 0) + (has(n.tasks, 'customers') ? 3 : 0) + (hasContentField(n) ? 2 : 0) + (has(n.tasks, 'email') && id === 'newsletter-writer' ? 2 : 0);
    }
    if (id === 'invoice-coordinator') return likelyInvoicesCustomers(n) ? 4 : 0;
    if (id === 'daily-briefing-writer') return (has(n.tasks, 'email') || has(n.tasks, 'reports') ? 2 : 0);
    if (id === 'travel-coordinator') return has(n.goals, 'travel') ? 3 : 0;
    if (id === 'gift-concierge') return (has(n.goals, 'family') || has(n.goals, 'errands') ? 3 : 0);
    if (id === 'order-concierge') return (has(n.goals, 'meals') || has(n.goals, 'errands') ? 3 : 0);
    if (id === 'subscription-cleaner') return has(n.goals, 'finances') ? 3 : 0;
    return 0;
  }

  function fillTemplateOrder(n) {
    var pair = contentFillWinner(n);
    var ids = [pair.first];
    if (likelyInvoicesCustomers(n)) ids.push('invoice-coordinator');
    ids.push(pair.second);
    FILL_AFTER_CONTENT.forEach(function (id) { ids.push(id); });
    return ids;
  }

  /**
   * Pick Eggbot + 2 to MAX_TEMPLATE_EXTRAS extras. Strong matches first, then
   * general-fit fills for small-business owners and solo operators, skipping
   * templates a kept custom bot already covers. Never fill with hiring or
   * sales templates unless the hiring/sales gate already passed as a strong match.
   */
  function pickTemplates(answers, customIds) {
    var n = normalize(answers);
    var pack = templateCatalog();
    var catalog = pack.CATALOG || [];
    var egg = null;
    var scored = [];
    catalog.forEach(function (t, i) {
      if (t.id === pack.EGGBOT_ID || t.always) { egg = templateRecord(t, 0); return; }
      scored.push({ t: t, s: scoreTemplate(t, n), i: i });
    });
    var ids = customIds || [];
    var extras = scored
      .filter(function (x) { return isStrongTemplateMatch(x.t, n, x.s) && !templateCoveredByCustom(x.t, ids); })
      .sort(function (x, y) { return y.s - x.s || x.i - y.i; });
    var picked = [];
    var usedInboxGroup = false;
    var pickedIds = {};
    function tryAdd(t, score) {
      if (!t || picked.length >= MAX_TEMPLATE_EXTRAS || pickedIds[t.id]) return;
      if (t.id === 'invoice-coordinator' && !likelyInvoicesCustomers(n)) return;
      if (templateCoveredByCustom(t, ids)) return;
      if (INBOX_OVERLAP_GROUP.indexOf(t.id) !== -1) {
        if (usedInboxGroup) return;
        usedInboxGroup = true;
      }
      picked.push(templateRecord(t, score, templateReason(t, n)));
      pickedIds[t.id] = true;
    }
    extras.forEach(function (x) { tryAdd(x.t, x.s); });
    var fillIds = fillTemplateOrder(n);
    var i;
    for (i = 0; i < fillIds.length && picked.length < 2; i++) {
      var ft = catalogById(fillIds[i]);
      if (ft && HIRING_OR_SALES_IDS.indexOf(ft.id) === -1) tryAdd(ft, scoreTemplate(ft, n));
    }
    for (i = 0; i < fillIds.length && picked.length < MAX_TEMPLATE_EXTRAS; i++) {
      if (fillRelevance(fillIds[i], n) < 3) continue;
      var otherContent = (fillIds[i] === 'social-media-manager' || fillIds[i] === 'newsletter-writer') &&
        (pickedIds['social-media-manager'] || pickedIds['newsletter-writer']);
      if (otherContent) continue;
      var extra = catalogById(fillIds[i]);
      if (extra && HIRING_OR_SALES_IDS.indexOf(extra.id) === -1) tryAdd(extra, scoreTemplate(extra, n));
    }
    var out = [];
    if (egg) out.push(egg);
    return out.concat(picked);
  }

  /**
   * Custom bots + templates, kept in sync and within MAX_BOTS.
   * Prefer keeping a custom bot over an overlapping template unless the template fully covers it
   * (none of the inbox-group templates do).
   */
  function selectTeam(answers) {
    var allCustom = recommendAllCustom(answers);
    var assumedIds = allCustom.map(function (b) { return b.id; });
    var templates = pickTemplates(answers, assumedIds);
    var bots = allCustom.slice(0, Math.max(1, MAX_BOTS - templates.length));
    var keptIds = bots.map(function (b) { return b.id; });
    var again = pickTemplates(answers, keptIds);
    var same = again.length === templates.length && again.every(function (t, i) { return t.id === templates[i].id; });
    if (!same) {
      templates = again;
      bots = allCustom.slice(0, Math.max(1, MAX_BOTS - templates.length));
    }
    refineTeamRoutines(bots);
    return { bots: bots, templates: templates };
  }

  /** When Meeting Prep is on the team, the inbox briefing covers email and tasks only — not today's calendar. */
  function refineTeamRoutines(bots) {
    if (!bots || !bots.length) return bots;
    var hasMeetings = bots.some(function (b) { return b.id === 'meetings'; });
    var calendar = 'morning briefing of important email and today\'s calendar';
    var tasksOnly = 'morning briefing of important email and tasks';
    bots.forEach(function (b) {
      if (b.id !== 'inbox' || !b.routine) return;
      var what = hasMeetings ? tasksOnly : calendar;
      b.routine = b.routine.replace(calendar, what).replace(tasksOnly, what);
    });
    return bots;
  }

  /**
   * Suggested templates: Dr. Eggbot first, then 2 to MAX_TEMPLATE_EXTRAS extras (strong matches first, then general-fit fills)
   * that do not overlap a recommended custom bot. Deterministic: higher score first, then catalog order.
   */
  function suggestTemplates(answers) {
    return selectTeam(answers).templates;
  }

  /** Prompt phrase for one template, e.g. Dr. Eggbot (listed as "dr eggbot"; for adding more bots later, after this team is set up). */
  function templatePromptName(t) {
    var listed = t.catalogName || t.name;
    var bits = [];
    if (listed && listed !== t.name) bits.push('listed as "' + listed + '"');
    if (t.always) bits.push('for adding more bots later, after this team is set up');
    if (bits.length) return t.name + ' (' + bits.join('; ') + ')';
    return t.name;
  }

  function formatTemplateLine(templates, totalBots) {
    if (!templates || !templates.length) return '';
    var names = templates.map(templatePromptName);
    var n = totalBots || templates.length;
    return 'Bot templates: look up these in Bot templates and offer me the import link for each: ' +
      andList(names) + '. If one isn\'t there, suggest the closest match instead. ' +
      'Skip any template whose job one of my custom bots already covers. ' +
      'Keep my new bots to ' + n + ' in total (templates plus custom bots), not counting this bot.';
  }

  /**
   * Custom-bot candidates, uncapped by templates (still at most MAX_BOTS).
   * Used so removing a template can free a slot for the next custom bot.
   */
  function recommendAllCustom(answers) {
    var n = normalize(answers);
    var scored = ARCHETYPES.map(function (a, i) { return { a: a, s: a.score(n), i: i }; })
      .filter(function (x) { return x.s >= MIN_SCORE; })
      .sort(function (x, y) { return y.s - x.s || x.i - y.i; });

    var picked = scored.slice(0, MAX_BOTS).map(function (x) { return { a: x.a, s: x.s }; });

    if (picked.length < MIN_BOTS) {
      var workSignal = n.tasks.length || n.tools.length || n.role || n.industry || n.otherTasks;
      var order = (!workSignal && n.goals.length) ? DEFAULT_ORDER_PERSONAL : DEFAULT_ORDER_WORK;
      for (var i = 0; i < order.length && picked.length < MIN_BOTS; i++) {
        var a = archetypeById(order[i]);
        if (!picked.some(function (p) { return p.a.id === a.id; })) picked.push({ a: a, s: 0 });
      }
    }

    return picked.map(function (p) {
      var b = p.a.build(n);
      var nm = b.name || p.a.name;
      return { id: p.a.id, name: nm, defaultName: nm, job: b.job, needs: b.needs, routine: b.routine, score: p.s };
    });
  }

  /**
   * Recommend custom bots, trimmed so custom + suggested templates stay within MAX_BOTS. Returns [{ id, name, defaultName, job, needs, routine, score }].
   */
  function recommend(answers) {
    return selectTeam(answers).bots;
  }

  /** Connection checklist: one row per service, with per-bot Required/Optional. */
  function connectionChecklist(bots) {
    var rows = {}, order = [];
    bots.forEach(function (b) {
      b.needs.forEach(function (c) {
        if (!CONNECTORS[c.id]) return;
        if (!rows[c.id]) {
          rows[c.id] = { id: c.id, label: CONNECTORS[c.id].label, allows: CONNECTORS[c.id].allows, required: false, usedBy: [] };
          order.push(c.id);
        }
        rows[c.id].usedBy.push({ bot: b.name, required: c.required });
        if (c.required) rows[c.id].required = true;
      });
    });
    return order.map(function (id) { return rows[id]; })
      .sort(function (x, y) { return (y.required ? 1 : 0) - (x.required ? 1 : 0); });
  }

  function joinList(items) { return items.filter(Boolean).join(', '); }

  /** Lowercase a regular industry phrase; keep acronyms and intra-cap names (SaaS) as typed. */
  function industryPhrase(industry) {
    var ind = String(industry || '').trim();
    if (!ind) return '';
    if (!/^[A-Z0-9]{2,}$/.test(ind) && !/[a-z][A-Z]/.test(ind)) {
      ind = ind.charAt(0).toLowerCase() + ind.slice(1);
    }
    if (/\bbusiness\b/i.test(ind)) return ind;
    return ind + ' business';
  }

  function articleFor(phrase) {
    return /^[aeiou]/i.test(phrase) ? 'an' : 'a';
  }

  function needLabel(c) {
    if (c.id === 'crm') {
      return c.required
        ? 'CRM (ask me which one, e.g. HubSpot or Salesforce)'
        : 'CRM (optional; ask me which one, e.g. HubSpot or Salesforce, or none)';
    }
    return (c.label || c.id) + (c.required ? '' : ' (optional)');
  }

  function goalCovered(goalId, bots, templates) {
    var i;
    for (i = 0; i < (bots || []).length; i++) {
      var ids = CUSTOM_GOAL_COVER[bots[i].id];
      if (ids && ids.indexOf(goalId) !== -1) return true;
    }
    var catalog = (templateCatalog().CATALOG || []);
    for (i = 0; i < (templates || []).length; i++) {
      var tid = templates[i].id, src = null, j;
      for (j = 0; j < catalog.length; j++) if (catalog[j].id === tid) { src = catalog[j]; break; }
      if (src && (src.goals || []).indexOf(goalId) !== -1) return true;
    }
    return false;
  }

  /** Move a stored routine into the job text: the bot creates it for itself. */
  function routineInJob(routine) {
    if (!routine) return '';
    var m = /^(.*?): (.*)$/.exec(routine);
    var when = m ? m[1] : routine;
    var what = (m ? m[2] : routine).replace(/\s*[.]+$/, '');
    var dayStart = DAYS.some(function (d) { return when.indexOf(d) === 0; });
    if (!dayStart) when = when.charAt(0).toLowerCase() + when.slice(1);
    return ' On your first run, create this routine for yourself: ' + when + ', ' + what + '.';
  }

  /** Build the copy-ready setup prompt (brief's template structure). */
  function buildPrompt(answers, bots, templates) {
    var n = normalize(answers);
    if (!templates) templates = suggestTemplates(answers);
    var lines = [];
    lines.push('Set up my Grok Bot team. Ask before anything that sends messages or spends money.');
    if (n.extraAskFirst.length) {
      var extras = n.extraAskFirst.map(function (id) {
        for (var i = 0; i < EXTRA_ASK_FIRST.length; i++) if (EXTRA_ASK_FIRST[i].id === id) return EXTRA_ASK_FIRST[i].phrase;
        return id;
      });
      lines.push('Also ask before ' + andList(extras) + '.');
    }

    var about = [];
    if (n.role && n.industry) {
      var ind = industryPhrase(n.industry);
      about.push(n.role + ' of ' + articleFor(ind) + ' ' + ind);
    } else if (n.role) {
      about.push('Role: ' + n.role);
    } else if (n.industry) {
      about.push('Industry: ' + n.industry);
    } else {
      about.push('Role: not specified');
      about.push('Industry: not specified');
    }
    var tasks = n.tasks.map(function (id) { for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === id) return TASKS[i].short; return id; });
    if (n.otherTasks) tasks.push(n.otherTasks);
    about.push('Tasks: ' + (tasks.length ? joinList(tasks) : 'not specified'));
    var tools = n.tools.filter(function (id) { return id !== 'other'; }).map(function (id) { return labelOf(TOOLS, id); });
    if (has(n.tools, 'other')) tools.push(n.otherTool || 'other tools');
    about.push('Tools: ' + (tools.length ? joinList(tools) : 'not specified'));
    if (n.location) about.push('Based in ' + n.location);
    lines.push('About me: ' + about.join('; ') + '.');

    var keptTemplates = templates || [];
    var contextNote = ' (context only; don\'t create a bot just for these)';
    var goalLabels = n.goals.map(function (id) {
      return { id: id, label: labelOf(GOALS, id).toLowerCase(), covered: goalCovered(id, bots, keptTemplates) };
    });
    if (!goalLabels.length) {
      lines.push('Personal goals: none.');
    } else if (goalLabels.every(function (g) { return g.covered; })) {
      lines.push('Personal goals: ' + joinList(goalLabels.map(function (g) { return g.label; })) + '.');
    } else if (goalLabels.every(function (g) { return !g.covered; })) {
      lines.push('Personal goals: ' + joinList(goalLabels.map(function (g) { return g.label; })) + contextNote + '.');
    } else {
      lines.push('Personal goals: ' + joinList(goalLabels.map(function (g) {
        return g.label + (g.covered ? '' : contextNote);
      })) + '.');
    }

    var saverOn = usageSaverOn(answers);
    var hasTimes = n.briefingTime !== 'none' || n.digestDay !== 'none' || saverOn ||
      (bots || []).some(function (b) { return !!b.routine; });
    if (hasTimes) lines.push('Times are in my local time zone.');
    if (keptTemplates.length) {
      lines.push(formatTemplateLine(keptTemplates, crewCount(bots, keptTemplates, answers)));
    }
    lines.push('Create these custom bots, one job each:');
    bots.forEach(function (b, i) {
      var name = cleanText(b.name, BOT_NAME_MAX) || b.defaultName;
      var needsText = b.needs.length ? b.needs.map(needLabel).join(', ') : 'none';
      var job = b.job.replace(/\.$/, '') + '.';
      job += routineInJob(b.routine);
      lines.push((i + 1) + '. ' + name + ': ' + job + ' Needs: ' + needsText + '.');
    });
    if (saverOn) lines.push((bots.length + 1) + '. ' + USAGE_SAVER_PROMPT);
    lines.push('For each custom bot: create it with the name and job above. Check what\'s already connected before asking me to connect anything, and don\'t ask me to reconnect the same account for each bot. Walk me through connecting anything that\'s missing, skipping any I decline.');
    if (saverOn) lines.push(USAGE_SAVER_LEAN);
    lines.push('After creating each bot, tell me to open it and say hi, so it sets up its routine on its first run.');
    var summary = 'When done, summarize: custom bots created, connections made, anything skipped.';
    if (keptTemplates.length) {
      summary = 'When done, summarize: templates added, custom bots created, connections made, anything skipped.';
    }
    lines.push(summary);
    return lines.join('\n');
  }

  /* ---------- Shareable state (URL hash): selections only, never free text ---------- */

  function encodeState(answers) {
    var n = normalize(answers);
    var parts = [
      't=' + n.tasks.join('.'),
      'o=' + n.tools.join('.'),
      'g=' + n.goals.join('.'),
      'b=' + n.briefingTime,
      'd=' + n.digestDay,
      'x=' + n.extraAskFirst.join('.')
    ];
    if (usageSaverOn(answers)) parts.push('u=1');
    return parts.join('&');
  }

  function decodeState(hash) {
    var s = String(hash || '').replace(/^#/, '');
    var out = {};
    s.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i < 0) return;
      var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
      var list = v ? v.split('.') : [];
      if (k === 't') out.tasks = list;
      else if (k === 'o') out.tools = list;
      else if (k === 'g') out.goals = list;
      else if (k === 'b') out.briefingTime = v;
      else if (k === 'd') out.digestDay = v;
      else if (k === 'x') out.extraAskFirst = list;
      else if (k === 'u') out.usageSaver = (v === '1');
    });
    var n = normalize(out);
    return {
      tasks: n.tasks, tools: n.tools, goals: n.goals,
      briefingTime: n.briefingTime, digestDay: n.digestDay, extraAskFirst: n.extraAskFirst,
      usageSaver: out.usageSaver === true
    };
  }

  return {
    MAX_BOTS: MAX_BOTS, MIN_BOTS: MIN_BOTS, BOT_NAME_MAX: BOT_NAME_MAX, MAX_TEMPLATE_EXTRAS: MAX_TEMPLATE_EXTRAS,
    USAGE_SAVER_PROMPT: USAGE_SAVER_PROMPT, USAGE_SAVER_LEAN: USAGE_SAVER_LEAN,
    usageSaverOn: usageSaverOn, crewCount: crewCount, mergeSmartCrew: mergeSmartCrew, isGenericRuleBot: isGenericRuleBot,
    TASKS: TASKS, TOOLS: TOOLS, GOALS: GOALS, DAYS: DAYS,
    contentFieldLabel: contentFieldLabel, hasContentField: hasContentField, contentIdeasFor: contentIdeasFor, contentUpdateExamples: contentUpdateExamples, contentBotName: contentBotName,
    LOCKED_ASK_FIRST: LOCKED_ASK_FIRST, EXTRA_ASK_FIRST: EXTRA_ASK_FIRST, CONNECTORS: CONNECTORS,
    ARCHETYPES: ARCHETYPES.map(function (a) { return { id: a.id, name: a.name }; }),
    formatTime: formatTime, formatDate: formatDate, timeOptions: timeOptions,
    looksLikeSecret: looksLikeSecret, cleanText: cleanText, normalize: normalize, hasAnySignal: hasAnySignal,
    recommend: recommend, recommendAllCustom: recommendAllCustom, suggestTemplates: suggestTemplates, refineTeamRoutines: refineTeamRoutines, formatTemplateLine: formatTemplateLine, templatePromptName: templatePromptName, connectionChecklist: connectionChecklist, buildPrompt: buildPrompt,
    encodeState: encodeState, decodeState: decodeState
  };
});
