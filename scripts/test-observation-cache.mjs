import assert from 'node:assert/strict';
import { createObservationCache, createRenderedFrameCache } from '../src/observation-cache.js';

function storage() {
  const entries = new Map();
  let refuseWrites = false;
  const cache = {
    async match(key) { return entries.get(String(key))?.clone(); },
    async put(key, response) {
      if (refuseWrites) throw new Error('Quota exceeded');
      entries.delete(String(key)); entries.set(String(key), response.clone());
    },
    async delete(key) { return entries.delete(String(key)); },
    async keys() { return [...entries.keys()]; },
  };
  return { entries, async open() { return cache; }, denyWrites() { refuseWrites = true; } };
}

let clock = 1000;
const disk = storage();
const options = { storage: disk, now: () => clock, maxEntries: 3 };
let cache = createObservationCache(options);
const frame = { observation: 'A', pixels: [1, null, 3], wcs: { crval: [83, -5] } };
await cache.set('preview:A', frame);
frame.pixels[0] = 99;
const first = await cache.get('preview:A');
assert.equal(first.pixels[0], 1, 'Saving must isolate calibrated pixels from display mutations');
first.pixels[0] = 88;
assert.equal((await cache.get('preview:A')).pixels[0], 1, 'Reads return independent frames');
// Flush queued touches before simulating a new page instance.
await cache.set('observations:target', { observations: [{ id: 'A' }] });
cache = createObservationCache(options);
assert.equal((await cache.get('preview:A')).observation, 'A', 'Images survive a page reload');
assert.deepEqual((await cache.get('observations:target')).observations, [{ id: 'A' }]);

clock += 86400001;
assert.equal(await cache.get('observations:target'), null, 'Date discovery expires after one day');
assert.ok(await cache.get('preview:A'), 'Pixels remain reusable for seven days');
clock += 6 * 86400000;
assert.equal(await cache.get('preview:A'), null, 'Expired science previews must not be reused');

const lruDisk = storage();
const lru = createObservationCache({ storage: lruDisk, now: () => ++clock, maxEntries: 2 });
await lru.set('preview:A', { id: 'A' });
await lru.set('preview:B', { id: 'B' });
await lru.get('preview:A'); // Touch the hot memory entry, not just persistent reads.
await lru.set('preview:C', { id: 'C' });
const reloaded = createObservationCache({ storage: lruDisk });
assert.equal(lruDisk.entries.size, 2);
assert.equal(await reloaded.get('preview:B'), null, 'Least-recently-used image is evicted first');
// Use the synthetic clock when inspecting the persisted timestamps.
const lruRead = createObservationCache({ storage: lruDisk, now: () => clock });
assert.equal((await lruRead.get('preview:A')).id, 'A');
assert.equal((await lruRead.get('preview:C')).id, 'C');
await lru.get('preview:B');
await lru.get('preview:A'); // Flush the queued touch without inserting a new record.
assert.equal(lruDisk.entries.size, 2, 'Memory hits cannot resurrect disk-evicted entries beyond the bound');

const smallDisk = storage();
const small = createObservationCache({ storage: smallDisk, maxBytes: 80, memoryBytes: 80 });
await small.set('preview:A', 'a'.repeat(20));
await small.set('preview:B', 'b'.repeat(20));
assert.equal(smallDisk.entries.size, 1, 'Byte limits are enforced as well as entry count');
await small.set('preview:large', 'x'.repeat(100));
assert.equal(await small.get('preview:large'), null, 'Oversized entries are not retained');

const unavailable = createObservationCache({ storage: { async open() { throw new Error('Disabled'); } } });
await unavailable.set('preview:A', frame);
assert.equal((await unavailable.get('preview:A')).observation, 'A');
assert.equal(await unavailable.get('preview:missing'), null);
const quotaDisk = storage();
const quota = createObservationCache({ storage: quotaDisk });
await quota.set('preview:A', frame);
quotaDisk.denyWrites();
const readOnly = createObservationCache({ storage: quotaDisk });
assert.equal((await readOnly.get('preview:A')).observation, 'A', 'Touch failures cannot hide saved pixels');
await quota.set('preview:B', { id: 'B' });
assert.equal((await quota.get('preview:B')).id, 'B', 'Quota failures retain memory fallback');
const rendered = createRenderedFrameCache(2, 200);
const canvasFrame = { preview: { pixels: [1, 2] }, thumbnail: { width: 2, height: 2 } };
rendered.set('1:A', canvasFrame); rendered.set('1:B', canvasFrame);
assert.equal(rendered.get('1:A'), canvasFrame);
rendered.set('2:C', canvasFrame);
assert.equal(rendered.get('1:B'), null, 'Rendered frame cache is LRU-bounded');
rendered.closeMap(1);
assert.equal(rendered.get('1:A'), null, 'Closing a map releases only its rendered frames');
assert.equal(rendered.get('2:C'), canvasFrame);
rendered.set('2:large', { preview: { pixels: Array(100).fill(0) }, thumbnail: { width: 2, height: 2 } });
assert.equal(rendered.get('2:large'), null, 'Rendered frames also respect a byte bound');
console.log('Persistent reloads, immutable pixels, TTLs, storage failure fallback and bounded rendered frames passed.');
