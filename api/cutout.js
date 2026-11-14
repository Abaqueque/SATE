import { handleCutout } from "../src/api.js";

// Vercel Node.js function; the browser keeps the same /api/cutout endpoint.
export function GET(request) {
  return handleCutout(request);
}
