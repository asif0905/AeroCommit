import assert from 'node:assert/strict';
import {safAirports} from './dist/airports.mjs';
import {demoState,applyScenario,plan} from './dist/engine.mjs';
assert.equal(new Set(safAirports.map(a=>a.id)).size,safAirports.length);
for(const a of safAirports){assert.ok(a.evidence.length);assert.ok(Number.isFinite(a.lat)&&Math.abs(a.lat)<=90);assert.ok(Number.isFinite(a.lon)&&Math.abs(a.lon)<=180);assert.equal(a.region==='US',a.country==='US');for(const e of a.evidence)assert.equal(new URL(e.url).protocol,'https:');}
assert.equal(safAirports.find(a=>a.id==='HAD').country,'SE');
assert.equal(safAirports.find(a=>a.id==='AMS').icao,'EHAM');
const s=demoState();s.airports.push({id:'AMS',name:'Amsterdam',hazard:'Not configured',risk:100,delivery:100,wind:0,demand:0,need:42,x:80,y:70});
s.suppliers.forEach(v=>s.lanes.push({supplier:v.id,airport:'AMS',lead:0,freight:0,capacity:0}));
s.flights.push({id:'R199',airline:'Test',origin:'AMS',destination:'JFK',target:50,enroute:0,depart:44,duration:8});
for(const scenario of ['clear','mixed','storm','tight']){applyScenario(s,scenario);const r=plan(s).flightRows.find(f=>f.id==='R199');assert.equal(r.firm+r.hold,0);assert.equal(s.airports.find(a=>a.id==='AMS').risk,100);}
console.log(`PASS: ${safAirports.length} unique airport records, evidence URLs, geographic metadata, and unconfigured airport allocation guards.`);

// CSV export: every row lines up with the header, and aliases stay in their own column.
const {directoryCsvRows,toCsv,CSV_HEADER}=await import('./dist/directory.mjs');
const csvRows=directoryCsvRows(safAirports,'2026-10-24');
assert.equal(csvRows.length,1+safAirports.reduce((n,a)=>n+a.evidence.length,0));
for(const r of csvRows)assert.equal(r.length,CSV_HEADER.length,'CSV row width');
const ams=csvRows.find(r=>r[0]==='AMS');assert.equal(ams[1],'EHAM');assert.equal(ams[3],'Amsterdam Airport Schiphol');assert.equal(ams[4],'Netherlands');
assert.ok(toCsv([['a"b','c']]).endsWith('"a""b","c"'),'CSV quoting');
console.log(`PASS CSV: ${csvRows.length-1} evidence rows, ${CSV_HEADER.length} aligned columns, quoting.`);
