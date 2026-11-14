// Application entry point.
// Routes requests to the independently owned UI, browser-processing and API modules.
import { handleCutout } from "./api.js";
import { browserScript } from "./browser.js";
import { page } from "./ui.js";

const pageHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=300",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const scriptHeaders = {
  "content-type": "text/javascript; charset=utf-8",
  "cache-control": "public, max-age=300",
  "x-content-type-options": "nosniff",
};

export default {
  async fetch(request, env, ctx) {
    void env;
    void ctx;
    const url = new URL(request.url);

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
