// Compliance Plan: how much SAF should an airline contract for the compliance year, and where,
// so it meets EU ETS, CORSIA and its own SAF target at the lowest cost when weather and supply go wrong?
//
// Two-stage stochastic LP:
//   Stage 1 (now):        contract tonnes c_k from each supplier offer (take-or-pay on what is delivered).
//   Stage 2 (per scenario s): weather changes fuel burn and diversions, suppliers deliver δ_ks·c_k.
//                         Each delivered tonne is claimed once, on one flight group at its uplift airport:
//                         ETS flights (zero-rated, saves allowances, earns SAF-allowance support) or
//                         CORSIA flights (reduces offsets by the CEF formula) or other flights.
//                         Backups: spot SAF, book-and-claim certificates (corporate target only), EUAs, CORSIA units.
// Objective: (1 − λ)·expected cost + λ·CVaR (mean of the worst (1 − α) share of scenarios).
import {solveLP} from './lp.mjs';

export const FOSSIL_CI = 89;     // gCO2e/MJ, ICAO/CORSIA jet baseline
export const FCF = 3.16;         // tCO2 per t jet fuel (CORSIA fuel conversion factor)
export const LHV = 43;           // MJ/kg

export const COMPLIANCE_SOURCES = {
  ets: {label: 'European Commission: aviation in the EU ETS, SAF allowances (50–95% of price gap), full auctioning from 2026', url: 'https://climate.ec.europa.eu/areas-action/transport-decarbonisation/reducing-emissions-aviation_en'},
  eua: {label: 'GMK Center: EUA Dec-26 futures €88.3/t (12 Oct 2026)', url: 'https://gmk.center/en/news/european-carbon-prices-rose-to-e88-t-in-october/amp/'},
  etsRef: {label: 'Climate Catalyst (Mar 2026): 2024 reference prices, SAF €2,085/t, jet €734/t', url: 'https://climatecatalyst.org/wp-content/uploads/2026/03/EU-Alternative-Aviation-Fuel-Policies.pdf'},
  uplift: {label: 'SkyNRG: ReFuelEU 90% uplift rule for aircraft operators, fine 2× jet price', url: 'https://skynrg.com/refueleu-how-it-will-shape-the-saf-market/'},
  corsia: {label: 'EDF (Jul 2026): CORSIA Phase 1 2024–26, mandatory phase from 2027, unit supply gap', url: 'https://blogs.edf.org/energyexchange/2026/07/27/corsia-at-a-crossroads-the-next-year-will-determine-its-course/'},
  corsiaUS: {label: 'FAA CORSIA FAQ: US volunteered for the voluntary phases', url: 'https://www.faa.gov/media/67966'},
  corsiaPrice: {label: 'Sylvera: CORSIA units likely $25–36 by 2027 (projection)', url: 'https://www.sylvera.com/blog/corsia-phase-1-pricing-what-airlines-need-to-know-about-costs'},
  canada: {label: 'Transport Canada SAF Blueprint: CORSIA in regulation, ≥10% reduction for eligible fuel, BC renewable jet 1–3% (2028–30)', url: 'https://tc.canada.ca/sites/default/files/2026-07/sustainable-aviation-fuels-blueprint-canada.pdf'},
  caJet: {label: 'CARB LCFS Basics (Nov 2025): conventional jet still exempt; intrastate jet obligation from 2028 was proposed', url: 'https://ww2.arb.ca.gov/sites/default/files/2025-11/LCFS%20Basics_post11-20-25_final.pdf'},
  safPrice: {label: 'EASA 2025 reference prices: SAF €1,925/t, jet €640/t', url: 'https://www.safinvestor.com/news/149690/easa-2025/'}
};

