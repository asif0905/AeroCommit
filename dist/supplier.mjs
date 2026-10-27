// Supplier Plan: where should each SAF batch go this month?
// An exact linear program allocates batch gallons to airports to maximize net value per period:
// stacked credits (RINs, LCFS/CFP/CFS, state credits, 45Z) + contracted premium − freight,
// plus mandate penalties avoided (ReFuelEU) and UK certificates (buy-out avoided, then traded).
import {maximize} from './lp.mjs';
import {defaultPolicy, CROP_FEEDSTOCKS} from './policy.mjs';
import {GALLONS_PER_TONNE} from './units.mjs';

const L_PER_GAL = 3.785411784;
const FOSSIL_CI = 89;              // gCO2e/MJ fossil jet comparator (CORSIA / UK mandate)
const MJ_PER_MMBTU = 1055.056;
const US = new Set(['CA', 'OR', 'WA', 'IL', 'MN', 'US']);

export function demoSupplier() {
  return {
    period: 'November 2026',
    policy: defaultPolicy(),
    obligations: {euFuelGal: 20000000, ukFuelGal: 10000000},
    batches: [
      {id: 'B1', name: 'UCO HEFA (imported UCO)', terminal: 'HOU', gallons: 1200000, feedstock: 'uco', origin: 'Other', ciLcfs: 22, ci45z: 14, ciIcao: 14, rfs: true},
      {id: 'B2', name: 'Tallow HEFA', terminal: 'HOU', gallons: 800000, feedstock: 'tallow', origin: 'US', ciLcfs: 30, ci45z: 22.5, ciIcao: 22.5, rfs: true},
      {id: 'B3', name: 'Soybean HEFA', terminal: 'CHI', gallons: 600000, feedstock: 'soybean', origin: 'US', ciLcfs: 58, ci45z: 40, ciIcao: 64.9, rfs: true}
    ],
    terminals: [
      {id: 'HOU', name: 'Houston terminal', lon: -95.27, lat: 29.73},
      {id: 'CHI', name: 'Chicago-area terminal', lon: -87.65, lat: 41.6}
    ],
    airports: [
      {id: 'LAX', name: 'Los Angeles', jur: 'CA', uptake: 600000, premium: 0, lon: -118.4085, lat: 33.9416},
      {id: 'SFO', name: 'San Francisco', jur: 'CA', uptake: 400000, premium: 0, lon: -122.379, lat: 37.6213},
      {id: 'PDX', name: 'Portland', jur: 'OR', uptake: 150000, premium: 0, lon: -122.5975, lat: 45.5887},
      {id: 'SEA', name: 'Seattle–Tacoma', jur: 'WA', uptake: 300000, premium: 0, lon: -122.3088, lat: 47.4502},
      {id: 'ORD', name: 'Chicago O’Hare', jur: 'IL', uptake: 500000, premium: 0, lon: -87.9073, lat: 41.9742},
      {id: 'MSP', name: 'Minneapolis–St Paul', jur: 'MN', uptake: 150000, premium: 0, lon: -93.2218, lat: 44.882},
      {id: 'JFK', name: 'New York JFK', jur: 'US', uptake: 400000, premium: 0, lon: -73.7781, lat: 40.6413},
      {id: 'AMS', name: 'Amsterdam Schiphol', jur: 'EU', uptake: 500000, premium: 0, lon: 4.7639, lat: 52.3086},
      {id: 'LHR', name: 'London Heathrow', jur: 'UK', uptake: 400000, premium: 0, lon: -0.4543, lat: 51.47}
    ],
    lanes: [
      {terminal: 'HOU', airport: 'LAX', freight: 0.35, capacity: 900000},
      {terminal: 'HOU', airport: 'SFO', freight: 0.40, capacity: 600000},
      {terminal: 'HOU', airport: 'PDX', freight: 0.55, capacity: 300000},
      {terminal: 'HOU', airport: 'SEA', freight: 0.55, capacity: 400000},
      {terminal: 'HOU', airport: 'ORD', freight: 0.25, capacity: 600000},
      {terminal: 'HOU', airport: 'JFK', freight: 0.20, capacity: 800000},
      {terminal: 'HOU', airport: 'AMS', freight: 0.30, capacity: 700000},
      {terminal: 'HOU', airport: 'LHR', freight: 0.32, capacity: 500000},
      {terminal: 'CHI', airport: 'ORD', freight: 0.05, capacity: 600000},
      {terminal: 'CHI', airport: 'MSP', freight: 0.12, capacity: 300000},
      {terminal: 'CHI', airport: 'JFK', freight: 0.25, capacity: 400000},
      {terminal: 'CHI', airport: 'SEA', freight: 0.45, capacity: 200000}
    ]
  };
}

