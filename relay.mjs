// Flight-data relay shared by server.mjs (local) and proxy/cloudflare-worker.js (hosted).
// Public ADS-B feeds refuse browser requests from other websites, so the app asks this relay,
// which fetches the feed server-side and answers {source, credit, now, ac} in readsb v2 format.

// Feeds and the terms each is used under. Keep this list in step with the providers' own terms.
//  - adsb.lol: data under the Open Database License (ODbL 1.0), commercial use allowed with attribution.
//  - airplanes.live: free REST API for non-commercial use, rate limited to 1 request per second
//    (https://airplanes.live/api-guide). Leave it out of a commercial deployment unless airplanes.live
//    has given written permission: set FLIGHT_FEEDS=adsblol.
export const FEEDS = {
  adsblol: {url: 'https://api.adsb.lol/v2/point', name: 'adsb.lol', home: 'https://adsb.lol', terms: 'ODbL 1.0', commercial: true, minIntervalMs: 0},
  airplaneslive: {url: 'https://api.airplanes.live/v2/point', name: 'airplanes.live', home: 'https://airplanes.live', terms: 'non-commercial use, 1 request/s', commercial: false, minIntervalMs: 1000}
};
export const DEFAULT_FEEDS = 'adsblol,airplaneslive';

// "adsblol,airplaneslive" → feed objects in that order; unknown names are ignored.
export function feedsFrom(spec = DEFAULT_FEEDS) {
  return String(spec).split(',').map(s => s.trim().toLowerCase()).filter((k, i, a) => FEEDS[k] && a.indexOf(k) === i).map(k => ({id: k, ...FEEDS[k]}));
}
export const DEFAULT_UPSTREAMS = feedsFrom();

const CACHE_MS = 10000, TIMEOUT_MS = 10000, MAX_KM = 463; // feeds cap point queries at 250 nautical miles

// Validate and round the query so equal requests share one cache entry and one upstream call.
export function parseQuery(params) {
  const lat = Number(params.get('lat')), lon = Number(params.get('lon')), km = Number(params.get('km') ?? 150);
  if (![lat, lon, km].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || km < 1 || km > MAX_KM) return null;
  return {lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000, nm: Math.max(1, Math.round(km / 1.852))};
}

// Keep only the fields the app reads; nothing else from the upstream is passed through.
const keep = a => ({hex: a.hex, flight: a.flight, t: a.t, r: a.r, lat: a.lat, lon: a.lon, alt_baro: a.alt_baro, alt_geom: a.alt_geom,
  gs: a.gs, track: a.track, true_heading: a.true_heading, baro_rate: a.baro_rate, geom_rate: a.geom_rate});

// upstreams: feed objects from feedsFrom(), or plain base URLs (no rate limit, credit by host name).
export function createRelay({upstreams = DEFAULT_UPSTREAMS, fetchImpl = globalThis.fetch, now = () => Date.now(),
  sleep = ms => new Promise(r => setTimeout(r, ms))} = {}) {
  const feeds = upstreams.map(u => typeof u === 'string' ? {url: u, name: new URL(u).hostname, home: new URL(u).origin, terms: '', minIntervalMs: 0} : u);
  const cache = new Map(), nextSlot = new Map();
  // Space calls to a rate-limited feed: each caller reserves the next free slot, then waits for it.
  async function throttle(feed) {
    if (!feed.minIntervalMs) return;
    const t = now(), slot = Math.max(t, nextSlot.get(feed.url) ?? 0);
    nextSlot.set(feed.url, slot + feed.minIntervalMs);
    if (slot > t) await sleep(slot - t);
  }
  return async function relay(params) {
    const q = parseQuery(params);
    if (!q) return {status: 400, body: {error: 'Give lat (−90..90), lon (−180..180) and km (1..463).'}};
    const key = `${q.lat},${q.lon},${q.nm}`, hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return {status: 200, body: hit.body, cached: true};
    const errors = [];
    for (const feed of feeds) {
      await throttle(feed);
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const r = await fetchImpl(`${feed.url}/${q.lat}/${q.lon}/${q.nm}`, {signal: ctl.signal, headers: {Accept: 'application/json', 'User-Agent': 'AeroCommit flight relay (github.com/asif0905/AeroCommit)'}});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!Array.isArray(data?.ac)) throw new Error('unexpected response');
        const body = {source: feed.name, credit: {name: feed.name, url: feed.home, terms: feed.terms}, now: now(), ac: data.ac.slice(0, 2000).map(keep)};
        cache.set(key, {at: now(), body});
        if (cache.size > 500) cache.delete(cache.keys().next().value);
        return {status: 200, body};
      } catch (e) { errors.push(`${feed.name}: ${e.name === 'AbortError' ? 'timed out' : e.message}`); }
      finally { clearTimeout(timer); }
    }
    return {status: 502, body: {error: 'No flight feed answered.', details: errors}};
  };
}
