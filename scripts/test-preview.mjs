import assert from "node:assert/strict";
import { handleCutout } from "../src/api.js";
import { readSciencePreview } from "../src/fits.js";

function header(fields) {
  const cards = Object.entries(fields).map(([key, value]) => (key.padEnd(8) + "= " + value).padEnd(80));
  cards.push("END".padEnd(80));
  return new TextEncoder().encode(cards.join("").padEnd(Math.ceil(cards.length * 80 / 2880) * 2880));
}
const primary = header({ SIMPLE: "T", BITPIX: "8", NAXIS: "0" });
const imageHeader = header({ XTENSION: "'IMAGE'", BITPIX: "-32", NAXIS: "2", NAXIS1: "2", NAXIS2: "2", EXTNAME: "'IMAGE'", BSCALE: "2", BZERO: "1" });
const pixels = new Uint8Array(2880);
const view = new DataView(pixels.buffer);
[1, 2, NaN, 4].forEach((value, index) => view.setFloat32(index * 4, value, false));
const auxiliary = new Uint8Array(4 * 1024 * 1024);
let delivered = 0;
let cancelled = false;
function fitsStream() {
  const chunks = [primary, imageHeader, pixels, auxiliary];
  return new ReadableStream({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) { delivered += chunk.length; controller.enqueue(chunk); }
      else controller.close();
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
}
const science = await readSciencePreview(new Response(fitsStream()), new AbortController().signal);
assert.deepEqual(science, { width: 2, height: 2, pixels: [3, 5, null, 9] });
assert.equal(cancelled, true, "Preview must cancel the unused auxiliary download");
assert.equal(delivered, 8640, "Preview must stop after the science HDU");

const nativeFetch = globalThis.fetch;
const csv = "access_url,access_format,obs_id,energy_bandpassname,s_ra,s_dec\nhttps://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/science.fits,image/fits,TEST-OBS,D4,83.8,-5.3";
let searches = 0;
let downloads = 0;
try {
  globalThis.fetch = async (url) => {
    if (String(url).includes("/SIA?")) { searches += 1; return new Response(csv); }
    downloads += 1;
    if (downloads === 1) return new Response("Temporary outage", { status: 503 });
    return new Response(fitsStream());
  };
  const url = "http://localhost/api/cutout?ra=83.8&dec=-5.3&wavelength=3.29&size=.05&format=preview";
  const first = await handleCutout(new Request(url));
  const preview = await first.json();
  assert.equal(first.status, 200);
  assert.equal(downloads, 2, "Temporary 503 must be retried");
  assert.equal(first.headers.get("x-app-cache"), "MISS");
  assert.match(first.headers.get("vercel-cdn-cache-control"), /s-maxage=86400/);
  assert.equal(preview.observation, "TEST-OBS");
  assert.match(preview.fitsUrl, /observation=TEST-OBS/);
  assert.deepEqual(preview.pixels, science.pixels);
  assert.ok(JSON.stringify(preview).length < 1000);

  const second = await handleCutout(new Request(url));
  assert.equal(second.headers.get("x-app-cache"), "HIT");
  assert.equal(downloads, 2, "Repeated preview must avoid downloading FITS");
  assert.equal(searches, 1);
  const full = await handleCutout(new Request("http://localhost" + preview.fitsUrl));
  assert.equal(full.headers.get("content-type"), "application/fits");
  assert.equal((await full.arrayBuffer()).byteLength, 8640 + auxiliary.length, "Explicit FITS download must retain every extension");
  assert.equal(searches, 1, "FITS download reuses discovery but pins the preview's observation");

  const invalid = await handleCutout(new Request("http://localhost/api/cutout?ra=NaN&dec=0&wavelength=1&format=preview"));
  assert.equal(invalid.status, 400);
  assert.equal(invalid.headers.get("cache-control"), "no-store");
  assert.equal(invalid.headers.get("vercel-cdn-cache-control"), null);

  let attempts = 0;
  globalThis.fetch = async () => { attempts += 1; return new Response("Busy", { status: 503 }); };
  const failureUrl = "http://localhost/api/cutout?ra=120&dec=2&wavelength=1&format=preview";
  const failure = await handleCutout(new Request(failureUrl));
  assert.equal(failure.status, 502);
  assert.equal(failure.headers.get("cache-control"), "no-store");
  assert.equal(attempts, 3);
  await handleCutout(new Request(failureUrl));
  assert.equal(attempts, 6, "Archive failures must not poison the cache");

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(handleCutout(new Request(failureUrl, { signal: controller.signal })), { name: "AbortError" });
  assert.equal(attempts, 6, "Cancellation must prevent retries");
} finally { globalThis.fetch = nativeFetch; }
console.log("Preview streaming, calibrated pixels, cache hits, on-demand complete FITS, retries, error caching and cancellation passed.");
