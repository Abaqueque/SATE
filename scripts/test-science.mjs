import assert from 'node:assert/strict';
import { targetCatalogue, predictPosition, measureSource, registerProjected } from '../src/targets.js';
const star = targetCatalogue[0];
const epoch = predictPosition(star, '2000-01-01T12:00:00Z');
assert.ok(Math.abs(epoch.ra - star.ra) < 1e-9);
const later = predictPosition(star, new Date(Date.UTC(2000, 0, 1, 12) + 365.25 * 86400000).toISOString());
assert.ok(Math.abs((later.dec - star.dec) * 3600000 - star.pmdec) < 1e-6);
assert.equal(predictPosition(star, 'invalid'), null);
const size = 64;
const make = (dx, dy) => Array.from({ length: size ** 2 }, (_, index) => {
  const x = index % size, y = Math.floor(index / size);
  return 2 + .01 * Math.sin(index * 3) + [[12, 12], [48, 13], [13, 49], [47, 48], [32, 32]].reduce((sum, [sx, sy]) =>
    sum + 20 * Math.exp(-((x - sx - dx) ** 2 + (y - sy - dy) ** 2) / 2), 0);
});
const raw = make(0, 0);
const candidate = measureSource({ width: size, height: size, pixels: raw }, [32, 32]);
assert.ok(candidate && candidate.snr > 5);
assert.ok(Math.abs(candidate.x - 32) < .01);
const missing = [...raw]; missing[32 * size + 32] = null; missing[32 * size + 33] = null;
assert.equal(measureSource({ width: size, height: size, pixels: missing }, [32, 32]), null, 'Missing/saturated cores must not receive repaired photometry');
const aligned = registerProjected({ width: size, height: size, values: raw }, { width: size, height: size, values: make(.6, -.4) });
assert.ok(aligned.registration && aligned.registration.stars >= 3);
assert.ok(Math.abs(aligned.registration.dx - .6) < .25);
assert.ok(Math.abs(aligned.registration.dy + .4) < .25);
assert.equal(registerProjected(null, { width: size, height: size, values: raw }).registration, null);
assert.equal(raw[32 * size + 32], make(0, 0)[32 * size + 32], 'Measurement and registration must preserve input arrays');
console.log('Epoch propagation, raw-pixel centroid/flux, missing-core rejection and background registration passed.');

