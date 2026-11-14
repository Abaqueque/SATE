import http from "node:http";
import app from "../src/app.js";

const port = Number(process.argv[2] || process.env.SPHEREX_PREVIEW_PORT || 4173);
const server = http.createServer(async (request, response) => {
  try {
    const origin = `http://${request.headers.host || `127.0.0.1:${port}`}`;
    const webRequest = new Request(new URL(request.url || "/", origin), {
      method: request.method,
      headers: request.headers,
    });
    const webResponse = await app.fetch(webRequest);
    response.writeHead(webResponse.status, Object.fromEntries(webResponse.headers));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Preview error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local preview: http://127.0.0.1:${port}`);
});
