/*
 * Brand config: the ONE place for the product name, tagline, logo, and disclaimer.
 * Rename = change APP_NAME below (plus "name" in wrangler.jsonc for the Workers project).
 * Colors, fonts, radii, and spacing live in theme.css.
 */
(function () {
  var APP_NAME = 'Crewstart';

  window.BRAND = {
    name: APP_NAME,
    tagline: APP_NAME + ': a team builder for your Grok Bot',
    title: APP_NAME + ': build your bot team',
    // Official symbol (ruby tile, pale-pink crew nodes, white start triangle). Decorative; colors are fixed.
    logoSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="32" height="32" aria-hidden="true" focusable="false">' +
      '<rect width="64" height="64" rx="17" fill="#E0115F"/>' +
      '<path d="M48.26 40.83A18.5 18.5 0 0 1 31.51 50.49" fill="none" stroke="#FFD9E6" stroke-width="4.2" stroke-linecap="round" opacity="0.5"/>' +
      '<path d="M16.23 41.67A18.5 18.5 0 0 1 16.23 22.33" fill="none" stroke="#FFD9E6" stroke-width="4.2" stroke-linecap="round" opacity="0.5"/>' +
      '<path d="M31.51 13.51A18.5 18.5 0 0 1 48.26 23.17" fill="none" stroke="#FFD9E6" stroke-width="4.2" stroke-linecap="round" opacity="0.5"/>' +
      '<circle cx="50.50" cy="32.00" r="5.6" fill="#FFD9E6"/>' +
      '<circle cx="22.75" cy="48.02" r="5.6" fill="#FFD9E6"/>' +
      '<circle cx="22.75" cy="15.98" r="5.6" fill="#FFD9E6"/>' +
      '<path d="M41.40 32.00 L29.10 39.10 L29.10 24.90Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="3.4" stroke-linejoin="round"/>' +
      '</svg>',
    disclaimer: 'Unofficial community tool. Not affiliated with xAI, Grok, or Cursor.',
    // e.g. "crewstart-setup-prompt-2026-11-20.txt"
    downloadPrefix: APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-setup-prompt'
  };
})();