const reduction = ci => 100 * (FOSSIL_CI - ci) / FOSSIL_CI;
const tiered = (p, ci) => { const r = reduction(ci); return r < p.minReduction ? 0 : Math.min(p.max, p.base + p.perPoint * Math.floor(r - p.minReduction)); };

// Per-gallon value components for batch b delivered to airport a (excluding mandate pools).
export function valueStack(b, a, lane, P) {
  const v = {premium: a.premium || 0, freight: -(lane?.freight || 0), rin: 0, lcfs: 0, state: 0, z45: 0, notes: []};
  const crop = CROP_FEEDSTOCKS.has(b.feedstock);
  if (US.has(a.jur)) {
    if (b.rfs) v.rin = P.rfs.rinsPerGal * P.rfs.d4 * P.rfs.capture / 100; else v.notes.push('No RFS pathway');
    const prog = P.lcfs[a.jur];
    if (prog) {
      const t = Math.max(0, prog.benchmark - b.ciLcfs) * P.lcfs.mjPerGal / 1e6;
      v.lcfs = t * prog.price * prog.capture / 100;
      if (!v.lcfs) v.notes.push(`CI above ${a.jur} benchmark`);
    }
    if (a.jur === 'IL') {
      if (b.feedstock === 'soybean' && P.il.soyCapReached) v.notes.push('Illinois soybean cap reached');
      else v.state = P.il.rate * P.il.capture / 100;
    }
    if (a.jur === 'MN') { v.state = tiered(P.mn, b.ciIcao) * P.mn.capture / 100; if (!v.state) v.notes.push('Below 50% reduction for MN'); }
    if (a.jur === 'WA' && P.wa.active) v.state = tiered(P.wa, b.ciIcao) * P.wa.capture / 100;
  }
  // 45Z is a producer credit: it depends on the batch, not the destination.
  const ciKg = b.ci45z * MJ_PER_MMBTU / 1000;
  if (P.z45.claim && ['US', 'CA', 'MX'].includes(b.origin) && ciKg < 50) v.z45 = P.z45.rate * Math.round(10 * (50 - ciKg) / 50) / 10;
  else if (P.z45.claim && !['US', 'CA', 'MX'].includes(b.origin)) v.notes.push('45Z: feedstock not North American');
  if ((a.jur === 'EU' || a.jur === 'UK') && crop) v.notes.push('Crop feedstock does not count toward EU/UK mandates');
  v.total = v.premium + v.freight + v.rin + v.lcfs + v.state + v.z45;
  return v;
}

// Mandate units per gallon: EU counts gallons; UK counts certificates (GHG-weighted, per DfT formula).
export const euUnits = b => CROP_FEEDSTOCKS.has(b.feedstock) || b.ciIcao >= FOSSIL_CI ? 0 : 1;
export const ukCerts = (b, P) => CROP_FEEDSTOCKS.has(b.feedstock) || b.ciIcao >= FOSSIL_CI ? 0 : L_PER_GAL * P.uk.safLhv * (FOSSIL_CI - b.ciIcao) / (FOSSIL_CI - 26.7) / 34;

export function mandateParams(s) {
  const P = s.policy;
  const euPenaltyPerGal = P.eu.multiplier * Math.max(0, P.eu.safEurT - P.eu.jetEurT) * P.fx.eurUsd / GALLONS_PER_TONNE;
  const euObligation = s.obligations.euFuelGal * P.eu.share / 100;
  const ukObligation = s.obligations.ukFuelGal * L_PER_GAL * P.uk.target / 100;  // certificates (34 MJ each)
  return {euPenaltyPerGal, euObligation, ukObligation, ukBuyout: P.uk.buyoutGbp * P.fx.gbpUsd, ukCert: P.uk.certGbp * P.fx.gbpUsd};
}

