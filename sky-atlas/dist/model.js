export const STATUS = {
  waiting: { label: 'Not reviewed', icon: '·', color: '#899594' },
  working: { label: 'In progress', icon: '↻', color: '#7ea8df' },
  reviewed: { label: 'Reviewed', icon: '✓', color: '#80bda4' },
  flagged: { label: 'Needs a look', icon: '!', color: '#e8b56c' }
};
export const MIRA = { region: 16, cell: 1 };
export function regionBounds(id) {
  const col = id % 12, row = Math.floor(id / 12);
  return { west: 360 - col * 30, east: 330 - col * 30, north: 90 - row * 30, south: 60 - row * 30 };
}
export function cellBounds(region, cell) {
  const b = regionBounds(region), col = cell % 3, row = Math.floor(cell / 3);
  return { west: b.west - col * 10, east: b.west - (col + 1) * 10, north: b.north - row * 10, south: b.north - (row + 1) * 10 };
}
export const regionName = id => `R${String(id + 1).padStart(2, '0')}`;
export const cellName = id => `${'ABC'[id % 3]}${Math.floor(id / 3) + 1}`;
export const key = (r, c) => `${r}:${c}`;
export function readState(storage = globalThis.localStorage) {
  try { const d = JSON.parse(storage.getItem('sate-prototype-v1') || '{}'); return { reviews: d.reviews || {}, preferences: d.preferences || { ai: true, compute: false, batch: '5', power: 'light' } }; }
  catch { return { reviews: {}, preferences: { ai: true, compute: false, batch: '5', power: 'light' } }; }
}
export function sampleStatus(r, c, reviews = {}) {
  if (r === MIRA.region && c === MIRA.cell) return 'waiting';
  const saved = reviews[key(r, c)];
  if (saved && STATUS[saved.status]) return saved.status;
  if ([8, 35, 58].includes(r)) return 'reviewed';
  const n = (r * 17 + c * 7 + 11) % 37;
  return n < 5 ? 'reviewed' : n === 12 ? 'flagged' : n === 23 ? 'working' : 'waiting';
}
export function regionStatus(r, reviews = {}) {
  const all = Array.from({ length: 9 }, (_, c) => sampleStatus(r, c, reviews));
  if (all.includes('flagged')) return 'flagged';
  if (all.includes('working')) return 'working';
  return all.every(s => s === 'reviewed') ? 'reviewed' : 'waiting';
}
export function parseSelection(search) {
  const q = new URLSearchParams(search), r = Number(q.get('region')), c = Number(q.get('cell'));
  return { region: q.has('region') && Number.isInteger(r) && r >= 0 && r < 72 ? r : null, cell: q.has('cell') && Number.isInteger(c) && c >= 0 && c < 9 ? c : null };
}
export function nextRegion(reviews = {}) {
  for (const r of [16, 28, 29, ...Array.from({ length: 72 }, (_, i) => i)]) {
    for (let c = 0; c < 9; c++) if (!(r === MIRA.region && c === MIRA.cell) && sampleStatus(r, c, reviews) === 'waiting') return { region: r, cell: c };
  }
  return null;
}
