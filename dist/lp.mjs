// Dependency-free dense simplex for: maximize c·x subject to A·x <= b, x >= 0, with b >= 0.
// The origin is always feasible for this form, so no phase-one is needed.
// Bland's rule prevents cycling; rows are scaled to keep prices and tonnes comparable.
export function maximize(c, A, b, {eps = 1e-9, maxIter = 20000} = {}) {
  const n = c.length;
  const rows = [], rhs = [];
  A.forEach((row, i) => {
    if (b[i] < -eps) throw new Error('LP right-hand side must be non-negative');
    const scale = Math.max(...row.map(Math.abs));
    if (!(scale > 0)) return; // empty row: 0 <= b always holds
    rows.push(row.map(v => v / scale));
    rhs.push(Math.max(0, b[i]) / scale);
  });
  const m = rows.length, width = n + m + 1;
  const T = rows.map((row, i) => {
    const t = new Float64Array(width);
    row.forEach((v, j) => (t[j] = v));
    t[n + i] = 1;
    t[width - 1] = rhs[i];
    return t;
  });
  const z = new Float64Array(width);
  c.forEach((v, j) => (z[j] = -v));
  const basis = Array.from({length: m}, (_, i) => n + i);
  for (let iter = 0; iter < maxIter; iter++) {
    let enter = -1;
    for (let j = 0; j < width - 1; j++) if (z[j] < -eps) { enter = j; break; }
    if (enter < 0) {
      const x = new Array(n).fill(0);
      basis.forEach((j, i) => { if (j < n) x[j] = Math.max(0, T[i][width - 1]); });
      return {status: 'optimal', x, value: c.reduce((s, v, j) => s + v * x[j], 0), iterations: iter};
    }
    let leave = -1, best = Infinity;
    for (let i = 0; i < m; i++) {
      const a = T[i][enter];
      if (a > eps) {
        const ratio = T[i][width - 1] / a;
        if (ratio < best - eps || (Math.abs(ratio - best) <= eps && basis[i] < basis[leave])) { best = ratio; leave = i; }
      }
    }
    if (leave < 0) return {status: 'unbounded', x: null, value: Infinity, iterations: iter};
    const pivotRow = T[leave], pv = pivotRow[enter];
    for (let j = 0; j < width; j++) pivotRow[j] /= pv;
    for (let i = 0; i < m; i++) {
      if (i === leave) continue;
      const f = T[i][enter];
      if (f !== 0) for (let j = 0; j < width; j++) T[i][j] -= f * pivotRow[j];
    }
    const fz = z[enter];
    if (fz !== 0) for (let j = 0; j < width; j++) z[j] -= fz * pivotRow[j];
    basis[leave] = enter;
  }
  throw new Error('LP iteration limit reached');
}

