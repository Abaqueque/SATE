import { setTimeout as delay } from "node:timers/promises";
import { readSciencePreview } from "./fits.js";
import { queryKey } from "./presets.js";

// Successful previews are shared by Vercel's CDN. These bounded warm-instance
// caches additionally avoid repeating discovery and preview work in one function.
const observationsCache = new Map();
const previewsCache = new Map();
const ttl = 86400000;
const cacheHeaders = {
  "cache-control": "public, max-age=300",
  "vercel-cdn-cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
};
function remember(cache, key, data) {
  if (JSON.stringify(data).length > 500000) return;
  cache.delete(key);
  cache.set(key, { data, expires: Date.now() + ttl });
  while (cache.size > 32) cache.delete(cache.keys().next().value);
}
function recalled(cache, key) {
  const entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) { cache.delete(key); return null; }
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
class ArchiveError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
export async function archiveFetch(url, signal) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    signal.throwIfAborted();
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "SPHEREx-Coordinate-Lab/2.0" }, signal,
      });
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
      await response.body?.cancel();
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error;
    }
    await delay(300 * (attempt + 1), undefined, { signal });
  }
}
function parseCsv(text) {
  const records = [];
  let record = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      record.push(field);
      field = "";
    } else if (character === '\n') {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else field += character;
  }

  if (field || record.length) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  if (records.length < 2) return [];
  const headers = records[0].map((value) => value.trim());
  return records
    .slice(1)
    .filter((row) => row.some(Boolean))
    .map((row) => {
      const result = {};
      headers.forEach((header, index) => {
        result[header] = row[index] || "";
      });
      return result;
    });
}


function isObservation(row) {
  try {
    const url = new URL(row.access_url);
    return url.protocol === "https:" && url.hostname === "irsa.ipac.caltech.edu" &&
      url.pathname.startsWith("/ibe/data/spherex/") &&
      (!row.access_format || row.access_format.toLowerCase().includes("fits"));
  } catch { return false; }
}
function distanceFrom(row, ra, dec) {
  const imageRa = Number(row.s_ra);
  const imageDec = Number(row.s_dec);
  if (!Number.isFinite(imageRa) || !Number.isFinite(imageDec)) return Infinity;
  const radians = Math.PI / 180;
  return 1 - (Math.sin(dec * radians) * Math.sin(imageDec * radians) +
    Math.cos(dec * radians) * Math.cos(imageDec * radians) * Math.cos((ra - imageRa) * radians));
}
function parseQuery(url) {
  const names = ["ra", "dec", "wavelength", "size"];
  const query = Object.fromEntries(names.map((name) => [name, Number(url.searchParams.get(name) ?? (name === "size" ? ".1" : NaN))]));
  const { ra, dec, wavelength, size } = query;
  if (!Number.isFinite(ra) || ra < 0 || ra > 360) throw new ArchiveError("Right ascension must be between 0° and 360°.", 400);
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) throw new ArchiveError("Declination must be between −90° and 90°.", 400);
  if (!Number.isFinite(wavelength) || wavelength < .75 || wavelength > 5) throw new ArchiveError("Wavelength must be between 0.75 and 5 µm.", 400);
  if (!Number.isFinite(size) || size < .01 || size > .35) throw new ArchiveError("Field width must be between 0.01° and 0.35°.", 400);
  return query;
}

export async function handleCutout(request) {
  const url = new URL(request.url);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50000)]);
  try {
    const query = parseQuery(url);
    const { ra, dec, wavelength, size } = query;
    const format = url.searchParams.get("format") || "fits";
    if (!["preview", "fits"].includes(format)) throw new ArchiveError("Unknown image format.", 400);
    const wanted = url.searchParams.get("observation") || "";
    const key = queryKey(query);
    const previewKey = key + ":" + wanted;
    if (format === "preview") {
      const cached = recalled(previewsCache, previewKey);
      if (cached) return json(cached, 200, { ...cacheHeaders, "x-app-cache": "HIT" });
    }

    let observations = recalled(observationsCache, key);
    if (!observations) {
      const sia = new URL("https://irsa.ipac.caltech.edu/SIA");
      sia.searchParams.set("COLLECTION", "spherex_dr1");
      // Require the target itself to be covered, rather than just an edge of its field.
      sia.searchParams.set("POS", `CIRCLE ${ra} ${dec} 0.000001`);
      sia.searchParams.set("BAND", `${Math.max(.75, wavelength - .025) * 1e-6} ${Math.min(5, wavelength + .025) * 1e-6}`);
      sia.searchParams.set("RESPONSEFORMAT", "CSV");
      sia.searchParams.set("MAXREC", "80");
      const searchResponse = await archiveFetch(sia, signal);
      if (!searchResponse.ok) throw new ArchiveError("The archive search is temporarily unavailable. Please try again.");
      observations = parseCsv(await searchResponse.text()).filter(isObservation)
        .sort((a, b) => distanceFrom(a, ra, dec) - distanceFrom(b, ra, dec));
      if (observations.length) remember(observationsCache, key, observations);
    }
    let observation = wanted ? observations.find((row) => row.obs_id === wanted) : observations[0];
    if (!observation) throw new ArchiveError(wanted ?
      "This preview's original observation is unavailable. Try a new search." :
      "No SPHEREx DR1 spectral image covers that coordinate at the selected wavelength.", 404);

    let fitsResponse;
    // A search footprint can overlap the field without yielding a valid cutout.
    // Try another matching exposure only when no observation was pinned by a preview.
    const candidates = wanted ? [observation] : observations.slice(0, 3);
    for (const candidate of candidates) {
      const cutout = new URL(candidate.access_url);
      cutout.searchParams.set("center", `${ra},${dec}`);
      cutout.searchParams.set("size", String(size));
      cutout.searchParams.set("gzip", "false");
      fitsResponse = await archiveFetch(cutout, signal);
      if (fitsResponse.ok) { observation = candidate; break; }
      await fitsResponse.body?.cancel();
    }
    if (!fitsResponse.ok) throw new ArchiveError(`The archive could not create this cutout (status ${fitsResponse.status}). Please try again.`);

    if (format === "preview") {
      const science = await readSciencePreview(fitsResponse, signal);
      const parameters = new URLSearchParams({
        ra: String(ra), dec: String(dec), wavelength: String(wavelength), size: String(size),
        observation: observation.obs_id, format: "fits",
      });
      const preview = {
        ...science, observation: observation.obs_id,
        bandpass: observation.energy_bandpassname || `${wavelength.toFixed(2)} µm`,
        fitsUrl: "/api/cutout?" + parameters, release: "SPHEREx DR1",
        preparedAt: new Date().toISOString(), query,
      };
      remember(previewsCache, previewKey, preview);
      return json(preview, 200, { ...cacheHeaders, "x-app-cache": "MISS" });
    }
    // Stream the full scientific file only on an explicit FITS download.
    return new Response(fitsResponse.body, {
      headers: {
        ...cacheHeaders, "content-type": "application/fits",
        "content-disposition": `attachment; filename="spherex-${ra}-${dec}.fits"`,
        "x-observation-id": encodeURIComponent(observation.obs_id),
        "x-bandpass": encodeURIComponent(observation.energy_bandpassname || ""),
      },
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    if (signal.aborted) return json({ error: "The archive took too long. Please try again or choose a prepared preset." }, 504);
    return json({ error: error instanceof ArchiveError ? error.message : "The archive could not return this image. Please try again." }, error.status || 502);
  }
}
