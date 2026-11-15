// Small, explicit subset of FITS/WCS used by SPHEREx DR1/QR3 image cutouts.
// Unsupported projections fail rather than silently showing misaligned frames.
const D2R = Math.PI / 180;
const decoder = new TextDecoder('ascii');

function cardValue(raw) {
  const value = raw.trim();
  if (value.startsWith("'")) {
    let result = '';
    for (let i = 1; i < value.length; i++) {
      if (value[i] === "'" && value[i + 1] === "'") { result += "'"; i++; }
      else if (value[i] === "'") break;
      else result += value[i];
    }
    return result.trim();
  }
  const text = value.split('/')[0].trim();
  if (text === 'T' || text === 'F') return text === 'T';
  const number = Number(text.replace(/[dD]/g, 'E'));
  return text && Number.isFinite(number) ? number : text;
}

export function readHdus(buffer) {
  const bytes = new Uint8Array(buffer);
  if (decoder.decode(bytes.subarray(0, 8)) !== 'SIMPLE  ') throw new Error('The archive response is not a FITS file.');
  const hdus = [];
  let offset = 0;
  while (offset + 2880 <= bytes.length) {
    const header = {};
    let cursor = offset, ended = false;
    while (cursor + 80 <= bytes.length) {
      const card = decoder.decode(bytes.subarray(cursor, cursor + 80)); cursor += 80;
      const key = card.slice(0, 8).trim();
      if (key === 'END') { ended = true; break; }
      if (card[8] === '=') header[key] = cardValue(card.slice(10));
    }
    if (!ended) throw new Error('Incomplete FITS header.');
    const dataOffset = Math.ceil(cursor / 2880) * 2880;
    let count = header.NAXIS ? 1 : 0;
    for (let i = 1; i <= (header.NAXIS || 0); i++) count *= header['NAXIS' + i];
    const length = Math.abs(header.BITPIX) / 8 * (header.GCOUNT || 1) * (count + (header.PCOUNT || 0));
    if (!Number.isSafeInteger(length) || length < 0 || dataOffset + length > bytes.length) throw new Error('Incomplete FITS data.');
    const end = dataOffset + Math.ceil(length / 2880) * 2880;
    hdus.push({ header, dataOffset, length, start: offset, end });
    offset = end;
  }
  return hdus;
}

function imagePlane(view, hdu) {
  if (!hdu || hdu.header.NAXIS !== 2 || hdu.header.XTENSION !== 'IMAGE') throw new Error('Missing two-dimensional image extension.');
  const h = hdu.header, width = h.NAXIS1, height = h.NAXIS2;
  if (width * height > 4e6) throw new Error('This image is too large for the interactive viewer.');
  const values = new Float64Array(width * height), stride = Math.abs(h.BITPIX) / 8;
  for (let i = 0; i < values.length; i++) {
    const p = hdu.dataOffset + i * stride;
    let raw;
    if (h.BITPIX === -32) raw = view.getFloat32(p, false);
    else if (h.BITPIX === -64) raw = view.getFloat64(p, false);
    else if (h.BITPIX === 32) raw = view.getInt32(p, false);
    else if (h.BITPIX === 16) raw = view.getInt16(p, false);
    else if (h.BITPIX === 8) raw = view.getUint8(p);
    else throw new Error('Unsupported FITS image encoding.');
    values[i] = h.BLANK != null && raw === h.BLANK ? NaN : raw * (h.BSCALE ?? 1) + (h.BZERO ?? 0);
  }
  return { width, height, values };
}

function readWaveTable(view, hdu) {
  if (!hdu || hdu.header.XTENSION !== 'BINTABLE' || hdu.header.NAXIS2 !== 1) throw new Error('Missing spectral wavelength table.');
  const h = hdu.header, columns = {};
  let offset = hdu.dataOffset;
  for (let i = 1; i <= h.TFIELDS; i++) {
    const match = /^(\d*)([JED])$/.exec(h['TFORM' + i]);
    if (!match) throw new Error('Unsupported spectral-table column.');
    const count = Number(match[1] || 1), type = match[2], stride = type === 'D' ? 8 : 4;
    const values = new Float64Array(count);
    for (let j = 0; j < count; j++) {
      const p = offset + j * stride;
      values[j] = type === 'J' ? view.getInt32(p, false) : type === 'E' ? view.getFloat32(p, false) : view.getFloat64(p, false);
    }
    columns[h['TTYPE' + i]] = values; offset += count * stride;
  }
  if (!columns.X || !columns.Y || columns.VALUES?.length !== columns.X.length * columns.Y.length * 2) throw new Error('Unsupported spectral-table dimensions.');
  return columns;
}