function candidates(s) {
  const P = s.policy, out = [];
  for (const b of s.batches) for (const lane of s.lanes) {
    if (lane.terminal !== b.terminal) continue;
    const a = s.airports.find(a => a.id === lane.airport); if (!a) continue;
    out.push({b, a, lane, v: valueStack(b, a, lane, P)});
  }
  return out;
}

// Value of an allocation (array aligned with candidates), counting mandate units against obligations.
function evaluate(s, cands, x) {
  const M = mandateParams(s), P = s.policy;
  let base = 0, eu = 0, uk = 0, mnDollars = 0;
  cands.forEach((c, i) => {
    base += x[i] * c.v.total;
    if (c.a.jur === 'EU') eu += x[i] * euUnits(c.b);
    if (c.a.jur === 'UK') uk += x[i] * ukCerts(c.b, P);
    if (c.a.jur === 'MN') mnDollars += x[i] * c.v.state;
  });
  const euCounted = Math.min(eu, M.euObligation), ukObl = Math.min(uk, M.ukObligation), ukExtra = Math.max(0, uk - M.ukObligation);
  // MN certificates are capped in dollars; anything above the cap earns nothing.
  const mnOver = Math.max(0, mnDollars - P.mn.cap * P.mn.capture / 100);
  const mandate = euCounted * M.euPenaltyPerGal + ukObl * M.ukBuyout + ukExtra * M.ukCert;
  return {value: base + mandate - mnOver, base, mandate, eu, uk, euCounted, ukObl, ukExtra, mnDollars: mnDollars - mnOver};
}

function solve(s, cands) {
  const P = s.policy, M = mandateParams(s), n = cands.length, nv = n + 4; // + euCounted, ukObl, ukExtra, mnCounted
  const A = [], b = [], row = () => new Array(nv).fill(0);
  for (const bt of s.batches) { const r = row(); cands.forEach((c, i) => { if (c.b === bt) r[i] = 1; }); A.push(r); b.push(Math.max(0, bt.gallons)); }
  for (const a of s.airports) { const r = row(); cands.forEach((c, i) => { if (c.a === a) r[i] = 1; }); A.push(r); b.push(Math.max(0, a.uptake)); }
  for (const l of s.lanes) { const r = row(); cands.forEach((c, i) => { if (c.lane === l) r[i] = 1; }); A.push(r); b.push(Math.max(0, l.capacity)); }
  // EU: counted gallons ≤ eligible EU gallons, ≤ obligation.
  let r = row(); r[n] = 1; cands.forEach((c, i) => { if (c.a.jur === 'EU') r[i] = -euUnits(c.b); }); A.push(r); b.push(0);
  r = row(); r[n] = 1; A.push(r); b.push(M.euObligation);
  // UK: certificates counted at buy-out (≤ obligation) plus surplus at traded value ≤ certificates generated.
  r = row(); r[n + 1] = 1; r[n + 2] = 1; cands.forEach((c, i) => { if (c.a.jur === 'UK') r[i] = -ukCerts(c.b, P); }); A.push(r); b.push(0);
  r = row(); r[n + 1] = 1; A.push(r); b.push(M.ukObligation);
  // Minnesota: only the state credit stops at the program cap; MN gallons keep their other value.
  r = row(); r[n + 3] = 1; cands.forEach((c, i) => { if (c.a.jur === 'MN') r[i] = -c.v.state; }); A.push(r); b.push(0);
  r = row(); r[n + 3] = 1; A.push(r); b.push(P.mn.cap * P.mn.capture / 100);
  const obj = [...cands.map(c => c.v.total - (c.a.jur === 'MN' ? c.v.state : 0)), M.euPenaltyPerGal, M.ukBuyout, M.ukCert, 1];
  const res = maximize(obj, A, b);
  if (res.status !== 'optimal') throw new Error('Supplier plan has no bounded optimum');
  return res.x.slice(0, n).map(v => v < 1e-6 ? 0 : v);
}

