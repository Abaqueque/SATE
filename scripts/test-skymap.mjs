import assert from 'node:assert/strict';
import vm from 'node:vm';
import { browserScript } from '../src/browser.js';

const origin = { ra: 83.8221, dec: -5.3911, wavelength: 3.29, size: .1 };

// Lightweight DOM harness exercises the actual shipped browser script, not a
// separate model of its state transitions. Browser QA covers layout and input.
const elements = [];
let rasterizations = 0;
class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.disabled = false;
    this.clientWidth = 720;
    this.clientHeight = 600;
    this.scrollLeft = this.scrollTop = 0;
    this.offsetWidth = 240;
    this.offsetHeight = 240;
    this.offsetLeft = this.offsetTop = 0;
    this.classList = {
      add: (value) => { this.className += ' ' + value; },
      remove: (value) => { this.className = this.className.split(' ').filter((item) => item !== value).join(' '); },
    };
    this.context = {
      createImageData: (width, height) => { rasterizations++; return { data: new Uint8ClampedArray(width * height * 4) }; },
      putImageData: (image) => { this.image = image; },
      drawImage: (source) => { this.image = source.image; },
    };
    elements.push(this);
  }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...children) { this.children.push(...children); children.forEach(child => { child.parent = this; }); }
  prepend(child) { this.children.unshift(child); child.parent = this; }
  remove() { this.removed = true; if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  replaceWith(next) {
    if (!this.parent) return;
    const parent = this.parent, index = parent.children.indexOf(this);
    parent.children.splice(index, 1, next); next.parent = parent; this.parent = null;
  }
  focus() { this.focused = true; }
  scrollTo(position) { this.scrollPosition = position; }
  getContext() { return this.context; }
  click() { if (!this.disabled) return this.listeners.click?.(); }
  toDataURL() { return 'data:image/png;base64,test'; }
}
const ids = new Map();
for (const id of ['search-form', 'submit-button', 'cancel-button', 'status', 'status-text', 'image-canvas', 'empty-state', 'download-png', 'download-fits', 'open-irsa', 'map-list', 'map-count', 'selected-position', 'meta-observation', 'meta-band', 'meta-size', 'ra', 'dec', 'size', 'wavelength', 'original-pixels']) {
  const element = new Element();
  if (id.startsWith('navigate-')) element.className = 'sky-arrow';
  ids.set(id, element);
}
let fetchCount = 0;
let fetchMode = 'success';
const context = vm.createContext({
  document: {
    getElementById: (id) => ids.get(id),
    createElement: (tag) => new Element(tag),
    querySelectorAll: (selector) => elements.filter((item) => item.className.split(' ').includes(selector.slice(1))),
  },
  navigator: {}, window: { requestIdleCallback() {} }, requestIdleCallback() {},
  AbortController, DOMException, URLSearchParams, URL, console,
  FormData: class { get(name) { return ids.get(name).value; } },
  setTimeout, Uint8ClampedArray,
  fetch: async (path, options) => {
    if (path.startsWith('/presets/index.json')) return { ok: true, json: async () => ({ entries: [] }) };
    fetchCount += 1;
    if (fetchMode === 'pending') return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
    });
    if (fetchMode === 'error') return { ok: false, json: async () => ({ error: 'No archive coverage.' }) };
    const query = Object.fromEntries(new URL(path, 'http://localhost').searchParams);
    const wcs = { crpix: [80.5, 80.5], crval: [Number(query.ra), Number(query.dec)], cd: [-.002, 0, 0, .002], sip: { a: [], b: [] } };
    const pixels = Array.from({ length: 160 * 160 }, (_, index) => fetchMode === 'blank' ? null : 1 + index / 1000);
    return {
      ok: true, headers: new Headers(),
      json: async () => ({ width: 160, height: 160, pixels, wcs, observation: query.observation || 'observation-' + fetchCount, bandpass: 'test band', fitsUrl: '/api/cutout?observation=' + fetchCount + '&format=fits' }),
    };
  },
});
vm.runInContext(browserScript, context);
const read = (code) => vm.runInContext(code, context);
const root = JSON.stringify(origin);
await read('loadTile(' + root + ', null, 0, 0)');
assert.equal(read('tileCount'), 1);
assert.equal(read('skyMaps.length'), 1);
assert.equal(read('selectedTile.map.tiles.size'), 1);
assert.equal(read('currentFitsUrl'), '/api/cutout?observation=1&format=fits');
const rootTile = read('selectedTile');
const afterFirst = fetchCount;
const firstObservation = JSON.stringify(rootTile.preview.observation);
const exactFirst = await read('getPreview(' + root + ', new AbortController().signal, ' + firstObservation + ', true)');
assert.equal(exactFirst.cached, true);
assert.equal(fetchCount, afterFirst, 'Returning to the initially loaded date must not query the archive');
exactFirst.preview.pixels[0] = -999;
const firstAgain = await read('getPreview(' + root + ', new AbortController().signal, ' + firstObservation + ', true)');
assert.notEqual(firstAgain.preview.pixels[0], -999, 'Display edits cannot contaminate saved observations');
await read('getPreview(' + root + ', new AbortController().signal, "ANOTHER-DATE", true)');
const afterSecond = fetchCount;
await read('getPreview(' + root + ', new AbortController().signal, "ANOTHER-DATE", true)');
assert.equal(fetchCount, afterSecond, 'Revisiting a loaded timeline frame must not download it again');
// Keep the existing spatial-map request-count assertions independent of this extra date.
fetchCount = afterFirst;
const rootImage = ids.get('image-canvas').image;
assert.equal(rootTile.thumbnail.width, 50);
assert.equal(rootTile.thumbnail.height, 50);
assert.equal(rootTile.selectButton.children.length, 1, 'No coordinate caption separates connected images');
assert.equal(ids.get('ra').value, undefined, 'Navigating must not increment the coordinate inputs');

