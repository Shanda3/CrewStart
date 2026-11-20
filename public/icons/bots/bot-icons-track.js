/* Crewstart bot-icon tracking + hover reactions. Vanilla, no dependencies.
 * Markup: svg.bot-icon viewBox 0 0 40 40, with g.body and one g.pupil per eye.
 * Tracking runs only inside [data-track-zone] that contains the icon.
 * Call window.csInitBotIcons() after icons are rendered (output is built later).
 * Reduced motion: the script exits before attaching anything.
 */
(function () {
  'use strict';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq && mq.matches) return;

  var MAX_X = 3, MAX_Y = 2.5;
  var MAX_TILT = 5;
  var REACH = 240;
  var LERP = 0.18;
  var HOP_MS = 560;
  var BLINK_MS = 130;
  var TAP_LOOK_MS = 900;

  var icons = [];
  var zonesBound = false;
  var pointer = null, frame = 0, activeZone = null;


  function pivot(el) {
    if (!el._csPivot) {
      try {
        var b = el.getBBox();
        el._csPivot = { x: b.x + b.width / 2, y: b.y + b.height };
      } catch (err) {
        el._csPivot = { x: 20, y: 40 };
      }
    }
    return el._csPivot;
  }
  function applyLook(m) {
    var t = 'translate(' + m.x.toFixed(2) + ' ' + m.y.toFixed(2) + ')';
    m.pupils.forEach(function (p) { p.setAttribute('transform', t); });
    var pv = pivot(m.body);
    m.body.setAttribute('transform', 'rotate(' + m.r.toFixed(2) + ' ' + pv.x + ' ' + pv.y + ')');
  }
  function clearLook(m) {
    m.pupils.forEach(function (p) { p.removeAttribute('transform'); });
    m.body.removeAttribute('transform');
  }

  function collect() {
    var seen = {};
    icons = [].slice.call(document.querySelectorAll('svg.bot-icon')).map(function (svg) {
      return {
        svg: svg,
        body: svg.querySelector('.body'),
        pupils: [].slice.call(svg.querySelectorAll('.pupil')),
        x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0
      };
    }).filter(function (m) {
      if (!m.body || !m.pupils.length) return false;
      if (seen[m.svg.getAttribute('data-cs-bot') || ''] && m.svg.getAttribute('data-cs-bot')) return true;
      return true;
    });
  }

  function inZone(el, x, y) {
    var b = el.getBoundingClientRect();
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }

  function aim() {
    var tracking = pointer && activeZone;
    icons.forEach(function (m) {
      if (!tracking || !activeZone.contains(m.svg)) { m.tx = m.ty = m.tr = 0; return; }
      var b = m.svg.getBoundingClientRect();
      var dx = pointer.x - (b.left + b.width / 2), dy = pointer.y - (b.top + b.height / 2);
      var d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(d / REACH, 1);
      m.tx = dx / d * MAX_X * k;
      m.ty = dy / d * MAX_Y * k;
      m.tr = Math.max(-1, Math.min(1, dx / REACH)) * MAX_TILT;
    });
  }

  function tick() {
    frame = 0; aim();
    var moving = false;
    icons.forEach(function (m) {
      m.x += (m.tx - m.x) * LERP; m.y += (m.ty - m.y) * LERP; m.r += (m.tr - m.r) * LERP;
      if (Math.abs(m.tx - m.x) > 0.01 || Math.abs(m.ty - m.y) > 0.01 || Math.abs(m.tr - m.r) > 0.01) moving = true;
      applyLook(m);
    });
    if (moving) frame = requestAnimationFrame(tick);
  }
  function wake() { if (!frame) frame = requestAnimationFrame(tick); }

  function setPointer(e, zone) {
    pointer = { x: e.clientX, y: e.clientY };
    activeZone = zone || null;
    wake();
  }
  function clearPointer() { pointer = null; activeZone = null; wake(); }

  function react(m, e) {
    var svg = m.svg;
    if (svg.classList.contains('react')) return;
    if (e && e.pointerType && e.pointerType !== 'mouse') {
      var zone = e.target && e.target.closest && e.target.closest('[data-track-zone]');
      pointer = { x: e.clientX, y: e.clientY };
      activeZone = zone || activeZone;
      wake();
      setTimeout(function () { clearPointer(); }, TAP_LOOK_MS);
    }
    svg.classList.add('blink');
    setTimeout(function () { svg.classList.remove('blink'); }, BLINK_MS);
    svg.classList.add('react');
    setTimeout(function () { svg.classList.remove('react'); }, HOP_MS);
  }

  function bindHits() {
    icons.forEach(function (m) {
      if (m.svg.getAttribute('data-cs-bot-bound')) return;
      m.svg.setAttribute('data-cs-bot-bound', '1');
      var hit = m.svg.closest('.bot-icon-hit') || m.svg;
      hit.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') react(m, e); });
      hit.addEventListener('focus', function () { react(m); });
      hit.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') react(m, e); });
    });
  }

  function bindZones() {
    if (zonesBound) return;
    zonesBound = true;
    [].slice.call(document.querySelectorAll('[data-track-zone]')).forEach(function (zone) {
      zone.addEventListener('pointermove', function (e) { setPointer(e, zone); }, { passive: true });
      zone.addEventListener('pointerleave', function () { clearPointer(); });
    });
    window.addEventListener('blur', function () { clearPointer(); });
    if (mq && mq.addEventListener) mq.addEventListener('change', function (e) {
      if (!e.matches) return;
      pointer = null; activeZone = null;
      icons.forEach(function (m) {
        m.x = m.y = m.r = 0;
        clearLook(m);
        m.svg.classList.remove('react', 'blink');
      });
    });
  }

  function init() {
    if (mq && mq.matches) return;
    collect();
    bindZones();
    bindHits();
  }

  window.csInitBotIcons = init;
  window.csBotReact = function (name) {
    icons.forEach(function (m) {
      if (m.svg.classList.contains('bot-' + name)) react(m);
    });
  };
})();
