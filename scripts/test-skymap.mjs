import assert from 'node:assert/strict';
import vm from 'node:vm';
import { browserScript } from '../src/browser.js';

const origin = { ra: 83.8221, dec: -5.3911, wavelength: 3.29, size: .1 };

// Lightweight DOM harness exercises the actual shipped browser script, not a
// separate model of its state transitions. Browser QA covers layout and input.
const elements = [];
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
      createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (image) => { this.image = image; },
      drawImage: (source) => { this.image = source.image; },
    };
    elements.push(this);
  }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...children) { this.children.push(...children); }
  prepend(child) { this.children.unshift(child); }
  scrollTo(position) { this.scrollPosition = position; }
  getContext() { return this.context; }
  click() { if (!this.disabled) return this.listeners.click?.(); }
  toDataURL() { return 'data:image/png;base64,test'; }
}
const ids = new Map();
for (const id of ['search-form', 'submit-button', 'cancel-button', 'status', 'status-text', 'image-canvas', 'empty-state', 'download-png', 'download-fits', 'open-irsa', 'map-list', 'map-count', 'selected-position', 'meta-observation', 'meta-band', 'meta-size', 'ra', 'dec', 'size', 'wavelength']) {
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
      json: async () => ({ width: 160, height: 160, pixels, wcs, observation: 'observation-' + fetchCount, bandpass: 'test band', fitsUrl: '/api/cutout?observation=' + fetchCount + '&format=fits' }),
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
console.log('Sky geometry, four-way navigation, retained maps, reuse, per-tile arrows, Stop, errors, selection and capacity passed.');
