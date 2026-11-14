import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractWcs, pixelToSky, skyToPixel, queryForImage, createImageGrid, reprojectImage } from '../src/wcs.js';

const close = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} should equal ${b}`);
const simple = { crpix: [6.5, 6.5], crval: [0, 0], cd: [-.01, 0, 0, .01], sip: { a: [], b: [] } };
assert.equal(extractWcs({}), null);
assert.equal(extractWcs({ CTYPE1: 'RA---TPV', CTYPE2: 'DEC--TPV' }), null);
const extracted = extractWcs({ CTYPE1: 'RA---TAN', CTYPE2: 'DEC--TAN', CRPIX1: 6.5, CRPIX2: 6.5, CRVAL1: 0, CRVAL2: 0, CDELT1: -.01, CDELT2: .01 });
assert.deepEqual(JSON.parse(JSON.stringify(extracted)), simple);
const atReference = pixelToSky(simple, 5.5, 5.5);
close(atReference.ra, 0);
close(atReference.dec, 0);
const east = pixelToSky(simple, 4.5, 5.5);
close(east.ra, Math.atan(.01 * Math.PI / 180) * 180 / Math.PI, 1e-10);
assert.ok(pixelToSky(simple, 6.5, 5.5).ra > 359.9, 'Wrap RA without a discontinuity');

for (const dec of [-90, -89.99, 0, 89.99, 90]) {
  const wcs = { ...simple, crval: [359.999, dec], sip: { a: [[0, 0, .4], [2, 0, 1e-5]], b: [[0, 0, -.8], [1, 1, -1e-5]] } };
  for (const [x, y] of [[0, 0], [6, 6], [100, -20]]) {
    const sky = pixelToSky(wcs, x, y);
    assert.ok(sky.ra >= 0 && sky.ra < 360 && sky.dec >= -90 && sky.dec <= 90);
    const back = skyToPixel(wcs, sky.ra, sky.dec);
    close(back[0], x);
    close(back[1], y);
  }
}

// Independent, labelled native-pixel raster: adjoining output tiles must select
// successive source pixels, with neither repeated nor skipped border columns.
const preview = { width: 12, height: 12, wcs: simple, pixels: Array.from({ length: 144 }, (_, i) => i) };
const grid = { width: 4, height: 4, projection: { ...simple, crpix: [2.5, 2.5] } };
const middle = reprojectImage(preview, grid, 0, 0);
const right = reprojectImage(preview, grid, 1, 0);
const above = reprojectImage(preview, grid, 0, -1);
for (let row = 0; row < 4; row += 1) {
  assert.equal(middle.values[row * 4 + 3] + 1, right.values[row * 4]);
  assert.equal(middle.values[(3 * 4) + row] + 12, above.values[row]);
}
const query = { ra: 0, dec: 0, size: .04, wavelength: 3.29 };
const next = queryForImage(grid, query, 1, 0);
const position = skyToPixel(grid.projection, next.ra, next.dec);
close(position[0], 5.5);
close(position[1], 1.5);
assert.notEqual(next.ra, 359.96, 'Adjacent centres come from image pixels, not decimal increments');
assert.equal(next.size, query.size);
assert.equal(next.wavelength, query.wavelength);

// Rotate the detector by 90 degrees while describing exactly the same sky.
const rotated = { ...preview, wcs: { ...simple, cd: [0, -.01, -.01, 0] }, pixels: [] };
for (let y = 0; y < 12; y += 1) {
  for (let x = 0; x < 12; x += 1) rotated.pixels.push((11 - x) * 12 + y);
}
assert.deepEqual(reprojectImage(rotated, grid, 0, 0).values, middle.values);
assert.throws(() => reprojectImage({ ...preview, wcs: null }, grid, 0, 0), /alignment/);
assert.throws(() => reprojectImage(preview, grid, 10, 10), /No valid/);

// Real SPHEREx prepared headers include nonzero constant and linear SIP terms.
const real = JSON.parse(await readFile(new URL('../public/presets/orion-nebula.json', import.meta.url), 'utf8'));
assert.ok(real.wcs.sip.a.some(([i, j]) => i + j === 0));
for (const [x, y] of [[0, 0], [20, 20], [40, 40]]) {
  const sky = pixelToSky(real.wcs, x, y);
  const back = skyToPixel(real.wcs, sky.ra, sky.dec);
  close(back[0], x);
  close(back[1], y);
}
const realGrid = createImageGrid(real.query, real);
assert.equal(realGrid.width, 29);
assert.ok(reprojectImage(real, realGrid, 0, 0).values.filter(Number.isFinite).length > 700);
console.log('TAN/SIP WCS, polar and RA wrap, exact adjacent pixel borders, rotated exposures and real SPHEREx metadata passed.');
