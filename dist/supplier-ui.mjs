// Supplier Plan tab: inputs, results and CSV export. Pure DOM; the model lives in supplier.mjs.
import {demoSupplier, planSupply} from './supplier.mjs';
import {SOURCES, POLICY_CHECKED, FEEDSTOCK_LABELS, JURISDICTIONS, defaultPolicy} from './policy.mjs';
import {safAirports} from './airports.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const usd = (n, d = 0) => (n < 0 ? '−$' : '$') + fmt(Math.abs(n), d);
const big = n => Math.abs(n) >= 1e6 ? usd(n / 1e6, 2) + 'm' : Math.abs(n) >= 1e3 ? usd(n / 1e3, 0) + 'k' : usd(n, 0);
const EU27 = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' '));
const JUR = {...JURISDICTIONS, NONE: 'No SAF program'};
const PARTS = [
  {key: 'rin', label: 'RINs', color: 'var(--sup-rin)'},
  {key: 'lcfs', label: 'LCFS / CFP / CFS', color: 'var(--sup-lcfs)'},
  {key: 'state', label: 'State SAF credit', color: 'var(--sup-state)'},
  {key: 'z45', label: '45Z', color: 'var(--sup-z45)'},
  {key: 'mandate', label: 'EU / UK mandate', color: 'var(--sup-mandate)'},
  {key: 'premium', label: 'Premium', color: 'var(--sup-premium)'}
];
// [min, max] for every editable number, keyed by field name.
const BOUNDS = {gallons: [0, 1e8], uptake: [0, 1e8], capacity: [0, 1e8], ciLcfs: [-300, 200], ci45z: [-300, 200], ciIcao: [-300, 200], premium: [-10, 50], freight: [0, 20],
  d4: [0, 20], rinsPerGal: [0, 3], capture: [0, 100], rate: [0, 5], price: [0, 1000], benchmark: [0, 200], mjPerGal: [80, 160], base: [0, 5], perPoint: [0, 1], max: [0, 10], minReduction: [0, 100], cap: [0, 1e9],
  share: [0, 100], safEurT: [0, 20000], jetEurT: [0, 5000], multiplier: [0, 10], eurUsd: [0.5, 2], gbpUsd: [0.5, 2.5], target: [0, 100], buyoutGbp: [0, 20], certGbp: [0, 20], safLhv: [25, 40], euFuelGal: [0, 1e10], ukFuelGal: [0, 1e10]};

let S = demoSupplier(), result = null, toastFn = () => {}, timer = null;

export function getSupplier() { return S; }
export function resetSupplier() { S = demoSupplier(); renderSupplierInputs(); renderSupplierResults(); }

// Rebuild a scenario from saved JSON, keeping only known fields with valid types and ranges.
export function restoreSupplier(raw) {
  if (!raw || typeof raw !== 'object') return;
  const d = demoSupplier(), okNum = (k, v) => typeof v === 'number' && Number.isFinite(v) && v >= BOUNDS[k][0] && v <= BOUNDS[k][1];
  const str = (v, fallback, max = 60) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;
  const pick = (src, tpl, numKeys) => { const o = {...tpl}; for (const k of numKeys) if (okNum(k, src?.[k])) o[k] = src[k]; return o; };
  try {
    if (Array.isArray(raw.batches) && raw.batches.length <= 20) S.batches = raw.batches.filter(b => b && /^B\d{1,3}$/.test(b.id) && d.terminals.some(t => t.id === b.terminal) && FEEDSTOCK_LABELS[b.feedstock] && ['US', 'CA', 'MX', 'Other'].includes(b.origin))
      .map(b => ({...pick(b, {id: b.id, terminal: b.terminal, feedstock: b.feedstock, origin: b.origin, gallons: 0, ciLcfs: 50, ci45z: 50, ciIcao: 50}, ['gallons', 'ciLcfs', 'ci45z', 'ciIcao']), name: str(b.name, b.id), rfs: b.rfs === true}));
    if (Array.isArray(raw.airports) && raw.airports.length <= 40) S.airports = raw.airports.filter(a => a && /^[A-Z0-9]{3,4}$/.test(a.id) && JUR[a.jur] && Number.isFinite(a.lon) && Number.isFinite(a.lat))
      .map(a => ({...pick(a, {id: a.id, jur: a.jur, uptake: 0, premium: 0, lon: a.lon, lat: a.lat}, ['uptake', 'premium']), name: str(a.name, a.id)}));
    if (Array.isArray(raw.lanes) && raw.lanes.length <= 200) S.lanes = raw.lanes.filter(l => l && d.terminals.some(t => t.id === l.terminal) && S.airports.some(a => a.id === l.airport))
      .map(l => pick(l, {terminal: l.terminal, airport: l.airport, freight: 0.5, capacity: 0}, ['freight', 'capacity']));
    S.obligations = pick(raw.obligations, d.obligations, ['euFuelGal', 'ukFuelGal']);
    const walk = (tpl, src) => { for (const k of Object.keys(tpl)) { if (tpl[k] && typeof tpl[k] === 'object') walk(tpl[k], src?.[k]); else if (typeof tpl[k] === 'boolean' && typeof src?.[k] === 'boolean') tpl[k] = src[k]; else if (typeof tpl[k] === 'number' && BOUNDS[k] && okNum(k, src?.[k])) tpl[k] = src[k]; } };
    S.policy = defaultPolicy(); walk(S.policy, raw.policy);
  } catch { S = demoSupplier(); }
}

