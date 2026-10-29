// Compliance Plan tab (airline side): inputs, risk slider, results and CSV export.
import {demoCompliance, planCompliance, COMPLIANCE_SOURCES} from './compliance.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const usd = (n, d = 0) => (n < 0 ? '−$' : '$') + fmt(Math.abs(n), d);
const big = n => Math.abs(n) >= 1e6 ? usd(n / 1e6, Math.abs(n) >= 1e8 ? 0 : 1) + 'm' : Math.abs(n) >= 1e3 ? usd(n / 1e3, 0) + 'k' : usd(n, 0);
const CHECKED = '2026-10-27';
const BOUNDS = {fuel: [0, 1e8], maxT: [0, 1e7], price: [0, 20000], ci: [-300, 200], risk: [0, 95],
  jetUsdT: [0, 5000], euaEur: [0, 1000], eurUsd: [0.5, 2], eeuUsd: [0, 500], safcUsdT: [0, 20000], safcMaxT: [0, 1e7], gapUsdT: [0, 50000], carbonUsd: [0, 2000],
  supportPct: [0, 100], safRefEur: [0, 20000], jetRefEur: [0, 5000], sgf: [0, 100], share: [0, 100], alpha: [50, 99], scenarios: [4, 40], seed: [1, 1e9], p: [0, 100], burn: [0, 50], divert: [0, 100], lambda: [0, 90]};
const RULES = [
  ['EU ETS: allowances for intra-EEA flights; SAF counts as zero; SAF-allowance support', 'EU', 'Modeled', 'ets'],
  ['ReFuelEU: airlines uplift ≥90% of EU-departing fuel at EU airports', 'EU', 'Modeled as diversion risk', 'uplift'],
  ['ReFuelEU 2% SAF blend obligation', 'EU', 'Supplier side (Supplier Plan)', 'uplift'],
  ['CORSIA offsetting; eligible fuel cuts offsets', 'US, Canada, EU (international)', 'Modeled', 'corsia'],
  ['US participation in CORSIA (voluntary phases; mandatory from 2027)', 'US', 'Assumed participating', 'corsiaUS'],
  ['Canada: CORSIA in regulation; Clean Fuel Regulations credits for SAF suppliers', 'Canada', 'CORSIA modeled; CFR supplier side', 'canada'],
  ['British Columbia renewable jet: 1% in 2028 → 3% in 2030', 'Canada', 'Supplier side, from 2028', 'canada'],
  ['California LCFS: intrastate jet obligation from 2028 (proposed)', 'US', 'Not modeled; unconfirmed', 'caJet'],
  ['Corporate SAF target', 'Airline', 'Modeled', null]
];

let C = demoCompliance(), result = null, timer = null, toastFn = () => {};
export const getCompliance = () => C;
export const getComplianceResult = () => result;
export function resetCompliance() { C = demoCompliance(); renderComplianceInputs(); renderComplianceResults(); }

