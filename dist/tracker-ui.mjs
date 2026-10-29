// Live Flights tab: aircraft near an airport from public ADS-B feeds, with estimated SAF impact.
import {SOURCES, creditOf, validRelay, AIRLINES, EXTRA_AIRPORTS, TRACKER_CHECKED, planShares, assess, summarize, simulate, BASELINE_CI} from './tracker.mjs';
import {safAirports} from './airports.mjs';
import {distanceKm, flatPath} from './geo.mjs';
import {WORLD_LAND, WORLD_BORDERS, SCALE as WORLD_SCALE} from './worldmap.mjs';
import {planCompliance} from './compliance.mjs';
import {getCompliance, getComplianceResult} from './compliance-ui.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
const KEY = 'aerocommit-tracker', LIVE_MS = 15000, SIM_MS = 5000, W = 760, H = 460;
const DEFAULTS = {airport: 'JFK', airline: 'DAL', radius: 150, source: 'auto', relay: '', industryShare: 0.8, industryCi: 28, includeOthers: true};

let S = {...DEFAULTS}, running = false, paused = false, timer = null, inflight = null, lastAt = null, avoidedKg = 0, workingSource = null;
let rows = [], status = {mode: 'idle', text: ''}, shares = null, airports = [], hooked = false;

function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return;
    if (typeof raw.airport === 'string' && /^[A-Z0-9]{3,4}$/.test(raw.airport)) S.airport = raw.airport;
    if (typeof raw.airline === 'string' && AIRLINES[raw.airline]) S.airline = raw.airline;
    if ([50, 100, 150, 250].includes(raw.radius)) S.radius = raw.radius;
    if (['auto', 'sim', ...Object.keys(SOURCES)].includes(raw.source)) S.source = raw.source;
    if (typeof raw.industryShare === 'number' && raw.industryShare >= 0 && raw.industryShare <= 100) S.industryShare = raw.industryShare;
    if (typeof raw.industryCi === 'number' && raw.industryCi >= -100 && raw.industryCi <= BASELINE_CI) S.industryCi = raw.industryCi;
    if (typeof raw.includeOthers === 'boolean') S.includeOthers = raw.includeOthers;
    if (typeof raw.relay === 'string' && validRelay(raw.relay)) S.relay = raw.relay.slice(0, 300);
  } catch {}
}
const saveSettings = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

function airportList() {
  const planAps = new Set((getCompliance()?.groups || []).flatMap(g => g.airports));
  const seen = new Map();
  for (const a of [...EXTRA_AIRPORTS, ...safAirports]) if (!seen.has(a.id) && Number.isFinite(a.lat) && Number.isFinite(a.lon)) seen.set(a.id, {id: a.id, name: a.name, lat: a.lat, lon: a.lon, plan: planAps.has(a.id)});
  return [...seen.values()].sort((a, b) => (b.plan - a.plan) || a.id.localeCompare(b.id));
}
const airport = () => airports.find(a => a.id === S.airport) || airports.find(a => a.id === 'JFK') || airports[0];

function refreshShares() {
  const cfg = getCompliance();
  let res = getComplianceResult();
  if (!res) { try { res = planCompliance(cfg); } catch { res = null; } }
  shares = planShares(cfg, res);
}