// A full square returns to its starting address and never fetches it again.
for (const [directionIndex, total] of [[0, 2], [1, 3], [2, 4], [3, 4]]) {
  read('navigateTile(selectedTile, directions[' + directionIndex + '])');
  while (read('activeController')) await new Promise(setImmediate);
  assert.equal(read('tileCount'), total);
}
assert.equal(fetchCount, 4);
assert.equal(read('selectedTile'), rootTile);
assert.equal(ids.get('image-canvas').image, rootImage);
assert.equal(read('selectedTile.selectButton.attributes["aria-pressed"]'), 'true');
assert.equal(read('skyMaps[0].tiles.get("0:-1").card.style.gridRow'), '1');
assert.equal(read('skyMaps[0].tiles.get("0:0").card.style.gridRow'), '2');
assert.equal(read('skyMaps[0].tiles.get("1:0").card.style.gridColumn'), '2');

// Every card has its own arrows; they navigate from that card, not selection.
const savedNorth = read('skyMaps[0].tiles.get("0:-1")');
assert.equal(rootTile.map.grid.style.gridTemplateRows, 'repeat(2, 240px)');
assert.equal(rootTile.map.range, savedNorth.map.range, 'All tiles share one brightness scale');
savedNorth.card.children.find((item) => item.attributes['aria-label']?.startsWith('Explore down')).click();
assert.equal(read('selectedTile'), rootTile);
assert.equal(fetchCount, 4);
fetchMode = 'error';
read('navigateTile(selectedTile, directions[3])');
while (read('activeController')) await new Promise(setImmediate);
assert.equal(read('tileCount'), 4);
assert.equal(read('selectedTile'), rootTile);
assert.match(ids.get('status-text').textContent, /No archive coverage.*unchanged/);
assert.equal(ids.get('download-png').disabled, false);
assert.equal(ids.get('download-fits').disabled, false);

