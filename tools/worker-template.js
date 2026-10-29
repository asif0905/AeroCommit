// AeroCommit flight relay for Cloudflare Workers (free plan is enough).
// Lets a hosted copy of AeroCommit, such as a published link, show live flights.
//
// Deploy: dash.cloudflare.com → Workers & Pages → Create → "Hello World" worker → Edit code →
// paste this file → Deploy. Copy the worker URL (https://<name>.<account>.workers.dev) into
// Live Flights → "Relay URL" in AeroCommit. Requests are cached for 10 seconds per area.
//
// Optional: set ALLOWED_ORIGINS (comma-separated) under Settings → Variables to restrict which
// sites may use the relay. Without it any site can call it.
//
// Feeds: FLIGHT_FEEDS (default "adsblol,airplaneslive"). airplanes.live's free API is for
// non-commercial use only, so a commercial deployment should set FLIGHT_FEEDS=adsblol unless
// airplanes.live has given permission. Calls to airplanes.live are spaced 1 second apart.

/*RELAY*/

const relays = new Map();
const relayFor = spec => { const key = spec || DEFAULT_FEEDS; if (!relays.has(key)) relays.set(key, createRelay({upstreams: feedsFrom(key)})); return relays.get(key); };

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env?.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowOrigin = !allowed.length ? '*' : allowed.includes(origin) ? origin : null;
    const cors = allowOrigin ? {'Access-Control-Allow-Origin': allowOrigin, 'Vary': 'Origin'} : {};
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400'}});
    if (request.method !== 'GET') return new Response('Method not allowed', {status: 405, headers: cors});
    if (allowed.length && !allowOrigin) return new Response('Origin not allowed', {status: 403});
    const out = await relayFor(env?.FLIGHT_FEEDS)(new URL(request.url).searchParams);
    return new Response(JSON.stringify(out.body), {status: out.status, headers: {...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
  }
};
