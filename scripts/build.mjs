import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { page } from "../src/ui.js";
import { browserScript } from "../src/browser.js";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distRoot = resolve(projectRoot, "dist");

await rm(distRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });
await writeFile(resolve(distRoot, "index.html"), page);
await writeFile(resolve(distRoot, "app.js"), browserScript);

console.log(`Built ${distRoot}`);
