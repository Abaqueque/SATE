import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { GET } from "../api/cutout.js";
import app from "../src/app.js";

const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const browser = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
assert.match(html, /<title>SPHEREx Coordinate Lab<\/title>/);
assert.match(html, /src="\/app.js"/);
new Script(browser);
assert.equal((await app.fetch(new Request("http://localhost/"))).status, 200);
assert.equal((await app.fetch(new Request("http://localhost/app.js"))).status, 200);
const invalid = await GET(new Request("http://localhost/api/cutout?ra=400&dec=0&wavelength=1"));
assert.equal(invalid.status, 400);
assert.match((await invalid.json()).error, /Right ascension/);
console.log("Vercel static assets, browser script, local routes and API validation passed.");
