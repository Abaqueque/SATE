import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { GET } from "../api/cutout.js";
import app from "../src/app.js";
import { queryKey } from "../src/presets.js";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const browser = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
assert.match(html, /<title>SPHEREx Coordinate Lab<\/title>/);
assert.match(html, /src="\/app.js(?:\?[^" ]*)?"/);
new Script(browser);
assert.equal((await app.fetch(new Request("http://localhost/"))).status, 200);
assert.equal((await app.fetch(new Request("http://localhost/app.js"))).status, 200);
const invalid = await GET(new Request("http://localhost/api/cutout?ra=400&dec=0&wavelength=1"));
assert.equal(invalid.status, 400);
assert.match((await invalid.json()).error, /Right ascension/);
const manifest = JSON.parse(await readFile(new URL("../dist/presets/index.json", import.meta.url), "utf8"));
assert.equal(manifest.entries.length, 9, "Every preset and the initial field need prepared previews");
assert.equal(new Set(manifest.entries.map((entry) => entry.key)).size, 9);
for (const entry of manifest.entries) {
  assert.match(entry.url, /^\/presets\/[a-z0-9-]+\.json$/);
  const preview = JSON.parse(await readFile(new URL("../dist" + entry.url, import.meta.url), "utf8"));
  assert.equal(queryKey(preview.query), entry.key);
  assert.equal(preview.pixels.length, preview.width * preview.height);
  assert.ok(preview.pixels.some((pixel) => pixel !== null && Number.isFinite(pixel)));
  assert.ok(preview.wcs && preview.wcs.cd.length === 4, 'Prepared images need sky-alignment metadata');
  const fitsUrl = new URL(preview.fitsUrl, "http://localhost");
  assert.equal(fitsUrl.pathname, "/api/cutout");
  assert.equal(fitsUrl.searchParams.get("observation"), preview.observation);
  assert.equal(fitsUrl.searchParams.get("geometry"), '1', 'FITS preserves the preview cutout padding');
}
console.log("Vercel static assets, browser script, local routes and API validation passed.");
