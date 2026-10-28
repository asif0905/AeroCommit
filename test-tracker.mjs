import assert from 'node:assert/strict';
import {parseReadsb, parseOpenSky, phaseOf, planShares, assess, summarize, simulate, burnRate, airlineOf, reductionFactor, SOURCES, bbox, FCF, DEFAULT_BURN_KG_H} from './dist/tracker.mjs';
import {demoCompliance, planCompliance} from './dist/compliance.mjs';
import {distanceKm} from './dist/geo.mjs';
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b}`);
const JFK = {id: 'JFK', lat: 40.6413, lon: -73.7781};

// Feed parsing: both formats, unit conversion, hostile values dropped or neutralised.
const rb = parseReadsb({ac: [
  {hex: 'a1b2c3', flight: 'DAL123  ', t: 'A321', lat: 40.7, lon: -73.8, alt_baro: 5000, gs: 250, track: 90, baro_rate: 1800},
  {hex: 'ffffff', flight: 'UAL9', t: 'B789', lat: 40.6, lon: -73.7, alt_baro: 'ground', gs: 5},
  {hex: 'bad', flight: '<img src=x onerror=alert(1)>', lat: 'x', lon: -73},
  {hex: '000001', flight: '"><script>', t: 'B738', lat: 40.9, lon: -74.0, alt_baro: 36000}
]});
assert.equal(rb.length, 3, 'drops rows without numeric position');
assert.equal(rb[0].callsign, 'DAL123'); assert.equal(rb[0].type, 'A321'); assert.equal(rb[1].ground, true); assert.equal(rb[1].altFt, 0);
assert.ok(/^[A-Z0-9-]*$/.test(rb[2].callsign), 'callsign sanitised');
const os = parseOpenSky({states: [['a1b2c3', 'AAL45   ', 'United States', 0, 0, -73.9, 40.7, 3048, false, 128.6, 270, 5.08], ['x', 'N1', 'US', 0, 0, null, 40, 0, true]]});
assert.equal(os.length, 1); near(os[0].altFt, 10000, 1, 'm→ft'); near(os[0].speedKt, 250, 0.5, 'm/s→kt'); near(os[0].vrateFpm, 1000, 1, 'm/s→ft/min');
assert.deepEqual(parseReadsb(null), []); assert.deepEqual(parseOpenSky({states: 'nope'}), []);
assert.match(SOURCES.adsblol.url(40.6413, -73.7781, 150), /\/v2\/point\/40\.6413\/-73\.7781\/81$/);
const b = bbox(40, -74, 111.32 * Math.cos(40 * Math.PI / 180)); near(b.lomax - b.lomin, 2, 1e-9, 'bbox lon span');
console.log('PASS feeds: readsb and OpenSky parsing, unit conversion, sanitising, query URLs.');

// Phase, airline and burn lookups.
assert.equal(phaseOf(rb[0], JFK), 'departing');
assert.equal(phaseOf({...rb[0], vrateFpm: -1200}, JFK), 'arriving');
assert.equal(phaseOf(rb[2], JFK), 'en route');
assert.equal(phaseOf(rb[1], JFK), 'ground');
assert.equal(airlineOf('DAL123'), 'DAL'); assert.equal(airlineOf('N123AB'), null);
assert.equal(burnRate('a321'), 2800); assert.equal(burnRate(''), DEFAULT_BURN_KG_H);
near(reductionFactor(89), 0, 1e-12); near(reductionFactor(-20), 1, 1e-12, 'clamped'); near(reductionFactor(24), 1 - 24 / 89, 1e-12);
console.log('PASS phases, airline codes, burn rates and reduction factor.');

// Plan shares from the demo Compliance Plan, checked against a hand calculation.
const cfg = demoCompliance(), res = planCompliance(cfg), sh = planShares(cfg, res);
let fuelJFK = 0; for (const g of cfg.groups) if (g.airports.includes('JFK')) fuelJFK += g.fuel / g.airports.length;
const safJFK = res.contracts.filter(k => k.airport === 'JFK').reduce((t, k) => t + k.tonnes, 0);
near(sh.airports.JFK.share, safJFK / fuelJFK, 1e-12, 'JFK share'); assert.ok(sh.airports.JFK.share > 0);
near(sh.network.fuelT, cfg.groups.reduce((t, g) => t + g.fuel, 0), 1e-6, 'all fuel counted once');
near(sh.network.safT, res.contracts.reduce((t, k) => t + k.tonnes, 0), 1e-6, 'all SAF counted');
assert.ok(!sh.airports.ATL, 'no plan at ATL');
console.log(`PASS plan shares: JFK ${(sh.airports.JFK.share * 100).toFixed(2)}%, network ${(sh.network.share * 100).toFixed(2)}%.`);

// Per-flight assessment and totals.
const opts = {airport: JFK, airline: 'DAL', shares: sh, industryShare: 0.008, industryCi: 28, includeOthers: true};
const dep = assess(rb[0], opts);
assert.equal(dep.basis, 'Plan at JFK'); near(dep.avoided, 2800 * sh.airports.JFK.share * FCF * (1 - sh.airports.JFK.ci / 89), 1e-9, 'departing avoided');
const other = assess({...rb[2], callsign: 'UAL1'}, opts);
assert.equal(other.basis, 'Industry average'); near(other.avoided, 2500 * 0.008 * FCF * (1 - 28 / 89), 1e-9);
assert.equal(assess({...rb[2], callsign: 'UAL1'}, {...opts, includeOthers: false}).avoided, 0);
const cruiseOwn = assess({...rb[2], callsign: 'DAL9'}, opts); assert.equal(cruiseOwn.basis, 'Plan network average');
assert.equal(assess({...rb[0]}, {...opts, airport: {id: 'ATL', lat: 40.6413, lon: -73.7781}}).basis, 'No SAF planned at ATL');
const s = summarize([dep, other, assess(rb[1], opts)]);
assert.equal(s.airborne, 2); near(s.avoidedKgH, dep.avoided + other.avoided, 1e-9); near(s.co2KgH, (2800 + 2500) * FCF, 1e-9);
assert.ok(s.avoidedPct > 0 && s.avoidedPct < 100);
console.log('PASS assessment: plan, network and industry bases; totals exclude ground traffic.');

// Simulator: deterministic, moves over time, stays near the airport, includes departures.
const a = simulate(JFK, 150, 1000), a2 = simulate(JFK, 150, 1000), c = simulate(JFK, 150, 1060);
assert.deepEqual(a, a2); assert.notDeepEqual(a.map(f => f.lat), c.map(f => f.lat));
assert.ok(a.every(f => distanceKm([JFK.lon, JFK.lat], [f.lon, f.lat]) < 150 * 1.3));
assert.ok(a.some(f => phaseOf(f, JFK) === 'departing') && a.some(f => airlineOf(f.callsign) === 'DAL'));
console.log('PASS simulator: deterministic, time-varying, local, with departures.');

// Airline filter: private, business and training aircraft are listed but not counted.
import {isAirlineFlight} from './dist/tracker.mjs';
assert.equal(isAirlineFlight({callsign: 'N6035F', type: 'P28A'}), false, 'N-number');
assert.equal(isAirlineFlight({callsign: 'EJA22', type: 'GLEX'}), false, 'business jet operator');
assert.equal(isAirlineFlight({callsign: 'ETH515', type: 'B788'}), true, 'unlisted airline on airliner type');
assert.equal(isAirlineFlight({callsign: 'DAL9', type: ''}), true, 'listed airline, unknown type');
const ga = assess({callsign: 'N6035F', type: 'P28A', lat: 40.7, lon: -73.8, altFt: 2000, ground: false}, opts);
assert.equal(ga.counted, false); assert.equal(ga.burn, 0); assert.equal(ga.avoided, 0);
const s2 = summarize([dep, ga]); assert.equal(s2.airborne, 1); assert.equal(s2.nonAirline, 1);
console.log('PASS airline filter: private and business aircraft excluded from totals.');

// Relay: validation, field filtering, fallback between upstreams, caching, errors.
import {createRelay, parseQuery} from './relay.mjs';
import {createAppServer} from './server.mjs';
import {buildWorker} from './tools/build-worker.mjs';
import {readFileSync} from 'node:fs';
assert.equal(parseQuery(new URLSearchParams('lat=91&lon=0&km=10')), null);
assert.equal(parseQuery(new URLSearchParams('lat=1&lon=x')), null);
assert.equal(parseQuery(new URLSearchParams('lat=40&lon=-73&km=600')), null);
assert.deepEqual(parseQuery(new URLSearchParams('lat=40.64134&lon=-73.77812&km=150')), {lat: 40.641, lon: -73.778, nm: 81});
let calls = [], clock = 0;
const fakeFetch = async url => { calls.push(url); if (url.startsWith('https://down.example')) return {ok: false, status: 503};
  return {ok: true, json: async () => ({ac: [{hex: 'abc', flight: 'DAL1', t: 'A321', lat: 40, lon: -73, alt_baro: 9000, secret: 'x'}]})}; };
const relay = createRelay({upstreams: ['https://down.example/v2/point', 'https://up.example/v2/point'], fetchImpl: fakeFetch, now: () => clock});
let out = await relay(new URLSearchParams('lat=40&lon=-73&km=150'));
assert.equal(out.status, 200); assert.equal(out.body.source, 'up.example'); assert.equal(out.body.ac[0].secret, undefined, 'extra fields dropped');
assert.deepEqual(calls, ['https://down.example/v2/point/40/-73/81', 'https://up.example/v2/point/40/-73/81']);
out = await relay(new URLSearchParams('lat=40&lon=-73&km=150')); assert.equal(out.cached, true); assert.equal(calls.length, 2, 'served from cache');
clock = 11000; await relay(new URLSearchParams('lat=40&lon=-73&km=150')); assert.equal(calls.length, 4, 'cache expires after 10 s');
assert.equal((await relay(new URLSearchParams('lat=abc'))).status, 400);
const dead = createRelay({upstreams: ['https://down.example/v2/point'], fetchImpl: fakeFetch});
out = await dead(new URLSearchParams('lat=40&lon=-73&km=50')); assert.equal(out.status, 502); assert.match(out.body.details[0], /503/);
assert.equal(parseReadsb(out.status === 502 ? {} : out.body).length, 0);
console.log('PASS relay: validation, field filter, upstream fallback, 10 s cache, error reporting.');

// Local server: static files, /api/flights through the relay, path traversal refused.
const srv = createAppServer({upstreams: ['https://up.example/v2/point'], fetchImpl: fakeFetch});
await new Promise(r => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;
let hr = await fetch(base + '/'); assert.equal(hr.status, 200); assert.match(await hr.text(), /Live Flights/);
hr = await fetch(base + '/tracker.mjs'); assert.equal(hr.headers.get('content-type'), 'text/javascript');
hr = await fetch(base + '/api/flights?lat=40&lon=-73&km=100'); assert.equal(hr.status, 200); assert.equal(hr.headers.get('access-control-allow-origin'), '*');
const live = await hr.json(); assert.equal(parseReadsb(live)[0].callsign, 'DAL1');
hr = await fetch(base + '/%2e%2e/package.json'); assert.ok([403, 404].includes(hr.status), 'no traversal');
hr = await fetch(base + '/nope.js'); assert.equal(hr.status, 404);
srv.close();
console.log('PASS server: static app, flight relay endpoint with CORS, traversal blocked.');

// Cloudflare worker: generated file is current and answers with CORS and origin checks.
assert.equal(readFileSync(new URL('./proxy/cloudflare-worker.js', import.meta.url), 'utf8'), buildWorker(), 'run node tools/build-worker.mjs');
const realFetch = globalThis.fetch; globalThis.fetch = fakeFetch;
try {
  const worker = (await import('./proxy/cloudflare-worker.js')).default;
  let w = await worker.fetch(new Request('https://relay.example/?lat=40&lon=-73&km=100', {headers: {Origin: 'https://a.example'}}), {});
  assert.equal(w.status, 200); assert.equal(w.headers.get('access-control-allow-origin'), '*'); assert.equal((await w.json()).ac.length, 1);
  w = await worker.fetch(new Request('https://relay.example/?lat=40&lon=-73', {headers: {Origin: 'https://evil.example'}}), {ALLOWED_ORIGINS: 'https://a.example'});
  assert.equal(w.status, 403);
  w = await worker.fetch(new Request('https://relay.example/?lat=40&lon=-73', {headers: {Origin: 'https://a.example'}}), {ALLOWED_ORIGINS: 'https://a.example'});
  assert.equal(w.headers.get('access-control-allow-origin'), 'https://a.example');
  assert.equal((await worker.fetch(new Request('https://relay.example/', {method: 'OPTIONS'}), {})).status, 204);
} finally { globalThis.fetch = realFetch; }
console.log('PASS worker: up to date with relay.mjs, CORS headers, optional origin allow-list.');
