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

// World outlines for the extended view: present, inside the region, and AMS/LHR sit on land-adjacent coordinates.
const {WORLD_LAND,WORLD_BORDERS,SCALE}=await import('./dist/worldmap.mjs');
const {flatPath}=await import('./dist/geo.mjs');
assert.ok(WORLD_LAND.length>20&&WORLD_BORDERS.length>20);
for(const ring of WORLD_LAND){assert.equal(ring.length%2,0);for(let i=0;i<ring.length;i+=2)assert.ok(ring[i]/SCALE>=-180&&ring[i]/SCALE<=75.01&&Math.abs(ring[i+1]/SCALE)<=90);}
assert.ok(/^M[-\d.]+,[-\d.]+L/.test(flatPath(WORLD_LAND,net.project,SCALE,true)));
// Point-in-polygon: AMS and JFK are on land; a mid-Atlantic point is not.
const onLand=(lon,lat)=>WORLD_LAND.reduce((inside,r)=>{let c=false;for(let i=0,j=r.length-2;i<r.length;j=i,i+=2){const xi=r[i]/SCALE,yi=r[i+1]/SCALE,xj=r[j]/SCALE,yj=r[j+1]/SCALE;if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)c=!c;}return inside!==c;},false);
assert.ok(onLand(4.76,52.31)&&onLand(-87.9,41.97)&&!onLand(-40,40),'land/sea check');
assert.ok(net.kmPx>0&&fitNetwork(s.airports).kmPx>0,'scale bar factor');
console.log('World outlines: rings valid, land/sea point checks and scale factor passed.');

// Label placement: overlapping anchors (LHR/AMS-style) get non-overlapping boxes inside bounds.
const {placeLabels}=await import('./dist/labels.mjs');
const anchors=[{x:600,y:100,w:120,h:32},{x:612,y:96,w:120,h:32},{x:606,y:110,w:120,h:32}];
const boxes=placeLabels(anchors,anchors.map(a=>({x:a.x-11,y:a.y-11,w:22,h:22})));
const ov=(a,b)=>Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y);
for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++)assert.ok(!ov(boxes[i],boxes[j]),'labels overlap');
const edge=placeLabels([{x:840,y:200,w:120,h:32}])[0];assert.ok(edge.x+edge.w<=850,'label kept inside map');
console.log('Labels: clustered airports placed without overlap, edge labels kept in bounds.');
