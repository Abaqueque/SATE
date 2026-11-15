import { readHdus, readHeader, wavelengthRange, wavelengthAtSky } from './spectral.js';

const IRSA = 'https://irsa.ipac.caltech.edu';
const COLLECTIONS = ['spherex_dr1', 'spherex_qr3', 'spherex_dr1_deep', 'spherex_qr3_deep'];
const MAX_ROWS = 100000;
const observationLists=new Map();
function cachedObservations(key){const entry=observationLists.get(key);if(!entry||Date.now()-entry.time>600000){observationLists.delete(key);return null;}return entry.data;}
function rememberObservations(key,data){observationLists.set(key,{time:Date.now(),data});while(observationLists.size>32)observationLists.delete(observationLists.keys().next().value);}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export function parseRegion(url) {
  const p = url.searchParams;
  for (const name of ['ra', 'dec', 'size', 'wavelength', 'tolerance']) {
    if (!p.has(name) || !p.get(name).trim()) throw new Error('Missing ' + name + '.');
  }
  const values = Object.fromEntries(['ra', 'dec', 'size', 'wavelength', 'tolerance'].map(k => [k, Number(p.get(k))]));
  if (!Object.values(values).every(Number.isFinite)) throw new Error('Use numeric coordinates and image settings.');
  if (values.ra < 0 || values.ra > 360 || values.dec < -90 || values.dec > 90) throw new Error('Coordinates are outside the sky-coordinate range.');
  const mosaic=p.get('mosaic')==='true';
  if (values.size < .01 || values.size > (mosaic?1.05:.35)+1e-10) throw new Error('Image width is outside the supported range.');
  if (values.wavelength < .75 || values.wavelength > 5 || values.tolerance < .01 || values.tolerance > .5) throw new Error('Invalid wavelength or wavelength tolerance.');
  values.mode=p.get('mode')||'single';
  if(!['single','all','mix'].includes(values.mode))throw new Error('Invalid wavelength mode.');
  if(values.mode==='mix'){
    values.wavelengths=[...new Set((p.get('wavelengths')||'').split(',').map(Number))].sort((a,b)=>a-b);
    if(!values.wavelengths.length||values.wavelengths.length>102||values.wavelengths.some(w=>!Number.isFinite(w)||w<.75||w>5))throw new Error('Select wavelengths for the mix.');
  }
  values.ra %= 360;
  if(mosaic)values.mosaic=true;
  return values;
}

function decodeXml(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, code) => {
    if (code[0] === '#') return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[code.toLowerCase()];
  });
}

function attribute(tag, name) {
  return new RegExp('\\b' + name + '\\s*=\\s*["\x27]([^"\x27]*)["\x27]', 'i').exec(tag)?.[1];
}

export function parseObservations(xml) {
  if (!/<VOTABLE\b/i.test(xml)) throw new Error('IRSA returned an invalid observation list.');
  for (const tag of xml.matchAll(/<INFO\b[^>]*>/gi)) {
    if (attribute(tag[0], 'name')?.toUpperCase() !== 'QUERY_STATUS') continue;
    const value = attribute(tag[0], 'value')?.toUpperCase();
    if (value === 'OVERFLOW') throw new Error('The archive truncated this very large search. No incomplete sequence was loaded.');
    if (value === 'ERROR') throw new Error('The archive could not complete the observation search.');
  }
  const table = /<TABLE\b[^>]*>([\s\S]*?)<\/TABLE>/i.exec(xml)?.[1];
  if (!table) throw new Error('IRSA returned no observation table.');
  const columns = [...table.matchAll(/<FIELD\b[^>]*>/gi)].map(m => attribute(m[0], 'name'));
  const data = /<TABLEDATA\b[^>]*>([\s\S]*?)<\/TABLEDATA>/i.exec(table)?.[1];
  if (data == null && !/<TABLEDATA\s*\/>/i.test(table)) throw new Error('Unsupported archive table format.');
  const rows = [...(data || '').matchAll(/<TR\b[^>]*>([\s\S]*?)<\/TR>/gi)].map(m => {
    const cells = [...m[1].matchAll(/<TD\b[^>]*\/\s*>|<TD\b[^>]*>([\s\S]*?)<\/TD>/gi)].map(c => decodeXml(c[1] || '').trim());
    if (cells.length !== columns.length) throw new Error('Incomplete archive metadata row.');
    return Object.fromEntries(columns.map((key, index) => [key, cells[index]]));
  });
  if (rows.length >= MAX_ROWS) throw new Error('The archive search reached its row limit. No incomplete sequence was loaded.');
  return rows;
}

