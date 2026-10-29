// Live Flights: estimate the SAF share and CO2 avoided for aircraft seen near an airport.
//
// SAF is blended into an airport's shared fuel supply, so no feed can say which aircraft burned it.
// This module allocates SAF the way book-and-claim accounting does: a departing flight of the planned
// airline carries the SAF share its Compliance Plan puts at that airport; other flights carry a
// network or industry average. All burn rates and shares are estimates.

import {distanceKm} from './geo.mjs';

export const TRACKER_CHECKED = '2026-10-27';

// CORSIA emissions-reduction convention: fuel conversion factor 3.16 kg CO2 per kg jet fuel and
// fossil jet baseline 89 gCO2e/MJ; SAF avoids 3.16 × (1 − CI/89) kg CO2 per kg SAF burned.
export const FCF = 3.16, BASELINE_CI = 89;

// Approximate cruise fuel burn, kg per hour, by ICAO aircraft type designator.
// Rounded values typical of published fleet averages; used only to rank and size estimates.
export const BURN_KG_H = {
  A319: 2300, A320: 2500, A321: 2800, A19N: 1950, A20N: 2100, A21N: 2400, BCS1: 1700, BCS3: 1900,
  B712: 2300, B737: 2300, B738: 2500, B739: 2600, B37M: 1950, B38M: 2100, B39M: 2250, B752: 3200, B753: 3500,
  B762: 4500, B763: 4800, B764: 5000, B772: 6800, B77L: 7000, B77W: 7500, B788: 5000, B789: 5600, B78X: 5900,
  B744: 10000, B748: 9800, A306: 5000, A332: 5600, A333: 5800, A338: 5000, A339: 5300, A359: 5800, A35K: 6800, A388: 11000,
  MD11: 8000, E170: 1500, E75L: 1600, E75S: 1600, E190: 1900, E195: 2000, E290: 1750, E295: 1850,
  CRJ2: 1100, CRJ7: 1400, CRJ9: 1500, CRJX: 1550, DH8D: 800, AT72: 600, AT76: 650
};
export const DEFAULT_BURN_KG_H = 2500;
export const burnRate = type => BURN_KG_H[String(type || '').toUpperCase()] ?? DEFAULT_BURN_KG_H;

// ICAO airline designators for common North American and European carriers.
export const AIRLINES = {
  DAL: 'Delta', AAL: 'American', UAL: 'United', SWA: 'Southwest', JBU: 'JetBlue', ASA: 'Alaska', NKS: 'Spirit',
  FFT: 'Frontier', HAL: 'Hawaiian', SKW: 'SkyWest', RPA: 'Republic', ENY: 'Envoy', EDV: 'Endeavor', JIA: 'PSA',
  FDX: 'FedEx', UPS: 'UPS', ACA: 'Air Canada', WJA: 'WestJet', JZA: 'Jazz', POE: 'Porter', BAW: 'British Airways',
  VIR: 'Virgin Atlantic', KLM: 'KLM', AFR: 'Air France', DLH: 'Lufthansa', IBE: 'Iberia', EIN: 'Aer Lingus',
  SAS: 'SAS', FIN: 'Finnair', SWR: 'Swiss', AUA: 'Austrian', TAP: 'TAP', EZY: 'easyJet', RYR: 'Ryanair',
  WZZ: 'Wizz Air', VLG: 'Vueling', TRA: 'Transavia', UAE: 'Emirates', QTR: 'Qatar', THY: 'Turkish'
};
export const airlineOf = callsign => { const m = /^([A-Z]{3})\d/.exec(String(callsign || '').trim().toUpperCase()); return m ? m[1] : null; };
// Airline flights only: a known carrier code, or an airline-style callsign on an airliner type.
// Private, business and training aircraft (N-numbers, NetJets on a Global Express, a Cessna) are left out of the totals.
export const isAirlineFlight = f => { const a = airlineOf(f.callsign); return !!a && (!!AIRLINES[a] || !!BURN_KG_H[String(f.type || '').toUpperCase()]); };

// Airports used by the demo plans that are not in the SAF airport directory.
export const EXTRA_AIRPORTS = [
  {id: 'ATL', name: 'Hartsfield-Jackson Atlanta International', lat: 33.6407, lon: -84.4277},
  {id: 'SEA', name: 'Seattle-Tacoma International', lat: 47.4502, lon: -122.3088},
  {id: 'YVR', name: 'Vancouver International', lat: 49.1967, lon: -123.1815},
  {id: 'YYZ', name: 'Toronto Pearson International', lat: 43.6777, lon: -79.6248},
  {id: 'MIA', name: 'Miami International', lat: 25.7959, lon: -80.2870}
];

// --- Feed parsing -------------------------------------------------------------------------------
// All feed values are untrusted: coerce to numbers and short strings, drop anything without a position.
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clean = (v, max = 10) => String(v ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, max).toUpperCase();

