import assert from 'node:assert/strict';
import { repairPreviewGaps } from '../src/repair.js';

const width = 21, height = 21;
const values = Array.from({ length: width * height }, (_, index) => index % width + Math.floor(index / width) * 2);
const missing = [199, 200, 220, 221];
missing.forEach(index => { values[index] = NaN; });
values[0] = NaN; // No extrapolation into missing image edges.
values[300] = 0; // Real dark measurements must be preserved.
const image = { width, height, values };
const result = repairPreviewGaps(image);
assert.equal(result.repairedCount, 4);
for (const index of missing) {
  assert.ok(Math.abs(result.values[index] - (index % width + Math.floor(index / width) * 2)) < .001, 'Recover a smooth linear brightness gradient');
  assert.ok(Number.isNaN(values[index]), 'Original science values must remain missing');
}
assert.ok(Number.isNaN(result.values[0]));
assert.equal(result.values[300], 0);
values.forEach((value, index) => {
  if (Number.isFinite(value)) assert.equal(result.values[index], value, 'Valid measurements must never change');
});
const broad = values.map(() => 5);
for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) broad[y * width + x] = NaN;
assert.equal(repairPreviewGaps({ width, height, values: broad }).repairedCount, 0, 'Large gaps must remain unfilled');
const empty = repairPreviewGaps({ width: 3, height: 3, values: Array(9).fill(NaN) });
assert.equal(empty.repairedCount, 0);
console.log('Gap interpolation preserves valid dark pixels, original data, edges and large gaps; smooth enclosed gaps are filled.');