export function validatedImagePath(value) {
  // Restrict this proxy to the archive's public DR1/QR3 science-image directories.
  if (!/^\/ibe\/data\/spherex\/(dr1|qr3)\/level2\/[A-Za-z0-9_./-]+\.fits$/.test(value) || value.split('/').some(s => s === '.' || s === '..')) throw new Error('Invalid SPHEREx image identifier.');
  return value;
}

// IRSA answers a small cone in about a second, but a cone of 0.1 degrees or more
// can take longer than a minute. The joined field is therefore covered by a grid
// of small cones, searched in parallel and merged by archive path.
const MAX_CONE = .071, MAX_SIDE = 5;
export function searchCircles(region) {
  if (!region.mosaic) return [{ ra: region.ra, dec: region.dec, radius: .000001 }];
  const side = Math.max(1, Math.min(MAX_SIDE, Math.ceil(region.size / .1 - 1e-9)));
  const cell = region.size / side, radius = Math.min(MAX_CONE, cell / Math.SQRT2);
  const stretch = Math.max(.02, Math.cos(region.dec * Math.PI / 180)), circles = [];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const dec = Math.max(-90, Math.min(90, region.dec + (y + .5 - side / 2) * cell));
    circles.push({ ra: (((region.ra + (x + .5 - side / 2) * cell / stretch) % 360) + 360) % 360, dec, radius: Number(radius.toFixed(6)) });
  }
  return circles;
}

async function searchCircle(region, circle, signal) {
  const query = new URL('/SIA', IRSA);
  COLLECTIONS.forEach(c => query.searchParams.append('COLLECTION', c));
  query.searchParams.set('POS', 'CIRCLE ' + circle.ra + ' ' + circle.dec + ' ' + circle.radius);
  if(region.mode!=='all'){const waves=region.wavelengths||[region.wavelength];query.searchParams.set('BAND',Math.max(.75,Math.min(...waves)-region.tolerance)*1e-6+' '+Math.min(5,Math.max(...waves)+region.tolerance)*1e-6);}
  query.searchParams.set('MAXREC', String(MAX_ROWS));
  query.searchParams.set('RESPONSEFORMAT', 'VOTABLE');
  for (let attempt = 0; ; attempt++) {
    const result = await fetch(query, { headers: { 'user-agent': 'SATE-Sky-Sequence/1.0' }, signal });
    if (result.ok) return parseObservations(await result.text());
    // The archive sheds load with 429/503 and a short Retry-After; honour it briefly.
    if (![429, 500, 502, 503, 504].includes(result.status) || attempt >= 2) throw new Error('IRSA is busy or unavailable (status ' + result.status + '). This is the archive, not the viewer; retry shortly.');
    await result.arrayBuffer().catch(() => {});
    await new Promise((resolve, reject) => { const id = setTimeout(resolve, Math.min(8, Math.max(1, Number(result.headers.get('retry-after')) || 3)) * 1000); signal.addEventListener('abort', () => { clearTimeout(id); reject(signal.reason); }, { once: true }); });
  }
}

