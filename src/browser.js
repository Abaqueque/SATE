// Browser rendering and interaction. Full FITS files are downloaded on demand.
export const browserScript = String.raw`
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
const manifestReady = fetch('/presets/index.json').then(function (response) {
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
        const response = await fetch(entry.url);
        if (response.ok) {
          const preview = await response.json();
          preview.prepared = true;
          savePreview(entry.key, preview);
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
async function getPreview(query, signal) {
  const cacheKey = key(query);
  if (previewCache.has(cacheKey)) return { preview: previewCache.get(cacheKey), cached: true };
  await cancellable(manifestReady, signal);
  signal.throwIfAborted();
  if (previewCache.has(cacheKey)) return { preview: previewCache.get(cacheKey), cached: true };
  const preparedUrl = presetFiles.get(cacheKey);
  if (preparedUrl) {
    try {
      const response = await fetch(preparedUrl, { signal: signal });
      if (response.ok) {
        const preview = await response.json();
        preview.prepared = true;
        savePreview(cacheKey, preview);
        return { preview: preview, cached: true };
      }
    } catch (error) { if (signal.aborted) throw error; }
  }
  const parameters = new URLSearchParams({ ra: String(query.ra), dec: String(query.dec), wavelength: String(query.wavelength), size: String(query.size), format: 'preview' });
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

function drawFits(fits) {
  const finite = [];
  const stride = Math.max(1, Math.floor(fits.values.length / 180000));
  for (let index = 0; index < fits.values.length; index += stride) {
    if (Number.isFinite(fits.values[index])) finite.push(fits.values[index]);
  }
  if (!finite.length) throw new Error('The selected cutout contains no valid science pixels.');
  finite.sort(function (a, b) { return a - b; });
  const low = percentile(finite, .01);
  let high = percentile(finite, .995);
  if (!(high > low)) high = low + 1;

  canvas.width = fits.width;
  canvas.height = fits.height;
  const context = canvas.getContext('2d');
  const image = context.createImageData(fits.width, fits.height);
  const stretch = Math.asinh(10);
  for (let y = 0; y < fits.height; y += 1) {
    for (let x = 0; x < fits.width; x += 1) {
      const source = y * fits.width + x;
      const target = ((fits.height - 1 - y) * fits.width + x) * 4;
      const raw = fits.values[source];
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
  emptyState.hidden = true;
  canvas.classList.add('visible');
}


form.addEventListener('submit', async function (event) {
  event.preventDefault();
  if (activeController) return;
  const query = queryFromForm();
  if (![query.ra, query.dec, query.wavelength, query.size].every(Number.isFinite) ||
      query.ra < 0 || query.ra > 360 || query.dec < -90 || query.dec > 90 ||
      query.wavelength < .75 || query.wavelength > 5 || query.size < .01 || query.size > .35) {
    setStatus('error', 'Check the coordinate, wavelength and field width ranges.');
    return;
  }
  const controller = startAction('Loading preview…');
  currentFitsUrl = null;
  pngButton.disabled = true;
  setStatus('loading', 'Loading science preview — full FITS stays on demand');
  openIrsa.href = 'https://irsa.ipac.caltech.edu/applications/spherex/?api=spectral-images&ra=' + query.ra + '&dec=' + query.dec + '&sr=' + query.size + 'd';
  try {
    const result = await getPreview(query, controller.signal);
    controller.signal.throwIfAborted();
    const preview = result.preview;
    drawFits({ width: preview.width, height: preview.height, values: preview.pixels.map(function (pixel) { return pixel == null ? NaN : pixel; }) });
    currentFitsUrl = preview.fitsUrl;
    currentName = 'spherex-' + query.ra.toFixed(4) + '-' + query.dec.toFixed(4) + '-' + query.wavelength.toFixed(2) + 'um';
    document.getElementById('meta-observation').textContent = preview.observation;
    document.getElementById('meta-band').textContent = preview.bandpass;
    document.getElementById('meta-size').textContent = preview.width + ' × ' + preview.height + ' px';
    const preparedDate = preview.preparedAt ? new Date(preview.preparedAt).toLocaleDateString() : '';
    setStatus('ready', preview.prepared ? 'Prepared SPHEREx preview · ' + preparedDate : result.cached ? 'Cached SPHEREx preview loaded' : 'Real SPHEREx preview rendered');
    statusText.title = preview.prepared ? 'Prepared from a real DR1 observation on ' + preview.preparedAt + '. FITS retrieves the same observation.' : '';
    pngButton.disabled = false;
  } catch (error) {
    setStatus(controller.signal.aborted ? 'idle' : 'error', controller.signal.aborted ? 'Search stopped — ready for new coordinates' : error.message);
  } finally { finishAction(controller); }
});
cancelButton.addEventListener('click', function () {
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
