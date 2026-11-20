// Checks WCAG contrast for the theme token pairs the UI actually uses.
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../public/theme.css', import.meta.url), 'utf8');
const v = Object.fromEntries([...css.matchAll(/--(cs-color-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(v[a]), lum(v[b])].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [
  ['text', 'bg', 4.5], ['text', 'surface', 4.5], ['text', 'surface-alt', 4.5], ['text', 'accent-bg', 4.5], ['text', 'warning-bg', 4.5], ['text', 'locked-bg', 4.5],
  ['text-muted', 'bg', 4.5], ['text-muted', 'surface', 4.5], ['text-muted', 'surface-alt', 4.5],
  ['accent', 'bg', 4.5], ['accent', 'surface', 4.5], ['on-accent', 'accent-fill', 4.5], ['on-accent', 'accent-fill-hover', 4.5], ['accent', 'accent-bg', 4.5], ['accent', 'surface-alt', 4.5],
  ['warning', 'warning-bg', 4.5], ['warning', 'surface', 4.5], ['success', 'surface', 4.5], ['success', 'bg', 4.5], ['success', 'locked-bg', 4.5],
  ['required', 'required-bg', 4.5], ['required', 'surface', 4.5], ['optional', 'optional-bg', 4.5],
  ['border', 'surface', 3], ['focus', 'bg', 3], ['focus', 'surface', 3], ['accent', 'accent-bg', 3]
];
let bad = 0;
for (const [f, b, min] of pairs) {
  const r = ratio('cs-color-' + f, 'cs-color-' + b);
  if (r < min) bad++;
  console.log(`${r >= min ? 'ok  ' : 'FAIL'} ${f} on ${b}: ${r.toFixed(2)} (min ${min})`);
}
process.exit(bad ? 1 : 0);
