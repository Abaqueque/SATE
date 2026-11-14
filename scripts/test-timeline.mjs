import assert from 'node:assert/strict';
import { handleCutout } from '../src/api.js';
import { installTimeline } from '../src/timeline.js';

const nativeFetch = globalThis.fetch;
const nativeDocument = globalThis.document;
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    value: '', children: [], listeners: {}, textContent: '',
    replaceChildren() { this.children = []; this.value = ''; },
    append(child) { this.children.push(child); },
    setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn; },
  });
  return elements.get(id);
}
try {
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    assert.match(String(url), /\/SIA\?/);
    return new Response('access_url,access_format,obs_id,t_min,energy_bandpassname\n' +
      'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/b.fits,image/fits,B,61001,D4\n' +
      'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/a.fits,image/fits,A,61000,D4\n' +
      'https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/c.fits,image/fits,C,,D4');
  };
  const request = new Request('http://localhost/api/cutout?ra=80&dec=-5&wavelength=3&size=.1&format=observations');
  const response = await handleCutout(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.observations.map(item => item.id), ['A', 'B']);
  assert.equal(data.undated, 1);
  assert.equal(data.observations[0].date, new Date((61000 - 40587) * 86400000).toISOString());
  assert.equal(calls, 1, 'Discovery must not download FITS files');
  globalThis.document = { getElementById: element, createElement: () => element('option-' + Math.random()) };
  globalThis.fetch = async () => Response.json(data);
  const tile = { query: { ra: 80, dec: -5, wavelength: 3, size: .1 }, preview: { observation: 'A' } };
  let fail = false;
  const timeline = installTimeline({ async show(target, item) {
    if (fail) throw new Error('Archive unavailable');
    target.preview = { observation: item.id, observedAt: item.date };
  } });
  timeline.select(tile);
  await element('timeline-load').listeners.click();
  assert.equal(element('timeline-exposure').children.length, 2);
  assert.equal(element('timeline-previous').disabled, true);
  await element('timeline-next').listeners.click();
  assert.equal(tile.preview.observation, 'B');
  fail = true;
  await element('timeline-previous').listeners.click();
  assert.equal(tile.preview.observation, 'B');
  assert.match(element('timeline-message').textContent, /Current image retained/);
  element('timeline-end').value = data.observations[0].date.slice(0, 10);
  element('timeline-end').listeners.change();
  assert.equal(element('timeline-exposure').children.length, 1);
  timeline.busy(true);
  assert.equal(element('timeline-next').disabled, true);
  timeline.busy(false);
  timeline.select(null);
  assert.equal(element('timeline-load').disabled, true);
  console.log('Timeline discovery, MJD dates, chronological ordering, date filters, switching, error retention and busy states passed.');
} finally {
  globalThis.fetch = nativeFetch;
  globalThis.document = nativeDocument;
}