// readsb / ADS-B Exchange v2 JSON, served by adsb.lol and airplanes.live: {ac: [{hex, flight, t, lat, lon, alt_baro, gs, track, baro_rate}]}.
export function parseReadsb(json) {
  const list = Array.isArray(json?.ac) ? json.ac : [];
  return list.map(a => {
    const lat = num(a.lat), lon = num(a.lon);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const ground = a.alt_baro === 'ground';
    return {id: clean(a.hex, 6), callsign: clean(a.flight), type: clean(a.t, 4), reg: clean(a.r, 10), lat, lon,
      altFt: ground ? 0 : num(a.alt_baro) ?? num(a.alt_geom), ground, speedKt: num(a.gs), track: num(a.track) ?? num(a.true_heading),
      vrateFpm: num(a.baro_rate) ?? num(a.geom_rate)};
  }).filter(Boolean);
}

// Live data always goes through a relay: the bundled server's /api/flights (npm start) or a deployed
// copy of proxy/cloudflare-worker.js. The public feeds refuse requests from other websites (CORS), and
// the relay is where each feed's terms are applied: one cached call per area every 10 s, airplanes.live
// spaced 1 s apart, and the feed's name and terms returned as `credit` so the page can show them.
const relayUrl = (base, lat, lon, km) => `${base}${base.includes('?') ? '&' : '?'}lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&km=${Math.round(km)}`;
// Feed credit from a relay response, kept only if it names a known feed (the response is untrusted).
export const FEED_CREDITS = {
  'adsb.lol': {name: 'adsb.lol', url: 'https://adsb.lol', terms: 'data © adsb.lol contributors, ODbL 1.0', licence: 'https://opendatacommons.org/licenses/odbl/1-0/'},
  'airplanes.live': {name: 'airplanes.live', url: 'https://airplanes.live', terms: 'free API, non-commercial use', licence: 'https://airplanes.live/api-guide'}
};
export const creditOf = json => FEED_CREDITS[String(json?.credit?.name ?? json?.source ?? '')] || null;
export const validRelay = u => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password; } catch { return false; } };
export const SOURCES = {
  local: {label: 'AeroCommit server', url: (lat, lon, km) => relayUrl('./api/flights', lat, lon, km), parse: parseReadsb, relay: true},
  relay: {label: 'Your relay', url: (lat, lon, km, base) => relayUrl(base, lat, lon, km), parse: parseReadsb, relay: true, needsBase: true},
};

// --- Flight phase ----------------------------------------------------------------------------------
// Near the airport and low: climbing means it departed here (and fuelled here), descending means arriving.
export function phaseOf(f, airport) {
  if (f.ground) return 'ground';
  const d = distanceKm([airport.lon, airport.lat], [f.lon, f.lat]);
  const alt = f.altFt ?? 99999, vr = f.vrateFpm ?? 0;
  if (d <= 60 && alt <= 12000 && vr >= 300) return 'departing';
  if (d <= 60 && alt <= 12000 && vr <= -300) return 'arriving';
  if (alt < 1000 && d <= 8) return 'ground';
  return 'en route';
}

// --- SAF shares from the Compliance Plan ---------------------------------------------------------
// Each flight group's fuel is spread evenly across its airports; planned SAF at an airport is the sum
// of contracted tonnes there. Share = SAF / fuel, with a tonnage-weighted carbon intensity.
export function planShares(cfg, result) {
  const fuel = {}, saf = {}, ciT = {};
  for (const g of cfg?.groups || []) {
    const n = g.airports?.length || 0;
    for (const ap of g.airports || []) fuel[ap] = (fuel[ap] || 0) + (Number(g.fuel) || 0) / n;
  }
  for (const k of result?.contracts || []) {
    const t = Math.max(0, Number(k.tonnes) || 0);
    if (t < 1e-6) continue;
    saf[k.airport] = (saf[k.airport] || 0) + t; ciT[k.airport] = (ciT[k.airport] || 0) + t * (Number(k.ci) || 0);
  }
  const airports = {};
  for (const ap of new Set([...Object.keys(fuel), ...Object.keys(saf)])) {
    const s = saf[ap] || 0, f = fuel[ap] || 0;
    airports[ap] = {safT: s, fuelT: f, share: f > 0 ? Math.min(1, s / f) : 0, ci: s > 0 ? ciT[ap] / s : null};
  }
  const totS = Object.values(saf).reduce((a, b) => a + b, 0), totF = Object.values(fuel).reduce((a, b) => a + b, 0);
  const totCi = Object.values(ciT).reduce((a, b) => a + b, 0);
  return {airports, network: {safT: totS, fuelT: totF, share: totF > 0 ? Math.min(1, totS / totF) : 0, ci: totS > 0 ? totCi / totS : null}};
}

export const reductionFactor = ci => Math.max(0, Math.min(1, 1 - (Number(ci) || 0) / BASELINE_CI));

