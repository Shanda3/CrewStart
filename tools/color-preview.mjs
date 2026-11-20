import { chromium } from 'playwright-core';
const V = {
  magenta: { a:'#ff4fc3', h:'#ff85d6', bg:'#3a1431' },
  brightteal: { a:'#22e5c7', h:'#6ff2dc', bg:'#0f3530' },
};
const b = await chromium.launch({ executablePath:'/usr/bin/google-chrome', args:['--no-sandbox'] });
for (const [n,c] of Object.entries(V)) {
  const p = await b.newPage({ viewport:{ width:1280, height:800 } });
  await p.goto('http://127.0.0.1:8799/');
  const css = `:root{--cs-color-accent:${c.a}!important;--cs-color-accent-hover:${c.h}!important;--cs-color-accent-bg:${c.bg}!important}`;
  await p.addStyleTag({ content: css });
  await p.screenshot({ path:`shots/color/${n}-landing.png` });
  await p.getByRole('button',{name:'Start'}).click();
  await p.addStyleTag({ content: css });
  await p.waitForTimeout(300);
  await p.screenshot({ path:`shots/color/${n}-step1.png` });
}
await b.close();