// General LP with <=, >= and = rows and right-hand sides of any sign (two-phase simplex).
//   solveLP({objective, sense: 'max'|'min', constraints: [{a: number[] | {index: coef}, op: '<='|'>='|'=', b}]})
// Variables are non-negative. Dantzig pricing with a switch to Bland's rule after a run of degenerate
// pivots guarantees termination. Returns {status: 'optimal'|'infeasible'|'unbounded', x, value}.
export function solveLP({objective, sense = 'max', constraints, eps = 1e-9, maxIter = 100000}) {
  const n = objective.length, sign = sense === 'min' ? -1 : 1;
  const rows = [];
  for (const con of constraints) {
    const a = new Float64Array(n);
    if (Array.isArray(con.a) || ArrayBuffer.isView(con.a)) for (let j = 0; j < n; j++) a[j] = con.a[j] || 0;
    else for (const [k, v] of Object.entries(con.a)) a[+k] += v;
    let b = con.b, op = con.op;
    let scale = 0; for (let j = 0; j < n; j++) scale = Math.max(scale, Math.abs(a[j]));
    if (!(scale > 0)) {
      const ok = op === '<=' ? b >= -1e-7 : op === '>=' ? b <= 1e-7 : Math.abs(b) <= 1e-7;
      if (!ok) return {status: 'infeasible', x: null, value: NaN};
      continue;
    }
    for (let j = 0; j < n; j++) a[j] /= scale; b /= scale;
    if (b < 0) { for (let j = 0; j < n; j++) a[j] = -a[j]; b = -b; op = op === '<=' ? '>=' : op === '>=' ? '<=' : '='; }
    rows.push({a, b, op});
  }
  const m = rows.length;
  const nSlack = rows.filter(r => r.op !== '=').length, nArt = rows.filter(r => r.op !== '<=').length;
  const artStart = n + nSlack, width = artStart + nArt + 1, R = width - 1;
  const T = [], basis = [], isArt = j => j >= artStart && j < R;
  let s = n, art = artStart;
  for (const r of rows) {
    const t = new Float64Array(width); t.set(r.a); t[R] = r.b;
    if (r.op === '<=') { t[s] = 1; basis.push(s++); }
    else { if (r.op === '>=') t[s++] = -1; t[art] = 1; basis.push(art++); }
    T.push(t);
  }
  const z = new Float64Array(width);
  let iterations = 0;
  function pivot(row, col) {
    const p = T[row], pv = p[col];
    for (let j = 0; j < width; j++) p[j] /= pv;
    for (let i = 0; i < T.length; i++) { if (i === row) continue; const f = T[i][col]; if (f !== 0) { const t = T[i]; for (let j = 0; j < width; j++) t[j] -= f * p[j]; } }
    const fz = z[col]; if (fz !== 0) for (let j = 0; j < width; j++) z[j] -= fz * p[j];
    basis[row] = col;
  }
  function run(allowArt) {
    let degenerate = 0;
    for (;;) {
      if (++iterations > maxIter) throw new Error('LP iteration limit reached');
      const bland = degenerate > 50;
      let enter = -1, best = -eps;
      for (let j = 0; j < R; j++) {
        if (!allowArt && isArt(j)) continue;
        if (z[j] < best) { enter = j; if (bland) break; best = z[j]; }
      }
      if (enter < 0) return 'optimal';
      let leave = -1, ratio = Infinity;
      for (let i = 0; i < T.length; i++) {
        const a = T[i][enter];
        if (a > eps) { const q = T[i][R] / a; if (q < ratio - 1e-12 || (Math.abs(q - ratio) <= 1e-12 && basis[i] < basis[leave])) { ratio = q; leave = i; } }
      }
      if (leave < 0) return 'unbounded';
      degenerate = ratio < 1e-12 ? degenerate + 1 : 0;
      pivot(leave, enter);
    }
  }
  // Phase 1: maximize −(sum of artificials).
  if (nArt) {
    for (let i = 0; i < T.length; i++) if (isArt(basis[i])) for (let j = 0; j < width; j++) if (!isArt(j)) z[j] -= T[i][j];
    run(true);
    if (z[R] < -1e-7 * Math.max(1, m)) return {status: 'infeasible', x: null, value: NaN};
    // Drive remaining (zero-valued) artificials out of the basis; drop redundant rows.
    for (let i = T.length - 1; i >= 0; i--) {
      if (!isArt(basis[i])) continue;
      let col = -1; for (let j = 0; j < artStart; j++) if (Math.abs(T[i][j]) > 1e-9) { col = j; break; }
      if (col >= 0) pivot(i, col); else { T.splice(i, 1); basis.splice(i, 1); }
    }
  }
  // Phase 2: original objective.
  z.fill(0);
  for (let j = 0; j < n; j++) z[j] = -sign * objective[j];
  for (let i = 0; i < T.length; i++) { const f = z[basis[i]]; if (f !== 0) for (let j = 0; j < width; j++) z[j] -= f * T[i][j]; }
  const status = run(false);
  if (status === 'unbounded') return {status, x: null, value: sign * Infinity};
  const x = new Array(n).fill(0);
  basis.forEach((j, i) => { if (j < n) x[j] = Math.max(0, T[i][R]); });
  return {status: 'optimal', x, value: objective.reduce((t, v, j) => t + v * x[j], 0), iterations};
}
