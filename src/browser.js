import * as geometry from './wcs.js';
import { installMapPanning } from './pan.js';
import { installTimeline } from './timeline.js';
import { repairPreviewGaps } from './repair.js';

// Share the tested coordinate calculation without adding a browser dependency.
export const browserScript = [...Object.values(geometry), installMapPanning, installTimeline, repairPreviewGaps].map(fn => fn.toString()).join('\n') + '\n' + String.raw`
const form = document.getElementById('search-form');
const submitButton = document.getElementById('submit-button');
const cancelButton = document.getElementById('cancel-button');
const statusBox = document.getElementById('status');
const statusText = document.getElementById('status-text');
const canvas = document.getElementById('image-canvas');
const emptyState = document.getElementById('empty-state');
const pngButton = document.getElementById('download-png');
const fitsButton = document.getElementById('download-fits');
const openIrsa = document.getElementById('open-irsa');
let currentFitsUrl = null;
let currentName = 'spherex-cutout';
let activeController = null;
const previewCache = new Map();
const skyMaps = [];
const mapList = document.getElementById('map-list');
const mapCount = document.getElementById('map-count');
const directions = [
  { id: 'up', label: 'up', symbol: '↑', dx: 0, dy: -1 },
  { id: 'right', label: 'right', symbol: '→', dx: 1, dy: 0 },
  { id: 'down', label: 'down', symbol: '↓', dx: 0, dy: 1 },
  { id: 'left', label: 'left', symbol: '←', dx: -1, dy: 0 },
];
let selectedTile = null;
let tileCount = 0;
let nextMapId = 1;
const tileLimit = 64;
const timeline = installTimeline({ paused: function () {
  if (selectedTile) setStatus('ready', 'Observation: ' + (selectedTile.preview.observedAt || selectedTile.preview.observation));
}, show: async function (tile, item, playbackSignal) {
  if (activeController) throw new Error('Wait for the current request to finish.');
  const controller = startAction('Loading observation…');
  setStatus('loading', 'Loading exposure from ' + item.date);
  try {
    const result = await getPreview(tile.query, playbackSignal ? AbortSignal.any([controller.signal, playbackSignal]) : controller.signal, item.id, true);
    controller.signal.throwIfAborted();
    playbackSignal?.throwIfAborted();
    const projected = reprojectImage(result.preview, tile.map.imageGrid, tile.x, tile.y);
    const thumbnail = document.createElement('canvas');
    drawFits(projected, thumbnail, tile.map.range);
    tile.preview = result.preview;
    tile.preview.observedAt = item.date;
    tile.thumbnail.replaceWith(thumbnail);
    tile.thumbnail = thumbnail;
    tile.selectButton.title = coordinates(tile.query) + ' · ' + item.id;
    selectTile(tile, result.cached);
    currentName += '-' + item.date.replace(/[:.]/g, '-');
    setStatus('ready', 'Observation: ' + item.date.replace('T', ' '));
  } finally { finishAction(controller); }
} });
function key(query) {
  return [query.ra, query.dec, query.wavelength, query.size].map(Number).join(':');
}
function queryFromForm() {
  const data = new FormData(form);
  return { ra: Number(data.get('ra')), dec: Number(data.get('dec')), wavelength: Number(data.get('wavelength')), size: Number(data.get('size')) };
}
function savePreview(cacheKey, preview) {
  previewCache.delete(cacheKey);
  previewCache.set(cacheKey, preview);
  if (previewCache.size > 32) previewCache.delete(previewCache.keys().next().value);
}
const manifestReady = fetch('/presets/index.json?geometry=1').then(function (response) {
  return response.ok ? response.json() : { entries: [] };
}).catch(function () { return { entries: [] }; });
const presetFiles = new Map();
manifestReady.then(function (manifest) {
  manifest.entries.forEach(function (entry) { presetFiles.set(entry.key, entry.url); });
  // Only static, prepared assets are prefetched. Page visits never launch archive searches.
  const preload = async function () {
    if (navigator.connection && navigator.connection.saveData) return;
    for (const entry of manifest.entries) {
      try {
        const response = await fetch(entry.url + '?geometry=1');
        if (response.ok) {
          const preview = await response.json();
          preview.prepared = true;
          if (preview.wcs) savePreview(entry.key, preview);
        }
      } catch (_) {}
    }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(preload);
  else setTimeout(preload, 1000);
});
document.querySelectorAll('.chip').forEach(function (button) {
  button.addEventListener('click', function () {
    document.getElementById('ra').value = button.dataset.ra;
    document.getElementById('dec').value = button.dataset.dec;
    document.getElementById('wavelength').value = button.dataset.wave;
    if (button.dataset.size) document.getElementById('size').value = button.dataset.size;
  });
});
function setStatus(state, message) {
  statusBox.dataset.state = state;
  statusText.textContent = message;
}
function startAction(label) {
  const controller = new AbortController();
  activeController = controller;
  submitButton.disabled = true;
  submitButton.textContent = label;
  fitsButton.disabled = true;
  cancelButton.disabled = false;
  cancelButton.textContent = 'Stop';
  updateMapControls();
  return controller;
}
function finishAction(controller) {
  if (activeController !== controller) return;
  activeController = null;
  submitButton.disabled = false;
  submitButton.textContent = 'Retrieve SPHEREx image';
  cancelButton.disabled = true;
  cancelButton.textContent = 'Stop';
  fitsButton.disabled = !currentFitsUrl;
  updateMapControls();
}
function cancellable(promise, signal) {
  return new Promise(function (resolve, reject) {
    function cleanup() { signal.removeEventListener('abort', abort); }
    function abort() { cleanup(); reject(new DOMException('Stopped', 'AbortError')); }
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(function (value) { cleanup(); resolve(value); }, function (error) { cleanup(); reject(error); });
  });
}
async function getPreview(query, signal, preferred = '', exact = false) {
  const cacheKey = key(query) + (preferred ? (exact ? ':exact:' : ':observation:') + preferred : '');
  if (previewCache.has(cacheKey)) return { preview: previewCache.get(cacheKey), cached: true };
  await cancellable(manifestReady, signal);
  signal.throwIfAborted();
  if (previewCache.has(cacheKey)) return { preview: previewCache.get(cacheKey), cached: true };
  const preparedUrl = preferred ? null : presetFiles.get(cacheKey);
  if (preparedUrl) {
    try {
      const response = await fetch(preparedUrl + '?geometry=1', { signal: signal });
      if (response.ok) {
        const preview = await response.json();
        preview.prepared = true;
        if (preview.wcs) {
          savePreview(cacheKey, preview);
          return { preview: preview, cached: true };
        }
      }
    } catch (error) { if (signal.aborted) throw error; }
  }
  const parameters = new URLSearchParams({ ra: String(query.ra), dec: String(query.dec), wavelength: String(query.wavelength), size: String(query.size), format: 'preview', geometry: '1' });
  if (preferred) parameters.set(exact ? 'observation' : 'preferred', preferred);
  const response = await fetch('/api/cutout?' + parameters, { signal: signal });
  if (!response.ok) {
    let message = 'The SPHEREx request failed.';
    try { message = (await response.json()).error || message; } catch (_) {}
    throw new Error(message);
  }
  const preview = await response.json();
  savePreview(cacheKey, preview);
  return { preview: preview, cached: response.headers.get('x-vercel-cache') === 'HIT' || response.headers.get('x-app-cache') === 'HIT' };
}
function percentile(sorted, fraction) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * fraction)))];
}

function palette(value) {
  const stops = [[0, [3, 3, 12]], [.18, [27, 14, 72]], [.4, [72, 58, 178]], [.62, [35, 187, 205]], [.82, [255, 176, 78]], [1, [255, 247, 218]]];
  for (let index = 1; index < stops.length; index += 1) {
    if (value <= stops[index][0]) {
      const left = stops[index - 1];
      const right = stops[index];
      const mix = (value - left[0]) / (right[0] - left[0]);
      return left[1].map(function (channel, channelIndex) {
        return Math.round(channel + (right[1][channelIndex] - channel) * mix);
      });
    }
  }
  return stops[stops.length - 1][1];
}

function drawFits(fits, targetCanvas = canvas, range = null) {
  const finite = [];
  const stride = Math.max(1, Math.floor(fits.values.length / 180000));
  for (let index = 0; index < fits.values.length; index += stride) {
    if (Number.isFinite(fits.values[index])) finite.push(fits.values[index]);
  }
  if (!finite.length) throw new Error('The selected cutout contains no valid science pixels.');
  finite.sort(function (a, b) { return a - b; });
  const low = range ? range.low : percentile(finite, .01);
  let high = range ? range.high : percentile(finite, .995);
  if (!(high > low)) high = low + 1;
  const original = document.getElementById('original-pixels');
  const display = original && original.checked ? fits : repairPreviewGaps(fits);
  targetCanvas.repairedPixelCount = display.repairedCount || 0;

  targetCanvas.width = fits.width;
  targetCanvas.height = fits.height;
  const context = targetCanvas.getContext('2d');
  const image = context.createImageData(fits.width, fits.height);
  const stretch = Math.asinh(10);
  for (let y = 0; y < fits.height; y += 1) {
    for (let x = 0; x < fits.width; x += 1) {
      const source = y * fits.width + x;
      const target = ((fits.height - 1 - y) * fits.width + x) * 4;
      const raw = display.values[source];
      let normalized = Number.isFinite(raw) ? (raw - low) / (high - low) : 0;
      normalized = Math.max(0, Math.min(1, normalized));
      normalized = Math.asinh(normalized * 10) / stretch;
      const color = palette(normalized);
      image.data[target] = color[0];
      image.data[target + 1] = color[1];
      image.data[target + 2] = color[2];
      image.data[target + 3] = Number.isFinite(raw) ? 255 : 0;
    }
  }
  context.putImageData(image, 0, 0);
  targetCanvas.classList.add('visible');
  return { low: low, high: high };
}

function initialMapRange(preview) {
  // Include the real surrounding pixels so a bright first target does not
  // immediately clip its fainter neighbours to black. All tiles reuse this.
  const finite = preview.pixels.filter(function (value) { return value != null && Number.isFinite(value); });
  finite.sort(function (a, b) { return a - b; });
  const low = percentile(finite, .01);
  const high = percentile(finite, .995);
  return { low: low, high: high > low ? high : low + 1 };
}

function updateMapControls() {
  timeline.busy(Boolean(activeController));
  document.querySelectorAll('.close-map').forEach(function (button) {
    button.disabled = Boolean(activeController);
  });
  document.querySelectorAll('.sky-arrow').forEach(function (button) {
    button.disabled = Boolean(activeController) || !selectedTile;
  });
  document.querySelectorAll('.tile-select').forEach(function (button) {
    button.disabled = Boolean(activeController);
  });
}
function coordinates(query) {
  return 'RA ' + query.ra.toFixed(5) + '° · Dec ' + query.dec.toFixed(5) + '°';
}
function centreMapTile(tile) {
  const scroller = tile.map.scroller;
  scroller.scrollTo({ left: Math.max(0, tile.map.grid.offsetLeft + tile.card.offsetLeft - (scroller.clientWidth - tile.card.offsetWidth) / 2), top: Math.max(0, tile.map.grid.offsetTop + tile.card.offsetTop - (scroller.clientHeight - tile.card.offsetHeight) / 2) });
}
function closeSkyMap(map) {
  // Do not remove the target of an in-flight image or FITS request.
  if (activeController || map.closed) return;
  const index = skyMaps.indexOf(map);
  if (index === -1) return;
  const wasSelected = selectedTile && selectedTile.map === map;
  map.closed = true;
  skyMaps.splice(index, 1);
  tileCount -= map.tiles.size;
  map.panning.observer?.disconnect();
  map.section.remove();
  map.tiles.clear();
  map.lastSelectedTile = null;
  mapCount.textContent = tileCount + ' / ' + tileLimit + ' tiles kept in this tab';
  if (wasSelected) {
    selectedTile = null;
    const remaining = skyMaps[skyMaps.length - 1];
    if (remaining) selectTile(remaining.lastSelectedTile || remaining.tiles.values().next().value, true);
  }
  if (!skyMaps.length) {
    timeline.select(null);
    selectedTile = null;
    currentFitsUrl = null;
    currentName = 'spherex-cutout';
    canvas.width = canvas.height = 1;
    canvas.classList.remove('visible');
    canvas.setAttribute('aria-label', 'Selected image for PNG export');
    emptyState.hidden = false;
    pngButton.disabled = fitsButton.disabled = true;
    const repairStatus = document.getElementById('repair-status');
    if (repairStatus) repairStatus.textContent = 'Small enclosed gaps are interpolated for display. Estimates do not recover saturated measurements.';
    ['meta-observation', 'meta-band', 'meta-size'].forEach(function (id) { document.getElementById(id).textContent = '—'; });
    document.getElementById('selected-position').textContent = 'All sky maps closed. Choose coordinates to start a new map.';
    openIrsa.href = 'https://irsa.ipac.caltech.edu/applications/spherex/';
    statusText.title = '';
  }
  updateMapControls();
  setStatus(skyMaps.length ? 'ready' : 'idle', 'Sky map ' + map.id + ' closed — ' + (skyMaps.length ? 'other maps retained' : 'ready for a new map'));
  // Keep keyboard focus useful after its close button leaves the document.
  const remaining = skyMaps[skyMaps.length - 1];
  (remaining ? remaining.closeButton : submitButton).focus({ preventScroll: true });
}
function selectTile(tile, cached) {
  if (selectedTile) {
    selectedTile.card.classList.remove('selected');
    selectedTile.selectButton.setAttribute('aria-pressed', 'false');
  }
  selectedTile = tile;
  timeline.select(tile);
  tile.map.lastSelectedTile = tile;
  tile.card.classList.add('selected');
  tile.selectButton.setAttribute('aria-pressed', 'true');
  const query = tile.query;
  const preview = tile.preview;
  canvas.width = tile.thumbnail.width;
  canvas.height = tile.thumbnail.height;
  canvas.getContext('2d').drawImage(tile.thumbnail, 0, 0);
  canvas.classList.add('visible');
  canvas.setAttribute('aria-label', 'SPHEREx observation at ' + coordinates(query));
  emptyState.hidden = true;
  currentFitsUrl = preview.fitsUrl;
  currentName = 'spherex-' + query.ra.toFixed(4) + '-' + query.dec.toFixed(4) + '-' + query.wavelength.toFixed(2) + 'um';
  openIrsa.href = 'https://irsa.ipac.caltech.edu/applications/spherex/?api=spectral-images&ra=' + query.ra + '&dec=' + query.dec + '&sr=' + query.size + 'd';
  document.getElementById('meta-observation').textContent = preview.observation;
  document.getElementById('meta-band').textContent = preview.bandpass;
  document.getElementById('meta-size').textContent = tile.thumbnail.width + ' × ' + tile.thumbnail.height + ' px';
  const repairStatus = document.getElementById('repair-status');
  if (repairStatus) repairStatus.textContent = tile.thumbnail.repairedPixelCount ?
    tile.thumbnail.repairedPixelCount + ' missing pixels interpolated for display. FITS data unchanged.' :
    'No pixels filled. FITS data unchanged.';
  document.getElementById('selected-position').textContent = coordinates(query);
  const preparedDate = preview.preparedAt ? new Date(preview.preparedAt).toLocaleDateString() : '';
  setStatus('ready', preview.prepared ? 'Prepared SPHEREx preview · ' + preparedDate : cached ? 'Saved sky tile selected — no new search' : 'Real SPHEREx preview added to sky map');
  statusText.title = preview.prepared ? 'Prepared from a real DR1 observation on ' + preview.preparedAt + '. FITS retrieves the same observation.' : '';
  pngButton.disabled = false;
  fitsButton.disabled = Boolean(activeController) || !currentFitsUrl;
  updateMapControls();
  // Pan the map viewport only, without jumping the page away from the viewer.
  centreMapTile(tile);
}
function createSkyMap(query, grid, range, observation) {
  const map = { id: nextMapId++, origin: { ...query }, tiles: new Map(), imageGrid: grid, range: range, observation: observation };
  const section = document.createElement('section');
  section.className = 'sky-map';
  const heading = document.createElement('h3');
  heading.textContent = 'Map ' + map.id + ' · ' + query.wavelength + ' µm · connected image grid';
  const toolbar = document.createElement('div');
  toolbar.className = 'map-toolbar';
  const centre = document.createElement('button');
  centre.type = 'button';
  centre.className = 'action';
  centre.textContent = 'Centre selected';
  centre.setAttribute('aria-label', 'Centre selected image in map ' + map.id);
  centre.addEventListener('click', function () { if (map.lastSelectedTile) centreMapTile(map.lastSelectedTile); });
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'action close-map';
  close.textContent = '× Close';
  close.setAttribute('aria-label', 'Close sky map ' + map.id);
  close.title = 'Close this map and its tiles. Other maps stay open.';
  close.addEventListener('click', function () { closeSkyMap(map); });
  map.closeButton = close;
  const actions = document.createElement('div');
  actions.className = 'map-toolbar-actions';
  actions.append(centre, close);
  toolbar.append(heading, actions);
  section.append(toolbar);
  const scroller = document.createElement('div');
  scroller.className = 'map-scroll';
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', heading.textContent + ', drag or scroll in any direction; arrow keys to pan');
  const imageBoard = document.createElement('div');
  imageBoard.className = 'map-grid';
  scroller.append(imageBoard);
  section.append(scroller);
  map.grid = imageBoard;
  map.scroller = scroller;
  map.section = section;
  mapList.prepend(section);
  map.panning = installMapPanning(scroller, imageBoard);
  skyMaps.push(map);
  return map;
}
function appendTile(map, tile) {
  tile.map = map;
  const card = document.createElement('article');
  card.className = 'map-tile';
  tile.card = card;
  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'tile-select';
  selectButton.setAttribute('aria-label', 'Select tile at ' + coordinates(tile.query));
  selectButton.setAttribute('aria-pressed', 'false');
  selectButton.title = coordinates(tile.query) + ' · ' + tile.preview.observation;
  selectButton.append(tile.thumbnail);
  selectButton.addEventListener('click', function () { if (!activeController) selectTile(tile, true); });
  tile.selectButton = selectButton;
  card.append(selectButton);
  directions.forEach(function (direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sky-arrow arrow-' + direction.id;
    button.textContent = direction.symbol;
    button.setAttribute('aria-label', 'Explore ' + direction.label + ' from ' + coordinates(tile.query));
    button.title = 'Continue image ' + direction.label;
    button.addEventListener('click', function () { navigateTile(tile, direction); });
    card.append(button);
  });
  map.tiles.set(tile.x + ':' + tile.y, tile);
  map.grid.append(card);
  const tiles = Array.from(map.tiles.values());
  const minX = Math.min(...tiles.map(function (item) { return item.x; }));
  const maxX = Math.max(...tiles.map(function (item) { return item.x; }));
  const minY = Math.min(...tiles.map(function (item) { return item.y; }));
  const maxY = Math.max(...tiles.map(function (item) { return item.y; }));
  map.grid.style.gridTemplateColumns = 'repeat(' + (maxX - minX + 1) + ', 240px)';
  map.grid.style.gridTemplateRows = 'repeat(' + (maxY - minY + 1) + ', 240px)';
  tiles.forEach(function (item) {
    item.card.style.gridColumn = String(item.x - minX + 1);
    item.card.style.gridRow = String(item.y - minY + 1);
  });
  tileCount += 1;
  mapCount.textContent = tileCount + ' / ' + tileLimit + ' tiles kept in this tab';
}
async function loadTile(query, map, x, y) {
  if (activeController) return;
  if (tileCount >= tileLimit) {
    setStatus('error', 'This tab has reached its 64-tile memory limit. All loaded tiles are retained and can still be explored. Open another tab for a new map.');
    return;
  }
  const controller = startAction('Loading preview…');
  setStatus('loading', 'Loading sky tile — existing images stay on the map');
  statusText.title = '';
  try {
    const result = await getPreview(query, controller.signal, map ? map.observation : '');
    controller.signal.throwIfAborted();
    const preview = result.preview;
    const grid = map ? map.imageGrid : createImageGrid(query, preview);
    const projected = reprojectImage(preview, grid, x, y);
    const thumbnail = document.createElement('canvas');
    thumbnail.setAttribute('aria-label', 'Sky tile at ' + coordinates(query));
    // Render before committing: no blank tiles or lost selection on failed data.
    const range = drawFits(projected, thumbnail, map ? map.range : initialMapRange(preview));
    const tile = { query: query, preview: preview, thumbnail: thumbnail, x: x, y: y };
    appendTile(map || createSkyMap(query, grid, range, preview.observation), tile);
    selectTile(tile, result.cached);
  } catch (error) {
    setStatus(controller.signal.aborted ? 'idle' : 'error', controller.signal.aborted ? 'Search stopped — all loaded tiles retained' : error.message + ' Existing tiles are unchanged.');
  } finally { finishAction(controller); }
}
function navigateTile(tile, direction) {
  if (activeController) return;
  const x = tile.x + direction.dx;
  const y = tile.y + direction.dy;
  const saved = tile.map.tiles.get(x + ':' + y);
  if (saved) { selectTile(saved, true); return; }
  loadTile(queryForImage(tile.map.imageGrid, tile.map.origin, x, y), tile.map, x, y);
}

form.addEventListener('submit', function (event) {
  event.preventDefault();
  if (activeController) return;
  const query = queryFromForm();
  if (![query.ra, query.dec, query.wavelength, query.size].every(Number.isFinite) ||
      query.ra < 0 || query.ra > 360 || query.dec < -90 || query.dec > 90 ||
      query.wavelength < .75 || query.wavelength > 5 || query.size < .01 || query.size > .35) {
    setStatus('error', 'Check the coordinate, wavelength and field width ranges.');
    return;
  }
  for (const map of skyMaps) {
    for (const tile of map.tiles.values()) {
      if (key(tile.query) === key(query)) { selectTile(tile, true); return; }
    }
  }
  loadTile(query, null, 0, 0);
});
document.getElementById('original-pixels')?.addEventListener('change', function () {
  timeline.clearFrames?.();
  for (const map of skyMaps) {
    for (const tile of map.tiles.values()) {
      drawFits(reprojectImage(tile.preview, map.imageGrid, tile.x, tile.y), tile.thumbnail, map.range);
    }
  }
  if (selectedTile) selectTile(selectedTile, true);
});
cancelButton.addEventListener('click', function () {
  timeline.clearFrames?.();
  if (!activeController) return;
  cancelButton.disabled = true;
  cancelButton.textContent = 'Stopping…';
  activeController.abort();
});
pngButton.addEventListener('click', function () {
  const link = document.createElement('a');
  link.download = currentName + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});
fitsButton.addEventListener('click', async function () {
  if (!currentFitsUrl || activeController) return;
  const controller = startAction('Downloading FITS…');
  setStatus('loading', 'Downloading full scientific FITS file');
  try {
    const response = await fetch(currentFitsUrl, { signal: controller.signal });
    if (!response.ok) {
      let message = 'The FITS download failed.';
      try { message = (await response.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    const blob = await response.blob();
    controller.signal.throwIfAborted();
    const link = document.createElement('a');
    link.download = currentName + '.fits';
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    setStatus('ready', 'Full FITS downloaded');
  } catch (error) {
    setStatus(controller.signal.aborted ? 'ready' : 'error', controller.signal.aborted ? 'FITS download stopped — preview retained' : error.message);
  } finally { finishAction(controller); }
});
`;