// Header of the HDU starting at `offset`, or null while it is still incomplete.
export function readHeader(bytes, offset = 0) {
  const header = {};
  for (let cursor = offset; cursor + 80 <= bytes.length; cursor += 80) {
    const card = decoder.decode(bytes.subarray(cursor, cursor + 80)), key = card.slice(0, 8).trim();
    if (key === 'END') return { header, dataOffset: Math.ceil((cursor + 80) / 2880) * 2880 };
    if (card[8] === '=') header[key] = cardValue(card.slice(10));
  }
  return null;
}

// Wavelength range over an image, from its header and a standalone WCS-WAVE HDU,
// sampled on a grid. Null when any sample cannot be evaluated.
export function wavelengthRange(imageHeader, tableBytes, samples = 9) {
  const hdu = readHeader(tableBytes, 0);
  if (!hdu) return null;
  const waveTable = readWaveTable(new DataView(tableBytes.buffer, tableBytes.byteOffset, tableBytes.byteLength), hdu);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < samples; j++) for (let i = 0; i < samples; i++) {
    const wave = wavelengthAt({ header: imageHeader, waveTable }, i * (imageHeader.NAXIS1 - 1) / (samples - 1), j * (imageHeader.NAXIS2 - 1) / (samples - 1));
    if (!Number.isFinite(wave)) return null;
    min = Math.min(min, wave); max = Math.max(max, wave);
  }
  return { min, max };
}

export function parseSpectralImage(buffer) {
  const hdus = readHdus(buffer), view = new DataView(buffer);
  const ext = name => hdus.find(h => h.header.EXTNAME === name);
  const imageHdu = ext('IMAGE');
  if (!imageHdu) throw new Error('No science IMAGE extension.');
  const image = imagePlane(view, imageHdu);
  const flags = ext('FLAGS') ? imagePlane(view, ext('FLAGS')) : null;
  const variance = ext('VARIANCE') ? imagePlane(view, ext('VARIANCE')) : null;
  const zodi = ext('ZODI') ? imagePlane(view, ext('ZODI')) : null;
  for (const plane of [flags, variance, zodi].filter(Boolean)) {
    if (plane.width !== image.width || plane.height !== image.height) throw new Error('FITS image planes do not match.');
  }
  return { ...image, header: imageHdu.header, flags: flags?.values, variance: variance?.values, zodi: zodi?.values, waveTable: ext('WCS-WAVE') ? readWaveTable(view, ext('WCS-WAVE')) : null };
}

function polynomial(h, prefix, u, v) {
  let sum = 0;
  const order = h[prefix + '_ORDER'] || 0;
  for (let i = 0; i <= order; i++) for (let j = 0; j <= order - i; j++) {
    sum += (h[prefix + '_' + i + '_' + j] || 0) * u ** i * v ** j;
  }
  return sum;
}

export function makeWorldToPixel(h) {
  if (!/^RA---TAN(-SIP)?$/.test(h.CTYPE1) || !/^DEC--TAN(-SIP)?$/.test(h.CTYPE2)) throw new Error('Unsupported sky projection; this exposure cannot be aligned safely.');
  const a = h.CD1_1 ?? (h.PC1_1 ?? 1) * (h.CDELT1 ?? 1);
  const b = h.CD1_2 ?? (h.PC1_2 ?? 0) * (h.CDELT1 ?? 1);
  const c = h.CD2_1 ?? (h.PC2_1 ?? 0) * (h.CDELT2 ?? 1);
  const d = h.CD2_2 ?? (h.PC2_2 ?? 1) * (h.CDELT2 ?? 1);
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-15) throw new Error('Invalid image coordinate transform.');
  const ra0 = h.CRVAL1 * D2R, dec0 = h.CRVAL2 * D2R;
  const sin0 = Math.sin(dec0), cos0 = Math.cos(dec0), sip = h.CTYPE1.endsWith('-SIP');
  return (ra, dec) => {
    const angle = ra * D2R - ra0, delta = dec * D2R;
    const denominator = sin0 * Math.sin(delta) + cos0 * Math.cos(delta) * Math.cos(angle);
    if (denominator <= 0) return [NaN, NaN];
    const xi = Math.cos(delta) * Math.sin(angle) / denominator / D2R;
    const eta = (cos0 * Math.sin(delta) - sin0 * Math.cos(delta) * Math.cos(angle)) / denominator / D2R;
    const U = (d * xi - b * eta) / det, V = (-c * xi + a * eta) / det;
    let u = U, v = V;
    if (sip) {
      let converged = false;
      for (let i = 0; i < 30; i++) {
        const nextU = U - polynomial(h, 'A', u, v), nextV = V - polynomial(h, 'B', u, v);
        const error = Math.max(Math.abs(nextU - u), Math.abs(nextV - v));
        u = nextU; v = nextV;
        if (error < 1e-7) { converged = true; break; }
      }
      if (!converged) return [NaN, NaN];
    }
    return [u + h.CRPIX1 - 1, v + h.CRPIX2 - 1];
  };
}

