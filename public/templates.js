/*
 * Curated Grok Bot templates. Names are the catalog listings (verified list, November 20, 2026).
 * No grokbot:// links: they will not open from a browser.
 * Works in the browser (window.CrewstartTemplates) and in Node (require('./templates.js')).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrewstartTemplates = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EGGBOT_ID = 'eggbot';
  var EGGBOT_REASON = 'For adding more bots later, after this team is set up.';

  /* tags use questionnaire ids (tasks, tools, goals) and lowercase role keywords. */
  var CATALOG = [
    { id: EGGBOT_ID, name: 'Dr. Eggbot', catalogName: 'dr eggbot', always: true, reason: EGGBOT_REASON, roles: [], tasks: [], tools: [], goals: [] },
    { id: 'inbox-manager', name: 'Inbox Manager', reason: 'It sorts your inbox and drafts replies for you to approve.', roles: [], tasks: ['email'], tools: ['gmail', 'outlook'], goals: [] },
    { id: 'calendar-coordinator', name: 'Calendar Coordinator', reason: 'It keeps your calendar organized and helps you find a time to meet.', roles: [], tasks: ['scheduling'], tools: ['gcal', 'outlook'], goals: ['family'] },
    { id: 'chief-of-staff', name: 'Chief of Staff', reason: 'It sends a short readout of what matters today across your tools.', roles: ['founder', 'owner', 'chief', 'manager', 'operations', 'director'], tasks: ['email', 'scheduling', 'reports'], tools: ['slack', 'gmail', 'gcal'], goals: [] },
    { id: 'executive-assistant', name: 'Executive Assistant', reason: 'It helps with email, scheduling, and the day’s details, and asks before acting.', roles: ['executive', 'assistant', 'founder', 'owner', 'manager', 'ceo'], tasks: ['email', 'scheduling'], tools: ['gmail', 'outlook', 'gcal'], goals: [] },
    { id: 'daily-briefing-writer', name: 'Daily Briefing Writer', reason: 'It writes a short morning brief of what you need to know today.', roles: [], tasks: ['reports', 'email'], tools: [], goals: [] },
    { id: 'meeting-prep-buddy', name: 'Meeting Prep Buddy', reason: 'It builds a short brief before meetings and captures notes afterward.', roles: [], tasks: ['meetings'], tools: ['gcal', 'outlook'], goals: [] },
    { id: 'sales-outbound', name: 'Sales Outbound', reason: 'It helps you follow up with leads and draft outreach for you to approve.', roles: ['sales', 'account executive', 'account manager', 'business development'], tasks: ['new-business'], tools: ['crm'], goals: [] },
    { id: 'social-media-manager', name: 'Social Media Manager', reason: 'It drafts posts in your voice and waits for your approval before anything goes out.', roles: ['marketing', 'social', 'communications', 'content'], tasks: ['writing'], tools: [], goals: [] },
    { id: 'newsletter-writer', name: 'Newsletter Writer', reason: 'It drafts newsletter copy in your voice for you to review and send.', roles: ['marketing', 'communications', 'writer', 'content'], tasks: ['writing'], tools: [], goals: [] },
    { id: 'expense-manager', name: 'Expense Manager', reason: 'It helps you track spending and bills, and never pays anything without your OK.', roles: ['finance', 'accountant', 'bookkeeper', 'operations'], tasks: [], tools: [], goals: ['finances'] },
    { id: 'invoice-coordinator', name: 'Invoice Coordinator', reason: 'It helps you track invoices and follow up on unpaid bills, with your approval.', roles: ['finance', 'accountant', 'bookkeeper'], tasks: ['customers'], tools: [], goals: [] },
    { id: 'hiring-screener', name: 'Hiring Screener', reason: 'It helps you review applicants and draft screening notes for your review.', roles: ['recruiter', 'recruiting', 'hiring', 'talent', 'hr', 'people'], tasks: ['hiring'], tools: [], goals: [] },
    { id: 'recruiting-coordinator', name: 'Recruiting Coordinator', reason: 'It helps you schedule interviews and keep candidates moving, with your approval.', roles: ['recruiter', 'recruiting', 'hiring', 'talent', 'hr', 'people'], tasks: ['hiring', 'scheduling'], tools: ['gcal', 'outlook'], goals: [] },
    { id: 'travel-coordinator', name: 'Travel Coordinator', reason: 'It researches trips and itineraries and never books without your approval.', roles: [], tasks: [], tools: [], goals: ['travel'] },
    { id: 'subscription-cleaner', name: 'Subscription Cleaner', reason: 'It helps you find unused subscriptions so you can decide what to cancel.', roles: [], tasks: [], tools: [], goals: ['finances'] },
    { id: 'gift-concierge', name: 'Gift Concierge', reason: 'It helps you remember occasions and suggest gifts, and never buys without your OK.', roles: [], tasks: [], tools: [], goals: ['family', 'errands'] },
    { id: 'crm-operations-manager', name: 'CRM Operations Manager', reason: 'It helps you keep contacts and deals in order and asks before changing records.', roles: ['operations', 'sales', 'revops', 'revenue'], tasks: ['customers'], tools: ['crm'], goals: [] },
    { id: 'status-report-writer', name: 'Status Report Writer', reason: 'It drafts status updates from your work so you can review and send them.', roles: ['manager', 'project', 'operations'], tasks: ['reports', 'projects'], tools: [], goals: [] },
    { id: 'personal-site-builder', name: 'Personal Site Builder', reason: 'It helps you plan and draft pages for a personal or portfolio site.', roles: ['designer', 'developer', 'engineer', 'marketer', 'founder'], tasks: ['writing'], tools: ['github', 'gdrive', 'notion'], goals: [] },
    { id: 'presentation-designer', name: 'Presentation Designer', reason: 'It helps you outline and draft slides for meetings and reviews.', roles: [], tasks: ['meetings', 'writing', 'reports'], tools: ['gdrive', 'notion'], goals: [] },
    { id: 'ticket-triage-specialist', name: 'Ticket Triage Specialist', reason: 'It helps you sort incoming requests and suggest what to handle first.', roles: ['support', 'customer success', 'operations', 'it'], tasks: ['customers', 'projects'], tools: ['linear', 'slack'], goals: [] },
    { id: 'contract-desk', name: 'Contract Desk', reason: 'It helps you review and organize contracts and flags items for your review.', roles: ['legal', 'counsel'], tasks: ['writing'], tools: ['gdrive', 'notion'], goals: [] },
    { id: 'researchy', name: 'Researchy', reason: 'It researches topics, competitors, or leads and sends a short digest with sources.', roles: [], tasks: ['research'], tools: [], goals: ['learning'] },
    { id: 'order-concierge', name: 'Order Concierge', reason: 'It helps you plan orders and purchases, and never buys without your approval.', roles: [], tasks: [], tools: [], goals: ['meals', 'errands'] }
  ];

  return { EGGBOT_ID: EGGBOT_ID, EGGBOT_REASON: EGGBOT_REASON, CATALOG: CATALOG };
});