fetchMode = 'pending';
read('navigateTile(selectedTile, directions[3])');
await new Promise(setImmediate);
assert.equal(rootTile.card.children[1].disabled, true);
assert.equal(savedNorth.selectButton.disabled, true);
assert.equal(rootTile.map.closeButton.disabled, true, 'Closing is disabled during a request');
read('closeSkyMap(skyMaps[0])');
assert.equal(read('skyMaps.length'), 1, 'A pending request must not write into a removed map');
ids.get('cancel-button').click();
while (read('activeController')) await new Promise(setImmediate);
assert.equal(read('tileCount'), 4);
assert.equal(read('selectedTile'), rootTile);
assert.match(ids.get('status-text').textContent, /stopped.*retained/);
assert.equal(rootTile.card.children[1].disabled, false);

fetchMode = 'blank';
await read('loadTile({ra:1,dec:1,wavelength:1,size:.1},null,0,0)');
assert.equal(read('skyMaps.length'), 1, 'Invalid science pixels must not create blank maps');
assert.equal(read('tileCount'), 4);

fetchMode = 'success';
await read('loadTile({ra:2,dec:2,wavelength:1,size:.2},null,0,0)');
assert.equal(read('skyMaps.length'), 2);
assert.equal(read('skyMaps[0].tiles.size'), 4, 'New target preserves previous map');
assert.equal(read('tileCount'), 5);
read('selectTile(skyMaps[0].tiles.get("0:0"), true)');
assert.equal(read('currentFitsUrl'), '/api/cutout?observation=1&format=fits');
assert.equal(ids.get('meta-observation').textContent, 'observation-1');
assert.equal(ids.get('ra').value, undefined);

// Capacity rejects new tiles but never evicts retained ones or blocks revisits.
read('tileCount = 64');
const beforeLimit = fetchCount;
await read('loadTile({ra:3,dec:3,wavelength:1,size:.1},null,0,0)');
assert.equal(fetchCount, beforeLimit);
assert.match(ids.get('status-text').textContent, /memory limit/);
read('navigateTile(selectedTile, directions[0])');
assert.equal(read('selectedTile'), savedNorth);
assert.equal(read('skyMaps[0].tiles.size'), 4);

// Restore the real count after the synthetic capacity check.
read('tileCount = 5');
const inactive = read('skyMaps[1]');
let disconnected = false;
inactive.panning.observer = { disconnect() { disconnected = true; } };
inactive.closeButton.click();
assert.equal(disconnected, true);
assert.equal(inactive.section.removed, true);
assert.equal(inactive.tiles.size, 0);
assert.equal(read('skyMaps.length'), 1);
assert.equal(read('tileCount'), 4, 'Closing frees only that map\'s tile capacity');
assert.equal(read('selectedTile'), savedNorth, 'Closing an inactive map preserves the current selection');
assert.equal(ids.get('map-list').children.length, 1);

await read('loadTile({ra:3,dec:3,wavelength:1,size:.1},null,0,0)');
const third = read('skyMaps[1]');
assert.equal(third.id, 3, 'Map IDs are not reused after a map is closed');
assert.equal(third.closeButton.attributes['aria-label'], 'Close sky map 3');
assert.equal(read('selectedTile.map'), third);
third.closeButton.click();
assert.equal(read('selectedTile'), savedNorth, 'Closing the active map selects a remaining map');
assert.equal(read('currentFitsUrl'), savedNorth.preview.fitsUrl);
assert.equal(ids.get('meta-observation').textContent, savedNorth.preview.observation);
assert.equal(ids.get('download-png').disabled, false);
assert.equal(read('tileCount'), 4);
third.closeButton.click();
assert.equal(read('tileCount'), 4, 'Repeated close cannot subtract capacity twice');

