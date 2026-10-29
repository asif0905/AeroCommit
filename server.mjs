// Local server: serves dist/ and relays live flight data at /api/flights. No dependencies.
//   npm start            → http://localhost:8080
//   PORT=3000 npm start  → another port
//   FLIGHT_FEEDS=adsblol npm start  → feeds to use (default adsblol,airplaneslive). airplanes.live's free
//                                     API is non-commercial only: use FLIGHT_FEEDS=adsblol for commercial use.
//   FLIGHT_UPSTREAMS=https://host/v2/point,... npm start  → other readsb-compatible feeds (testing)
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRelay, DEFAULT_UPSTREAMS, feedsFrom} from './relay.mjs';

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon'};

export function createAppServer({root = fileURLToPath(new URL('./dist/', import.meta.url)), upstreams = DEFAULT_UPSTREAMS, fetchImpl} = {}) {
  const relay = createRelay({upstreams, fetchImpl});
  const base = path.resolve(root);
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (url.pathname === '/api/flights') {
      const out = await relay(url.searchParams);
      res.writeHead(out.status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'});
      res.end(JSON.stringify(out.body));
      return;
    }
    let rel; try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    const file = path.resolve(base, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel));
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const data = await readFile(file);
      res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff'});
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404, {'Content-Type': 'text/plain'}).end('Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  const upstreams = process.env.FLIGHT_UPSTREAMS ? process.env.FLIGHT_UPSTREAMS.split(',').map(s => s.trim()).filter(Boolean)
    : process.env.FLIGHT_FEEDS ? feedsFrom(process.env.FLIGHT_FEEDS) : DEFAULT_UPSTREAMS;
  if (!upstreams.length) throw new Error('FLIGHT_FEEDS names no known feed (use adsblol and/or airplaneslive)');
  createAppServer({upstreams}).listen(port, () => console.log(`AeroCommit: http://localhost:${port}  (live flights via /api/flights: ${upstreams.map(u => u.name || u).join(', ')})`));
}
