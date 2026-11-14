import assert from 'node:assert/strict';
import { handleCutout } from '../src/api.js';
import { installTimeline } from '../src/timeline.js';
import { createObservationCache } from '../src/observation-cache.js';

const nativeFetch = globalThis.fetch;
const nativeDocument = globalThis.document;
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    value: '', children: [], listeners: {}, textContent: '',
    style: { setProperty(name, value) { this[name] = value; } },
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
  const shown = [];
  let failId = '', pauseOnShow = false;
  const timeline = installTimeline({ async show(target, item, signal) {
    shown.push(item.id);
    if (pauseOnShow) element('timeline-play').listeners.click();
    signal?.throwIfAborted();
    if (fail || item.id === failId) throw new Error('Archive unavailable');
    target.preview = { observation: item.id, observedAt: item.date };
  } });
  timeline.select(tile);
  await element('timeline-load').listeners.click();
  assert.equal(element('timeline-exposure').children.length, 2);
  assert.equal(element('timeline-previous').disabled, true);
  assert.equal(element('timeline-slider').style['--timeline-progress'], '0%');
  await element('timeline-next').listeners.click();
  assert.equal(tile.preview.observation, 'B');
  assert.equal(element('timeline-slider').style['--timeline-progress'], '100%');
  element('timeline-slider').value = '.5';
  element('timeline-slider').listeners.input();
  assert.equal(element('timeline-slider').style['--timeline-progress'], '50%', 'Track fill follows the thumb while dragging');
  element('timeline-slider').value = '1';
  fail = true;
  await element('timeline-previous').listeners.click();
  assert.equal(tile.preview.observation, 'B');
  assert.doesNotMatch(element('timeline-message').textContent, /unavailable|error/i);
  fail = false;
  // Starting from the last exposure replays the sequence from the beginning.
  shown.length = 0;
  failId = 'A';
  await element('timeline-play').listeners.click();
  assert.deepEqual(shown, ['A', 'B'], 'Playback must silently skip the failed first snapshot');
  assert.equal(tile.preview.observation, 'B');
  assert.equal(element('timeline-play').textContent, 'Play');
  assert.doesNotMatch(element('timeline-message').textContent, /unavailable|error/i);
  shown.length = 0; failId = ''; pauseOnShow = true;
  await element('timeline-play').listeners.click();
  assert.deepEqual(shown, ['A'], 'Pause must cancel playback before further frames');
  assert.equal(element('timeline-play').textContent, 'Play');
  pauseOnShow = false;
  await element('timeline-first').listeners.click();
  assert.equal(tile.preview.observation, 'A', 'Earliest control selects the first usable exposure');
  await element('timeline-last').listeners.click();
  assert.equal(tile.preview.observation, 'B', 'Latest control selects the last usable exposure');
  shown.length = 0;
  await element('collect-measurements').listeners.click();
  assert.deepEqual(shown, ['A', 'B'], 'Measurement scan visits all epochs oldest first');
  assert.equal(element('timeline-exposure').children.length, 2, 'All dated exposures remain available');
  timeline.busy(true);
  assert.equal(element('timeline-next').disabled, true);
  timeline.busy(false);
  timeline.select(null);
  assert.equal(element('timeline-load').disabled, true);
  const saved = createObservationCache({ storage: null });
  let discoveries = 0;
  globalThis.fetch = async () => { discoveries++; return Response.json(data); };
  const restored = installTimeline({}, saved);
  restored.select(tile);
  await element('timeline-load').listeners.click();
  assert.equal(discoveries, 1);
  const refreshedPage = installTimeline({}, saved);
  refreshedPage.select(tile);
  await element('timeline-load').listeners.click();
  assert.equal(discoveries, 1, 'A new page timeline restores saved date lists without archive discovery');
  assert.match(element('timeline-message').textContent, /cached dates/);
  assert.equal(element('timeline-load').textContent, 'Refresh observations');
  await element('timeline-load').listeners.click();
  assert.equal(discoveries, 2, 'Explicit Refresh observations still discovers new dates');
  console.log('Timeline discovery, MJD dates, chronological ordering, playback, switching, error retention and busy states passed.');
} finally {
  globalThis.fetch = nativeFetch;
  globalThis.document = nativeDocument;
}
