// SIMBAD TAP snapshot, retrieved 2026-11-14. ICRS positions at J2000,
// pmra includes cos(dec); proper motions are mas/year. No parallax correction.
export const targetCatalogue = [
  { name: 'Barnard’s Star', ra: 269.4520769586187, dec: 4.693364966576667, pmra: -801.551, pmdec: 10362.394, epoch: 2000, kind: 'motion', wave: 1.6 },
  { name: 'Epsilon Indi B', ra: 331.04414658852124, dec: -56.782844195116105, pmra: 3981.977, pmdec: -2466.832, epoch: 2000, kind: 'motion', wave: 4.5 },
  { name: 'WISE 0855', ra: 133.81890825, dec: -7.247048, pmra: -8123.7, pmdec: 673.2, epoch: 2000, kind: 'motion', wave: 4.5 },
  { name: 'RW Aurigae', ra: 76.95652603458333, dec: 30.401438173888888, pmra: 7.23, pmdec: -20.33, epoch: 2000, kind: 'variable', wave: 2.2 },
  { name: 'R Draconis', ra: 248.16761083295, dec: 66.75497941722, pmra: -20.643, pmdec: 6.149, epoch: 2000, kind: 'variable', wave: 3.29 },
];

export function predictPosition(target, date) {
  const time = Date.parse(date);
  if (!target || !Number.isFinite(time)) return null;
  const year = 2000 + (time - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86400000);
  const elapsed = year - target.epoch;
  return { ra: (target.ra + target.pmra * elapsed / (3600000 * Math.cos(target.dec * Math.PI / 180)) + 360) % 360,
    dec: target.dec + target.pmdec * elapsed / 3600000 };
}

export function measureSource(preview, position, radius = 2) {
  if (!position) return null;
  const [cx, cy] = position, source = [], sky = [];
  let total = 0;
  for (let y = Math.floor(cy - 7); y <= Math.ceil(cy + 7); y++) {
    for (let x = Math.floor(cx - 7); x <= Math.ceil(cx + 7); x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r <= radius) total++;
      if (x < 0 || y < 0 || x >= preview.width || y >= preview.height) continue;
      const value = preview.pixels[y * preview.width + x];
      if (value == null || !Number.isFinite(value)) continue;
      if (r <= radius) source.push({ x, y, value });
      if (r >= 4 && r <= 7) sky.push(value);
    }
  }
  if (!total || source.length / total < .9 || sky.length < 20) return null;
  sky.sort((a, b) => a - b);
  const background = sky[Math.floor(sky.length / 2)];
  const deviations = sky.map(v => Math.abs(v - background)).sort((a, b) => a - b);
  const noise = Math.max(1e-9, 1.4826 * deviations[Math.floor(deviations.length / 2)]);
  const flux = source.reduce((sum, p) => sum + p.value - background, 0);
  const error = noise * Math.sqrt(source.length * (1 + source.length / sky.length));
  const weight = source.reduce((sum, p) => sum + Math.max(0, p.value - background), 0);
  if (flux / error < 5 || !weight) return null;
  const x = source.reduce((sum, p) => sum + p.x * Math.max(0, p.value - background), 0) / weight;
  const y = source.reduce((sum, p) => sum + p.y * Math.max(0, p.value - background), 0) / weight;
  return { x, y, flux, error, snr: flux / error, positionErrorPixels: Math.max(.05, 1 / (flux / error)), coverage: source.length / total };
}

export function registerProjected(reference, current) {
  const { width, height } = current;
  if (!reference || reference.width !== width || reference.height !== height) return { ...current, registration: null };
  const peaks = image => {
    const points = [];
    const finite = image.values.filter(Number.isFinite).sort((a, b) => a - b);
    const background = finite[Math.floor(finite.length / 2)] || 0;
    const spread = finite.map(value => Math.abs(value - background)).sort((a, b) => a - b);
    const threshold = background + Math.max(1e-9, 7.413 * (spread[Math.floor(spread.length / 2)] || 0));
    for (let y = 5; y < height - 5; y++) for (let x = 5; x < width - 5; x++) {
      // The target at field centre must not define the background registration.
      if (Math.hypot(x - width / 2, y - height / 2) < 8) continue;
      const value = image.values[y * width + x];
      if (!Number.isFinite(value) || value <= threshold) continue;
      let maximum = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if ((dx || dy) && image.values[(y + dy) * width + x + dx] >= value) maximum = false;
      }
      if (maximum) {
        let sum = 0, sx = 0, sy = 0;
        const base = Math.min(...[-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => image.values[(y + dy) * width + x + dx])));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const w = Math.max(0, image.values[(y + dy) * width + x + dx] - base);
          sum += w; sx += (x + dx) * w; sy += (y + dy) * w;
        }
        if (sum > 0) points.push({ x: sx / sum, y: sy / sum, value });
      }
    }
    return points.sort((a, b) => b.value - a.value).slice(0, 35);
  };
  const left = peaks(reference), right = peaks(current), offsets = [];
  const used = new Set();
  for (const star of left) {
    let match = null, distance = 3;
    for (const candidate of right) {
      const delta = Math.hypot(star.x - candidate.x, star.y - candidate.y);
      if (!used.has(candidate) && delta < distance) { distance = delta; match = candidate; }
    }
    if (match) { used.add(match); offsets.push([match.x - star.x, match.y - star.y]); }
  }
  if (offsets.length < 3) return { ...current, registration: null };
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const dx = median(offsets.map(v => v[0])), dy = median(offsets.map(v => v[1]));
  const good = offsets.filter(v => Math.hypot(v[0] - dx, v[1] - dy) < .7);
  if (good.length < 3) return { ...current, registration: null };
  const scatter = Math.sqrt(good.reduce((sum, v) => sum + (v[0] - dx) ** 2 + (v[1] - dy) ** 2, 0) / good.length);
  const values = current.values.map((_, index) => {
    const x = index % width + dx, y = Math.floor(index / width) + dy;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    if (ix < 0 || iy < 0 || ix + 1 >= width || iy + 1 >= height) return NaN;
    const pixels = [current.values[iy * width + ix], current.values[iy * width + ix + 1], current.values[(iy + 1) * width + ix], current.values[(iy + 1) * width + ix + 1]];
    if (!pixels.every(Number.isFinite)) return NaN;
    return pixels[0] * (1 - fx) * (1 - fy) + pixels[1] * fx * (1 - fy) + pixels[2] * (1 - fx) * fy + pixels[3] * fx * fy;
  });
  return { ...current, values, registration: { dx, dy, scatter, stars: good.length } };
}
