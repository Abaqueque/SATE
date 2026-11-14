// Browser/FITS processing module.
// This is served verbatim at /app.js so frontend data-processing work stays
// independent from the page layout and SPHEREx API implementation.
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

let currentFits = null;
let currentName = 'spherex-cutout';
let activeController = null;

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

function parseValue(raw) {
  const value = raw.trim();
  if (!value) return null;
  if (value[0] === "'") {
    let output = '';
    for (let index = 1; index < value.length; index += 1) {
      if (value[index] === "'" && value[index + 1] === "'") {
        output += "'";
        index += 1;
      } else if (value[index] === "'") break;
      else output += value[index];
    }
    return output.trim();
  }
  const clean = value.split('/')[0].trim();
  if (clean === 'T') return true;
  if (clean === 'F') return false;
  const number = Number(clean.replace(/[dD]/, 'E'));
  return Number.isNaN(number) ? clean : number;
}

function parseFits(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder('ascii');
  let offset = 0;

  while (offset + 2880 <= bytes.length) {
    const header = {};
    let cursor = offset;
    let foundEnd = false;
    while (cursor + 80 <= bytes.length) {
      const card = decoder.decode(bytes.subarray(cursor, cursor + 80));
      cursor += 80;
      const key = card.slice(0, 8).trim();
      if (key === 'END') {
        foundEnd = true;
        break;
      }
      if (key && card[8] === '=') header[key] = parseValue(card.slice(10));
    }
    if (!foundEnd) throw new Error('The archive returned an invalid FITS header.');

    const dataOffset = Math.ceil(cursor / 2880) * 2880;
    const naxis = Number(header.NAXIS || 0);
    const dimensions = [];
    for (let axis = 1; axis <= naxis; axis += 1) dimensions.push(Number(header['NAXIS' + axis] || 0));
    const bitpix = Number(header.BITPIX || 0);
    const bytesPerPixel = Math.abs(bitpix) / 8;
    const pixelsPerGroup = naxis ? dimensions.reduce(function (a, b) { return a * b; }, 1) : 0;
    const dataBytes = bytesPerPixel * Number(header.GCOUNT || 1) * (pixelsPerGroup + Number(header.PCOUNT || 0));

    if (naxis >= 2 && dimensions[0] > 0 && dimensions[1] > 0 && dataOffset + dataBytes <= bytes.length) {
      const width = dimensions[0];
      const height = dimensions[1];
      const values = new Float32Array(width * height);
      const scale = Number(header.BSCALE == null ? 1 : header.BSCALE);
      const zero = Number(header.BZERO == null ? 0 : header.BZERO);
      const blank = header.BLANK;

      for (let index = 0; index < values.length; index += 1) {
        const position = dataOffset + index * bytesPerPixel;
        let raw;
        if (bitpix === 8) raw = view.getUint8(position);
        else if (bitpix === 16) raw = view.getInt16(position, false);
        else if (bitpix === 32) raw = view.getInt32(position, false);
        else if (bitpix === -32) raw = view.getFloat32(position, false);
        else if (bitpix === -64) raw = view.getFloat64(position, false);
        else throw new Error('Unsupported FITS BITPIX value: ' + bitpix);
        values[index] = blank != null && raw === blank ? NaN : raw * scale + zero;
      }
      return { width: width, height: height, values: values, header: header };
    }
    offset = dataOffset + Math.ceil(dataBytes / 2880) * 2880;
  }
  throw new Error('No two-dimensional science image was found in this FITS file.');
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

function safeHeader(response, name, fallback) {
  try {
    return decodeURIComponent(response.headers.get(name) || fallback);
  } catch (_) {
    return response.headers.get(name) || fallback;
  }
}

form.addEventListener('submit', async function (event) {
  event.preventDefault();
  const data = new FormData(form);
  const ra = Number(data.get('ra'));
  const dec = Number(data.get('dec'));
  const wavelength = Number(data.get('wavelength'));
  const size = Number(data.get('size'));
  if (!(ra >= 0 && ra <= 360 && dec >= -90 && dec <= 90 && wavelength >= .75 && wavelength <= 5)) {
    setStatus('error', 'Check the coordinate and wavelength ranges.');
    return;
  }

  const controller = new AbortController();
  activeController = controller;
  submitButton.disabled = true;
  submitButton.textContent = 'Searching the archive…';
  cancelButton.disabled = false;
  cancelButton.textContent = 'Stop';
  setStatus('loading', 'Querying SPHEREx DR1 at IRSA');
  pngButton.disabled = true;
  fitsButton.disabled = true;

  const parameters = new URLSearchParams({ ra: String(ra), dec: String(dec), wavelength: String(wavelength), size: String(size) });
  openIrsa.href = 'https://irsa.ipac.caltech.edu/applications/spherex/?api=spectral-images&ra=' + encodeURIComponent(ra) + '&dec=' + encodeURIComponent(dec) + '&sr=' + encodeURIComponent(size + 'd');

  try {
    const response = await fetch('/api/cutout?' + parameters.toString(), { signal: controller.signal });
    if (!response.ok) {
      let message = 'The SPHEREx request failed.';
      try { message = (await response.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    setStatus('loading', 'Rendering calibrated FITS pixels');
    const buffer = await response.arrayBuffer();
    const parsed = parseFits(buffer);
    drawFits(parsed);
    currentFits = buffer;
    currentName = 'spherex-' + ra.toFixed(4) + '-' + dec.toFixed(4) + '-' + wavelength.toFixed(2) + 'um';
    document.getElementById('meta-observation').textContent = safeHeader(response, 'X-Observation-ID', 'SPHEREx exposure');
    document.getElementById('meta-band').textContent = safeHeader(response, 'X-Bandpass', wavelength.toFixed(2) + ' µm');
    document.getElementById('meta-size').textContent = parsed.width + ' × ' + parsed.height + ' px';
    setStatus('ready', 'Real SPHEREx observation rendered');
    pngButton.disabled = false;
    fitsButton.disabled = false;
  } catch (error) {
    if (error.name === 'AbortError') setStatus('idle', 'Search stopped — ready for new coordinates');
    else setStatus('error', error.message || 'Unable to render this coordinate.');
  } finally {
    if (activeController === controller) {
      activeController = null;
      submitButton.disabled = false;
      submitButton.textContent = 'Retrieve SPHEREx image';
      cancelButton.disabled = true;
      cancelButton.textContent = 'Stop';
    }
  }
});

cancelButton.addEventListener('click', function () {
  if (!activeController) return;
  cancelButton.disabled = true;
  cancelButton.textContent = 'Stopping…';
  setStatus('loading', 'Stopping SPHEREx search');
  activeController.abort();
});

pngButton.addEventListener('click', function () {
  const link = document.createElement('a');
  link.download = currentName + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
});

fitsButton.addEventListener('click', function () {
  if (!currentFits) return;
  const link = document.createElement('a');
  link.download = currentName + '.fits';
  link.href = URL.createObjectURL(new Blob([currentFits], { type: 'application/fits' }));
  link.click();
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
});
`;