export function demoCompliance() {
  return {
    year: 2027, airline: 'Meridian Air (demo)',
    prices: {jetUsdT: 743, euaEur: 88.3, eurUsd: 1.161, eeuUsd: 25, safcUsdT: 1500, safcMaxT: 4000, gapUsdT: 2500, carbonUsd: 0},
    ets: {supportPct: 50, safRefEur: 2085, jetRefEur: 734, allowances: true},
    corsia: {sgf: 19},                       // sector growth factor (%) — replace with ICAO's published value
    target: {share: 4},                      // corporate SAF target, % of total fuel
    risk: {lambda: 30, alpha: 90, scenarios: 16, seed: 2027},
    weather: {
      mild: {p: 55, burn: 0.5, divert: 0.5}, active: {p: 35, burn: 1.5, divert: 1.5}, severe: {p: 10, burn: 3.5, divert: 4}
    },
    groups: [
      {id: 'G1', name: 'Intra-Europe', fuel: 120000, airports: ['AMS'], ets: true, corsia: false, euDeparture: true},
      {id: 'G2', name: 'Europe → North America', fuel: 180000, airports: ['AMS'], ets: false, corsia: true, euDeparture: true},
      {id: 'G3', name: 'North America → Europe', fuel: 180000, airports: ['JFK', 'ORD'], ets: false, corsia: true, euDeparture: false},
      {id: 'G4', name: 'US–Canada transborder', fuel: 60000, airports: ['ORD', 'SEA', 'YYZ', 'YVR'], ets: false, corsia: true, euDeparture: false},
      {id: 'G5', name: 'US domestic', fuel: 800000, airports: ['LAX', 'SFO', 'ORD', 'JFK', 'SEA'], ets: false, corsia: false, euDeparture: false},
      {id: 'G6', name: 'Canada domestic', fuel: 50000, airports: ['YYZ', 'YVR'], ets: false, corsia: false, euDeparture: false}
    ],
    // Contract offers: price $/t delivered at the airport, CI gCO2e/MJ (CORSIA method), annual shortfall risk %.
    offers: [
      {id: 'K1', supplier: 'North Sea Renewables (demo)', airport: 'AMS', maxT: 15000, price: 2300, ci: 18, risk: 10, gulf: false},
      {id: 'K2', supplier: 'Gulf Biofuels (demo)', airport: 'JFK', maxT: 20000, price: 2050, ci: 24, risk: 15, gulf: true},
      {id: 'K3', supplier: 'Prairie HEFA (demo)', airport: 'ORD', maxT: 12000, price: 2000, ci: 52, risk: 8, gulf: false},
      {id: 'K4', supplier: 'Pacific Renewables (demo)', airport: 'LAX', maxT: 12000, price: 2250, ci: 22, risk: 10, gulf: false},
      {id: 'K5', supplier: 'Cascadia Fuels (demo)', airport: 'SEA', maxT: 6000, price: 2200, ci: 20, risk: 12, gulf: false},
      {id: 'K6', supplier: 'Fraser Clean Fuels (demo)', airport: 'YVR', maxT: 5000, price: 2400, ci: 25, risk: 15, gulf: false},
      {id: 'K7', supplier: 'Gulf Biofuels (demo)', airport: 'ORD', maxT: 10000, price: 2100, ci: 24, risk: 15, gulf: true}
    ],
    // Spot SAF bought only if needed in a scenario; scarcer and dearer when several contracts fall short.
    spot: [
      {id: 'S1', airport: 'AMS', maxT: 3000, price: 2900, ci: 25},
      {id: 'S2', airport: 'JFK', maxT: 3000, price: 2800, ci: 30},
      {id: 'S3', airport: 'LAX', maxT: 2000, price: 2850, ci: 25}
    ]
  };
}

// Seeded scenario generation: weather regime per scenario, supplier shortfalls (Gulf suppliers more
// exposed in severe hurricane-type seasons), and a tighter spot market when several contracts fail.
export function scenarios(cfg) {
  let seed = (cfg.risk.seed >>> 0) || 1;
  const rng = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  const W = cfg.weather, total = W.mild.p + W.active.p + W.severe.p || 1, S = Math.max(4, Math.min(40, Math.round(cfg.risk.scenarios)));
  const out = [];
  for (let s = 0; s < S; s++) {
    const u = rng() * total, regime = u < W.mild.p ? 'mild' : u < W.mild.p + W.active.p ? 'active' : 'severe', w = W[regime];
    const delivered = {}, short = [];
    for (const k of cfg.offers) {
      const p = Math.min(0.95, (k.risk / 100) * (regime === 'severe' && k.gulf ? 3 : 1));
      const hit = rng() < p, frac = hit ? 0.2 + 0.6 * rng() : 1;
      delivered[k.id] = frac; if (hit) short.push(k.id);
    }
    const tight = short.length >= 2;
    out.push({id: s + 1, regime, burn: w.burn / 100, divert: w.divert / 100, delivered, short, spotScale: tight ? 0.5 : 1, spotMarkup: tight ? 1.3 : 1, p: 1 / S});
  }
  return out;
}

