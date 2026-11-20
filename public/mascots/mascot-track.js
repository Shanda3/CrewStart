/* Crewstart mascot tracking + reactions. Vanilla, no dependencies.
 * Pupils follow the pointer, the body leans toward it, and hover or tap plays a one-shot reaction.
 * Markup: <svg class="mascot m-berry|m-puddle|m-honey" viewBox="0 0 120 120"> with
 *   one g.body (pivot: bottom center, transform-box: fill-box) and one g.pupil per eye.
 * Usage: <div data-track-zone> ...mascots... </div>, or document-wide if no zone is marked.
 */
(function () {
  'use strict';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (mq && mq.matches) return;                       // reduced motion: everything stays static

  var MAX_X = 5, MAX_Y = 4;     // pupil travel, viewBox units (120-unit canvas)
  var MAX_TILT = 6;             // body lean, degrees
  var REACH = 360;              // px from a mascot's center where travel and tilt reach their max
  var LERP = 0.18;              // smoothing per animation frame (about 60 fps)
  var REACT = { 'm-berry': ['react-bounce', 560], 'm-puddle': ['react-squish', 720], 'm-honey': ['react-wave', 760] };

  var zone = document.querySelector('[data-track-zone]') || document.documentElement;
  var list = [].slice.call(zone.querySelectorAll('svg.mascot')).map(function (svg) {
    return { svg: svg, body: svg.querySelector('.body'), pupils: [].slice.call(svg.querySelectorAll('.pupil')),
             x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0 };
  }).filter(function (m) { return m.body && m.pupils.length; });
  if (!list.length) return;
  window.csTracking = true;                           // turns off the focus glance so travel never stacks

  var pointer = null, frame = 0;


  function pivot(el) {
    if (!el._csPivot) {
      try {
        var b = el.getBBox();
        el._csPivot = { x: b.x + b.width / 2, y: b.y + b.height };
      } catch (err) {
        el._csPivot = { x: 60, y: 108 };
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

  function aim() {
    list.forEach(function (m) {
      if (!pointer) { m.tx = m.ty = m.tr = 0; return; }          // return to center
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
    list.forEach(function (m) {
      m.x += (m.tx - m.x) * LERP; m.y += (m.ty - m.y) * LERP; m.r += (m.tr - m.r) * LERP;
      if (Math.abs(m.tx - m.x) > 0.01 || Math.abs(m.ty - m.y) > 0.01 || Math.abs(m.tr - m.r) > 0.01) moving = true;
      applyLook(m);
    });
    if (moving) frame = requestAnimationFrame(tick);            // stops once settled
  }
  function wake() { if (!frame) frame = requestAnimationFrame(tick); }

  zone.addEventListener('pointermove', function (e) { pointer = { x: e.clientX, y: e.clientY }; wake(); }, { passive: true });
  zone.addEventListener('pointerleave', function () { pointer = null; wake(); });
  window.addEventListener('blur', function () { pointer = null; wake(); });

  function react(m, e) {
    var svg = m.svg, key = Object.keys(REACT).filter(function (c) { return svg.classList.contains(c); })[0];
    if (!key || svg.classList.contains('react')) return;     // one shot; ignore re-triggers while playing
    if (e && e.pointerType !== 'mouse') {                      // touch or pen tap: a brief look at the tap point
      pointer = { x: e.clientX, y: e.clientY }; wake();
      setTimeout(function () { pointer = null; wake(); }, 900);
    }
    svg.classList.add('blink');
    setTimeout(function () { svg.classList.remove('blink'); }, 130);
    svg.classList.add('react', REACT[key][0]);
    setTimeout(function () { svg.classList.remove('react', REACT[key][0]); }, REACT[key][1]);
  }
  list.forEach(function (m) {
    m.svg.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') react(m, e); });
    m.svg.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') react(m, e); });
  });
  window.csReact = function (name) { list.forEach(function (m) { if (m.svg.classList.contains('m-' + name)) react(m); }); };

  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) {
    if (!e.matches) return;
    pointer = null;
    list.forEach(function (m) { m.x = m.y = m.r = 0; clearLook(m); });
  });
})();
