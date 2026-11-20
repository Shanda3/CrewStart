/*
 * Crewstart Worker entry. Runs only for /api/* and /admin/* (run_worker_first);
 * everything else is static assets. See src/handlers.js for the logic.
 * Workers entry modules may only export handlers, so all named exports live in handlers.js.
 */
import { handleSubscribe, handleSmart } from './handlers.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/subscribe') return handleSubscribe(request, env);
    if (pathname === '/api/smart') return handleSmart(request, env);
    // /admin/* (including /admin/export.csv) is intentionally disabled: 404, no data.
    if (pathname.startsWith('/api/') || pathname.startsWith('/admin/')) {
      return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return env.ASSETS.fetch(request);
  }
};
