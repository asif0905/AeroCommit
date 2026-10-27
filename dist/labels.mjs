// Greedy map-label placement. Each label tries positions around its anchor (right, left, above, below)
// and takes the first with no overlap; otherwise the one with the least overlap. Placed labels become
// obstacles for later ones, so callers should pass the most important labels first.
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// Rough text width for the map's sans-serif faces; good enough for collision tests.
export const textWidth = (text, size, bold = false) => String(text).length * size * (bold ? 0.64 : 0.56);

// labels: [{x, y, w, h, gap?}] anchored at point (x, y); obstacles: [{x, y, w, h}] boxes.
// bounds: {x, y, w, h} of the drawable area. Returns [{x, y, w, h, side}] top-left boxes in input order.
export function placeLabels(labels, obstacles = [], bounds = {x: 0, y: 0, w: 850, h: 420}) {
  const taken = obstacles.slice();
  return labels.map(l => {
    const g = l.gap ?? 13;
    const candidates = [
      {side: 'right', x: l.x + g, y: l.y - l.h / 2},
      {side: 'left', x: l.x - g - l.w, y: l.y - l.h / 2},
      {side: 'above', x: l.x - l.w / 2, y: l.y - g - l.h},
      {side: 'below', x: l.x - l.w / 2, y: l.y + g},
      {side: 'above-right', x: l.x + g * 0.6, y: l.y - g - l.h},
      {side: 'below-right', x: l.x + g * 0.6, y: l.y + g},
      {side: 'above-left', x: l.x - g * 0.6 - l.w, y: l.y - g - l.h},
      {side: 'below-left', x: l.x - g * 0.6 - l.w, y: l.y + g}
    ].map(c => ({...c, w: l.w, h: l.h}));
    let best = null, bestCost = Infinity;
    for (const c of candidates) {
      const outside = c.w * c.h - overlap(c, bounds);
      const cost = taken.reduce((s, t) => s + overlap(c, t), 0) + outside * 4;
      if (cost < bestCost - 1e-9) { best = c; bestCost = cost; }
      if (cost === 0) break;
    }
    taken.push(best);
    return best;
  });
}