export async function handleObservations(request) {
  let region;
  try { region = parseRegion(new URL(request.url)); } catch (e) { return json({ error: e.message }, 400); }
  try {
    const cacheKey=JSON.stringify(region),cached=cachedObservations(cacheKey);if(cached)return json(cached);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50000)]);
    // Three cones at a time: measured as fast as nine at once, and gentler on the archive.
    const circles = searchCircles(region), rows = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(3, circles.length) }, async () => {
      while (next < circles.length) rows.push(...await searchCircle(region, circles[next++], signal));
    }));
    const observations = [], seen = new Set();
    for (const row of rows) {
      const url = new URL(row.access_url);
      if (url.origin !== IRSA) throw new Error('An observation has an unexpected archive location.');
      const path = validatedImagePath(url.pathname), mjd = Number(row.t_min);
      if (!row.t_min || !Number.isFinite(mjd)) throw new Error('An observation has no usable timestamp.');
      if (seen.has(path)) continue;
      seen.add(path);
      observations.push({ id: row.obs_id, path, mjd, date: new Date((mjd - 40587) * 86400000).toISOString(), band: row.energy_bandpassname, collection: row.obs_collection });
    }
    observations.sort((a, b) => a.mjd - b.mjd || a.path.localeCompare(b.path));
    const result={ region, observations, complete: true, collections: COLLECTIONS };rememberObservations(cacheKey,result);return json(result);
  } catch (e) {
    if (request.signal.aborted) return json({ error: 'Search cancelled.' }, 499);
    return json({ error: e.name === 'TimeoutError' ? 'The archive search timed out. Please retry.' : e.message }, 502);
  }
}

const HEADERS = { 'user-agent': 'SATE-Sky-Sequence/1.0' };
const WAVE_TABLE_BYTES = 5760, MAX_CUTOUT_BYTES = 32 * 1024 * 1024;
const ascii = new TextDecoder('ascii');