// Average-year scenario used for the "plan for an average year" comparison.
export function averageScenario(cfg) {
  const W = cfg.weather, total = W.mild.p + W.active.p + W.severe.p || 1;
  const burn = (W.mild.p * W.mild.burn + W.active.p * W.active.burn + W.severe.p * W.severe.burn) / total / 100;
  const divert = (W.mild.p * W.mild.divert + W.active.p * W.active.divert + W.severe.p * W.severe.divert) / total / 100;
  const delivered = Object.fromEntries(cfg.offers.map(k => [k.id, 1 - (k.risk / 100) * 0.5]));
  return [{id: 0, regime: 'average', burn, divert, delivered, short: [], spotScale: 1, spotMarkup: 1, p: 1}];
}

export const reductionPerT = ci => FCF * Math.max(0, 1 - ci / FOSSIL_CI);           // CORSIA ER per t SAF (tCO2)
export const lifecyclePerT = ci => Math.max(0, FOSSIL_CI - ci) * LHV / 1000;          // tCO2e saved per t SAF
export const corsiaEligible = ci => ci <= FOSSIL_CI * 0.9;                          // ≥10% lifecycle reduction

function prices(cfg) {
  const P = cfg.prices, E = cfg.ets;
  const eua = P.euaEur * P.eurUsd;                                                   // $/tCO2
  const support = E.allowances ? (E.supportPct / 100) * Math.max(0, E.safRefEur - E.jetRefEur) * P.eurUsd : 0;  // $/t SAF on ETS flights
  return {eua, support};
}