// Restore saved inputs: known fields only, numbers within bounds.
export function restoreCompliance(raw) {
  if (!raw || typeof raw !== 'object') return;
  const d = demoCompliance(), ok = (k, v) => typeof v === 'number' && Number.isFinite(v) && BOUNDS[k] && v >= BOUNDS[k][0] && v <= BOUNDS[k][1];
  const str = (v, f, max = 60) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : f;
  const code = v => typeof v === 'string' && /^[A-Z0-9]{3,4}$/.test(v);
  try {
    const walk = (tpl, src) => { for (const k of Object.keys(tpl)) { if (tpl[k] && typeof tpl[k] === 'object' && !Array.isArray(tpl[k])) walk(tpl[k], src?.[k]); else if (typeof tpl[k] === 'boolean' && typeof src?.[k] === 'boolean') tpl[k] = src[k]; else if (typeof tpl[k] === 'number' && ok(k, src?.[k])) tpl[k] = src[k]; } };
    for (const key of ['prices', 'ets', 'corsia', 'target', 'risk', 'weather']) walk(d[key], raw[key]);
    if (Array.isArray(raw.groups) && raw.groups.length <= 20) d.groups = raw.groups.filter(g => g && /^G\d{1,3}$/.test(g.id) && Array.isArray(g.airports) && g.airports.every(code)).map(g => ({id: g.id, name: str(g.name, g.id), fuel: ok('fuel', g.fuel) ? g.fuel : 0, airports: g.airports.slice(0, 12), ets: g.ets === true, corsia: g.corsia === true, euDeparture: g.euDeparture === true}));
    if (Array.isArray(raw.offers) && raw.offers.length <= 30) d.offers = raw.offers.filter(k => k && /^K\d{1,3}$/.test(k.id) && code(k.airport)).map(k => ({id: k.id, supplier: str(k.supplier, k.id), airport: k.airport, maxT: ok('maxT', k.maxT) ? k.maxT : 0, price: ok('price', k.price) ? k.price : 2000, ci: ok('ci', k.ci) ? k.ci : 30, risk: ok('risk', k.risk) ? k.risk : 10, gulf: k.gulf === true}));
    if (Array.isArray(raw.spot) && raw.spot.length <= 20) d.spot = raw.spot.filter(o => o && /^S\d{1,3}$/.test(o.id) && code(o.airport)).map(o => ({id: o.id, airport: o.airport, maxT: ok('maxT', o.maxT) ? o.maxT : 0, price: ok('price', o.price) ? o.price : 2800, ci: ok('ci', o.ci) ? o.ci : 30}));
    C = d;
  } catch { C = demoCompliance(); }
}