function bracket(array, value) {
  if (value < array[0] || value > array[array.length - 1]) return null;
  let index = 0;
  while (index + 2 < array.length && array[index + 1] < value) index++;
  return [index, (value - array[index]) / (array[index + 1] - array[index])];
}

export function wavelengthAt(image, x, y) {
  const h = image.header, t = image.waveTable;
  if (h.CTYPE1W !== 'WAVE-TAB' || h.CTYPE2W !== 'WAVE-TAB' || h.PV1_3W !== 1 || h.PV2_3W !== 2) throw new Error('Unsupported wavelength coordinate system.');
  const u = x + 1 - h.CRPIX1W, v = y + 1 - h.CRPIX2W;
  const px = h.CRVAL1W + h.CDELT1W * ((h.PC1_1W ?? 1) * u + (h.PC1_2W ?? 0) * v);
  const py = h.CRVAL2W + h.CDELT2W * ((h.PC2_1W ?? 0) * u + (h.PC2_2W ?? 1) * v);
  const bx = bracket(t.X, px), by = bracket(t.Y, py);
  if (!bx || !by) return NaN;
  const [ix, fx] = bx, [iy, fy] = by, nx = t.X.length;
  const at = (i, j) => t.VALUES[(j * nx + i) * 2];
  return at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) + at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
}

// Calibrate the selected position from an exposure header and its own WCS table.
export function wavelengthAtSky(header, tableBytes, ra, dec) {
  const [x,y]=makeWorldToPixel(header)(ra,dec);
  if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=header.NAXIS1||y>=header.NAXIS2)return null;
  const hdu=readHeader(tableBytes),waveTable=readWaveTable(new DataView(tableBytes.buffer,tableBytes.byteOffset,tableBytes.byteLength),hdu);
  const wavelength=wavelengthAt({header,waveTable},x,y);
  return Number.isFinite(wavelength)?{wavelength,x,y}:null;
}

export function createSkyGrid(ra, dec, size, pixels = Math.max(32, Math.min(210, Math.ceil(size * 3600 / 6.2)))) {
  const coordinates = new Float64Array(pixels * pixels * 2);
  const a = ra * D2R, d = dec * D2R;
  for (let y = 0; y < pixels; y++) for (let x = 0; x < pixels; x++) {
    const xi = -(x + .5 - pixels / 2) * size / pixels * D2R;
    const eta = -(y + .5 - pixels / 2) * size / pixels * D2R;
    const denominator = Math.cos(d) - eta * Math.sin(d);
    const alpha = a + Math.atan2(xi, denominator);
    const delta = Math.atan2(Math.sin(d) + eta * Math.cos(d), Math.hypot(denominator, xi));
    const index = (y * pixels + x) * 2;
    coordinates[index] = (alpha / D2R + 360) % 360; coordinates[index + 1] = delta / D2R;
  }
  return { ra, dec, size, pixels, coordinates };
}