rootTile.map.closeButton.click();
assert.equal(read('skyMaps.length'), 0);
assert.equal(read('tileCount'), 0);
assert.equal(read('selectedTile'), null);
assert.equal(read('currentFitsUrl'), null);
assert.equal(ids.get('empty-state').hidden, false);
assert.equal(ids.get('download-png').disabled, true);
assert.equal(ids.get('download-fits').disabled, true);
assert.equal(ids.get('meta-observation').textContent, '—');
assert.equal(ids.get('map-list').children.length, 0);
assert.equal(ids.get('submit-button').focused, true);
assert.match(ids.get('map-count').textContent, /^0 \/ 64/);

await read('loadTile(' + root + ', null, 0, 0)');
assert.equal(read('skyMaps[0].id'), 4);
assert.equal(read('tileCount'), 1);
assert.equal(ids.get('empty-state').hidden, true);
assert.equal(ids.get('download-png').disabled, false);

// Exercise the actual timeline display path, not just its raw-pixel cache.
const frameA = read('selectedTile.thumbnail');
const observationA = read('selectedTile.preview.observation');
context.dateA = { id: observationA, date: '2025-05-01T00:00:00.000Z' };
context.dateB = { id: 'TIMELINE-B', date: '2025-11-01T00:00:00.000Z' };
await read('showObservation(selectedTile, dateB)');
const frameB = read('selectedTile.thumbnail');
assert.notEqual(frameA, frameB);
const frameRequests = fetchCount, renders = rasterizations;
read('const displayStates = []; const previousStatus = setStatus; setStatus = (state, message) => { displayStates.push(state); previousStatus(state, message); };');
await read('showObservation(selectedTile, dateA)');
assert.equal(read('selectedTile.thumbnail'), frameA, 'Returning to the initial date reuses its rendered canvas');
await read('showObservation(selectedTile, dateB)');
assert.equal(read('selectedTile.thumbnail'), frameB, 'Repeating a date reuses its rendered canvas');
assert.equal(fetchCount, frameRequests, 'Rendered cache hits must make zero archive/API requests');
assert.equal(rasterizations, renders, 'Rendered cache hits must not reproject/repaint the science pixels');
assert.equal(read('displayStates.includes("loading")'), false, 'Saved dates must never flash an archive-loading state');
assert.equal(read('activeController'), null);
assert.match(ids.get('status-text').textContent, /saved frame.*no reload/);

// Expelling rendered frames still reuses previously downloaded raw pixels.
read('renderedFrames.closeMap(selectedTile.map.id)');
await read('showObservation(selectedTile, dateA)');
assert.equal(fetchCount, frameRequests, 'Evicted rendered frames fall back to the raw-pixel cache, not the network');
assert.equal(read('displayStates.includes("loading")'), false);
assert.match(ids.get('status-text').textContent, /saved pixels.*no archive request/);
const stopped = new AbortController(); stopped.abort(); context.stopped = stopped;
await assert.rejects(read('showObservation(selectedTile, dateB, stopped.signal)'), { name: 'AbortError' });
assert.equal(read('selectedTile.preview.observation'), observationA, 'A stopped playback must not swap a cached frame');
const originalPixels = ids.get('original-pixels');
originalPixels.checked = true;
originalPixels.listeners.change();
const originalA = read('selectedTile.thumbnail'), originalImage = originalA.image;
originalPixels.checked = false;
originalPixels.listeners.change();
assert.notEqual(read('selectedTile.thumbnail'), originalA, 'Original/repaired modes retain distinct canvases');
assert.equal(originalA.image, originalImage, 'Toggling repair cannot overwrite a cached original canvas');
await read('showObservation(selectedTile, dateB)');
originalPixels.checked = true;
originalPixels.listeners.change();
await read('showObservation(selectedTile, dateA)');
assert.equal(read('selectedTile.thumbnail'), originalA, 'Each observation reuses the matching original/repaired variant');
console.log('Sky maps, Stop, close cleanup, rendered timeline reuse, zero-fetch/zero-repaint revisits and raw-cache fallback passed.');