export function initTracker() {
  loadSettings();
  airports = airportList();
  if (!airports.some(a => a.id === S.airport)) S.airport = 'JFK';
  $('#trk-airport').innerHTML = airports.map(a => `<option value="${a.id}">${a.id} · ${esc(a.name)}${a.plan ? ' · in plan' : ''}</option>`).join('');
  $('#trk-airline').innerHTML = Object.entries(AIRLINES).sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => `<option value="${c}">${esc(n)} (${c})</option>`).join('');
  $('#trk-source').innerHTML = `<option value="auto">Auto: first live feed that answers</option>` + `<option value="local">AeroCommit server (npm start)</option><option value="relay">Your relay URL</option>` + `<option value="sim">Simulated traffic</option>`;
  $('#trk-checked').textContent = TRACKER_CHECKED;
  syncInputs();
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  on('#trk-airport', 'change', e => { S.airport = e.target.value; avoidedKg = 0; lastAt = null; settingsChanged(true); });
  on('#trk-airline', 'change', e => { S.airline = e.target.value; settingsChanged(false); });
  on('#trk-radius', 'change', e => { S.radius = Number(e.target.value); settingsChanged(true); });
  on('#trk-source', 'change', e => { S.source = e.target.value; workingSource = null; settingsChanged(true); });
  on('#trk-share', 'change', e => { const v = Number(e.target.value); if (v >= 0 && v <= 100) S.industryShare = v; syncInputs(); settingsChanged(false); });
  on('#trk-ci', 'change', e => { const v = Number(e.target.value); if (v >= -100 && v <= BASELINE_CI) S.industryCi = v; syncInputs(); settingsChanged(false); });
  on('#trk-others', 'change', e => { S.includeOthers = e.target.checked; settingsChanged(false); });
  on('#trk-relay', 'change', e => { const v = e.target.value.trim(); if (!v || validRelay(v)) { S.relay = v.slice(0, 300); workingSource = null; $('#trk-relay').setCustomValidity(''); settingsChanged(true); } else { $('#trk-relay').setCustomValidity('Use an https:// address'); $('#trk-relay').reportValidity(); } });
  on('#trk-pause', 'click', () => { paused = !paused; $('#trk-pause').textContent = paused ? 'Resume' : 'Pause'; if (paused) stopTimer(); else { lastAt = null; poll(); } render(); });
  on('#trk-refresh', 'click', () => { if (!paused) poll(); });
  if (!hooked) { document.addEventListener('visibilitychange', () => { if (!running) return; if (document.hidden) stopTimer(); else if (!paused) { lastAt = null; poll(); } }); hooked = true; }
}

function syncInputs() {
  $('#trk-airport').value = S.airport; $('#trk-airline').value = S.airline; $('#trk-radius').value = String(S.radius);
  $('#trk-source').value = S.source; $('#trk-share').value = S.industryShare; $('#trk-ci').value = S.industryCi; $('#trk-others').checked = S.includeOthers; $('#trk-relay').value = S.relay;
}

function settingsChanged(refetch) {
  saveSettings();
  if (refetch) { rows = []; render(); if (running && !paused) poll(); }
  else { rows = rows.map(r => assess(r, opts())); render(); }
}

const opts = () => ({airport: airport(), airline: S.airline, shares, industryShare: S.industryShare / 100, industryCi: S.industryCi, includeOthers: S.includeOthers});

export function startTracker() {
  running = true; refreshShares();
  rows = rows.map(r => assess(r, opts()));
  render();
  if (!paused) { lastAt = null; poll(); }
}
export function stopTracker() { running = false; stopTimer(); inflight?.abort(); }
function stopTimer() { clearTimeout(timer); timer = null; }

