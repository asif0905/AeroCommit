import assert from 'node:assert/strict';
import {solveLP} from './dist/lp.mjs';
import {demoCompliance, planCompliance, solveCompliance, scenarios, reductionPerT, lifecyclePerT, FCF} from './dist/compliance.mjs';
const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} != ${b}`);

// General LP: known optima, equality/≥ rows, negative right-hand sides, infeasible and unbounded cases.
let r = solveLP({objective: [3, 5], sense: 'max', constraints: [{a: [1, 0], op: '<=', b: 4}, {a: [0, 2], op: '<=', b: 12}, {a: [3, 2], op: '<=', b: 18}]});
near(r.value, 36, 1e-9, 'Wyndor'); near(r.x[0], 2, 1e-9); near(r.x[1], 6, 1e-9);
r = solveLP({objective: [2, 3], sense: 'min', constraints: [{a: [1, 1], op: '>=', b: 10}, {a: [1, -1], op: '=', b: 2}]});
near(r.x[0], 6, 1e-9, 'min with = and >='); near(r.x[1], 4, 1e-9); near(r.value, 24, 1e-9);
r = solveLP({objective: [1, 1], sense: 'max', constraints: [{a: [-1, -1], op: '>=', b: -5}]}); near(r.value, 5, 1e-9, 'negative rhs');
assert.equal(solveLP({objective: [1], constraints: [{a: [1], op: '>=', b: 3}, {a: [1], op: '<=', b: 2}]}).status, 'infeasible');
assert.equal(solveLP({objective: [1, 0], constraints: [{a: [1, -1], op: '<=', b: 1}]}).status, 'unbounded');
r = solveLP({objective: [1, 1], sense: 'min', constraints: [{a: {0: 1, 1: 2}, op: '>=', b: 4}, {a: {0: 3, 1: 1}, op: '>=', b: 6}]}); near(r.value, 2.8, 1e-9, 'sparse rows');
console.log('PASS LP: known optima, = and >= rows, negative RHS, sparse rows, infeasible and unbounded detection.');

// CORSIA and lifecycle formulas.
near(reductionPerT(24), 3.16 * (1 - 24 / 89), 1e-12, 'CORSIA ER'); near(lifecyclePerT(24), 65 * 43 / 1000, 1e-12, 'lifecycle');

// Feasibility and accounting on the demo plan.
const cfg = demoCompliance(), plan = planCompliance(cfg), scen = scenarios(cfg);
function audit(cfg, p) {
  const {eua, support} = p, P = cfg.prices;
  for (const k of p.contracts) assert.ok(k.tonnes >= -1e-6 && k.tonnes <= k.maxT + 1e-6, 'contract within offer');
  p.scenarios.forEach((s, i) => {
    const sc = scen[i];
    const delivered = p.contracts.reduce((t, k) => t + k.tonnes * (sc.delivered[k.id] ?? 1), 0);
    near(s.saf - s.spotT, delivered, 1e-3, `scenario ${s.id}: every delivered tonne claimed once`);
    near(s.claims.ets + s.claims.corsia + s.claims.other, s.saf, 1e-3, 'claims add up (no double counting)');
    assert.ok(s.eeus + s.er >= s.corsiaReq - 1e-3, 'CORSIA covered');
    assert.ok(s.saf + s.certT + s.gapT >= s.targetT - 1e-3, 'target covered or gap recorded');
    assert.ok(s.certT <= P.safcMaxT * sc.spotScale + 1e-6, 'certificate cap');
    const etsFuel = cfg.groups.filter(g => g.ets).reduce((t, g) => t + g.fuel * (1 + sc.burn), 0);
    const rebuilt = s.contractCost + s.spotCost + s.certCost + s.gapCost + eua * FCF * (etsFuel - s.claims.ets) - s.support + s.eeuCost + s.upliftPenalty - P.carbonUsd * s.lifecycle;
    near(rebuilt, s.cost, 1e-3 * Math.max(1, Math.abs(s.cost)) * 1e-6 + 1, `scenario ${s.id} cost rebuilds from parts`);
  });
}
audit(cfg, plan);
console.log('PASS compliance accounting: contracts within offers, one claim per tonne, CORSIA and target coverage, certificate cap, cost rebuilds from parts.');

// Risk-neutral plan beats (or ties) the average-year plan on expected cost; more risk weight lowers CVaR.
const at = lam => { const c = demoCompliance(); c.risk.lambda = lam; return planCompliance(c); };
const p0 = at(0), p30 = at(30), p70 = at(70);
assert.ok(p0.saving >= -1e-3, 'risk-neutral stochastic plan is no worse than the average-year plan');
assert.ok(p30.cvar <= p0.cvar + 1e-3 && p70.cvar <= p30.cvar + 1e-3, 'CVaR falls as risk weight rises');
assert.ok(p30.expectedCost >= p0.expectedCost - 1e-3 && p70.expectedCost >= p30.expectedCost - 1e-3, 'expected cost rises as risk weight rises');
// Hurricane exposure: with risk weight, Gulf contracts shrink relative to the risk-neutral plan.
const gulf = p => p.contracts.filter(k => k.gulf).reduce((t, k) => t + k.tonnes, 0);
assert.ok(gulf(p70) <= gulf(p0) + 1e-3, 'risk-averse plan holds no more Gulf exposure');
console.log(`PASS risk trade-off: λ=0 saves $${Math.round(p0.saving).toLocaleString()} vs average-year plan; CVaR ${Math.round(p0.cvar / 1e6 * 10) / 10}m → ${Math.round(p30.cvar / 1e6 * 10) / 10}m → ${Math.round(p70.cvar / 1e6 * 10) / 10}m.`);

// Hand-built case: one ETS group, one offer, no target, no CORSIA. Contract all if SAF on ETS pays, none if not.
const tiny = (price, support) => {
  const c = demoCompliance();
  c.groups = [{id: 'G', name: 'ETS', fuel: 10000, airports: ['AMS'], ets: true, corsia: false, euDeparture: true}];
  c.offers = [{id: 'K', supplier: 'X', airport: 'AMS', maxT: 1000, price, ci: 20, risk: 0, gulf: false}];
  c.spot = []; c.target.share = 0; c.ets.allowances = support; c.risk.scenarios = 4; c.risk.lambda = 0;
  return solveCompliance(c);
};
const euaT = 88.3 * 1.161 * FCF;   // allowance cost avoided per t
assert.equal(Math.round(tiny(743 + euaT - 50, false).contracts[0].tonnes), 1000, 'cheap SAF fully contracted');
assert.equal(Math.round(tiny(743 + euaT + 50, false).contracts[0].tonnes), 0, 'SAF dearer than allowances not contracted without support');
assert.equal(Math.round(tiny(743 + euaT + 50, true).contracts[0].tonnes), 1000, 'SAF-allowance support tips the decision');
// CORSIA-ineligible fuel (< 10% reduction) earns no offset reduction.
const c2 = demoCompliance(); c2.offers.forEach(k => { k.ci = 85; }); c2.risk.scenarios = 4;
assert.ok(solveCompliance(c2).scenarios.every(s => s.er === 0), 'CI 85 fuel gives no CORSIA reduction');
// Gulf suppliers fail more often in severe seasons (pooled over 40 seeds × 40 scenarios).
const tally = {severe: [0, 0], mild: [0, 0]}, gulfIds = demoCompliance().offers.filter(k => k.gulf).map(k => k.id);
for (let seed = 1; seed <= 40; seed++) for (const s of scenarios({...demoCompliance(), risk: {...demoCompliance().risk, scenarios: 40, seed}})) {
  if (!tally[s.regime]) continue; tally[s.regime][0] += gulfIds.filter(id => s.short.includes(id)).length; tally[s.regime][1] += gulfIds.length;
}
assert.ok(tally.severe[0] / tally.severe[1] > 1.8 * tally.mild[0] / tally.mild[1], 'Gulf shortfalls cluster in severe seasons');
console.log('PASS compliance cases: allowance break-even, SAF-allowance support, CORSIA 10% eligibility, scenario generation.');