// Minimal header scan for streaming: where does the HDU at `offset` end?
// Returns null until the whole header has arrived.
function hduExtent(bytes, offset) {
  const header = {};
  for (let cursor = offset; cursor + 80 <= bytes.length; cursor += 80) {
    const card = ascii.decode(bytes.subarray(cursor, cursor + 80)), key = card.slice(0, 8).trim();
    if (key === 'END') {
      const dataOffset = Math.ceil((cursor + 80) / 2880) * 2880;
      let count = header.NAXIS ? 1 : 0;
      for (let i = 1; i <= (header.NAXIS || 0); i++) count *= header['NAXIS' + i];
      const length = Math.abs(header.BITPIX) / 8 * (header.GCOUNT || 1) * (count + (header.PCOUNT || 0));
      if (!Number.isSafeInteger(length)) throw new Error('Unreadable FITS header from the archive.');
      return { name: String(header.EXTNAME || '').replace(/'/g, '').trim(), end: dataOffset + Math.ceil(length / 2880) * 2880 };
    }
    if (card[8] === '=') { const raw = card.slice(10).split('/')[0].trim(); header[key] = raw.startsWith("'") ? raw : Number(raw); }
  }
  return null;
}

// Read this exposure's own wavelength table. Cache by exact archive path so
// calibrations from different processing versions are never substituted.
// The byte-range tail allows the cutout stream to stop before the large EPSF HDU.
const waveTables = new Map();
function waveTableTail(file, signal) {
  const key=file.pathname;
  if (!waveTables.has(key)) {
    const pending=fetchWaveTable(file,signal).then(table=>{if(!table)waveTables.delete(key);return table;});
    waveTables.set(key,pending);
    while(waveTables.size>64)waveTables.delete(waveTables.keys().next().value);
  }
  return waveTables.get(key);
}

async function fetchWaveTable(file, signal) {
  try {
    const result = await fetch(file, { headers: { ...HEADERS, range: 'bytes=-' + WAVE_TABLE_BYTES }, redirect: 'error', signal });
    if (result.status !== 206) { await result.body?.cancel(); return null; }
    const bytes = new Uint8Array(await result.arrayBuffer());
    const extent = bytes.length === WAVE_TABLE_BYTES && ascii.decode(bytes.subarray(0, 8)) === 'XTENSION' ? hduExtent(bytes, 0) : null;
    return extent?.name === 'WCS-WAVE' && extent.end === WAVE_TABLE_BYTES ? bytes : null;
  } catch { return null; }
}

async function scienceBytes(cutout, file, signal, band = null) {
  const stop = new AbortController(), both = AbortSignal.any([signal, stop.signal]);
  const tail = waveTableTail(file, AbortSignal.timeout(20000));
  let result;
  for (let attempt = 0; ; attempt++) {
    result = await fetch(cutout, { headers: HEADERS, redirect: 'error', signal: both });
    if (result.ok) break;
    const retryAfter = Number(result.headers.get('retry-after'));
    await result.body?.cancel();
    // "Server busy" is usually momentary: a quick retry here succeeds far sooner than
    // reporting a failure and pausing every download in the browser.
    if (![429, 500, 502, 503, 504].includes(result.status) || attempt >= 2) { stop.abort(); return { status: result.status, retryAfter }; }
    await new Promise((resolve, reject) => { const id = setTimeout(resolve, 1200 * (attempt + 1)); both.addEventListener('abort', () => { clearTimeout(id); reject(both.reason); }, { once: true }); });
  }
  // Keep exposures within three search widths: the viewer shows those nearby
  // wavelengths as separate, labelled timeline images. Anything further is skipped.
  const bandLow = band ? band.wavelength - 3 * band.tolerance - .01 : 0, bandHigh = band ? band.wavelength + 3 * band.tolerance + .01 : 0;
  let bytes = new Uint8Array(0), offset = 0, need = 2880, total = 0, pending = [];
  const reader = result.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (value) { pending.push(value); total += value.length; }
    if (total > MAX_CUTOUT_BYTES) { stop.abort(); throw new Error('This cutout exceeds the interactive download limit. Try a smaller image width.'); }
    if (!done && total < need) continue;
    const joined = new Uint8Array(total); joined.set(bytes); let at = bytes.length;
    for (const chunk of pending) { joined.set(chunk, at); at += chunk.length; }
    bytes = joined; pending = [];
    while (offset < total) {
      const extent = hduExtent(bytes, offset);
      if (!extent) { need = Math.max(need, total + 1); break; }
      if (band && extent.name === 'IMAGE') {
        // The archive search matches a detector's whole bandpass, so many exposures
        // have no pixel near the requested wavelength in this field. The image header
        // and the wavelength table settle that before any pixel data is downloaded.
        let range = null;
        try { const table = await tail; range = table && wavelengthRange(readHeader(bytes, offset).header, table); } catch { range = null; }
        band = null;
        if (range && (range.max < bandLow || range.min > bandHigh)) { stop.abort(); return { skipped: range }; }
      }
      if (extent.name === 'EPSF') {
        const table = await tail;
        if (table) {
          stop.abort();
          const output = new Uint8Array(offset + table.length); output.set(bytes.subarray(0, offset)); output.set(table, offset);
          return { bytes: output };
        }
      }
      if (extent.end > total) { need = extent.end; break; }
      offset = extent.end;
    }
    if (done) break;
  }
  // Fallback: the whole cutout arrived (no EPSF table, or no usable byte-range tail).
  const hdus = readHdus(bytes.buffer).filter(h => h.start === 0 || ['IMAGE', 'FLAGS', 'VARIANCE', 'ZODI', 'WCS-WAVE'].includes(h.header.EXTNAME));
  const output = new Uint8Array(hdus.reduce((n, h) => n + h.end - h.start, 0));
  let position = 0;
  for (const hdu of hdus) { output.set(bytes.subarray(hdu.start, hdu.end), position); position += hdu.end - hdu.start; }
  return { bytes: output };
}

export async function handleFrame(request) {
  const url = new URL(request.url);
  let region, path;
  try { region = parseRegion(url); path = validatedImagePath(url.searchParams.get('image') || ''); } catch (e) { return json({ error: e.message }, 400); }
  const cutout = new URL(path, IRSA);
  cutout.searchParams.set('center', region.ra + ',' + region.dec);
  // A larger source cutout leaves room to rotate onto the north-up output grid.
  cutout.searchParams.set('size', String(Number((region.size * 1.5).toPrecision(12))));
  cutout.searchParams.set('gzip', 'false');
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)]);
    const fetched = await scienceBytes(cutout, new URL(path, IRSA), signal, url.searchParams.get('match') === 'true' ? region : null);
    if (fetched.skipped) return new Response(null, { status: 204, headers: { 'cache-control': 'public, max-age=86400', 'x-sate-wavelength-range': fetched.skipped.min.toFixed(4) + '-' + fetched.skipped.max.toFixed(4) } });
    if (fetched.status) return json({ error: 'IRSA is busy or could not retrieve this exposure (status ' + fetched.status + ').', retryAfter: [429, 503].includes(fetched.status) ? Math.min(60, Math.max(5, fetched.retryAfter || 5)) : 0 }, 502);
    const output = fetched.bytes;
    return new Response(output, { headers: { 'content-type': 'application/fits', 'cache-control': 'public, max-age=86400', 'x-fits-extensions': 'PRIMARY,IMAGE,FLAGS,VARIANCE,ZODI,WCS-WAVE' } });
  } catch (e) {
    if (request.signal.aborted) return json({ error: 'Image retrieval cancelled.' }, 499);
    return json({ error: e.name === 'TimeoutError' ? 'This exposure timed out. It can be retried.' : e.message }, 502);
  }
}