// Credit-blind comparison: each batch fills its cheapest-freight lanes first.
function nearestPlan(s, cands) {
  const x = new Array(cands.length).fill(0);
  const left = {batch: new Map(s.batches.map(b => [b, b.gallons])), airport: new Map(s.airports.map(a => [a, a.uptake])), lane: new Map(s.lanes.map(l => [l, l.capacity]))};
  cands.map((c, i) => ({c, i})).sort((p, q) => p.c.lane.freight - q.c.lane.freight || p.i - q.i).forEach(({c, i}) => {
    const q = Math.max(0, Math.min(left.batch.get(c.b), left.airport.get(c.a), left.lane.get(c.lane)));
    if (q <= 0) return;
    x[i] = q; left.batch.set(c.b, left.batch.get(c.b) - q); left.airport.set(c.a, left.airport.get(c.a) - q); left.lane.set(c.lane, left.lane.get(c.lane) - q);
  });
  return x;
}

export function planSupply(s, {marginals = true} = {}) {
  const cands = candidates(s), x = solve(s, cands), ev = evaluate(s, cands, x), M = mandateParams(s);
  const baseX = nearestPlan(s, cands), baseEv = evaluate(s, cands, baseX);
  const allocations = cands.map((c, i) => ({batch: c.b.id, airport: c.a.id, terminal: c.lane.terminal, gallons: x[i], stack: c.v})).filter(a => a.gallons > 0.5);
  const airports = s.airports.map(a => {
    const rows = allocations.filter(r => r.airport === a.id), g = rows.reduce((t, r) => t + r.gallons, 0);
    const avg = k => g ? rows.reduce((t, r) => t + r.gallons * r.stack[k], 0) / g : 0;
    const stack = Object.fromEntries(['premium', 'freight', 'rin', 'lcfs', 'state', 'z45'].map(k => [k, avg(k)]));
    let mandate = 0;
    if (a.jur === 'EU' && g) mandate = rows.reduce((t, r) => t + r.gallons * euUnits(s.batches.find(b => b.id === r.batch)), 0) / g * (ev.eu ? ev.euCounted / ev.eu : 0) * M.euPenaltyPerGal;
    if (a.jur === 'UK' && g) { const certs = rows.reduce((t, r) => t + r.gallons * ukCerts(s.batches.find(b => b.id === r.batch), s.policy), 0); mandate = ev.uk ? (ev.ukObl * M.ukBuyout + ev.ukExtra * M.ukCert) * (certs / ev.uk) / g : 0; }
    stack.mandate = mandate;
    return {...a, gallons: g, stack, perGal: g ? Object.values(stack).reduce((t, v) => t + v, 0) : 0, fill: a.uptake ? g / a.uptake : 0};
  });
  const batches = s.batches.map(b => { const g = allocations.filter(r => r.batch === b.id).reduce((t, r) => t + r.gallons, 0); return {...b, allocated: g, unallocated: Math.max(0, b.gallons - g)}; });
  const out = {
    allocations, airports, batches, value: ev.value, baseline: baseEv.value, uplift: ev.value - baseEv.value,
    gallons: allocations.reduce((t, r) => t + r.gallons, 0),
    eu: {obligation: M.euObligation, counted: ev.euCounted, delivered: ev.eu, shortfall: Math.max(0, M.euObligation - ev.euCounted), penaltyPerGal: M.euPenaltyPerGal},
    uk: {obligation: M.ukObligation, certificates: ev.uk, shortfall: Math.max(0, M.ukObligation - ev.uk), buyout: M.ukBuyout, certValue: M.ukCert},
    mn: {dollars: ev.mnDollars, cap: s.policy.mn.cap * s.policy.mn.capture / 100}
  };
  out.eu.exposure = out.eu.shortfall * M.euPenaltyPerGal;
  out.uk.exposure = out.uk.shortfall * M.ukBuyout;
  if (marginals) {
    // Value of 10,000 more gallons of uptake at each airport, or of each batch (re-solve; $/gal).
    const step = 10000, clone = () => structuredClone(s);
    for (const a of out.airports) { const t = clone(); t.airports.find(z => z.id === a.id).uptake += step; a.marginal = (planSupply(t, {marginals: false}).value - out.value) / step; }
    for (const b of out.batches) { const t = clone(); t.batches.find(z => z.id === b.id).gallons += step; b.marginal = (planSupply(t, {marginals: false}).value - out.value) / step; }
  }
  return out;
}

// Exposed for tests: score any feasible allocation with the same objective the LP maximizes.
export const _internal = {candidates, evaluate};