export function alignImage(image, grid, wavelength, tolerance, { showAll = false } = {}) {
  const transform = makeWorldToPixel(image.header), centre = transform(grid.ra, grid.dec);
  let centreWavelength = NaN;
  try { centreWavelength = wavelengthAt(image, ...centre); } catch (error) { if (!showAll) throw error; }
  if (!showAll && !Number.isFinite(centreWavelength)) throw new Error('The selected position has no wavelength calibration in this exposure.');
  if (!showAll && Math.abs(centreWavelength - wavelength) > tolerance) return { excluded: true, wavelength: centreWavelength };
  const values = new Float32Array(grid.pixels ** 2).fill(NaN);
  const variance = new Float64Array(values.length).fill(NaN);
  const wavelengths = new Float64Array(values.length).fill(NaN);
  const quality = new Uint8Array(values.length);
  let good = 0, flagged = 0;
  // Conservative nominal-state mask: permit the source-mask bit, but no other flags.
  // https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html
  const valid = i => Number.isFinite(image.values[i]) && image.variance?.[i] > 0 && Number.isFinite(image.variance?.[i]) && image.flags != null && Number.isFinite(image.flags[i]) && (image.flags[i] & ~2097152) === 0;
  for (let i = 0; i < values.length; i++) {
    const [x, y] = transform(grid.coordinates[i * 2], grid.coordinates[i * 2 + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= image.width - 1 || y >= image.height - 1) continue;
    let localWave = NaN;
    try { localWave = wavelengthAt(image, x, y); } catch (error) { if (!showAll) throw error; }
    wavelengths[i] = localWave;
    if (!showAll) {
      if (!Number.isFinite(localWave) || Math.abs(localWave - wavelength) > tolerance) continue;
    }
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ids = [iy * image.width + ix, iy * image.width + ix + 1, (iy + 1) * image.width + ix, (iy + 1) * image.width + ix + 1];
    if (!showAll && !ids.every(valid)) continue;
    const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    let value = 0, weight = 0;
    for (let j = 0; j < 4; j++) {
      const raw = image.values[ids[j]], zodi = image.zodi?.[ids[j]];
      if (!Number.isFinite(raw)) continue;
      value += weights[j] * (raw - (Number.isFinite(zodi) ? zodi : 0)); weight += weights[j];
    }
    if (ids.every(valid) && (!image.zodi || ids.every(id => Number.isFinite(image.zodi[id])))) {
      variance[i] = weights.reduce((sum, w, j) => sum + w * w * image.variance[ids[j]], 0);
      quality[i] = 1;
    }
    if (weight > 0 && Number.isFinite(value)) { values[i] = value / weight; good++; if (!ids.every(valid)) flagged++; }
  }
  if (!showAll && !good) throw new Error('No usable pixels remain after coverage, wavelength and quality checks.');
  return { values, variance, wavelengths, quality, unit: String(image.header.BUNIT || '').trim(), gridKey: JSON.stringify([grid.ra,grid.dec,grid.size,grid.pixels]), width: grid.pixels, height: grid.pixels, wavelength: centreWavelength, coverage: good / values.length, flaggedFraction: good ? flagged / good : 0, aligned: true, date: image.header['DATE-OBS'], mjd: image.header['MJD-OBS'], backgroundRemoved: !!image.zodi };
}

export function sharedStretch(frames, {quality=false,wavelength=NaN,tolerance=0}={}) {
  const sample = [];
  for (const frame of frames) {
    const values = frame.values, stride = Math.max(1, Math.ceil(values.length / 1000));
    for (let i = 0; i < values.length; i += stride) if (Number.isFinite(values[i]) && (!quality || frame.quality?.[i]) && (!Number.isFinite(wavelength) || Number.isFinite(frame.wavelengths?.[i]) && Math.abs(frame.wavelengths[i]-wavelength)<=tolerance)) sample.push(values[i]);
  }
  sample.sort((a, b) => a - b);
  if (!sample.length) return { low: 0, high: 1, samples: 0 };
  const low = sample[Math.floor((sample.length - 1) * .01)], high = sample[Math.floor((sample.length - 1) * .995)];
  return { low, high: high > low ? high : low + 1, samples: sample.length };
}

export function drawAligned(canvas, frame, stretch) {
  canvas.width = frame.width; canvas.height = frame.height;
  const context = canvas.getContext('2d'), rgba = context.createImageData(frame.width, frame.height);
  for (let i = 0; i < frame.values.length; i++) {
    const value = frame.values[i];
    const grey = Math.round(255 * Math.asinh(10 * Math.max(0, Math.min(1, (value - stretch.low) / (stretch.high - stretch.low)))) / Math.asinh(10));
    rgba.data[i * 4] = grey;rgba.data[i * 4+1] = grey;rgba.data[i * 4+2] = grey;
    rgba.data[i * 4 + 3] = Number.isFinite(value) ? 255 : 0;
  }
  context.putImageData(rgba, 0, 0);
}

// Keep a renderable detector image if celestial alignment is unsupported.
// This fallback is explicitly labelled; it is never presented as aligned.
export function rawDetectorFrame(image, reason) {
  const values = Float32Array.from(image.values, (v,i) => Number.isFinite(v) ? v - (Number.isFinite(image.zodi?.[i]) ? image.zodi[i] : 0) : NaN);
  let count=0,flagged=0;for(let i=0;i<values.length;i++)if(Number.isFinite(values[i])){count++;if(!image.flags||image.flags[i]!==0)flagged++;}
  let wavelength=NaN;try{wavelength=wavelengthAt(image,(image.width-1)/2,(image.height-1)/2);}catch{}
  return {values,width:image.width,height:image.height,coverage:count/values.length,flaggedFraction:count?flagged/count:0,wavelength,aligned:false,alignmentReason:reason};
}