// Per-flight estimate. opts: {airport, airline, shares (from planShares), industryShare (0-1), industryCi, includeOthers}.
export function assess(f, opts) {
  const phase = phaseOf(f, opts.airport), airline = airlineOf(f.callsign), counted = isAirlineFlight(f), burn = f.ground || !counted ? 0 : burnRate(f.type);
  let share = 0, ci = null, basis = counted ? 'Not counted' : 'Not an airline flight';
  if (!counted) { /* left out of fuel and CO2 totals */ }
  else if (opts.airline && airline === opts.airline) {
    const here = opts.shares?.airports?.[opts.airport.id];
    if (phase === 'departing') {
      share = here?.share || 0; ci = here?.ci; basis = share > 0 ? `Plan at ${opts.airport.id}` : `No SAF planned at ${opts.airport.id}`;
    } else {
      share = opts.shares?.network?.share || 0; ci = opts.shares?.network?.ci; basis = 'Plan network average';
    }
  } else if (opts.includeOthers) {
    share = opts.industryShare || 0; ci = opts.industryCi; basis = 'Industry average';
  }
  const fossilCo2 = burn * FCF, safKg = burn * share, avoided = safKg * FCF * reductionFactor(ci ?? BASELINE_CI);
  return {...f, phase, airline, airlineName: AIRLINES[airline] || '', counted, burn, share, ci, basis, fossilCo2, safKg, avoided, own: counted && !!opts.airline && airline === opts.airline};
}

export function summarize(rows) {
  const air = rows.filter(r => r.counted !== false && !r.ground && r.phase !== 'ground');
  const sum = k => air.reduce((t, r) => t + r[k], 0);
  const burn = sum('burn'), co2 = sum('fossilCo2'), avoided = sum('avoided'), saf = sum('safKg');
  return {tracked: rows.length, airborne: air.length, nonAirline: rows.filter(r => r.counted === false).length, own: air.filter(r => r.own).length, burnKgH: burn, safKgH: saf,
    co2KgH: co2, avoidedKgH: avoided, avoidedPct: co2 > 0 ? avoided / co2 * 100 : 0};
}

// --- Simulated feed ------------------------------------------------------------------------------
// Deterministic traffic for offline use and tests. Positions advance with time t (seconds).
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const SIM_MIX = [['DAL', 6], ['AAL', 4], ['UAL', 4], ['SWA', 3], ['JBU', 2], ['ASA', 1], ['SKW', 2], ['ACA', 1], ['KLM', 1], ['BAW', 1], ['DLH', 1], ['FDX', 1]];
const SIM_TYPES = ['A321', 'B738', 'A320', 'B739', 'A21N', 'B38M', 'E75L', 'CRJ9', 'B752', 'A333', 'B763', 'B789', 'A359', 'BCS3'];
export function simulate(airport, km, t = Date.now() / 1000, seed = 7, count = 40) {
  const r = rng(seed + Math.round(airport.lat * 100) * 31 + Math.round(airport.lon * 100));
  const total = SIM_MIX.reduce((a, [, w]) => a + w, 0), out = [];
  for (let i = 0; i < count; i++) {
    let x = r() * total, code = SIM_MIX[0][0];
    for (const [c, w] of SIM_MIX) { if ((x -= w) < 0) { code = c; break; } }
    const kind = r(), heading = r() * 360, speed = 250 + r() * 230, start = r() * 1800;
    const period = 1800, age = (t + start) % period;               // each flight loops through a 30-minute leg
    let dist, alt, vr, trk = heading, spd = speed;
    if (kind < 0.25) { dist = age / period * km; alt = 1500 + dist / km * 28000; vr = 2200; spd = 180 + dist / km * 260; }       // departing outward
    else if (kind < 0.45) { dist = (1 - age / period) * km; alt = 1500 + dist / km * 24000; vr = -1600; trk = (heading + 180) % 360; spd = 170 + dist / km * 250; } // arriving inward
    else { dist = km * (0.2 + 0.75 * r()); alt = 31000 + Math.round(r() * 8) * 1000; vr = 0; }
    const off = kind < 0.45 ? 0 : (age / period - 0.5) * km * 1.6;  // overflights cross the area
    const rad = heading * Math.PI / 180, perp = rad + Math.PI / 2;
    const dx = Math.sin(rad) * dist + (kind < 0.45 ? 0 : Math.sin(perp) * off), dy = Math.cos(rad) * dist + (kind < 0.45 ? 0 : Math.cos(perp) * off);
    if (kind >= 0.45) trk = (heading + 90) % 360;
    const lat = airport.lat + dy / 110.574, lon = airport.lon + dx / (111.32 * Math.cos(airport.lat * Math.PI / 180));
    out.push({id: 'SIM' + String(i).padStart(3, '0'), callsign: code + (100 + Math.floor(r() * 2800)), type: SIM_TYPES[Math.floor(r() * SIM_TYPES.length)], reg: '',
      lat, lon, altFt: Math.round(alt), ground: false, speedKt: Math.round(spd), track: Math.round(trk), vrateFpm: vr});
  }
  return out;
}
