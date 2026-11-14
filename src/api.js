// SPHEREx backend module.
// Owns input validation, IRSA discovery, FITS cutout retrieval and response metadata.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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

function safeMetadata(value, fallback = "") {
  return encodeURIComponent(String(value || fallback).replace(/[\r\n]/g, " ").slice(0, 300));
}

export async function handleCutout(request) {
  const url = new URL(request.url);
  const ra = Number(url.searchParams.get("ra"));
  const dec = Number(url.searchParams.get("dec"));
  const wavelength = Number(url.searchParams.get("wavelength"));
  const size = Number(url.searchParams.get("size") || .1);

  if (!Number.isFinite(ra) || ra < 0 || ra > 360) return json({ error: "Right ascension must be between 0° and 360°." }, 400);
  if (!Number.isFinite(dec) || dec < -90 || dec > 90) return json({ error: "Declination must be between −90° and 90°." }, 400);
  if (!Number.isFinite(wavelength) || wavelength < .75 || wavelength > 5) return json({ error: "Wavelength must be between 0.75 and 5 µm." }, 400);
  if (!Number.isFinite(size) || size < .01 || size > .35) return json({ error: "Field width must be between 0.01° and 0.35°." }, 400);

  const sia = new URL("https://irsa.ipac.caltech.edu/SIA");
  sia.searchParams.set("COLLECTION", "spherex_dr1");
  sia.searchParams.set("POS", `CIRCLE ${ra} ${dec} ${Math.max(size / 2, .005)}`);
  sia.searchParams.set("BAND", `${Math.max(.75, wavelength - .025) * 1e-6} ${Math.min(5, wavelength + .025) * 1e-6}`);
  sia.searchParams.set("RESPONSEFORMAT", "CSV");
  sia.searchParams.set("MAXREC", "80");

  let searchResponse;
  try {
    searchResponse = await fetch(sia, {
      headers: { "user-agent": "SPHEREx-Coordinate-Lab/1.0" },
      signal: request.signal,
    });
  } catch {
    if (request.signal.aborted) throw new DOMException("Search stopped", "AbortError");
    return json({ error: "The IRSA archive could not be reached. Please try again." }, 502);
  }
  if (!searchResponse.ok) return json({ error: "IRSA rejected the observation search." }, 502);

  const observations = parseCsv(await searchResponse.text());
  const observation = observations.find((row) => {
    const accessUrl = row.access_url || "";
    const format = (row.access_format || "").toLowerCase();
    return accessUrl.includes("/ibe/data/") && (!format || format.includes("fits"));
  });
  if (!observation) return json({ error: "No SPHEREx DR1 spectral image covers that coordinate at the selected wavelength." }, 404);

  const cutout = new URL(observation.access_url);
  cutout.searchParams.set("center", `${ra},${dec}`);
  cutout.searchParams.set("size", String(size));
  cutout.searchParams.set("gzip", "false");

  let fitsResponse;
  try {
    fitsResponse = await fetch(cutout, {
      headers: { "user-agent": "SPHEREx-Coordinate-Lab/1.0" },
      signal: request.signal,
    });
  } catch {
    if (request.signal.aborted) throw new DOMException("Search stopped", "AbortError");
    return json({ error: "The SPHEREx cutout service could not be reached." }, 502);
  }
  if (!fitsResponse.ok) {
    return json({ error: `IRSA could not create this cutout (archive status ${fitsResponse.status}). Try a smaller field width.` }, 502);
  }

  const body = await fitsResponse.arrayBuffer();
  if (body.byteLength < 2880) return json({ error: "IRSA returned an incomplete FITS file." }, 502);
  return new Response(body, {
    headers: {
      "content-type": "application/fits",
      "content-disposition": `inline; filename="spherex-${ra}-${dec}.fits"`,
      "cache-control": "public, max-age=86400",
      "x-observation-id": safeMetadata(observation.obs_id, "SPHEREx exposure"),
      "x-bandpass": safeMetadata(observation.energy_bandpassname, `${wavelength.toFixed(2)} µm`),
    },
  });
}