const exposureInfoCache=new Map();
async function imageHeader(file,signal){
  for(let attempt=0;attempt<3;attempt++){
    const result=await fetch(file,{headers:{...HEADERS,range:'bytes=0-65535'},redirect:'error',signal});
    if(!result.ok){await result.body?.cancel();if([429,500,502,503,504].includes(result.status)&&attempt<2){await new Promise(r=>setTimeout(r,800*(attempt+1)));continue;}throw new Error('Archive metadata unavailable ('+result.status+').');}
    const reader=result.body.getReader();let bytes=new Uint8Array(0);
    try{while(bytes.length<262144){const chunk=await reader.read();if(chunk.done)break;const joined=new Uint8Array(bytes.length+chunk.value.length);joined.set(bytes);joined.set(chunk.value,bytes.length);bytes=joined;let offset=0;
      while(offset<bytes.length){const h=readHeader(bytes,offset);if(!h)break;if(h.header.EXTNAME==='IMAGE')return h.header;const extent=hduExtent(bytes,offset);if(!extent||extent.end<=offset)break;offset=extent.end;}
    }}finally{await reader.cancel().catch(()=>{});}
    throw new Error('Incomplete exposure metadata.');
  }
}
export async function handleFrameInfo(request){
  const url=new URL(request.url);let region,path;
  try{region=parseRegion(url);path=validatedImagePath(url.searchParams.get('image')||'');}catch(e){return json({error:e.message},400);}
  const key=JSON.stringify([path,region.ra,region.dec]);
  if(exposureInfoCache.has(key))return Response.json(exposureInfoCache.get(key),{headers:{'cache-control':'public, max-age=86400'}});
  try{
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(35000)]),file=new URL(path,IRSA);
    const [header,table]=await Promise.all([imageHeader(file,signal),waveTableTail(file,signal)]);
    if(!table)throw new Error('Wavelength calibration unavailable.');
    const calibrated=wavelengthAtSky(header,table,region.ra,region.dec);
    const info={path,wavelength:calibrated?.wavelength??null,covered:!!calibrated};
    exposureInfoCache.set(key,info);while(exposureInfoCache.size>1024)exposureInfoCache.delete(exposureInfoCache.keys().next().value);
    return Response.json(info,{headers:{'cache-control':'public, max-age=86400'}});
  }catch(e){return json({error:request.signal.aborted?'Cancelled.':e.message},request.signal.aborted?499:502);}
}