export function initSupplier({toast}) {
  toastFn = toast;
  $('#sup-checked').textContent = new Date(POLICY_CHECKED + 'T12:00:00').toLocaleDateString('en-US', {day: 'numeric', month: 'long', year: 'numeric'});
  $('#sup-legend').innerHTML = PARTS.map(p => `<span><i style="background:${p.color}"></i>${p.label}</span>`).join('');
  $('#sup-sources').innerHTML = Object.values(SOURCES).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a></li>`).join('');
  const panel = $('#supplier');
  panel.addEventListener('input', e => { if (e.target.dataset.sup && e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') update(e.target, false); });
  panel.addEventListener('change', e => { if (e.target.dataset.sup) update(e.target, true); });
  panel.addEventListener('click', e => {
    const rb = e.target.closest('[data-sup-remove]'); if (rb) { remove(rb.dataset.supRemove, rb.dataset.id); return; }
    if (e.target.closest('.sup-jump')) { e.preventDefault(); const d = $('#sup-policy').closest('details'); d.open = true; d.scrollIntoView({block: 'start'}); }
  });
  $('#sup-add-batch').onclick = () => {
    if (S.batches.length >= 20) return toastFn('The plan supports up to 20 batches.');
    const n = Math.max(0, ...S.batches.map(b => +b.id.slice(1))) + 1;
    S.batches.push({id: 'B' + n, name: 'New batch', terminal: S.terminals[0].id, gallons: 100000, feedstock: 'uco', origin: 'US', ciLcfs: 25, ci45z: 20, ciIcao: 20, rfs: true});
    renderSupplierInputs(); solveSoon(0);
  };
  $('#sup-add-airport-btn').onclick = () => {
    const id = $('#sup-add-airport').value, a = safAirports.find(a => a.id === id); if (!a) return;
    if (S.airports.length >= 40) return toastFn('The plan supports up to 40 airports.');
    const jur = a.country === 'US' ? 'US' : a.country === 'GB' ? 'UK' : EU27.has(a.country) ? 'EU' : 'NONE';
    S.airports.push({id: a.id, name: a.name, jur, uptake: 0, premium: 0, lon: a.lon, lat: a.lat});
    for (const t of S.terminals) S.lanes.push({terminal: t.id, airport: a.id, freight: 0.5, capacity: 0});
    renderSupplierInputs(); solveSoon(0);
    toastFn(`${a.id} added as ${JUR[jur]}. Set its uptake and lane capacity to start placing fuel there.`);
  };
  $('#sup-export').onclick = exportCsv;
  renderSupplierInputs(); renderSupplierResults();
}

function update(el, structural) {
  const path = el.dataset.sup.split('.'), key = path.at(-1);
  let target = S; for (const k of path.slice(0, -1)) target = target[k];
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.dataset.kind === 'text') v = el.value.trim().slice(0, 60) || target[key];
  else if (el.tagName === 'SELECT') v = el.value;
  else {
    if (el.value.trim() === '') return;
    v = Number(el.value); if (!Number.isFinite(v)) return;
    const [lo, hi] = BOUNDS[key] || [-Infinity, Infinity]; v = Math.min(hi, Math.max(lo, v));
    if (structural) el.value = v;
  }
  target[key] = v;
  if (structural && el.tagName === 'SELECT') renderSupplierInputs();
  solveSoon(structural ? 0 : 200);
}

function remove(kind, id) {
  if (kind === 'batch') S.batches = S.batches.filter(b => b.id !== id);
  if (kind === 'airport') { S.airports = S.airports.filter(a => a.id !== id); S.lanes = S.lanes.filter(l => l.airport !== id); }
  renderSupplierInputs(); solveSoon(0);
}

function solveSoon(ms) { clearTimeout(timer); timer = setTimeout(renderSupplierResults, ms); }

const numIn = (path, value, step = 'any', cls = '') => `<input type="number" step="${step}" class="${cls}" data-sup="${path}" value="${esc(+value.toFixed(4))}" aria-label="${esc(path.split('.').at(-1))}">`;
const sel = (path, value, options, label) => `<select data-sup="${path}" aria-label="${esc(label)}">${Object.entries(options).map(([k, v]) => `<option value="${esc(k)}"${k === value ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`;

export function renderSupplierInputs() {
  const terms = Object.fromEntries(S.terminals.map(t => [t.id, t.name]));
  $('#sup-batch-inputs').innerHTML = S.batches.map((b, i) => `<tr><td><input data-sup="batches.${i}.name" data-kind="text" class="sup-name" value="${esc(b.name)}" aria-label="Batch name"><small class="muted">${esc(b.id)}</small></td>
    <td>${sel(`batches.${i}.terminal`, b.terminal, terms, 'Terminal')}</td><td>${numIn(`batches.${i}.gallons`, b.gallons, 1000, 'sup-wide')}</td>
    <td>${sel(`batches.${i}.feedstock`, b.feedstock, FEEDSTOCK_LABELS, 'Feedstock')}</td><td>${sel(`batches.${i}.origin`, b.origin, {US: 'United States', CA: 'Canada', MX: 'Mexico', Other: 'Outside North America'}, 'Feedstock origin')}</td>
    <td>${numIn(`batches.${i}.ciLcfs`, b.ciLcfs, 0.1)}</td><td>${numIn(`batches.${i}.ci45z`, b.ci45z, 0.1)}</td><td>${numIn(`batches.${i}.ciIcao`, b.ciIcao, 0.1)}</td>
    <td><input type="checkbox" data-sup="batches.${i}.rfs"${b.rfs ? ' checked' : ''} aria-label="Has an RFS pathway"></td>
    <td><button class="icon-btn" data-sup-remove="batch" data-id="${esc(b.id)}" aria-label="Remove ${esc(b.name)}">×</button></td></tr>`).join('');
  $('#sup-airport-inputs').innerHTML = S.airports.map((a, i) => `<tr><td><b>${esc(a.id)}</b> <span class="muted">${esc(a.name)}</span></td>
    <td>${sel(`airports.${i}.jur`, a.jur, JUR, 'Program')}</td><td>${numIn(`airports.${i}.uptake`, a.uptake, 1000, 'sup-wide')}</td><td>${numIn(`airports.${i}.premium`, a.premium, 0.01)}</td>
    <td><button class="icon-btn" data-sup-remove="airport" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.id)}">×</button></td></tr>`).join('');
  $('#sup-lane-inputs').innerHTML = S.lanes.map((l, i) => `<tr><td>${esc(terms[l.terminal] || l.terminal)}</td><td><b>${esc(l.airport)}</b></td><td>${numIn(`lanes.${i}.freight`, l.freight, 0.01)}</td><td>${numIn(`lanes.${i}.capacity`, l.capacity, 1000, 'sup-wide')}</td></tr>`).join('');
  const taken = new Set(S.airports.map(a => a.id));
  $('#sup-add-airport').innerHTML = '<option value="">Add from SAF airport directory…</option>' + safAirports.filter(a => !taken.has(a.id)).sort((a, b) => a.id.localeCompare(b.id)).map(a => `<option value="${esc(a.id)}">${esc(a.id)} · ${esc(a.name)}</option>`).join('');
  const P = S.policy, f = (label, path, value, step, src, note = '') => `<label>${label}${numIn(path, value, step)}${note ? `<small>${note}</small>` : ''}${src ? `<a href="${esc(SOURCES[src].url)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</label>`;
  const chk = (label, path, value, note = '') => `<label class="sup-check"><input type="checkbox" data-sup="${path}"${value ? ' checked' : ''}><span>${label}</span>${note ? `<small>${note}</small>` : ''}</label>`;
  $('#sup-policy').innerHTML = `
    <fieldset><legend>Federal</legend>${f('D4 RIN price ($)', 'policy.rfs.d4', P.rfs.d4, 0.01, 'rin')}${f('RINs per gallon', 'policy.rfs.rinsPerGal', P.rfs.rinsPerGal, 0.1, null, 'Renewable jet equivalence value')}${f('RIN value captured (%)', 'policy.rfs.capture', P.rfs.capture, 1)}${f('45Z rate ($/gal)', 'policy.z45.rate', P.z45.rate, 0.01, 'z45', '$1.00 with prevailing wage; × (50 − CI kg/mmBtu)/50')}${chk('We produce this fuel and claim 45Z', 'policy.z45.claim', P.z45.claim)}</fieldset>
    <fieldset><legend>West Coast clean fuel programs</legend>${f('California credit ($/t)', 'policy.lcfs.CA.price', P.lcfs.CA.price, 0.25, 'lcfsPrices')}${f('California jet benchmark (g/MJ)', 'policy.lcfs.CA.benchmark', P.lcfs.CA.benchmark, 0.01, 'caBenchmark')}${f('Oregon credit ($/t)', 'policy.lcfs.OR.price', P.lcfs.OR.price, 0.25, 'lcfsPrices')}${f('Oregon benchmark (g/MJ)', 'policy.lcfs.OR.benchmark', P.lcfs.OR.benchmark, 0.01, 'or', 'Estimate: replace with OAR 340-253-8040 Table 2')}${f('Washington credit ($/t)', 'policy.lcfs.WA.price', P.lcfs.WA.price, 0.25, 'lcfsPrices')}${f('Washington benchmark (g/MJ)', 'policy.lcfs.WA.benchmark', P.lcfs.WA.benchmark, 0.01, 'wa')}${f('Alternative jet energy (MJ/gal)', 'policy.lcfs.mjPerGal', P.lcfs.mjPerGal, 0.01, 'wa')}</fieldset>
    <fieldset><legend>State SAF credits</legend>${f('Illinois ($/gal)', 'policy.il.rate', P.il.rate, 0.01, 'il')}${f('Illinois share captured (%)', 'policy.il.capture', P.il.capture, 1, null, 'Airlines claim it; count the share priced into your sale')}${chk('Illinois soybean cap reached', 'policy.il.soyCapReached', P.il.soyCapReached)}${f('Minnesota base ($/gal)', 'policy.mn.base', P.mn.base, 0.01, 'mn', '+2¢ per point above 50% reduction, max $2.00')}${f('Minnesota program cap ($)', 'policy.mn.cap', P.mn.cap, 1000, 'mnCap', '2026 certificate allocation')}${chk('Washington SAF tax credit active', 'policy.wa.active', P.wa.active, 'Not active until 20M gal/yr WA capacity')}</fieldset>
    <fieldset><legend>ReFuelEU (EU airports)</legend>${f('SAF share (%)', 'policy.eu.share', P.eu.share, 0.1, 'eu')}${f('Aviation fuel you supply at EU airports (US gal)', 'obligations.euFuelGal', S.obligations.euFuelGal, 100000)}${f('SAF reference price (€/t)', 'policy.eu.safEurT', P.eu.safEurT, 1, 'euPrices')}${f('Jet reference price (€/t)', 'policy.eu.jetEurT', P.eu.jetEurT, 1, 'euPrices')}${f('Penalty multiplier', 'policy.eu.multiplier', P.eu.multiplier, 0.1, null, 'Legal minimum is 2; member states may set more')}${f('EUR → USD', 'policy.fx.eurUsd', P.fx.eurUsd, 0.001)}</fieldset>
    <fieldset><legend>UK SAF Mandate</legend>${f('Main obligation (% of energy)', 'policy.uk.target', P.uk.target, 0.001, 'uk')}${f('Aviation fuel you supply in the UK (US gal)', 'obligations.ukFuelGal', S.obligations.ukFuelGal, 100000)}${f('Buy-out (£ per certificate)', 'policy.uk.buyoutGbp', P.uk.buyoutGbp, 0.01, 'uk')}${f('Surplus certificate sale (£)', 'policy.uk.certGbp', P.uk.certGbp, 0.01, null, 'No public price; enter your quote')}${f('SAF energy (MJ/L)', 'policy.uk.safLhv', P.uk.safLhv, 0.01)}${f('GBP → USD', 'policy.fx.gbpUsd', P.fx.gbpUsd, 0.001, null, 'Assumption')}</fieldset>`;
}

export function renderSupplierResults() {
  try { result = planSupply(S); } catch (e) { $('#sup-metrics').innerHTML = `<div class="metric"><p>${esc(e.message)}</p></div>`; return; }
  const r = result;
  if (r.eu.shortfall < 1) r.eu.shortfall = 0;
  if (r.uk.shortfall < 1) r.uk.shortfall = 0;
  $('#sup-period').textContent = S.period;
  const euPct = r.eu.obligation ? 100 * r.eu.counted / r.eu.obligation : 100, ukPct = r.uk.obligation ? 100 * Math.min(r.uk.certificates, r.uk.obligation) / r.uk.obligation : 100;
  $('#sup-metrics').innerHTML = [
    ['Net value this period', big(r.value), `${fmt(r.gallons)} US gal placed · ${usd(r.gallons ? r.value / r.gallons : 0, 2)}/gal`],
    ['Vs nearest-airport plan', (r.uplift >= 0 ? '+' : '') + big(r.uplift), r.baseline ? `${(100 * r.uplift / Math.abs(r.baseline)).toFixed(1)}% more value from the same fuel` : 'No baseline value'],
    ['EU obligation met', fmt(euPct, 0) + '%', r.eu.shortfall ? `${fmt(r.eu.shortfall)} gal short · ${big(r.eu.exposure)} penalty` : `${fmt(r.eu.obligation)} gal obligation covered`],
    ['UK obligation met', fmt(ukPct, 0) + '%', r.uk.shortfall ? `${fmt(r.uk.shortfall)} certificates short · ${big(r.uk.exposure)} buy-out` : `${fmt(r.uk.obligation)} certificates covered`]
  ].map(([l, n, p]) => `<div class="metric"><div class="metric-label">${l}</div><div class="number">${n}</div><p>${p}</p></div>`).join('');
  // Scale bars to the typical US credit stack; mandate-heavy airports run off the end and are marked.
  const gross = a => PARTS.reduce((t, p) => t + Math.max(0, a.stack[p.key]), 0);
  const maxPerGal = Math.max(1, Math.min(10, Math.max(...r.airports.map(gross))));
  $('#sup-legend').innerHTML = PARTS.map(p => `<span><i style="background:${p.color}"></i>${p.label}</span>`).join('') + `<span class="sup-scale">Full bar = ${usd(maxPerGal, 2)}/gal · striped end = beyond scale</span>`;
  $('#sup-airports').innerHTML = r.airports.map(a => {
    const from = r.allocations.filter(x => x.airport === a.id).map(x => `${esc(x.batch)} ${fmt(x.gallons / 1000)}k`).join(' · ') || '—';
    const segs = PARTS.filter(p => a.stack[p.key] > 0.005).map(p => `<i style="width:${(100 * a.stack[p.key] / maxPerGal).toFixed(2)}%;background:${p.color}" title="${p.label}: ${usd(a.stack[p.key], 2)}/gal"></i>`).join('');
    const tip = PARTS.filter(p => Math.abs(a.stack[p.key]) > 0.005).map(p => `${p.label} ${usd(a.stack[p.key], 2)}`).concat(a.stack.freight ? [`Freight ${usd(a.stack.freight, 2)}`] : []).join(' · ');
    return `<tr class="${a.gallons ? '' : 'sup-idle'}"><td><b>${esc(a.id)}</b><small>${esc(a.name)}</small></td><td>${esc(JUR[a.jur])}</td>
      <td class="num">${fmt(a.gallons)}<div class="sup-fill" title="${fmt(100 * a.fill)}% of uptake"><i style="width:${Math.min(100, 100 * a.fill).toFixed(1)}%"></i></div></td><td class="sup-from">${from}</td>
      <td><div class="sup-stack${gross(a) > maxPerGal + 0.005 ? ' over' : ''}" role="img" aria-label="${esc(tip || 'No fuel placed')}" title="${esc(tip)}">${a.gallons ? segs : ''}</div><span class="num">${a.gallons ? usd(a.perGal, 2) + '/gal' : 'Not used'}</span>${a.stack.freight ? `<small class="muted"> after ${usd(-a.stack.freight, 2)} freight</small>` : ''}</td>
      <td class="num">${a.marginal > 0.005 ? '+' + usd(a.marginal, 2) + '/gal' : '<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  $('#sup-batches').innerHTML = r.batches.map(b => `<tr><td><b>${esc(b.name)}</b><small>${esc(b.id)} · ${esc(FEEDSTOCK_LABELS[b.feedstock])} · ${fmt(b.gallons)} gal</small></td><td class="num">${fmt(b.allocated)}</td><td class="num">${b.unallocated > 0.5 ? fmt(b.unallocated) : '—'}</td><td class="num">${b.marginal > 0.005 ? '+' + usd(b.marginal, 2) + '/gal' : '—'}</td></tr>`).join('');
  const bar = (pct, cls = '') => `<div class="sup-meter ${cls}"><i style="width:${Math.min(100, Math.max(0, pct)).toFixed(1)}%"></i></div>`;
  $('#sup-compliance').innerHTML = `
    <div><h3>ReFuelEU · ${fmt(S.policy.eu.share, 1)}%</h3>${bar(euPct, r.eu.shortfall ? 'warn' : '')}<p>${fmt(r.eu.counted)} of ${fmt(r.eu.obligation)} gal obligation${r.eu.delivered > r.eu.counted + 1 ? ` · ${fmt(r.eu.delivered - r.eu.counted)} gal above it` : ''}.</p><p class="muted">Each gallon short costs at least ${usd(r.eu.penaltyPerGal, 2)}, and must still be supplied next year.</p></div>
    <div><h3>UK SAF Mandate · ${fmt(S.policy.uk.target, 3)}%</h3>${bar(ukPct, r.uk.shortfall ? 'warn' : '')}<p>${fmt(r.uk.certificates)} of ${fmt(r.uk.obligation)} certificates${r.uk.certificates > r.uk.obligation + 1 ? ` · ${fmt(r.uk.certificates - r.uk.obligation)} surplus` : ''}.</p><p class="muted">Buy-out ${usd(r.uk.buyout, 2)} per certificate; certificates scale with GHG savings.</p></div>
    <div><h3>Minnesota credit cap</h3>${bar(r.mn.cap ? 100 * r.mn.dollars / r.mn.cap : 0)}<p>${big(r.mn.dollars)} of ${big(r.mn.cap)} available.</p></div>`;
}

function exportCsv() {
  if (!result) return;
  const rows = [['AeroCommit supplier plan', S.period], ['Policy values checked', POLICY_CHECKED], ['Net value USD', result.value.toFixed(2)], ['Nearest-airport plan USD', result.baseline.toFixed(2)], [],
    ['Batch', 'Terminal', 'Airport', 'Program', 'US gal', 'Premium $/gal', 'Freight $/gal', 'RINs $/gal', 'LCFS/CFP/CFS $/gal', 'State credit $/gal', '45Z $/gal', 'Net before mandates $/gal', 'Value before mandates USD', 'Notes'],
    ...result.allocations.map(a => { const ap = S.airports.find(x => x.id === a.airport); const s = a.stack; return [a.batch, a.terminal, a.airport, JUR[ap.jur], a.gallons.toFixed(0), s.premium, s.freight, s.rin.toFixed(4), s.lcfs.toFixed(4), s.state.toFixed(4), s.z45.toFixed(4), s.total.toFixed(4), (s.total * a.gallons).toFixed(2), s.notes.join('; ')]; }),
    [], ['Mandate', 'Obligation', 'Counted', 'Shortfall', 'Exposure USD'],
    ['ReFuelEU (gal)', result.eu.obligation.toFixed(0), result.eu.counted.toFixed(0), result.eu.shortfall.toFixed(0), result.eu.exposure.toFixed(2)],
    ['UK SAF Mandate (certificates)', result.uk.obligation.toFixed(0), result.uk.certificates.toFixed(0), result.uk.shortfall.toFixed(0), result.uk.exposure.toFixed(2)],
    [], ['Screening estimate. Illustrative batches. Not tax, legal or trading advice.']];
  const csv = '﻿' + rows.map(r => r.map(v => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = 'aerocommit-supplier-plan.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
