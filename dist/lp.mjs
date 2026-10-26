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
