/*
 * Runtime config (no secrets here: the Turnstile SITE key is public by design).
 *
 * The production widget (hostnames crewstart.ai and www.crewstart.ai) uses the
 * real site key. Local dev, previews, and tests run on localhost / 127.0.0.1
 * and must keep Cloudflare's official always-pass test site key.
 */
(function (root) {
  var TEST_SITE_KEY = '1x00000000000000000000AA';
  var PROD_SITE_KEY = '0x4AAAAAAGKlQIcVkmPM3-Z2';

  function turnstileSiteKeyFor(hostname) {
    var host = String(hostname || '').toLowerCase();
    if (host === 'crewstart.ai' || host === 'www.crewstart.ai') return PROD_SITE_KEY;
    return TEST_SITE_KEY;
  }

  var hostname = (typeof location !== 'undefined' && location.hostname) ? location.hostname : '';

  root.APP_CONFIG = {
    turnstileSiteKey: turnstileSiteKeyFor(hostname),
    turnstileSiteKeyFor: turnstileSiteKeyFor,
    subscribeEndpoint: '/api/subscribe',
    smartEndpoint: '/api/smart',
    // Must match CONSENT_VERSION / CONSENT_TEXT in src/worker.js (server is the source of truth).
    consentVersion: '2026-11-20-v1',
    consentText: "Yes, email me occasional AI tips and updates about Shanda Biggs's AI consulting. Unsubscribe anytime.",
    // Public profile links. An empty SOCIAL.x hides the X link.
    // SOCIAL.grokSignup is the official Grok Bot page; swap in a referral URL later if one exists.
    SOCIAL: {
      linkedin: 'https://www.linkedin.com/in/shanda-biggs',
      x: 'https://x.com/BiggsShanda',
      grokSignup: 'https://x.ai/bot'
    }
  };
})(typeof self !== 'undefined' ? self : this);
