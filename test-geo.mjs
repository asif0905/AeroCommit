import assert from 'node:assert/strict';
import {project, greatCircle, distanceKm} from './dist/geo.mjs';
import {LAND, BORDERS, GRATICULE} from './dist/basemap.mjs';
import {demoState} from './dist/engine.mjs';
const s = demoState();
// Every airport and hub has real coordinates and lands inside the 850 × 420 map.
for (const o of [...s.airports, ...s.suppliers]) {
  assert.ok(o.lon > -125 && o.lon < -66 && o.lat > 24 && o.lat < 50, `${o.id} outside contiguous US`);
  const [x, y] = project(o.lon, o.lat);
  assert.ok(x > 30 && x < 820 && y > 15 && y < 380, `${o.id} projects off the map`);
}
// Known great-circle distances (published airport-pair distances, ±1%).
const at = id => { const a = s.airports.find(a => a.id === id); return [a.lon, a.lat]; };
for (const [a, b, km] of [['SFO', 'JFK', 4152], ['LAX', 'JFK', 3983], ['ORD', 'ATL', 976], ['ATL', 'MIA', 958]])
  assert.ok(Math.abs(distanceKm(at(a), at(b)) - km) / km < 0.01, `${a}-${b} distance`);
// Orientation: north is up, east is right.
const [sx, sy] = project(...at('SFO')), [jx, jy] = project(...at('JFK')), [mx, my] = project(...at('MIA'));
assert.ok(jx > sx && my > jy, 'map orientation');
// Great-circle paths start and end at the airports and bow north for a transcontinental flight.
const gc = greatCircle(at('SFO'), at('JFK'), 40);
assert.deepEqual(gc[0].map(v => +v.toFixed(6)), at('SFO').map(v => +v.toFixed(6)));
assert.deepEqual(gc.at(-1).map(v => +v.toFixed(6)), at('JFK').map(v => +v.toFixed(6)));
assert.ok(Math.max(...gc.map(p => p[1])) > 40.6413, 'SFO-JFK great circle bows north');
// Basemap is present and compact.
for (const d of [LAND, BORDERS, GRATICULE]) assert.ok(/^M[\d.]+,[\d.]+/.test(d) && d.length < 30000);
console.log('Geography: coordinates, projection bounds, orientation, great-circle paths and 4 airport-pair distances passed.');

const {fitNetwork}=await import('./dist/geo.mjs');
const {safAirports}=await import('./dist/airports.mjs');
const combined=[...s.airports,safAirports.find(a=>a.id==='AMS'),safAirports.find(a=>a.id==='IST')];
const net=fitNetwork(combined);assert.equal(net.extended,true);
for(const p of combined){const [x,y]=net.project(p.lon,p.lat);assert.ok(Number.isFinite(x)&&x>=40&&x<=790&&y>=30&&y<=360);}
assert.equal(fitNetwork(s.airports).extended,false);
console.log('Expanded US–Europe map: all airport positions fit, domestic basemap preserved.');
