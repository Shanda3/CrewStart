// Writes sample-prompt.txt for the small business owner persona (used for the live-bot test).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const L = createRequire(import.meta.url)('../public/logic.js');
const smallBiz = {
  role: 'Owner', industry: 'Home bakery and catering',
  tasks: ['email', 'scheduling', 'customers', 'writing', 'research'],
  tools: ['gmail', 'gcal', 'crm'], goals: ['meals', 'finances'],
  briefingTime: '07:30', digestDay: 'Monday', extraAskFirst: ['delete']
};
const prompt = L.buildPrompt(smallBiz, L.recommend(smallBiz), L.suggestTemplates(smallBiz));
writeFileSync(new URL('../sample-prompt.txt', import.meta.url), prompt + '\n');
console.log(prompt);