// Build and solve. fixed: optional {offerId: tonnes} to evaluate a given contract plan.
export function solveCompliance(cfg, scen = scenarios(cfg), fixed = null) {
  const {eua, support} = prices(cfg), P = cfg.prices, S = scen.length;
  const lambda = Math.min(1, Math.max(0, cfg.risk.lambda / 100)), alpha = Math.min(0.99, Math.max(0, cfg.risk.alpha / 100));
  const groupsAt = ap => cfg.groups.filter(g => g.airports.includes(ap));
  const cols = []; const add = (meta) => { cols.push(meta); return cols.length - 1; };
  const cIdx = cfg.offers.map(k => add({t: 'contract', k}));
  const etaP = add({t: 'eta+'}), etaN = add({t: 'eta-'});
  const per = scen.map(sc => {
    const v = {sc, y: [], q: [], cert: add({t: 'cert', sc}), corsiaShort: add({t: 'corsia', sc}), gap: add({t: 'gap', sc}), cP: add({t: 'cost+', sc}), cN: add({t: 'cost-', sc}), z: add({t: 'z', sc})};
    for (const k of cfg.offers) for (const g of groupsAt(k.airport)) v.y.push({col: add({t: 'y', sc, k, g}), k, g});
    for (const o of cfg.spot) for (const g of groupsAt(o.airport)) v.q.push({col: add({t: 'q', sc, o, g}), o, g});
    return v;
  });
  const n = cols.length, cons = [];
  const row = () => ({}), put = (r, j, val) => { r[j] = (r[j] || 0) + val; };
  for (const [i, k] of cfg.offers.entries()) {
    const r = row(); put(r, cIdx[i], 1);
    if (fixed) cons.push({a: r, op: '=', b: Math.min(k.maxT, Math.max(0, fixed[k.id] || 0))}); else cons.push({a: r, op: '<=', b: k.maxT});
  }
  const fuel = (g, sc) => g.fuel * (1 + sc.burn);
  const totalFuel = sc => cfg.groups.reduce((t, g) => t + fuel(g, sc), 0);
  for (const v of per) {
    const sc = v.sc;
    // Every delivered contract tonne is claimed once, on a flight group departing its airport.
    cfg.offers.forEach((k, i) => {
      const r = row(); put(r, cIdx[i], -(sc.delivered[k.id] ?? 1));
      v.y.filter(e => e.k === k).forEach(e => put(r, e.col, 1));
      if (Object.keys(r).length > 1) cons.push({a: r, op: '=', b: 0});
    });
    // Spot availability.
    for (const o of cfg.spot) { const r = row(); v.q.filter(e => e.o === o).forEach(e => put(r, e.col, 1)); if (Object.keys(r).length) cons.push({a: r, op: '<=', b: o.maxT * sc.spotScale}); }
    // Blend limit: SAF on a group at an airport ≤ 50% of that group's fuel uplifted there.
    for (const g of cfg.groups) for (const ap of g.airports) {
      const r = row(); v.y.filter(e => e.g === g && e.k.airport === ap).forEach(e => put(r, e.col, 1)); v.q.filter(e => e.g === g && e.o.airport === ap).forEach(e => put(r, e.col, 1));
      if (Object.keys(r).length) cons.push({a: r, op: '<=', b: 0.5 * fuel(g, sc) / g.airports.length});
    }
    // CORSIA: units bought ≥ requirement − eligible-fuel reductions.
    const corsiaReq = cfg.groups.filter(g => g.corsia).reduce((t, g) => t + FCF * fuel(g, sc), 0) * cfg.corsia.sgf / 100;
    { const r = row(); put(r, v.corsiaShort, 1);
      v.y.filter(e => e.g.corsia && corsiaEligible(e.k.ci)).forEach(e => put(r, e.col, reductionPerT(e.k.ci)));
      v.q.filter(e => e.g.corsia && corsiaEligible(e.o.ci)).forEach(e => put(r, e.col, reductionPerT(e.o.ci)));
      cons.push({a: r, op: '>=', b: corsiaReq}); }
    // Book-and-claim certificates: limited supply, halved when several contracts fail.
    { const r = row(); put(r, v.cert, 1); cons.push({a: r, op: '<=', b: P.safcMaxT * sc.spotScale}); }
    // Corporate target: SAF used + certificates + gap ≥ share × total fuel.
    { const r = row(); put(r, v.gap, 1); put(r, v.cert, 1); v.y.forEach(e => put(r, e.col, 1)); v.q.forEach(e => put(r, e.col, 1));
      cons.push({a: r, op: '>=', b: cfg.target.share / 100 * totalFuel(sc)}); }
    // Scenario cost (constant part on the right-hand side).
    const etsFuel = cfg.groups.filter(g => g.ets).reduce((t, g) => t + fuel(g, sc), 0);
    const euNeed = cfg.groups.filter(g => g.euDeparture).reduce((t, g) => t + fuel(g, sc), 0);
    const upliftPenalty = 2 * P.jetUsdT * euNeed * Math.max(0, sc.divert - 0.10);
    const constant = eua * FCF * etsFuel + upliftPenalty;
    const r = row(); put(r, v.cP, 1); put(r, v.cN, -1);
    cfg.offers.forEach((k, i) => put(r, cIdx[i], -(k.price - P.jetUsdT) * (sc.delivered[k.id] ?? 1)));
    for (const e of v.y) {
      let c = 0;
      if (e.g.ets) c += eua * FCF + support;       // allowances not needed, plus SAF-allowance support
      c += P.carbonUsd * lifecyclePerT(e.k.ci);
      put(r, e.col, c);
    }
    for (const e of v.q) {
      let c = -(e.o.price * sc.spotMarkup - P.jetUsdT);
      if (e.g.ets) c += eua * FCF + support;
      c += P.carbonUsd * lifecyclePerT(e.o.ci);
      put(r, e.col, c);
    }
    put(r, v.cert, -P.safcUsdT * sc.spotMarkup); put(r, v.corsiaShort, -P.eeuUsd); put(r, v.gap, -P.gapUsdT);
    cons.push({a: r, op: '=', b: constant});
    v.constant = constant; v.corsiaReq = corsiaReq; v.etsFuel = etsFuel; v.euNeed = euNeed; v.upliftPenalty = upliftPenalty; v.totalFuel = totalFuel(sc);
    // CVaR: z ≥ cost − η.
    const rz = row(); put(rz, v.z, 1); put(rz, v.cP, -1); put(rz, v.cN, 1); put(rz, etaP, 1); put(rz, etaN, -1);
    cons.push({a: rz, op: '>=', b: 0});
  }
  const obj = new Array(n).fill(0);
  for (const v of per) { obj[v.cP] += (1 - lambda) * v.sc.p; obj[v.cN] -= (1 - lambda) * v.sc.p; obj[v.z] += lambda * v.sc.p / (1 - alpha); }
  obj[etaP] += lambda; obj[etaN] -= lambda;
  const res = solveLP({objective: obj, sense: 'min', constraints: cons});
  if (res.status !== 'optimal') throw new Error(res.status === 'infeasible' ? 'No feasible compliance plan with these inputs' : 'Compliance plan is unbounded');
  const x = res.x;
  const contracts = cfg.offers.map((k, i) => ({...k, tonnes: x[cIdx[i]]}));
  const results = per.map(v => {
    const sc = v.sc, cost = x[v.cP] - x[v.cN];
    const claims = {ets: 0, corsia: 0, other: 0}, byOffer = {};
    let saf = 0, lifecycle = 0, er = 0, contractCost = 0, spotT = 0, spotCost = 0, support$ = 0;
    for (const e of v.y) { const t = x[e.col]; if (t < 1e-6) continue; saf += t; lifecycle += t * lifecyclePerT(e.k.ci); claims[e.g.ets ? 'ets' : e.g.corsia ? 'corsia' : 'other'] += t; if (e.g.corsia && corsiaEligible(e.k.ci)) er += t * reductionPerT(e.k.ci); byOffer[e.k.id] = (byOffer[e.k.id] || 0) + t; if (e.g.ets) support$ += t * support; }
    for (const e of v.q) { const t = x[e.col]; if (t < 1e-6) continue; saf += t; spotT += t; spotCost += t * (e.o.price * sc.spotMarkup - P.jetUsdT); lifecycle += t * lifecyclePerT(e.o.ci); claims[e.g.ets ? 'ets' : e.g.corsia ? 'corsia' : 'other'] += t; if (e.g.corsia && corsiaEligible(e.o.ci)) er += t * reductionPerT(e.o.ci); if (e.g.ets) support$ += t * support; }
    cfg.offers.forEach((k, i) => { contractCost += (k.price - P.jetUsdT) * (sc.delivered[k.id] ?? 1) * x[cIdx[i]]; });
    const etsSaf = claims.ets, euas = FCF * (v.etsFuel - etsSaf);
    const targetT = cfg.target.share / 100 * v.totalFuel;
    return {
      id: sc.id, regime: sc.regime, p: sc.p, short: sc.short, cost, saf, lifecycle, claims, spotT, certT: x[v.cert], gapT: x[v.gap], targetT,
      euas, euaCost: euas * eua, eeus: x[v.corsiaShort], eeuCost: x[v.corsiaShort] * P.eeuUsd, corsiaReq: v.corsiaReq, er,
      contractCost, spotCost, certCost: x[v.cert] * P.safcUsdT * sc.spotMarkup, gapCost: x[v.gap] * P.gapUsdT, support: support$, upliftPenalty: v.upliftPenalty,
      upliftShare: 1 - sc.divert, targetMet: x[v.gap] < 1
    };
  });
  const E = f => results.reduce((t, r) => t + r.p * f(r), 0);
  const sorted = results.map(r => r.cost).sort((a, b) => b - a), tailN = Math.max(1, Math.round((1 - alpha) * S));
  return {
    contracts, scenarios: results, expectedCost: E(r => r.cost), cvar: sorted.slice(0, tailN).reduce((t, c) => t + c, 0) / tailN, worst: sorted[0], best: sorted.at(-1),
    expected: {saf: E(r => r.saf), lifecycle: E(r => r.lifecycle), euas: E(r => r.euas), eeus: E(r => r.eeus), spot: E(r => r.spotT), cert: E(r => r.certT), gap: E(r => r.gapT), target: E(r => r.targetT), pTarget: E(r => r.targetMet ? 1 : 0)},
    contracted: contracts.reduce((t, k) => t + k.tonnes, 0), eua, support, iterations: res.iterations
  };
}

// Full plan: risk-aware contracts, compared with contracts sized for an average year.
export function planCompliance(cfg) {
  const scen = scenarios(cfg);
  const plan = solveCompliance(cfg, scen);
  const avgPlan = solveCompliance({...cfg, risk: {...cfg.risk, lambda: 0}}, averageScenario(cfg));
  const naive = solveCompliance(cfg, scen, Object.fromEntries(avgPlan.contracts.map(k => [k.id, k.tonnes])));
  return {...plan, naive, naiveContracts: avgPlan.contracts, saving: naive.expectedCost - plan.expectedCost, tailSaving: naive.cvar - plan.cvar};
}
