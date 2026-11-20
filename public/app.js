/* Crewstart UI. All state lives in memory (plus selections-only URL hash). */
(function () {
  'use strict';
  var L = window.BotLogic, BRAND = window.BRAND, CFG = window.APP_CONFIG || {};
  var STEP_TITLES = ['Welcome', 'Your work', 'Personal goals', 'Check-ins', 'Your team', 'Your prompt'];
  var LAST = 5;
  // One question per screen. `step` drives the 5-step progress indicator.
  var SCREENS = [
    { key: '0', step: 0 },
    { key: '1a', step: 1, part: 1, parts: 3 }, { key: '1b', step: 1, part: 2, parts: 3 }, { key: '1c', step: 1, part: 3, parts: 3 },
    { key: '2', step: 2 }, { key: '3', step: 3 }, { key: '4', step: 4 },
    { key: '5', step: 5 }
  ];
  function screenIndex(key) { for (var i = 0; i < SCREENS.length; i++) if (SCREENS[i].key === key) return i; return 0; }

  var state = {
    screen: 0,
    answers: {
      role: '', industry: '', location: '', tasks: [], otherTasks: '', tools: [], otherTool: '', goals: [],
      briefingTime: '08:00', briefingDays: 'weekdays', digestFreq: 'weekly', digestDays: ['Monday'], extraAskFirst: ['delete'], usageSaver: false
    },
    bots: [], allBots: [], allCustom: [], botsKey: '',
    templates: [], allTemplates: [],
    smartBots: [], smartTemplates: [], smartIncluded: true, smartMessage: '',
    subscribed: false
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'className') n.className = attrs[k];
      else if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function announce(msg) { var live = $('#live'); live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); }

  /* ---------- Brand ---------- */
  function applyBrand() {
    if ($('#signup-form')) {
      document.title = BRAND.title;
      var md = document.querySelector('meta[name="description"]');
      if (md) md.setAttribute('content', BRAND.tagline);
    }
    $$('[data-brand-wordmark]').forEach(function (n) {
      n.textContent = '';
      var name = BRAND.name;
      if (/start$/i.test(name) && name.length > 5) {
        n.appendChild(el('span', { className: 'brand-crew', text: name.slice(0, -5) }));
        n.appendChild(el('span', { className: 'brand-start', text: name.slice(-5) }));
      } else {
        n.appendChild(el('span', { className: 'brand-crew', text: name }));
      }
    });
    $$('[data-brand-name]').forEach(function (n) { n.textContent = BRAND.name; });
    $$('[data-brand-tagline]').forEach(function (n) { n.textContent = BRAND.tagline; });
    $$('[data-brand-disclaimer]').forEach(function (n) { n.textContent = BRAND.disclaimer; });
    $$('[data-brand-logo]').forEach(function (n) { n.innerHTML = BRAND.logoSvg; });
    var social = CFG.SOCIAL || {};
    $$('[data-social]').forEach(function (a) {
      var url = social[a.getAttribute('data-social')];
      if (typeof url === 'string' && url.trim()) {
        a.setAttribute('href', url.trim());
        a.hidden = false;
      } else {
        a.removeAttribute('href');
        a.hidden = true;
      }
    });
  }

  /* ---------- Build form controls from logic catalogs ---------- */
  function checkbox(group, item, checked) {
    var id = group + '-' + item.id;
    return el('label', { className: 'check', for: id }, [
      el('input', { type: 'checkbox', id: id, name: group, value: item.id, checked: !!checked }),
      el('span', { text: item.label })
    ]);
  }
  function buildControls() {
    var lists = { tasks: L.TASKS, tools: L.TOOLS, goals: L.GOALS, extra: L.EXTRA_ASK_FIRST };
    Object.keys(lists).forEach(function (key) {
      var box = $('[data-list="' + key + '"]');
      var field = key === 'extra' ? 'extraAskFirst' : key;
      lists[key].forEach(function (item) { box.appendChild(checkbox(key, item, state.answers[field].indexOf(item.id) !== -1)); });
    });
    var locked = $('[data-list="locked"]');
    L.LOCKED_ASK_FIRST.forEach(function (item) {
      var id = 'locked-' + item.id;
      locked.appendChild(el('li', {}, [el('label', { className: 'check locked', for: id }, [
        el('input', { type: 'checkbox', id: id, checked: true, disabled: true, 'aria-describedby': id + '-tag' }),
        el('span', { text: item.label }),
        el('span', { className: 'lock-tag', id: id + '-tag', text: 'Always on' })
      ])]));
    });
    var bt = $('#briefingTime');
    L.timeOptions().forEach(function (o) { bt.appendChild(el('option', { value: o.value, text: o.label })); });
    bt.appendChild(el('option', { value: 'none', text: 'No briefing' }));
    function dayChips(name, type) {
      var box = $('[data-days="' + name + '"]');
      if (!box) return;
      L.DAYS.forEach(function (d) {
        var id = name + '-' + d;
        box.appendChild(el('label', { className: 'day-chip', for: id }, [
          el('input', { type: type, id: id, name: name, value: d, 'aria-label': d }),
          el('span', { 'aria-hidden': 'true', text: d.slice(0, 3) })
        ]));
      });
    }
    dayChips('briefingCustomDays', 'checkbox');
    dayChips('digestWeeklyDay', 'radio');
    dayChips('digestCustomDays', 'checkbox');
  }

  function selectedDays(name) {
    return L.DAYS.filter(function (d) {
      var i = $('[data-days="' + name + '"] input[value="' + d + '"]');
      return i && i.checked;
    });
  }

  function setRadio(name, value) {
    $$('input[name="' + name + '"]').forEach(function (i) { i.checked = i.value === value; });
  }

  function setDayChecks(name, days) {
    var list = days || [];
    $$('input[name="' + name + '"]').forEach(function (i) { i.checked = list.indexOf(i.value) !== -1; });
  }

  function briefingDaysMode(a) {
    return (a.briefingDays === 'everyday' || a.briefingDays === 'weekdays') ? a.briefingDays : 'custom';
  }

  function defaultCustomBriefingDays(a) {
    if (Array.isArray(a.briefingDays) && a.briefingDays.length) return a.briefingDays.slice();
    if (a.briefingDays === 'everyday') return L.DAYS.slice();
    return L.WEEKDAYS.slice();
  }

  function syncScheduleControls() {
    var a = state.answers;
    var bt = $('#briefingTime');
    if (bt) bt.value = a.briefingTime;
    var bMode = briefingDaysMode(a);
    setRadio('briefingDays', bMode);
    setDayChecks('briefingCustomDays', bMode === 'custom' ? a.briefingDays : []);
    var hasBriefing = a.briefingTime !== 'none';
    var bWrap = $('#briefing-days-wrap');
    var bCustom = $('#briefing-custom-days');
    if (bWrap) bWrap.hidden = !hasBriefing;
    if (bCustom) bCustom.hidden = !hasBriefing || bMode !== 'custom';

    setRadio('digestFreq', a.digestFreq || 'weekly');
    setDayChecks('digestWeeklyDay', a.digestFreq === 'weekly' ? a.digestDays : []);
    setDayChecks('digestCustomDays', a.digestFreq === 'custom' ? a.digestDays : []);
    var wDay = $('#digest-weekly-day');
    var cDay = $('#digest-custom-days');
    if (wDay) wDay.hidden = a.digestFreq !== 'weekly';
    if (cDay) cDay.hidden = a.digestFreq !== 'custom';
  }

  function syncControlsFromState() {
    var a = state.answers;
    ['tasks', 'tools', 'goals'].forEach(function (k) {
      $$('input[name="' + k + '"]').forEach(function (i) { i.checked = a[k].indexOf(i.value) !== -1; });
    });
    $$('input[name="extra"]').forEach(function (i) { i.checked = a.extraAskFirst.indexOf(i.value) !== -1; });
    syncScheduleControls();
    ['role', 'industry', 'location', 'otherTasks', 'otherTool'].forEach(function (k) { if ($('#' + k)) $('#' + k).value = a[k] || ''; });
    updateTaskLimit();
    $('#otherTool-field').hidden = a.tools.indexOf('other') === -1;
  }

  function updateTaskLimit() {
    var n = state.answers.tasks.length;
    var full = n >= 5;
    $$('input[name="tasks"]').forEach(function (i) { if (!i.checked) i.disabled = full; });
    $('#tasks-count').textContent = n === 0 ? '' : n + ' selected' + (full ? '. That\'s the maximum of 5; uncheck one to pick another.' : '.');
  }

  function updateHash() {
    var h = L.encodeState(state.answers);
    try { history.replaceState(null, '', '#' + h); } catch (e) { /* file:// etc. */ }
  }

  function secretWarn(id) {
    var input = $('#' + id), warn = $('#' + id + '-warn');
    if (!warn) return;
    var bad = L.looksLikeSecret(input.value);
    warn.hidden = !bad;
    warn.textContent = bad ? 'This looks like a password, key, or code. Please remove it. It won\'t be included.' : '';
    input.setAttribute('aria-invalid', bad ? 'true' : 'false');
  }

  function onChange(e) {
    var t = e.target, a = state.answers;
    if (t.type === 'checkbox' && ['tasks', 'tools', 'goals', 'extra'].indexOf(t.name) !== -1) {
      var key = t.name === 'extra' ? 'extraAskFirst' : t.name;
      var list = a[key].filter(function (x) { return x !== t.value; });
      if (t.checked) list.push(t.value);
      // keep catalog order
      var cat = { tasks: L.TASKS, tools: L.TOOLS, goals: L.GOALS, extraAskFirst: L.EXTRA_ASK_FIRST }[key];
      a[key] = cat.map(function (c) { return c.id; }).filter(function (id) { return list.indexOf(id) !== -1; });
      if (key === 'tasks') updateTaskLimit();
      if (key === 'tools') $('#otherTool-field').hidden = a.tools.indexOf('other') === -1;
      if (key === 'goals' && currentStep() === 2) $('[data-action="next"]').textContent = a.goals.length ? 'Next' : 'Skip';
      updateHash();
    } else if (t.id === 'briefingTime') {
      a.briefingTime = t.value;
      syncScheduleControls();
      updateHash();
    } else if (t.name === 'briefingDays') {
      a.briefingDays = t.value === 'custom' ? defaultCustomBriefingDays(a) : t.value;
      syncScheduleControls();
      updateHash();
    } else if (t.name === 'briefingCustomDays') {
      var bDays = selectedDays('briefingCustomDays');
      if (!bDays.length) { t.checked = true; bDays = [t.value]; }
      a.briefingDays = bDays;
      updateHash();
    } else if (t.name === 'digestFreq') {
      a.digestFreq = t.value;
      if (t.value === 'weekly') {
        a.digestDays = [a.digestDays && a.digestDays[0] ? a.digestDays[0] : 'Monday'];
      } else if (t.value === 'custom') {
        if (!a.digestDays || !a.digestDays.length) a.digestDays = ['Monday'];
      }
      syncScheduleControls();
      updateHash();
    } else if (t.name === 'digestWeeklyDay') {
      a.digestDays = [t.value];
      updateHash();
    } else if (t.name === 'digestCustomDays') {
      var dDays = selectedDays('digestCustomDays');
      if (!dDays.length) { t.checked = true; dDays = [t.value]; }
      a.digestDays = dDays;
      updateHash();
    } else if (t.id === 'usage-saver') {
      a.usageSaver = !!t.checked;
      updateHash();
      renderReview();
    }
  }
  function onInput(e) {
    var t = e.target;
    if (['role', 'industry', 'location', 'otherTasks', 'otherTool'].indexOf(t.id) !== -1) {
      state.answers[t.id] = t.value;
      secretWarn(t.id);
    }
  }

  /* ---------- Steps ---------- */
  function goScreen(i, opts) {
    var sc = SCREENS[i], n = sc.step;
    if (n === 4 || n === 5) ensureReview();
    if (sc.key === '4') loadTurnstile();
    if (sc.key === '5') { renderOutput(); updateSharePreview(); loadTurnstile(); }
    state.screen = i;
    $$('.step').forEach(function (s) { s.hidden = s.getAttribute('data-screen') !== sc.key; });
    var inFlow = n > 0;
    $('.progress').hidden = !inFlow;
    $('.step-nav').hidden = !inFlow || n === LAST;
    var label = 'Step ' + n + ' of ' + LAST + ': ' + STEP_TITLES[n] + (sc.parts ? ' (' + sc.part + ' of ' + sc.parts + ')' : '');
    if (inFlow) {
      $('#progress-label').textContent = label;
      var frac = (n - 1 + (sc.parts ? sc.part / sc.parts : 1)) / LAST;
      $('.progress-fill').style.width = (frac * 100) + '%';
      $$('[data-step-dot]').forEach(function (li) {
        var d = Number(li.getAttribute('data-step-dot'));
        if (d === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.classList.toggle('done', d < n);
      });
      var next = $('[data-action="next"]');
      next.hidden = n === LAST;
      next.textContent = n === 3 ? 'See my team' : n === 4 ? 'Build my prompt' : (n === 2 && !state.answers.goals.length ? 'Skip' : 'Next');
    }
    if (window.csSetMascotMood) {
      var happy = (sc.key === '4' || sc.key === '5');
      window.csSetMascotMood(happy ? 'happy' : 'neutral');
      if (sc.key === '4' && window.csCelebrate && !(opts && opts.initial)) window.csCelebrate();
    }
    var h = $('#h-' + sc.key);
    window.scrollTo(0, 0);
    if (h && !(opts && opts.initial)) h.focus({ preventScroll: true });
    if (inFlow) announce(label + '. ' + (h ? h.textContent : ''));
  }
  function currentStep() { return SCREENS[state.screen].step; }

  /* ---------- Review ---------- */
  function answersKey() { return JSON.stringify(L.normalize(state.answers)); }
  function activeCrew() {
    var include = state.smartIncluded !== false;
    return L.mergeSmartCrew(
      state.bots,
      state.templates,
      include ? (state.smartBots || []) : [],
      include ? (state.smartTemplates || []) : []
    );
  }
  function activeTemplates() { return activeCrew().templates; }
  function activeBots() { return activeCrew().bots; }
  function crewTotal() { return L.crewCount(activeBots(), activeTemplates(), state.answers); }
  function overflowCustom() {
    var have = {};
    activeBots().forEach(function (b) { have[b.id] = true; });
    return state.allCustom.filter(function (b) { return !have[b.id]; });
  }
  function ensureReview() {
    var key = answersKey();
    if (key === state.botsKey && state.allCustom.length) {
      renderReview();
      return;
    }
    state.botsKey = key;
    state.smartBots = [];
    state.smartTemplates = [];
    state.smartIncluded = true;
    state.smartMessage = '';
    state.allTemplates = L.suggestTemplates(state.answers);
    state.templates = state.allTemplates.slice();
    state.allCustom = L.recommendAllCustom(state.answers);
    var slots = Math.max(1, L.MAX_BOTS - state.templates.length);
    state.allBots = state.allCustom.slice(0, slots);
    state.bots = state.allBots.slice();
    renderReview();
  }
  function svgEl(inner) {
    var w = document.createElement('span');
    w.innerHTML = '<svg class="i sm" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + inner + '</svg>';
    return w.firstChild;
  }
  function countPhrase(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function renderCrewCount() {
    var saver = !!state.answers.usageSaver;
    var c = activeBots().length, tpl = activeTemplates().length, total = c + tpl;
    var mid = countPhrase(c, 'custom bot', 'custom bots');
    if (tpl || state.allTemplates.length || (state.smartTemplates && state.smartTemplates.length)) mid += ' + ' + countPhrase(tpl, 'template', 'templates');
    $('#crew-count-text').innerHTML = 'Your crew: <b>' + mid + '</b> (' + total + ' of ' + L.MAX_BOTS + ')' + (saver ? ' + Usage Saver' : '');
    var meter = $('#crew-meter');
    meter.textContent = '';
    var i;
    for (i = 0; i < c; i++) meter.appendChild(el('span', { className: 'seg c' }));
    for (i = 0; i < tpl; i++) meter.appendChild(el('span', { className: 'seg t' }));
    for (i = total; i < L.MAX_BOTS; i++) meter.appendChild(el('span', { className: 'seg e' }));
  }
  function renderUsageSaver() {
    var input = $('#usage-saver');
    var card = $('#usage-saver-card');
    if (!input || !card) return;
    var on = !!state.answers.usageSaver;
    input.checked = on;
    input.disabled = false;
    card.classList.toggle('on', on);
  }
  function renderReview() {
    L.refineTeamRoutines(activeBots());
    renderCrewCount();
    renderBots();
    renderTemplates();
    renderUsageSaver();
    renderSmartCard();
    renderAddSlot();
  }
  function renderBots() {
    var ol = $('#bot-list');
    ol.textContent = '';
    var bots = activeBots();
    var only = bots.length <= 1;
    bots.forEach(function (b, i) {
      var nameId = 'bot-name-' + b.id;
      var needs = b.needs.length
        ? el('ul', { className: 'tags' }, b.needs.map(function (c) {
            return el('li', {}, [el('span', { className: 'tag ' + (c.required ? 'tag-required' : 'tag-optional'), text: c.label + (c.required ? '' : ' (optional)') })]);
          }))
        : document.createTextNode('No connections needed');
      var remove = el('button', {
        type: 'button', className: 'btn btn-small', 'data-remove': b.id,
        'aria-disabled': only ? 'true' : null, 'aria-describedby': only ? 'min-one' : null
      }, ['Remove', el('span', { className: 'visually-hidden', text: ' ' + b.name })]);
      ol.appendChild(el('li', { className: 'bot-card', 'aria-label': 'Bot ' + (i + 1) + ' of ' + bots.length }, [
        el('div', { className: 'bot-head' }, [
          el('div', { className: 'field' }, [
            el('label', { for: nameId, text: 'Bot ' + (i + 1) + ' name' }),
            el('input', { type: 'text', id: nameId, value: b.name, maxlength: String(L.BOT_NAME_MAX || 60), 'data-rename': b.id, autocomplete: 'off' })
          ]),
          b.smart ? el('span', { className: 'tpl-badge smart', text: 'Smart suggestion' }) : null,
          remove
        ]),
        el('p', { className: 'bot-job', text: b.job }),
        el('dl', {}, [
          el('dt', { text: 'Needs' }), el('dd', {}, [needs]),
          el('dt', { text: 'Routine' }), el('dd', { text: b.routine || 'None (works when you ask)' })
        ])
      ]));
    });
    if (only) ol.appendChild(el('li', { id: 'min-one', className: 'hint', text: 'Your team needs at least one bot.' }));
    $('#removed-note').hidden = state.bots.length === state.allBots.length || !state.allBots.some(function (b) {
      return !state.bots.some(function (x) { return x.id === b.id; });
    });
  }
  function badgeSvg() {
    return svgEl('<path d="M6.5 3.5h7.5l4 4v13h-11.5Z"/><path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h3.5"/>');
  }
  function renderTemplates() {
    var list = $('#tpl-list');
    list.textContent = '';
    var card = $('#tpl-card');
    var hasSuggested = state.allTemplates.length > 0;
    card.hidden = !hasSuggested;
    activeTemplates().forEach(function (t) {
      var titleKids = [document.createTextNode(t.name)];
      if (t.always) titleKids.push(el('span', { className: 'tpl-always', text: 'Always suggested' }));
      if (t.smart) titleKids.push(el('span', { className: 'tpl-badge smart', text: 'Smart suggestion' }));
      var remove = el('button', {
        type: 'button', className: 'btn btn-small',
        'data-remove-template': t.id,
        'aria-label': 'Remove ' + t.name + ' template'
      }, ['Remove']);
      list.appendChild(el('li', { className: 'tpl-row' }, [
        el('span', { className: 'tpl-badge' }, [badgeSvg(), document.createTextNode('Template')]),
        el('div', { className: 'tpl-txt' }, [
          el('h3', {}, titleKids),
          el('p', { text: t.reason })
        ]),
        remove
      ]));
    });
    var someRemoved = state.templates.length < state.allTemplates.length;
    $('#tpl-removed-note').hidden = !someRemoved;
  }
  function renderAddSlot() {
    var slot = $('#add-slot');
    slot.textContent = '';
    slot.classList.remove('full');
    var free = L.MAX_BOTS - crewTotal();
    var extra = overflowCustom();
    if (free <= 0) {
      slot.hidden = false;
      slot.classList.add('full');
      var names = extra.map(function (b) { return b.name; });
      var more = names.length
        ? 'Remove a bot or template to make room for ' + (
            names.length === 1 ? names[0]
            : names.length === 2 ? names[0] + ' or ' + names[1]
            : names.slice(0, -1).join(', ') + ', or ' + names[names.length - 1]
          ) + '.'
        : 'Remove a bot or template if you want to add something else.';
      slot.appendChild(el('span', { className: 'plus' }, [svgEl('<path d="M20 6 9 17l-5-5"/>')]));
      slot.appendChild(el('div', {}, [el('b', { text: 'Your crew is full' }), document.createTextNode(more)]));
      return;
    }
    if (!extra.length) { slot.hidden = true; return; }
    slot.hidden = false;
    var actions = extra.map(function (b) {
      return el('button', { type: 'button', className: 'btn btn-small', 'data-add-bot': b.id }, ['Add ' + b.name]);
    });
    slot.appendChild(el('span', { className: 'plus' }, [svgEl('<path d="M12 5v14M5 12h14"/>')]));
    slot.appendChild(el('div', {}, [
      el('b', { text: 'Your crew has room' }),
      document.createTextNode('Add a recommended bot to use the free slot.'),
      el('div', { className: 'add-actions' }, actions)
    ]));
  }
  function removeBot(id) {
    if (activeBots().length <= 1) { announce('Your team needs at least one bot.'); return; }
    var smart = (state.smartBots || []).find(function (b) { return b.id === id; });
    if (smart) {
      smart.removed = true;
      renderReview();
      announce(smart.name + ' removed. ' + crewTotal() + ' of ' + L.MAX_BOTS + ' slots in use.');
      $('#h-4').focus();
      return;
    }
    var idx = state.bots.findIndex(function (b) { return b.id === id; });
    if (idx < 0) return;
    var removed = state.bots.splice(idx, 1)[0];
    renderReview();
    announce(removed.name + ' removed. ' + crewTotal() + ' of ' + L.MAX_BOTS + ' slots in use.');
    var buttons = $$('[data-remove]');
    var target = buttons[Math.min(idx, buttons.length - 1)];
    (target || $('#h-4')).focus();
  }
  function removeTemplate(id) {
    var smart = (state.smartTemplates || []).find(function (t) { return t.id === id; });
    if (smart) {
      smart.removed = true;
      renderReview();
      announce(smart.name + ' template removed. A slot is free.');
      $('#h-4').focus();
      return;
    }
    var idx = state.templates.findIndex(function (t) { return t.id === id; });
    if (idx < 0) return;
    var removed = state.templates.splice(idx, 1)[0];
    renderReview();
    announce(removed.name + ' template removed. A slot is free.');
    var buttons = $$('[data-remove-template]');
    var target = buttons[Math.min(idx, buttons.length - 1)];
    (target || $('#h-4')).focus();
  }
  function addOverflowBot(id) {
    if (crewTotal() >= L.MAX_BOTS) return;
    if (state.bots.some(function (b) { return b.id === id; })) return;
    var src = state.allCustom.find(function (b) { return b.id === id; });
    if (!src) return;
    state.bots.push(src);
    renderReview();
    announce(src.name + ' added.');
    var input = $('#bot-name-' + id);
    (input || $('#h-4')).focus();
  }
  function restoreBots() {
    var names = {};
    state.bots.forEach(function (b) { names[b.id] = b.name; });
    var have = {};
    state.bots.forEach(function (b) { have[b.id] = true; });
    var slots = Math.max(1, L.MAX_BOTS - state.templates.length);
    state.allBots.forEach(function (b) {
      if (state.bots.length >= slots) return;
      if (have[b.id]) {
        if (names[b.id]) b.name = names[b.id];
        return;
      }
      if (names[b.id]) b.name = names[b.id];
      state.bots.push(b);
      have[b.id] = true;
    });
    renderReview();
    announce('Removed custom bots restored, up to the ' + L.MAX_BOTS + '-bot cap.');
    $('#h-4').focus();
  }
  function restoreTemplates() {
    var have = {};
    state.templates.forEach(function (t) { have[t.id] = true; });
    var added = 0, skipped = 0;
    state.allTemplates.forEach(function (t) {
      if (have[t.id]) return;
      if (crewTotal() >= L.MAX_BOTS) { skipped++; return; }
      state.templates.push(t);
      have[t.id] = true;
      added++;
    });
    renderReview();
    announce(added ? 'Removed templates restored.' + (skipped ? ' Your crew was full, so some could not be added back.' : '') : 'Your crew is full. Remove a custom bot to restore a template.');
    $('#h-4').focus();
  }

  /* ---------- Output ---------- */
  function promptBots() {
    return activeBots().map(function (b) {
      var copy = Object.assign({}, b);
      copy.name = L.cleanText(b.name, L.BOT_NAME_MAX || 60) || b.defaultName;
      return copy;
    });
  }
  function currentPrompt() { return L.buildPrompt(state.answers, promptBots(), activeTemplates()); }

  function renderCrewIcons() {
    var I = window.BotIcons;
    var list = $('#out-crew-list');
    var cluster = $('#out-crew-cluster');
    var count = $('#out-crew-count');
    if (!I || !list) return;
    list.textContent = '';
    if (cluster) cluster.textContent = '';
    var total = crewTotal();
    if (count) count.textContent = total + ' of ' + L.MAX_BOTS + (state.answers.usageSaver ? ' + Usage Saver' : '');

    var rows = [];
    promptBots().forEach(function (b, i) {
      rows.push({
        kind: 'custom',
        kindLabel: 'Custom',
        id: b.id,
        name: b.name || b.defaultName || 'Custom bot',
        job: b.job || '',
        suffix: 'c' + i
      });
    });
    activeTemplates().forEach(function (tpl, i) {
      rows.push({
        kind: tpl.id === 'eggbot' ? 'eggbot' : 'template',
        kindLabel: 'Template',
        id: tpl.id,
        name: tpl.name,
        job: tpl.reason || '',
        suffix: 't' + i
      });
    });
    if (state.answers.usageSaver) {
      rows.push({
        kind: 'addon',
        kindLabel: 'Add-on',
        id: 'usage-saver',
        name: 'Usage Saver',
        job: 'Keeps your plan usage down. Checks weekly which bots and routines use the most and suggests cuts for you to approve.',
        suffix: 'saver'
      });
    }

    rows.forEach(function (row) {
      var key = I.iconKey(row);
      var hit = el('span', { className: 'bot-icon-hit', 'aria-hidden': 'true' });
      hit.innerHTML = I.iconMarkup(key, row.suffix, 32);
      var kindClass = row.kind === 'custom' ? 'kind kind-custom' : (row.kind === 'addon' ? 'kind kind-addon' : 'kind kind-tpl');
      list.appendChild(el('li', { className: 'crew-row' }, [
        hit,
        el('div', { className: 'crew-txt' }, [
          el('b', { text: row.name }),
          el('span', { className: 'crew-job', text: row.job })
        ]),
        el('span', { className: kindClass, text: row.kindLabel })
      ]));
    });

    if (cluster) {
      rows.slice(0, 3).forEach(function (row) {
        var key = I.iconKey(row);
        var hit = el('span', { className: 'bot-icon-hit', 'aria-hidden': 'true' });
        hit.innerHTML = I.iconMarkup(key, 'cl-' + row.suffix, 32);
        cluster.appendChild(hit);
      });
    }
    if (window.csInitBotIcons) window.csInitBotIcons();
  }

  function renderOutput() {
    $('#prepared-date').textContent = 'on ' + L.formatDate(new Date());
    renderCrewIcons();
    var prompt = currentPrompt();
    setPromptText(prompt);
    var pre = $('#prompt-out');
    if (pre) pre.classList.remove('is-open');
    var tog = $('#toggle-prompt');
    if (tog) tog.textContent = 'Show full prompt';
    var lines = prompt ? prompt.split('\n').length : 0;
    var meta = $('#prompt-meta');
    if (meta) meta.textContent = lines + ' line' + (lines === 1 ? '' : 's') + ' · plain text';
    $('#copy-status').textContent = '';
    var copyBtn = $('#copy-btn');
    if (copyBtn) copyBtn.classList.remove('copied');
    var ul = $('#checklist');
    ul.textContent = '';
    var rows = L.connectionChecklist(promptBots());
    if (!rows.length) ul.appendChild(el('li', { text: 'No connections needed for this team.' }));
    rows.forEach(function (r) {
      ul.appendChild(el('li', {}, [
        el('div', { className: 'row-head' }, [
          el('strong', { text: r.label }),
          el('span', { className: 'tag ' + (r.required ? 'tag-required' : 'tag-optional'), text: r.required ? 'Required' : 'Optional' })
        ]),
        el('p', { text: r.allows }),
        el('p', { className: 'used-by', text: 'Used by: ' + r.usedBy.map(function (u) { return u.bot + ' (' + (u.required ? 'required' : 'optional') + ')'; }).join(', ') })
      ]));
    });
    updateSharePreview();
  }

  function setStatus(id, msg, isError) {
    var s = $(id);
    s.classList.toggle('error', !!isError);
    s.textContent = '';
    setTimeout(function () { s.textContent = msg; }, 30);
  }
  function promptText() {
    var el = $('#prompt-out');
    if (!el) return '';
    return el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '');
  }
  function setPromptText(text) {
    var el = $('#prompt-out');
    if (!el) return;
    if (el.tagName === 'TEXTAREA') el.value = text;
    else el.textContent = text;
  }
  function copyText(text, okMsg) {
    function fallback() {
      var scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.setAttribute('readonly', '');
      scratch.className = 'cs-copy-scratch';
      document.body.appendChild(scratch);
      scratch.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(scratch);
      setStatus('#copy-status', ok ? okMsg : 'Copy didn\'t work here. Select the text and copy it manually.', !ok);
    }
    function ok() {
      setStatus('#copy-status', okMsg);
      var btn = $('#copy-btn');
      if (btn && text === promptText()) {
        if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
        btn.classList.add('copied');
        btn.textContent = 'Copied!';
        setTimeout(function () {
          btn.classList.remove('copied');
          if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
        }, 2200);
      }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else fallback();
  }
  function download() {
    var d = new Date();
    var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var blob = new Blob([currentPrompt() + '\n'], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: BRAND.downloadPrefix + '-' + stamp + '.txt' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setStatus('#copy-status', 'Downloaded ' + a.getAttribute('download') + '.');
  }

  function renderSmartCard() {
    var card = $('#smart-card');
    var form = $('#smart-form');
    var result = $('#smart-result');
    if (!card || !form || !result) return;
    var has = (state.smartBots && state.smartBots.length) || (state.smartTemplates && state.smartTemplates.length);
    var fallbackOnly = !has && !!state.smartMessage;
    form.hidden = !!has;
    result.hidden = !has;
    card.classList.toggle('on', !!has && state.smartIncluded !== false);
    card.classList.toggle('fallback', fallbackOnly);
    var include = $('#smart-include');
    if (include) include.checked = state.smartIncluded !== false;
    var msg = $('#smart-result-msg');
    if (has && msg) {
      var held = (state.smartBots || []).filter(function (b) { return b.held && !b.removed; }).length;
      msg.textContent = (state.smartMessage || 'Smart suggestions are in your team below. Remove any you don\'t want, or turn them all off.') +
        (held ? ' Your crew was full, so ' + held + ' could not be added. Remove a bot to make room.' : '');
    }
    if (fallbackOnly) setStatus('#smart-status', state.smartMessage, false);
  }

  function taskLabels() {
    var n = L.normalize(state.answers);
    var labels = n.tasks.map(function (id) {
      for (var i = 0; i < L.TASKS.length; i++) if (L.TASKS[i].id === id) return L.TASKS[i].label;
      return id;
    });
    if (n.otherTasks) labels.push(n.otherTasks);
    return labels;
  }
  function toolLabels() {
    var n = L.normalize(state.answers);
    var labels = n.tools.filter(function (id) { return id !== 'other'; }).map(function (id) {
      for (var i = 0; i < L.TOOLS.length; i++) if (L.TOOLS[i].id === id) return L.TOOLS[i].label;
      return id;
    });
    if (n.tools.indexOf('other') !== -1) labels.push(n.otherTool || 'other tools');
    return labels;
  }
  function goalLabels() {
    var n = L.normalize(state.answers);
    return n.goals.map(function (id) {
      for (var i = 0; i < L.GOALS.length; i++) if (L.GOALS[i].id === id) return L.GOALS[i].label;
      return id;
    });
  }

  function readSmartToken() {
    var hidden = $('#smart-turnstile-token');
    return smartTurnstileToken || (hidden && hidden.value) || '';
  }
  function setSmartLoading(on) {
    var box = $('#smart-loading');
    var form = $('#smart-form');
    var btn = $('#smart-submit');
    if (box) {
      box.hidden = !on;
      box.setAttribute('aria-hidden', on ? 'false' : 'true');
      box.classList.toggle('is-busy', !!on);
    }
    if (form) form.setAttribute('aria-busy', on ? 'true' : 'false');
    if (btn) {
      btn.disabled = !!on;
      btn.setAttribute('aria-busy', on ? 'true' : 'false');
    }
    if (on) setStatus('#smart-status', '');
  }
  function submitSmart(e) {

    e.preventDefault();
    var email = ($('#smart-email') && $('#smart-email').value.trim()) || '';
    var err = $('#smart-email-error');
    if (!EMAIL_RE.test(email)) {
      if (err) { err.hidden = false; err.textContent = email ? 'Error: Enter a full email address, like name@example.com.' : 'Error: Enter your email address to get smart suggestions.'; }
      if ($('#smart-email')) { $('#smart-email').setAttribute('aria-invalid', 'true'); $('#smart-email').focus(); }
      return;
    }
    if (err) { err.hidden = true; err.textContent = ''; }
    if ($('#smart-email')) $('#smart-email').setAttribute('aria-invalid', 'false');
    if (!readSmartToken()) {
      setStatus('#smart-status', 'One moment: the spam check is still loading. Try again in a few seconds.', true);
      loadTurnstile();
      return;
    }
    var marketing = !!( $('#smart-consent') && $('#smart-consent').checked );
    var n = L.normalize(state.answers);
    var body = {
      email: email,
      turnstile_token: readSmartToken(),
      marketing_consent: marketing,
      profession: n.role,
      industry: n.industry,
      location: n.location,
      tasks: taskLabels(),
      tools: toolLabels(),
      goals: goalLabels(),
      covered: (state.bots || []).map(function (b) { return { name: b.name, job: b.job }; })
        .concat((state.templates || []).map(function (t) { return { name: t.name, job: t.reason || t.name }; }))
    };
    if (marketing) body.consent_version = CFG.consentVersion;
    var btn = $('#smart-submit');
    setSmartLoading(true);
    fetch(CFG.smartEndpoint || '/api/smart', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin',
      signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(22000) : undefined
    }).then(function (res) {
      return res.json().then(function (j) { return { res: res, j: j }; }).catch(function () { return { res: res, j: null }; });
    }).then(function (pack) {
      var res = pack.res, j = pack.j;
      if (j && j.fallback) {
        state.smartMessage = j.message || 'We couldn\'t generate smart suggestions right now, so we\'re showing your regular team.';
        state.smartBots = [];
        state.smartTemplates = [];
        setStatus('#smart-status', state.smartMessage, false);
        renderReview();
        announce(state.smartMessage);
        return;
      }
      if (res.status === 403) {
        setStatus('#smart-status', 'The spam check didn\'t pass. Please try again.', true);
        return;
      }
      if (res.status === 400) {
        setStatus('#smart-status', 'Please check your email address and try again.', true);
        return;
      }
      if (!res.ok || !j || j.ok !== true) {
        state.smartMessage = 'We couldn\'t generate smart suggestions right now, so we\'re showing your regular team.';
        setStatus('#smart-status', state.smartMessage, false);
        renderReview();
        return;
      }
      state.smartBots = (j.bots || []).map(function (b) { b.smart = true; b.removed = false; return b; });
      state.smartTemplates = (j.templates || []).map(function (t) { t.smart = true; t.removed = false; return t; });
      state.smartIncluded = true;
      state.smartMessage = 'Smart suggestions are in your team below. Remove any you don\'t want, or turn them all off.';
      setStatus('#smart-status', '');
      renderReview();
      announce('Smart suggestions added to your team.');
    }).catch(function () {
      state.smartMessage = 'We couldn\'t reach the server. Your regular team is still ready. Check your connection and try again.';
      setStatus('#smart-status', state.smartMessage, true);
    }).then(function () {
      setSmartLoading(false);
      smartTurnstileToken = '';
      var hid = $('#smart-turnstile-token');
      if (hid) hid.value = '';
      if (window.turnstile && smartTurnstileWidget !== null) window.turnstile.reset(smartTurnstileWidget);
    });
  }

  /* ---------- Required email step ---------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var turnstileToken = '', turnstileWidget = null, turnstileLoading = false;
  var smartTurnstileToken = '', smartTurnstileWidget = null;

  function renderTurnstileWidgets() {
    if (!window.turnstile || !CFG.turnstileSiteKey) return;
    if ($('#smart-turnstile-slot') && smartTurnstileWidget === null) {
      smartTurnstileWidget = window.turnstile.render('#smart-turnstile-slot', {
        sitekey: CFG.turnstileSiteKey,
        callback: function (t) { smartTurnstileToken = t; var i = $('#smart-turnstile-token'); if (i) i.value = t; },
        'expired-callback': function () { smartTurnstileToken = ''; var i = $('#smart-turnstile-token'); if (i) i.value = ''; },
        'error-callback': function () { smartTurnstileToken = ''; var i = $('#smart-turnstile-token'); if (i) i.value = ''; }
      });
    }
    if ($('#turnstile-slot') && turnstileWidget === null) {
      turnstileWidget = window.turnstile.render('#turnstile-slot', {
        sitekey: CFG.turnstileSiteKey,
        callback: function (t) { turnstileToken = t; },
        'expired-callback': function () { turnstileToken = ''; },
        'error-callback': function () { turnstileToken = ''; }
      });
    }
  }
  function loadTurnstile() {
    if (!CFG.turnstileSiteKey) return;
    if (window.turnstile) { renderTurnstileWidgets(); return; }
    if (turnstileLoading) return;
    turnstileLoading = true;
    window.__csTurnstileReady = function () { renderTurnstileWidgets(); };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__csTurnstileReady';
    s.async = true; s.defer = true;
    s.onerror = function () { turnstileLoading = false; };
    document.head.appendChild(s);
  }
  function signupValid() { return EMAIL_RE.test($('#su-email').value.trim()); }
  function emailErrorText(value) {
    if (!value) return 'Error: Enter your email address to join the list.';
    return 'Error: Enter a full email address, like name@example.com.';
  }
  function showEmailError(msg) {
    var err = $('#su-email-error');
    err.hidden = false;
    err.textContent = msg;
    $('#su-email').setAttribute('aria-invalid', 'true');
    $('#su-email').focus();
  }
  function clearEmailError() {
    var err = $('#su-email-error');
    err.hidden = true;
    err.textContent = '';
    $('#su-email').setAttribute('aria-invalid', 'false');
  }
  function showOptinForm() {
    $('#optin-form-wrap').hidden = false;
    $('#optin-success').hidden = true;
  }
  function showOptinSuccess() {
    $('#optin-form-wrap').hidden = true;
    $('#optin-success').hidden = false;
  }
  function updateSignup() {
    var v = $('#su-email').value.trim();
    if (v && EMAIL_RE.test(v)) clearEmailError();
  }
  function profileForShare() {
    return { role: L.cleanText(state.answers.role, 60), industry: L.cleanText(state.answers.industry, 60) };
  }
  function updateSharePreview() {
    var p = profileForShare();
    var box = $('#su-share');
    var parts = [];
    if (p.role) parts.push('role: ' + p.role);
    if (p.industry) parts.push('industry: ' + p.industry);
    $('#su-share-preview').textContent = parts.length ? '(' + parts.join(', ') + ')' : '(you left these blank, so nothing extra is sent)';
    box.disabled = !parts.length;
    if (!parts.length) box.checked = false;
  }
  var RETRY_MSG = 'We couldn\'t reach the server. Check your connection and try again.';
  function submitSignup(e) {
    e.preventDefault();
    var value = $('#su-email').value.trim();
    if (!signupValid()) {
      showEmailError(emailErrorText(value));
      return;
    }
    clearEmailError();
    if (!turnstileToken) { setStatus('#su-status', 'One moment: the spam check is still loading. Try again in a few seconds.', true); loadTurnstile(); return; }
    var share = $('#su-share').checked;
    var marketing = $('#su-consent').checked;
    var body = {
      email: value,
      first_name: $('#su-first').value.trim(),
      marketing_consent: marketing,
      share_profile: share,
      turnstile_token: turnstileToken
    };
    if (marketing) body.consent_version = CFG.consentVersion;
    if (share) { var p = profileForShare(); body.role = p.role; body.industry = p.industry; }
    var btn = $('#su-submit');
    btn.disabled = true;
    setStatus('#su-status', 'Checking...');
    fetch(CFG.subscribeEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin'
    }).then(function (res) {
      if (res.ok) return res.json().then(function (j) {
        if (!j || j.ok !== true) throw new Error('bad response');
        state.subscribed = true;
        $('#su-status').textContent = '';
        showOptinSuccess();
        announce("Thanks, you're on the list.");
      });
      var msg = res.status === 429 ? 'Too many tries. Please wait a few minutes and try again.'
        : res.status === 403 ? 'The spam check didn\'t pass. Please try again.'
        : res.status === 400 ? 'Please check your email address and try again.'
        : 'Something went wrong on our side. Please try again in a minute.';
      setStatus('#su-status', msg, true);
    }).catch(function () {
      setStatus('#su-status', RETRY_MSG, true);
    }).then(function () {
      turnstileToken = '';
      if (window.turnstile && turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
      btn.disabled = false;
    });
  }

  /* ---------- Wiring ---------- */
  function restart() {
    state.answers = { role: '', industry: '', location: '', tasks: [], otherTasks: '', tools: [], otherTool: '', goals: [], briefingTime: '08:00', briefingDays: 'weekdays', digestFreq: 'weekly', digestDays: ['Monday'], extraAskFirst: ['delete'], usageSaver: false };
    state.bots = []; state.allBots = []; state.allCustom = []; state.botsKey = '';
    state.templates = []; state.allTemplates = []; state.subscribed = false;
    state.smartBots = []; state.smartTemplates = []; state.smartIncluded = true; state.smartMessage = '';
    setPromptText(''); $('#checklist').textContent = '';
    $('#signup-form').reset(); $('#su-status').textContent = '';
    clearEmailError(); showOptinForm();
    syncControlsFromState();
    ['role', 'industry', 'location', 'otherTasks', 'otherTool'].forEach(secretWarn);
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    goScreen(0);
  }

  function init() {
    applyBrand();
    if (!$('#signup-form')) return;
    $('#su-consent-text').textContent = CFG.consentText;
    buildControls();
    if (location.hash.length > 1) {
      var s = L.decodeState(location.hash);
      Object.keys(s).forEach(function (k) { state.answers[k] = s[k]; });
    }
    syncControlsFromState();

    if ($('#smart-form')) $('#smart-form').addEventListener('submit', submitSmart);
    if ($('#smart-include')) $('#smart-include').addEventListener('change', function (e) {
      state.smartIncluded = !!e.target.checked;
      renderReview();
      announce(state.smartIncluded ? 'Smart suggestions are included in your team.' : 'Smart suggestions turned off. Your regular team is unchanged.');
    });
    document.addEventListener('change', onChange);
    document.addEventListener('input', function (e) {
      onInput(e);
      var r = e.target.getAttribute && e.target.getAttribute('data-rename');
      if (r) {
        var b = state.bots.find(function (x) { return x.id === r; }) || (state.smartBots || []).find(function (x) { return x.id === r; });
        if (b) b.name = e.target.value;
      }
    });
    var tog = $('#toggle-prompt');
    if (tog) {
      tog.addEventListener('click', function () {
        var pre = $('#prompt-out');
        if (!pre) return;
        var open = pre.classList.toggle('is-open');
        tog.textContent = open ? 'Show less' : 'Show full prompt';
      });
    }
    var howto = $('#howto-video');
    var playBtn = $('#watch-play');
    var watch = $('.watch');
    if (howto && playBtn) {
      playBtn.addEventListener('click', function () {
        var play = howto.play();
        if (play && play.catch) play.catch(function () {});
        if (watch) watch.classList.add('is-playing');
      });
      howto.addEventListener('play', function () { if (watch) watch.classList.add('is-playing'); });
      howto.addEventListener('ended', function () {
        if (watch) watch.classList.remove('is-playing');
        howto.currentTime = 0;
      });
    }
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-action],[data-remove],[data-remove-template],[data-add-bot]');
      if (!t) return;
      var rm = t.getAttribute('data-remove');
      if (rm) return removeBot(rm);
      var rmt = t.getAttribute('data-remove-template');
      if (rmt) return removeTemplate(rmt);
      var add = t.getAttribute('data-add-bot');
      if (add) return addOverflowBot(add);
      switch (t.getAttribute('data-action')) {
        case 'start': return goScreen(1);
        case 'next':
          return goScreen(Math.min(SCREENS.length - 1, state.screen + 1));
        case 'back':
          if (SCREENS[state.screen].key === '5') return goScreen(screenIndex('4'));
          return goScreen(Math.max(0, state.screen - 1));
        case 'restore': return restoreBots();
        case 'restore-templates': return restoreTemplates();
        case 'copy': return copyText(promptText(), 'Prompt copied. Paste it into your first bot.');
        case 'download': return download();
        case 'share': updateHash(); return copyText(location.href, 'Share link copied. It includes your selections only, never anything you typed.');
        case 'restart': return restart();
      }
    });
    var form = $('#signup-form');
    form.addEventListener('input', updateSignup);
    form.addEventListener('change', updateSignup);
    form.addEventListener('submit', submitSignup);
    $('#su-email').addEventListener('blur', function () {
      var v = this.value.trim();
      this.setAttribute('aria-invalid', v && !EMAIL_RE.test(v) ? 'true' : 'false');
    });
    goScreen(0, { initial: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
