// Flight-data relay shared by server.mjs (local) and proxy/cloudflare-worker.js (hosted).
// Public ADS-B feeds refuse browser requests from other websites, so the app asks this relay,
// which fetches the feed server-side and answers {source, now, ac} in readsb v2 format.

export const DEFAULT_UPSTREAMS = ['https://api.adsb.lol/v2/point', 'https://api.airplanes.live/v2/point'];
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

export function createRelay({upstreams = DEFAULT_UPSTREAMS, fetchImpl = globalThis.fetch, now = () => Date.now()} = {}) {
  const cache = new Map();
  return async function relay(params) {
    const q = parseQuery(params);
    if (!q) return {status: 400, body: {error: 'Give lat (−90..90), lon (−180..180) and km (1..463).'}};
    const key = `${q.lat},${q.lon},${q.nm}`, hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return {status: 200, body: hit.body, cached: true};
    const errors = [];
    for (const base of upstreams) {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      try {
        const r = await fetchImpl(`${base}/${q.lat}/${q.lon}/${q.nm}`, {signal: ctl.signal, headers: {Accept: 'application/json', 'User-Agent': 'AeroCommit flight relay (github.com/asif0905/AeroCommit)'}});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!Array.isArray(data?.ac)) throw new Error('unexpected response');
        const body = {source: new URL(base).hostname, now: now(), ac: data.ac.slice(0, 2000).map(keep)};
        cache.set(key, {at: now(), body});
        if (cache.size > 500) cache.delete(cache.keys().next().value);
        return {status: 200, body};
      } catch (e) { errors.push(`${new URL(base).hostname}: ${e.name === 'AbortError' ? 'timed out' : e.message}`); }
      finally { clearTimeout(timer); }
    }
    return {status: 502, body: {error: 'No flight feed answered.', details: errors}};
  };
}
