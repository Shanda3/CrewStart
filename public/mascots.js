/* Crewstart mascots. Neutral SVGs are inlined (same-origin, no external requests).
 * Happy is the same round sparkle eyes, just larger (--cs-mascot motion CSS .is-happy).
 * Official mascot-motion.js is not loaded: it toggles mockup .chip controls and would
 * fight the app's native checkboxes. Blink, glance, hop, and celebrate are reimplemented here.
 * All mascots are decorative (aria-hidden). Motion honors prefers-reduced-motion.
 */
(function () {
  var SVG = {
    berry: "<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"mascot m-berry \" viewBox=\"0 0 120 120\" role=\"img\" aria-label=\"Berry, neutral\"><defs><radialGradient id=\"g-berry-1\" cx=\"38%\" cy=\"30%\" r=\"80%\"><stop offset=\"0\" stop-color=\"#FF6B9C\"/><stop offset=\"1\" stop-color=\"#E0115F\"/></radialGradient></defs><ellipse class=\"shadow\" cx=\"60\" cy=\"112\" rx=\"30\" ry=\"4.5\" fill=\"#000\" opacity=\".28\"/><g class=\"bodywrap\"><g class=\"pose\"><g class=\"body\"><path class=\"tuft\" d=\"M60 33 C 57 22, 66 16, 72 20 C 66 20, 63 25, 64 32\" fill=\"#0FA898\"/><ellipse class=\"body-shape\" cx=\"60\" cy=\"68\" rx=\"38\" ry=\"36\" fill=\"url(#g-berry-1)\"/><ellipse cx=\"46\" cy=\"50\" rx=\"10\" ry=\"6\" fill=\"#fff\" opacity=\".35\" transform=\"rotate(-25 46 50)\"/><g class=\"eyes\"><g class=\"eye\" style=\"transform-origin:46px 72px\"><g class=\"pupil\"><g class=\"eyeball\"><ellipse cx=\"46\" cy=\"72\" rx=\"6.60\" ry=\"8.20\" fill=\"#1A0A11\"/><circle class=\"glint\" cx=\"48.10\" cy=\"68.70\" r=\"2.40\" fill=\"#fff\"/><circle class=\"glint g2\" cx=\"43.80\" cy=\"75.00\" r=\"1.10\" fill=\"#fff\" opacity=\"0.85\"/></g></g></g><g class=\"eye\" style=\"transform-origin:74px 72px\"><g class=\"pupil\"><g class=\"eyeball\"><ellipse cx=\"74\" cy=\"72\" rx=\"6.60\" ry=\"8.20\" fill=\"#1A0A11\"/><circle class=\"glint\" cx=\"76.10\" cy=\"68.70\" r=\"2.40\" fill=\"#fff\"/><circle class=\"glint g2\" cx=\"71.80\" cy=\"75.00\" r=\"1.10\" fill=\"#fff\" opacity=\"0.85\"/></g></g></g></g></g></g></g></svg>",
    puddle: "<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"mascot m-puddle \" viewBox=\"0 0 120 120\" role=\"img\" aria-label=\"Puddle, neutral\"><defs><radialGradient id=\"g-puddle-4\" cx=\"38%\" cy=\"30%\" r=\"80%\"><stop offset=\"0\" stop-color=\"#8AF5E8\"/><stop offset=\"1\" stop-color=\"#14D9C4\"/></radialGradient></defs><ellipse class=\"shadow\" cx=\"60\" cy=\"112\" rx=\"30\" ry=\"4.5\" fill=\"#000\" opacity=\".28\"/><g class=\"bodywrap\"><g class=\"pose\"><g class=\"body\"><path class=\"body-shape\" d=\"M60 38 C 92 38, 108 58, 106 82 C 104 100, 86 106, 60 106 C 34 106, 16 100, 14 82 C 12 58, 28 38, 60 38 Z\" fill=\"url(#g-puddle-4)\"/><ellipse cx=\"42\" cy=\"52\" rx=\"11\" ry=\"6\" fill=\"#fff\" opacity=\".35\" transform=\"rotate(-25 42 52)\"/><g class=\"eyes\"><g class=\"eye\" style=\"transform-origin:45px 76px\"><g class=\"pupil\"><g class=\"eyeball\"><ellipse cx=\"45\" cy=\"76\" rx=\"6.60\" ry=\"8.20\" fill=\"#1A0A11\"/><circle class=\"glint\" cx=\"47.10\" cy=\"72.70\" r=\"2.40\" fill=\"#fff\"/><circle class=\"glint g2\" cx=\"42.80\" cy=\"79.00\" r=\"1.10\" fill=\"#fff\" opacity=\"0.85\"/></g></g></g><g class=\"eye\" style=\"transform-origin:75px 76px\"><g class=\"pupil\"><g class=\"eyeball\"><ellipse cx=\"75\" cy=\"76\" rx=\"6.60\" ry=\"8.20\" fill=\"#1A0A11\"/><circle class=\"glint\" cx=\"77.10\" cy=\"72.70\" r=\"2.40\" fill=\"#fff\"/><circle class=\"glint g2\" cx=\"72.80\" cy=\"79.00\" r=\"1.10\" fill=\"#fff\" opacity=\"0.85\"/></g></g></g></g></g></g></g></svg>",
    honey: "<svg xmlns=\"http://www.w3.org/2000/svg\" class=\"mascot m-honey \" viewBox=\"0 0 120 120\" role=\"img\" aria-label=\"Honey, neutral\"><defs><radialGradient id=\"g-honey-7\" cx=\"38%\" cy=\"30%\" r=\"80%\"><stop offset=\"0\" stop-color=\"#FFD970\"/><stop offset=\"1\" stop-color=\"#FFB730\"/></radialGradient></defs><ellipse class=\"shadow\" cx=\"60\" cy=\"112\" rx=\"30\" ry=\"4.5\" fill=\"#000\" opacity=\".28\"/><g class=\"bodywrap\"><g class=\"pose\"><g class=\"body\"><path class=\"antenna\" d=\"M60 44 C 60 36, 62 30, 66 26\" fill=\"none\" stroke=\"#E9A23B\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><circle class=\"antenna-tip\" cx=\"67\" cy=\"24\" r=\"5\" fill=\"#E0115F\"/><circle class=\"body-shape\" cx=\"60\" cy=\"74\" r=\"30\" fill=\"url(#g-honey-7)\"/><ellipse cx=\"49\" cy=\"60\" rx=\"8\" ry=\"5\" fill=\"#fff\" opacity=\".35\" transform=\"rotate(-25 49 60)\"/><g class=\"eyes\"><g class=\"eye\" style=\"transform-origin:48.5px 78px\"><g class=\"pupil\"><g class=\"eyeball\"><ellipse cx=\"48.5\" cy=\"78\" rx=\"5.81\" ry=\"7.22\" fill=\"#1A0A11\"/><circle class=\"glint\" cx=\"50.35\" cy=\"75.10\" r=\"2.11\" fill=\"#fff\"/><circle class=\"glint g2\" cx=\"46.56\" cy=\"80.64\" r=\"0.97\" fill=\"#fff\" opacity=\"0.85\"/></g></g></g><g class=\"eye\" style=\"transform-origin:71.5px 78px\"><g class=\"pupil\"><g class=\"eyeball\"><ellipse cx=\"71.5\" cy=\"78\" rx=\"5.81\" ry=\"7.22\" fill=\"#1A0A11\"/><circle class=\"glint\" cx=\"73.35\" cy=\"75.10\" r=\"2.11\" fill=\"#fff\"/><circle class=\"glint g2\" cx=\"69.56\" cy=\"80.64\" r=\"0.97\" fill=\"#fff\" opacity=\"0.85\"/></g></g></g></g></g></g></g></svg>"
  };

  function stamp(svg, suffix) {
    return svg
      .replace(/\srole="img"/g, '')
      .replace(/\saria-label="[^"]*"/g, '')
      .replace(/\sstyle="[^"]*"/g, '')
      .replace(/<svg\b/, '<svg aria-hidden="true" focusable="false"')
      .replace(/id="(g-[^"]+)"/g, 'id="$1-' + suffix + '"')
      .replace(/url\(#(g-[^)]+)\)/g, 'url(#$1-' + suffix + ')');
  }
  function trio(suffix) {
    return stamp(SVG.berry, suffix + '-b') + stamp(SVG.puddle, suffix + '-p') + stamp(SVG.honey, suffix + '-h');
  }
  function fill(sel, suffix) {
    var n = document.querySelector(sel);
    if (!n) return null;
    n.innerHTML = trio(suffix);
    n.removeAttribute('hidden');
    return n;
  }

  fill('[data-mascot-slot].perch-top', 'land');
  fill('[data-mascot-slot].perch', 'perch');
  fill('[data-mascot-slot].mini-trio', 'mini');
  var ready = fill('[data-mascot-slot].ready-trio', 'ready');
  if (ready) ready.querySelectorAll('.mascot').forEach(function (m) { m.classList.add('is-happy'); });

  function list(root) { return Array.prototype.slice.call((root || document).querySelectorAll('.mascot')); }
  function visible(m) {
    var r = m.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  window.csSetMascotMood = function (mood) {
    var happy = mood === 'happy';
    var perch = document.querySelector('.perch');
    if (perch) perch.classList.toggle('happy', happy);
    list(document.querySelector('.perch')).concat(list(document.querySelector('.mini-trio'))).forEach(function (m) {
      m.classList.toggle('is-happy', happy);
      if (!happy) m.classList.remove('celebrate', 'hop', 'blink');
    });
  };

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  list().forEach(function (m) {
    (function loop() {
      setTimeout(function () {
        if (!m.classList.contains('is-happy')) {
          m.classList.add('blink');
          setTimeout(function () { m.classList.remove('blink'); }, 130);
        }
        loop();
      }, 2200 + Math.random() * 3800);
    })();
    m.addEventListener('animationend', function (e) {
      if (e.animationName === 'cs-hop') m.classList.remove('hop');
      if (e.animationName === 'cs-celebrate') m.classList.remove('celebrate');
    });
  });

  function look(el) {
    list().forEach(function (m) {
      if (m.closest('[data-track-zone]')) return;
      var e = m.querySelector('.eyes');
      if (!e || !visible(m)) return;
      if (!el) { e.removeAttribute('transform'); return; }
      var a = m.getBoundingClientRect(), b = el.getBoundingClientRect();
      var dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      var dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      var d = Math.hypot(dx, dy) || 1;
      e.setAttribute('transform', 'translate(' + (dx / d * 3.5).toFixed(2) + ' ' + (dy / d * 3).toFixed(2) + ')');
    });
  }
  window.csLook = look;
  document.addEventListener('focusin', function (ev) {
    if (ev.target.matches('input,select,textarea,button,.check')) look(ev.target);
  });
  document.addEventListener('mouseover', function (ev) {
    var t = ev.target.closest && ev.target.closest('.check,input,select,.btn');
    if (t) look(t);
  });
  document.addEventListener('focusout', function () { look(null); });

  window.csHop = function () {
    list().filter(visible).forEach(function (m, i) {
      setTimeout(function () {
        m.classList.remove('hop');
        void m.getBoundingClientRect();
        m.classList.add('hop');
      }, i * 70);
    });
  };
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t && t.matches && t.matches('.check input[type="checkbox"]') && t.checked && !t.disabled && window.csHop) window.csHop();
  });

  window.csCelebrate = function () {
    var targets = list(document.querySelector('.perch')).concat(list(document.querySelector('.mini-trio')));
    targets.forEach(function (m, i) {
      m.classList.add('is-happy');
      setTimeout(function () {
        m.classList.remove('celebrate');
        void m.getBoundingClientRect();
        m.classList.add('celebrate');
      }, i * 90);
    });
  };
})();
