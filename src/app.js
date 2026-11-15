// Application entry point.
// Routes requests to the independently owned UI, browser-processing and API modules.
import { handleCutout } from "./api.js";
import { browserScript } from "./browser.js";
import { page } from "./ui.js";

import { handleObservations, handleFrame } from './sequence-api.js';
import { readFile } from 'node:fs/promises';

const pageHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const scriptHeaders = {
  "content-type": "text/javascript; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if(url.pathname==='/api/observations' && request.method==='GET')return handleObservations(request);
    if(url.pathname==='/api/frame' && request.method==='GET')return handleFrame(request);
    if(url.pathname==='/sky' && request.method==='GET')return new Response(await readFile(new URL('../dist/sky/index.html',import.meta.url),'utf8'),{headers:pageHeaders});
    const modules={'/sky.js':'sky.js','/spectral.js':'spectral.js','/sequence-view.js':'sequence-view.js','/sequence-model.js':'sequence-model.js','/frame-cache.js':'frame-cache.js','/stack.js':'stack.js','/mosaic.js':'mosaic.js','/motion.js':'motion.js'};
    if(modules[url.pathname] && request.method==='GET')return new Response(await readFile(new URL('../dist/'+modules[url.pathname],import.meta.url),'utf8'),{headers:scriptHeaders});
    if (url.pathname === "/api/cutout" && request.method === "GET") {
      return handleCutout(request);
    }
    if (url.pathname === "/app.js" && request.method === "GET") {
      return new Response(browserScript, { headers: scriptHeaders });
    }
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(page, { headers: pageHeaders });
    }
    return new Response("Not found", { status: 404 });
  },
};