export function initCompliance({toast}) {
  toastFn = toast;
  $('#cmp-checked').textContent = new Date(CHECKED + 'T12:00:00').toLocaleDateString('en-US', {day: 'numeric', month: 'long', year: 'numeric'});
  $('#cmp-sources').innerHTML = Object.values(COMPLIANCE_SOURCES).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a></li>`).join('');
  $('#cmp-rules').innerHTML = RULES.map(([rule, region, status, src]) => `<tr><td>${esc(rule)}${src ? ` <a class="cmp-src" href="${esc(COMPLIANCE_SOURCES[src].url)}" target="_blank" rel="noopener noreferrer">source ↗</a>` : ''}</td><td>${esc(region)}</td><td><span class="status ${status === 'Modeled' ? 'commit' : 'unallocated'}">${esc(status)}</span></td></tr>`).join('');
  const panel = $('#compliance');
  panel.addEventListener('input', e => { if (e.target.dataset.cmp && e.target.type !== 'checkbox') update(e.target, false); });
  panel.addEventListener('change', e => { if (e.target.dataset.cmp) update(e.target, true); });
  panel.addEventListener('click', e => {
    const rb = e.target.closest('[data-cmp-remove]'); if (rb) { C.offers = C.offers.filter(k => k.id !== rb.dataset.id); renderComplianceInputs(); solveSoon(0); return; }
    if (e.target.closest('.cmp-jump')) { e.preventDefault(); const d = $('#cmp-inputs'); d.open = true; d.scrollIntoView({block: 'start'}); }
  });
  $('#cmp-lambda').addEventListener('input', e => { C.risk.lambda = +e.target.value; lambdaText(); solveSoon(250); });
  $('#cmp-add-offer').onclick = () => {
    if (C.offers.length >= 30) return toastFn('The plan supports up to 30 offers.');
    const n = Math.max(0, ...C.offers.map(k => +k.id.slice(1))) + 1, ap = C.groups[0]?.airports[0] || 'AMS';
    C.offers.push({id: 'K' + n, supplier: 'New supplier', airport: ap, maxT: 5000, price: 2200, ci: 25, risk: 10, gulf: false});
    renderComplianceInputs(); solveSoon(0);
  };
  $('#cmp-export').onclick = exportCsv;
  renderComplianceInputs(); renderComplianceResults();
}

function lambdaText() {
  const l = C.risk.lambda;
  $('#cmp-lambda-text').textContent = l === 0 ? 'Off: cheapest on average' : `${l}% weight on the worst ${100 - C.risk.alpha}% of scenarios`;
}

function update(el, structural) {
  const path = el.dataset.cmp.split('.'), key = path.at(-1);
  let t = C; for (const k of path.slice(0, -1)) t = t[k];
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.dataset.kind === 'text') v = el.value.trim().slice(0, 60) || t[key];
  else if (el.dataset.kind === 'codes') { const codes = el.value.toUpperCase().split(/[\s,]+/).filter(c => /^[A-Z0-9]{3,4}$/.test(c)); if (!codes.length) return; v = [...new Set(codes)].slice(0, 12); }
  else if (el.dataset.kind === 'code') { v = el.value.trim().toUpperCase(); if (!/^[A-Z0-9]{3,4}$/.test(v)) return; }
  else { if (el.value.trim() === '') return; v = Number(el.value); if (!Number.isFinite(v)) return; const [lo, hi] = BOUNDS[key] || [-Infinity, Infinity]; v = Math.min(hi, Math.max(lo, v)); if (structural) el.value = v; }
  t[key] = v;
  solveSoon(structural ? 0 : 350);
}

const solveSoon = ms => { clearTimeout(timer); timer = setTimeout(renderComplianceResults, ms); };
const num = (path, v, step = 'any', cls = '') => `<input type="number" step="${step}" class="${cls}" data-cmp="${path}" value="${esc(+(+v).toFixed(4))}" aria-label="${esc(path.split('.').at(-1))}">`;
const chk = (path, v, label) => `<input type="checkbox" data-cmp="${path}"${v ? ' checked' : ''} aria-label="${esc(label)}">`;

export function renderComplianceInputs() {
  $('#cmp-year').textContent = C.year;
  $('#cmp-lambda').value = C.risk.lambda; lambdaText();
  $('#cmp-group-inputs').innerHTML = C.groups.map((g, i) => `<tr><td><input data-cmp="groups.${i}.name" data-kind="text" class="sup-name" value="${esc(g.name)}" aria-label="Group name"></td><td>${num(`groups.${i}.fuel`, g.fuel, 1000, 'sup-wide')}</td>
    <td><input data-cmp="groups.${i}.airports" data-kind="codes" class="sup-name" value="${esc(g.airports.join(', '))}" aria-label="Uplift airports"></td><td>${chk(`groups.${i}.ets`, g.ets, 'EU ETS')}</td><td>${chk(`groups.${i}.corsia`, g.corsia, 'CORSIA')}</td><td>${chk(`groups.${i}.euDeparture`, g.euDeparture, 'Departs EU')}</td></tr>`).join('');
  $('#cmp-offer-inputs').innerHTML = C.offers.map((k, i) => `<tr><td><input data-cmp="offers.${i}.supplier" data-kind="text" class="sup-name" value="${esc(k.supplier)}" aria-label="Supplier"><small class="muted">${esc(k.id)}</small></td>
    <td><input data-cmp="offers.${i}.airport" data-kind="code" class="cmp-code" value="${esc(k.airport)}" aria-label="Airport code"></td><td>${num(`offers.${i}.maxT`, k.maxT, 100, 'sup-wide')}</td><td>${num(`offers.${i}.price`, k.price, 10)}</td><td>${num(`offers.${i}.ci`, k.ci, 0.1)}</td><td>${num(`offers.${i}.risk`, k.risk, 1)}</td>
    <td>${chk(`offers.${i}.gulf`, k.gulf, 'Hurricane exposed')}</td><td><button class="icon-btn" data-cmp-remove="offer" data-id="${esc(k.id)}" aria-label="Remove ${esc(k.supplier)}">×</button></td></tr>`).join('');
  $('#cmp-spot-inputs').innerHTML = C.spot.map((o, i) => `<tr><td><b>${esc(o.airport)}</b></td><td>${num(`spot.${i}.maxT`, o.maxT, 100, 'sup-wide')}</td><td>${num(`spot.${i}.price`, o.price, 10)}</td><td>${num(`spot.${i}.ci`, o.ci, 0.1)}</td></tr>`).join('');
  const f = (label, path, v, step, src, note = '') => `<label>${label}${num(path, v, step)}${note ? `<small>${note}</small>` : ''}${src ? `<a href="${esc(COMPLIANCE_SOURCES[src].url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</label>`;
  const box = (label, path, v, note = '') => `<label class="sup-check"><input type="checkbox" data-cmp="${path}"${v ? ' checked' : ''}><span>${label}</span>${note ? `<small>${note}</small>` : ''}</label>`;
  const P = C.prices, W = C.weather;
  $('#cmp-policy').innerHTML = `
    <fieldset><legend>Fuel &amp; EU ETS</legend>${f('Jet fuel ($/t)', 'prices.jetUsdT', P.jetUsdT, 1, 'safPrice')}${f('EU allowance (€/tCO₂)', 'prices.euaEur', P.euaEur, 0.1, 'eua')}${f('EUR → USD', 'prices.eurUsd', P.eurUsd, 0.001)}${box('Claim SAF-allowance support', 'ets.allowances', C.ets.allowances, '20M allowances to 2030, first come')}${f('Support share of price gap (%)', 'ets.supportPct', C.ets.supportPct, 1, 'ets', '50% most biofuels, 70% advanced, 95% e-fuels')}${f('Reference SAF price (€/t)', 'ets.safRefEur', C.ets.safRefEur, 1, 'etsRef')}${f('Reference jet price (€/t)', 'ets.jetRefEur', C.ets.jetRefEur, 1, 'etsRef')}</fieldset>
    <fieldset><legend>CORSIA &amp; corporate target</legend>${f('CORSIA unit ($/tCO₂)', 'prices.eeuUsd', P.eeuUsd, 0.5, 'corsiaPrice', 'Projection; enter your quotes')}${f('Sector growth factor (%)', 'corsia.sgf', C.corsia.sgf, 0.1, 'corsia', 'Estimate; use ICAO’s published value')}${f('SAF target (% of fuel)', 'target.share', C.target.share, 0.1)}${f('Book-and-claim certificate ($/t)', 'prices.safcUsdT', P.safcUsdT, 10, null, 'Counts toward the target only')}${f('Certificates available (t/yr)', 'prices.safcMaxT', P.safcMaxT, 100)}${f('Cost of missing the target ($/t)', 'prices.gapUsdT', P.gapUsdT, 10, null, 'Internal value of a missed commitment')}${f('Internal carbon value ($/tCO₂e)', 'prices.carbonUsd', P.carbonUsd, 1, null, 'Rewards lifecycle savings beyond compliance')}</fieldset>
    <fieldset><legend>Weather seasons</legend>${['mild', 'active', 'severe'].map(k => f(`${k[0].toUpperCase() + k.slice(1)}: likelihood (%)`, `weather.${k}.p`, W[k].p, 1) + f(`${k[0].toUpperCase() + k.slice(1)}: extra fuel burn (%)`, `weather.${k}.burn`, W[k].burn, 0.1) + f(`${k[0].toUpperCase() + k.slice(1)}: EU uplift diverted (%)`, `weather.${k}.divert`, W[k].divert, 0.1)).join('')}</fieldset>
    <fieldset><legend>Scenarios</legend>${f('Number of scenarios', 'risk.scenarios', C.risk.scenarios, 1)}${f('Random seed', 'risk.seed', C.risk.seed, 1, null, 'Change to test another set of years')}${f('Bad-year cutoff (percentile)', 'risk.alpha', C.risk.alpha, 1, null, '90 = average of the worst 10%')}</fieldset>`;
}

export function renderComplianceResults() {
  try { result = planCompliance(C); } catch (e) { $('#cmp-metrics').innerHTML = `<div class="metric"><p>${esc(e.message)}. Check offers, fuel and target values.</p></div>`; return; }
  const r = result, X = r.expected;
  $('#cmp-metrics').innerHTML = [
    ['Expected compliance cost', big(r.expectedCost), `SAF premium, allowances, CORSIA units and backups`],
    ['Bad-year cost', big(r.cvar), `Average of the worst ${100 - C.risk.alpha}% of ${r.scenarios.length} scenarios`],
    [r.tailSaving >= 0 ? 'Saved in bad years' : 'Extra cost in bad years', big(Math.abs(r.tailSaving)), `Vs a plan sized for an average year, which is ${r.saving >= 0 ? big(r.saving) + ' dearer' : big(-r.saving) + ' cheaper'} on average`],
    ['SAF target met', fmt(100 * X.pTarget, 0) + '% of years', `${fmt(X.saf)} t SAF expected · ${fmt(X.lifecycle)} tCO₂e saved`]
  ].map(([l, n, p]) => `<div class="metric"><div class="metric-label">${l}</div><div class="number">${n}</div><p>${p}</p></div>`).join('');
  const maxT = Math.max(1, ...r.contracts.map(k => k.maxT));
  $('#cmp-contracts').innerHTML = r.contracts.map(k => {
    const nv = r.naiveContracts.find(n => n.id === k.id)?.tonnes || 0;
    return `<tr class="${k.tonnes > 0.5 ? '' : 'sup-idle'}"><td><b>${esc(k.supplier)}</b><small>${esc(k.airport)}${k.gulf ? ' · hurricane exposed' : ''}</small></td><td class="num">${usd(k.price)}/t<small>CI ${fmt(k.ci, 1)}</small></td><td class="num">${fmt(k.risk)}%</td>
      <td class="num"><b>${fmt(k.tonnes)} t</b> <span class="muted">of ${fmt(k.maxT)}</span><div class="sup-fill"><i style="width:${(100 * k.tonnes / maxT).toFixed(1)}%"></i></div></td><td class="num">${fmt(nv)} t${Math.abs(nv - k.tonnes) > 1 ? `<small>${nv > k.tonnes ? '−' : '+'}${fmt(Math.abs(nv - k.tonnes))} t here</small>` : ''}</td></tr>`;
  }).join('');
  const base = Math.min(...r.scenarios.map(s => s.cost), ...r.naive.scenarios.map(s => s.cost));
  const span = Math.max(1, ...r.scenarios.map(s => s.cost - base), ...r.naive.scenarios.map(s => s.cost - base));
  $('#cmp-scale').textContent = `Full width = ${big(span)} above the cheapest scenario (${big(base)})`;
  const rows = r.scenarios.map((s, i) => ({s, n: r.naive.scenarios[i]})).sort((a, b) => b.s.cost - a.s.cost);
  $('#cmp-scenarios').innerHTML = rows.map(({s, n}) => {
    const backups = [s.spotT > 0.5 && `${fmt(s.spotT)} t spot`, s.certT > 0.5 && `${fmt(s.certT)} t certificates`, s.gapT > 0.5 && `${fmt(s.gapT)} t target gap`, s.upliftPenalty > 0 && 'uplift fine'].filter(Boolean).join(' · ') || '—';
    const names = s.short.map(id => C.offers.find(k => k.id === id)).filter(Boolean).map(k => `${esc(k.supplier.replace(' (demo)', ''))} @${esc(k.airport)}`).join(', ') || 'None';
    return `<tr><td><span class="cmp-regime ${s.regime}">${s.regime}</span><small>Scenario ${s.id}</small></td><td class="cmp-short">${names}</td><td class="cmp-short">${backups}</td>
      <td><div class="cmp-bar"><i style="width:${(100 * (s.cost - base) / span).toFixed(1)}%"></i><b style="left:${(100 * (n.cost - base) / span).toFixed(1)}%" title="Average-year plan: ${big(n.cost)}"></b></div></td><td class="num">${big(s.cost)}<small>${n.cost > s.cost + 1 ? big(n.cost - s.cost) + ' saved' : n.cost < s.cost - 1 ? big(s.cost - n.cost) + ' more' : 'same'}</small></td></tr>`;
  }).join('');
  const cl = r.scenarios.reduce((t, s) => ({ets: t.ets + s.p * s.claims.ets, corsia: t.corsia + s.p * s.claims.corsia, other: t.other + s.p * s.claims.other}), {ets: 0, corsia: 0, other: 0});
  const tot = Math.max(1, cl.ets + cl.corsia + cl.other), meter = v => `<div class="sup-meter"><i style="width:${(100 * v / tot).toFixed(1)}%"></i></div>`;
  const worstUplift = Math.min(...r.scenarios.map(s => s.upliftShare));
  $('#cmp-claims').innerHTML = `
    <div><h3>EU ETS flights · ${fmt(cl.ets)} t</h3>${meter(cl.ets)}<p>Saves ${fmt(cl.ets * 3.16)} allowances (${big(cl.ets * 3.16 * r.eua)}) plus ${big(cl.ets * r.support)} SAF-allowance support.</p></div>
    <div><h3>CORSIA flights · ${fmt(cl.corsia)} t</h3>${meter(cl.corsia)}<p>Expected CORSIA units still to buy: ${fmt(X.eeus)} tCO₂.</p></div>
    <div><h3>Other flights · ${fmt(cl.other)} t</h3>${meter(cl.other)}<p>Counts toward the SAF target and climate savings only.</p></div>
    <p class="muted">Backups, expected: ${fmt(X.spot)} t spot SAF, ${fmt(X.cert)} t certificates, ${fmt(X.gap)} t target gap. ReFuelEU uplift at EU airports stays at or above ${fmt(100 * worstUplift, 1)}% in every scenario (rule: 90%).</p>`;
}

function exportCsv() {
  if (!result) return;
  const r = result;
  const rows = [['AeroCommit compliance plan', C.airline, C.year], ['Rules and prices checked', CHECKED], ['Risk weight on bad years (%)', C.risk.lambda], ['Expected cost USD', r.expectedCost.toFixed(0)], ['Bad-year cost USD (CVaR)', r.cvar.toFixed(0)], ['Average-year plan expected USD', r.naive.expectedCost.toFixed(0)], ['Average-year plan bad-year USD', r.naive.cvar.toFixed(0)], [],
    ['Offer', 'Supplier', 'Airport', 'Price $/t', 'CI', 'Shortfall risk %', 'Recommended t', 'Average-year plan t'],
    ...r.contracts.map(k => [k.id, k.supplier, k.airport, k.price, k.ci, k.risk, k.tonnes.toFixed(1), (r.naiveContracts.find(n => n.id === k.id)?.tonnes || 0).toFixed(1)]),
    [], ['Scenario', 'Weather', 'Shortfalls', 'SAF t', 'ETS t', 'CORSIA t', 'Other t', 'Spot t', 'Certificates t', 'Target gap t', 'EUAs tCO2', 'CORSIA units tCO2', 'Cost USD', 'Average-year plan cost USD'],
    ...r.scenarios.map((s, i) => [s.id, s.regime, s.short.join(' '), s.saf.toFixed(0), s.claims.ets.toFixed(0), s.claims.corsia.toFixed(0), s.claims.other.toFixed(0), s.spotT.toFixed(0), s.certT.toFixed(0), s.gapT.toFixed(0), s.euas.toFixed(0), s.eeus.toFixed(0), s.cost.toFixed(0), r.naive.scenarios[i].cost.toFixed(0)]),
    [], ['Screening estimate with illustrative inputs. Not legal or trading advice.']];
  const csv = '﻿' + rows.map(x => x.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = `aerocommit-compliance-plan-${C.year}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
