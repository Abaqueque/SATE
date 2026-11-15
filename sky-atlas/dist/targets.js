// SIMBAD TAP snapshot, retrieved 2026-11-14. ICRS positions at J2000,
// pmra includes cos(dec); proper motions are mas/year. No parallax correction.
export const targetCatalogue = [
  { name: 'Barnard’s Star', ra: 269.4520769586187, dec: 4.693364966576667, pmra: -801.551, pmdec: 10362.394, epoch: 2000, kind: 'motion', wave: 1.6 },
  { name: 'Epsilon Indi B', ra: 331.04414658852124, dec: -56.782844195116105, pmra: 3981.977, pmdec: -2466.832, epoch: 2000, kind: 'motion', wave: 4.5 },
  { name: 'WISE 0855', ra: 133.81890825, dec: -7.247048, pmra: -8123.7, pmdec: 673.2, epoch: 2000, kind: 'motion', wave: 4.5 },
  { name: 'RW Aurigae', ra: 76.95652603458333, dec: 30.401438173888888, pmra: 7.23, pmdec: -20.33, epoch: 2000, kind: 'variable', wave: 2.2 },
  { name: 'R Draconis', ra: 248.16761083295, dec: 66.75497941722, pmra: -20.643, pmdec: 6.149, epoch: 2000, kind: 'variable', wave: 3.29 },
  // CDS Sesame/SIMBAD positions and proper motions retrieved 2026-11-15.
  { name: 'Kapteyn’s Star', ra: 77.91912433145708, dec: -45.01843381524333, pmra: 6491.223, pmdec: -5708.614, epoch: 2000, kind: 'motion', wave: 1.6 },
  { name: 'Groombridge 1830', ra: 178.2448639115646, dec: 37.71868169809029, pmra: 4002.655, pmdec: -5817.800, epoch: 2000, kind: 'motion', wave: 1.6 },
];

export function predictPosition(target, date) {
  const time = Date.parse(date);
  if (!target || !Number.isFinite(time)) return null;
  const year = 2000 + (time - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86400000);
  const elapsed = year - target.epoch;
  return { ra: (target.ra + target.pmra * elapsed / (3600000 * Math.cos(target.dec * Math.PI / 180)) + 360) % 360,
    dec: target.dec + target.pmdec * elapsed / 3600000 };
}

