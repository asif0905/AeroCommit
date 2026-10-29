// Vercel serverless function: live flight relay for the hosted site (GET /api/flights?lat=&lon=&km=).
// Same relay as `npm start` and the Cloudflare Worker, so the Live Flights tab on aerocommit.com
// shows real aircraft instead of simulated traffic.
//
// Feeds default to adsb.lol only (ODbL 1.0, commercial use allowed with attribution), because the
// public site is AeroCommit's commercial face. airplanes.live's free API is for non-commercial use;
// add it only with permission, by setting the Vercel environment variable FLIGHT_FEEDS=adsblol,airplaneslive.
import {createRelay, feedsFrom} from '../relay.mjs';

const relays = new Map();
function relayFor(spec) {
  const key = spec || 'adsblol';
  if (!relays.has(key)) relays.set(key, createRelay({upstreams: feedsFrom(key)}));
  return relays.get(key);
}

export async function GET(request) {
  const out = await relayFor(process.env.FLIGHT_FEEDS)(new URL(request.url).searchParams);
  return new Response(JSON.stringify(out.body), {
    status: out.status,
    // Let Vercel's edge cache share one answer per area for 10 s across all visitors.
    headers: {'Content-Type': 'application/json', 'Cache-Control': out.status === 200 ? 'public, s-maxage=10, stale-while-revalidate=5' : 'no-store'}
  });
}
