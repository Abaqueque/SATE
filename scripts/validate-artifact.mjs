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

const sky=await readFile(new URL('../dist/sky/index.html',import.meta.url),'utf8');
assert.match(sky,/id="image"/);
assert.match(sky,/id="time"/);
for(const path of ['/sky','/sky.js','/sequence-view.js','/sequence-model.js','/spectral.js','/frame-cache.js','/stack.js','/mosaic.js','/motion.js'])assert.equal((await app.fetch(new Request('http://localhost'+path))).status,200);
assert.equal((await app.fetch(new Request('http://localhost/api/observations?ra=bad'))).status,400);
assert.equal((await app.fetch(new Request('http://localhost/api/frame?ra=bad'))).status,400);
console.log('Wavelength-and-time page, module routes and sequence API input validation passed.');

// Regression: a missing DOM node previously stopped all controls at startup.
const sequenceScript=await readFile(new URL('../dist/sky.js',import.meta.url),'utf8');
const htmlIds=new Set([...sky.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const match of sequenceScript.matchAll(/\$\('([-\w]+)'\)/g))assert.ok(htmlIds.has(match[1]),`Missing required sky control: ${match[1]}`);
const version=/src="\/sky\.js\?v=([a-f0-9]+)"/.exec(sky)?.[1];assert.ok(version,'Sky entry point needs a build version');
assert.ok(sequenceScript.includes('./motion.js?v='+version),'HTML and modules must share a build version');
assert.equal((await app.fetch(new Request('http://localhost/sky'))).headers.get('cache-control'),'no-store');
console.log('Required sky controls and consistent module versions passed.');
