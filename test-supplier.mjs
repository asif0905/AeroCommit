import assert from 'node:assert/strict';
import {demoSupplier, planSupply, valueStack, ukCerts, euUnits, mandateParams} from './dist/supplier.mjs';
const near = (a, b, tol = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b}`);
const s0 = demoSupplier(), P = s0.policy;
const B = id => s0.batches.find(b => b.id === id), A = id => s0.airports.find(a => a.id === id), lane = (t, a) => s0.lanes.find(l => l.terminal === t && l.airport === a);

// Hand-calculated value stack.
let v = valueStack(B('B1'), A('LAX'), lane('HOU', 'LAX'), P);
near(v.rin, 1.6 * 2.05, 1e-9, 'RIN');
near(v.lcfs, (80.17 - 22) * 126.37 / 1e6 * 89.25, 1e-9, 'CA LCFS');
near(v.z45, 0, 0, 'imported UCO gets no 45Z');
near(v.total, 3.28 + (80.17 - 22) * 126.37e-6 * 89.25 - 0.35, 1e-9, 'total');
v = valueStack(B('B2'), A('SEA'), lane('HOU', 'SEA'), P);
near(v.lcfs, (93.10 - 30) * 126.37e-6 * 82.25, 1e-9, 'WA CFS');
near(v.z45, 0.5, 1e-9, '45Z tallow: (50-23.7)/50 rounds to 0.5');
v = valueStack(B('B3'), A('ORD'), lane('CHI', 'ORD'), P);
near(v.state, 0.75, 1e-9, 'IL $1.50 at 50% capture');
near(v.z45, 0.2, 1e-9, '45Z soybean');
v = valueStack(B('B1'), A('AMS'), lane('HOU', 'AMS'), P);
near(v.rin + v.lcfs + v.state, 0, 0, 'no US credits on exported gallons');
// Minnesota tier: UCO (84% reduction) hits the $2.00 cap; soybean with ILUC (27%) earns nothing.
near(valueStack(B('B1'), {jur: 'MN'}, {freight: 0}, P).state, 2.00, 1e-9, 'MN cap');
near(valueStack(B('B3'), {jur: 'MN'}, {freight: 0}, P).state, 0, 0, 'MN threshold');
// Mandate units: crop feedstock never counts; UK certificates per DfT formula.
assert.equal(euUnits(B('B3')), 0); assert.equal(ukCerts(B('B3'), P), 0);
near(ukCerts(B('B1'), P), 3.785411784 * 33.38 * (89 - 14) / (89 - 26.7) / 34, 1e-9, 'UK certificates');
const M = mandateParams(s0);
near(M.euPenaltyPerGal, 2 * (1925 - 640) * 1.161 / (1000 / (3.785411784 * 0.8)), 1e-9, 'EU penalty');
console.log('PASS supplier value stack: RINs, LCFS/CFS, 45Z origin and CI rounding, IL, MN tiers, EU/UK mandate units.');

// Feasibility and optimality on demo and random scenarios.
function check(s) {
  const p = planSupply(s, {marginals: false}), eps = 1e-3;
  for (const b of s.batches) assert.ok(p.allocations.filter(r => r.batch === b.id).reduce((t, r) => t + r.gallons, 0) <= b.gallons + eps, 'batch volume');
  for (const a of s.airports) assert.ok(p.allocations.filter(r => r.airport === a.id).reduce((t, r) => t + r.gallons, 0) <= a.uptake + eps, 'airport uptake');
  for (const l of s.lanes) assert.ok(p.allocations.filter(r => r.terminal === l.terminal && r.airport === l.airport).reduce((t, r) => t + r.gallons, 0) <= l.capacity + eps, 'lane capacity');
  for (const r of p.allocations) assert.equal(r.terminal, s.batches.find(b => b.id === r.batch).terminal, 'batch ships from its own terminal');
  assert.ok(p.mn.dollars <= p.mn.cap + eps, 'MN cap');
  assert.ok(p.value >= p.baseline - 1e-3, 'optimizer at least matches nearest-airport plan');
  return p;
}
const p = check(s0);
assert.ok(p.uplift > 0, 'demo: optimizer beats nearest-airport plan');
near(p.uk.certificates, p.uk.obligation, 1, 'UK filled to obligation when surplus certificates have no sale value');
assert.equal(p.eu.shortfall, 0);
// EU shortfall exposure when uptake at EU airports is too small.
let s = demoSupplier(); s.airports.find(a => a.id === 'AMS').uptake = 100000;
let q = check(s); near(q.eu.shortfall, 300000, 1, 'EU shortfall'); near(q.eu.exposure, 300000 * q.eu.penaltyPerGal, 1);
// MN cap binds.
s = demoSupplier(); s.policy.mn.cap = 50000; s.airports.find(a => a.id === 'MSP').uptake = 1e6; s.lanes.push({terminal: 'HOU', airport: 'MSP', freight: 0.1, capacity: 1e6});
q = check(s); near(q.mn.dollars, 50000, 1, 'MN cap binds');
assert.ok(q.allocations.filter(r => r.airport === 'MSP').reduce((t, r) => t + r.gallons, 0) > 50000 / 2 + 1, 'MN gallons beyond the cap still flow when other credits pay');
// Brute-force optimality: no randomly ordered feasible fill beats the LP under the same scoring.
const {_internal} = await import('./dist/supplier.mjs');
let seed = 4242; const rng = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
function randomFill(s, cands) {
  const x = new Array(cands.length).fill(0), lb = new Map(s.batches.map(b => [b, b.gallons])), la = new Map(s.airports.map(a => [a, a.uptake])), ll = new Map(s.lanes.map(l => [l, l.capacity]));
  cands.map((c, i) => ({c, i, r: rng()})).sort((a, b) => a.r - b.r).forEach(({c, i}) => {
    if (rng() < 0.25) return; // sometimes skip a lane entirely
    const q = Math.max(0, Math.min(lb.get(c.b), la.get(c.a), ll.get(c.lane)) * rng());
    x[i] = q; lb.set(c.b, lb.get(c.b) - q); la.set(c.a, la.get(c.a) - q); ll.set(c.lane, ll.get(c.lane) - q);
  });
  return x;
}
let beaten = 0;
for (let t = 0; t < 60; t++) {
  s = demoSupplier();
  s.batches.forEach(b => { b.gallons = rng() * 1.5e6; b.ciLcfs = 10 + rng() * 60; b.ciIcao = 10 + rng() * 70; b.ci45z = 10 + rng() * 50; });
  s.airports.forEach(a => { a.uptake = rng() * 7e5; a.premium = rng() * 0.3; });
  s.lanes.forEach(l => { l.freight = rng() * 0.8; l.capacity = rng() * 9e5; });
  s.policy.rfs.d4 = rng() * 3; s.obligations.euFuelGal = rng() * 4e7; s.obligations.ukFuelGal = rng() * 2e7; s.policy.uk.certGbp = rng() * 4; s.policy.mn.cap = rng() * 1e6;
  const lp = check(s), cands = _internal.candidates(s);
  for (let k = 0; k < 40; k++) { const other = _internal.evaluate(s, cands, randomFill(s, cands)).value; assert.ok(lp.value >= other - 1e-3, `random plan beat LP in scenario ${t}`); if (lp.value > other + 1) beaten++; }
}
console.log('PASS supplier LP: batch/uptake/lane/MN caps, EU shortfall exposure, beats nearest-airport plan, 60 random scenarios × 40 random feasible plans never beat the LP.');