async function fetchJson(url, ms = 12000) {
  inflight?.abort();
  const ctl = new AbortController(); inflight = ctl;
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {signal: ctl.signal, headers: {Accept: 'application/json'}});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function poll() {
  stopTimer();
  if (!running || paused) return;
  const ap = airport(), km = S.radius;
  let flights = null, used = null, credit = null, errors = [];
  if (S.source !== 'sim') {
    const usable = k => !SOURCES[k].needsBase || S.relay;
    const order = S.source === 'auto' ? [workingSource, 'local', 'relay'].filter((k, i, a) => k && a.indexOf(k) === i && usable(k)) : [S.source].filter(usable);
    if (!order.length) errors.push('Your relay: add a relay URL');
    for (const k of order) {
      try { const json = await fetchJson(SOURCES[k].url(ap.lat, ap.lon, km, S.relay)); flights = SOURCES[k].parse(json); credit = creditOf(json); used = k; break; }
      catch (e) { if (e.name === 'AbortError' && !running) return; errors.push(`${SOURCES[k].label}: ${e.name === 'AbortError' ? 'timed out' : e.message === 'Failed to fetch' ? 'blocked or offline' : e.message}`); }
    }
  }
  if (!running) return;
  if (flights) { workingSource = used; status = {mode: 'live', source: used, credit, errors}; }
  else { flights = simulate(ap, km); status = {mode: 'sim', errors: S.source === 'sim' ? [] : errors}; if (S.source === 'auto') workingSource = null; }
  const o = opts();
  rows = flights.filter(f => distanceKm([ap.lon, ap.lat], [f.lon, f.lat]) <= km).map(f => assess(f, o));
  const now = Date.now(), sum = summarize(rows);
  if (lastAt) avoidedKg += sum.avoidedKgH * Math.min(60, (now - lastAt) / 1000) / 3600;
  lastAt = now; status.at = new Date(now);
  render();
  timer = setTimeout(poll, status.mode === 'live' ? LIVE_MS : SIM_MS);
}

const tonnes = kg => kg >= 1000 ? fmt(kg / 1000, kg >= 1e5 ? 0 : 1) + ' t' : fmt(kg) + ' kg';

function render() {
  if (!$('#trk-map')) return;
  const ap = airport(), sum = summarize(rows), name = AIRLINES[S.airline] || S.airline, here = shares?.airports?.[ap.id];
  // Status line
  const st = $('#trk-status');
  if (paused) st.innerHTML = `<i class="trk-dot paused"></i><b>Paused</b>`;
  else if (status.mode === 'live') { const src = SOURCES[status.source], c = status.credit; st.innerHTML = `<i class="trk-dot live"></i><b>Live</b> · ${c ? `Flight data: <a href="${c.url}" target="_blank" rel="noopener">${esc(c.name)}</a> (<a href="${c.licence}" target="_blank" rel="noopener">${esc(c.terms)}</a>)` : 'Flight data from your relay'} via ${esc(src.label)} · updated ${status.at.toLocaleTimeString()} · refreshes every ${LIVE_MS / 1000} s`; }
  else if (status.mode === 'sim') st.innerHTML = `<i class="trk-dot sim"></i><b>Simulated traffic</b>${status.errors.length ? ` · live data isn’t reachable from this page. Public flight feeds only answer servers, so run AeroCommit with <code>npm start</code> or add a relay URL above (see <code>proxy/cloudflare-worker.js</code>).<details class="trk-errs"><summary>What was tried</summary>${esc(status.errors.join(' · '))}</details>` : ''}`;
  else st.innerHTML = `<i class="trk-dot"></i>Connecting…`;
  // Plan context
  $('#trk-plan').innerHTML = here?.share > 0
    ? `${esc(name)} departures from <b>${ap.id}</b> carry <b>${fmt(here.share * 100, 1)}% SAF</b> (CI ${fmt(here.ci, 1)}) from your Compliance Plan: ${fmt(here.safT)} t of ${fmt(here.fuelT)} t uplift.`
    : `Your Compliance Plan has no SAF at <b>${ap.id}</b>, so ${esc(name)} departures here count as 0%. Other ${esc(name)} flights use the plan's network average of <b>${fmt((shares?.network?.share || 0) * 100, 1)}%</b>.`;
  // Metrics
  $('#trk-metrics').innerHTML = [
    ['Airline aircraft in the air', fmt(sum.airborne), `${fmt(sum.own)} ${esc(name)} · within ${S.radius} km of ${ap.id}${sum.nonAirline ? ` · ${fmt(sum.nonAirline)} private or business aircraft not counted` : ''}`],
    ['Fuel burning now', tonnes(sum.burnKgH) + '/h', `${tonnes(sum.safKgH)}/h of it SAF (estimated)`],
    ['CO₂ avoided now', tonnes(sum.avoidedKgH) + '/h', `${fmt(sum.avoidedPct, 2)}% of these flights' CO₂`],
    ['Avoided while watching', tonnes(avoidedKg), 'Since this tab started updating']
  ].map(([l, n, p]) => `<div class="metric"><div class="metric-label">${l}</div><div class="number">${n}</div><p>${p}</p></div>`).join('');
  renderMap(ap);
  // Table
  const sorted = [...rows].sort((a, b) => (b.own - a.own) || (b.avoided - a.avoided) || (b.burn - a.burn)).slice(0, 40);
  $('#trk-rows').innerHTML = sorted.length ? sorted.map(r => `<tr class="${r.own ? 'trk-own' : ''}">
    <td><b>${esc(r.callsign || r.id)}</b><small>${esc(r.airlineName || 'Unknown operator')}</small></td><td>${esc(r.type || '—')}</td>
    <td class="num">${r.ground ? 'Ground' : r.altFt == null ? '—' : fmt(r.altFt) + ' ft'}<small>${r.speedKt == null ? '' : fmt(r.speedKt) + ' kt'}</small></td>
    <td><span class="trk-phase ${r.phase.replace(' ', '-')}">${r.phase}</span></td>
    <td class="num">${r.counted ? fmt(r.burn) + ' kg/h' : '—'}</td><td class="num">${r.share > 0 ? fmt(r.share * 100, r.share < 0.01 ? 2 : 1) + '%' : '—'}<small>${esc(r.basis)}</small></td>
    <td class="num"><b>${r.avoided > 0 ? fmt(r.avoided) + ' kg/h' : '—'}</b></td></tr>`).join('')
    : `<tr><td colspan="7" class="muted">${paused ? 'Paused.' : 'Waiting for aircraft…'}</td></tr>`;
  $('#trk-count').textContent = rows.length > 40 ? `Showing 40 of ${rows.length}` : '';
}

function renderMap(ap) {
  const km = S.radius, k = (Math.min(W, H) / 2 - 18) / km, cos = Math.cos(ap.lat * Math.PI / 180);
  const proj = (lon, lat) => [W / 2 + (lon - ap.lon) * 111.32 * cos * k, H / 2 - (lat - ap.lat) * 110.574 * k];
  const rings = [1 / 3, 2 / 3, 1].map(f => `<circle cx="${W / 2}" cy="${H / 2}" r="${(f * km * k).toFixed(1)}" class="trk-ring"/><text x="${W / 2 + 4}" y="${(H / 2 - f * km * k + 14).toFixed(1)}" class="trk-ring-label">${Math.round(f * km)} km</text>`).join('');
  const planes = rows.map(r => {
    const [x, y] = proj(r.lon, r.lat), cls = r.own ? 'own' : r.avoided > 0 ? 'saf' : r.counted ? 'other' : 'other gen';
    return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(r.track || 0).toFixed(0)})" class="trk-plane ${cls}${r.ground ? ' ground' : ''}"><title>${esc(r.callsign || r.id)} · ${esc(r.type || 'type unknown')} · ${r.phase}${r.avoided > 0 ? ' · ' + fmt(r.avoided) + ' kg CO₂/h avoided' : ''}</title><path d="M0,-8 L5.5,6 L0,3 L-5.5,6 Z"/></g>`;
  }).join('');
  $('#trk-map').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Aircraft within ${km} km of ${esc(ap.id)}"><defs><clipPath id="trk-clip"><rect width="${W}" height="${H}"/></clipPath></defs>
    <rect width="${W}" height="${H}" class="trk-sea"/><g clip-path="url(#trk-clip)"><path d="${flatPath(WORLD_LAND, proj, WORLD_SCALE, true)}" class="trk-land" fill-rule="evenodd"/><path d="${flatPath(WORLD_BORDERS, proj, WORLD_SCALE)}" class="trk-border"/>
    ${rings}<g class="trk-airport" transform="translate(${W / 2},${H / 2})"><circle r="6"/><text x="10" y="5">${esc(ap.id)}</text></g>${planes}</g></svg>`;
}
