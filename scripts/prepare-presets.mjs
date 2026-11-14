import { mkdir, readFile, writeFile } from "node:fs/promises";
import { handleCutout } from "../src/api.js";
import { presets, queryKey } from "../src/presets.js";

const allTargets = [...presets, { ...presets.find((target) => target.id === "orion-nebula"), id: "orion-default", size: .1 }];
const selected = process.argv.slice(2);
const targets = selected.length ? allTargets.filter((target) => selected.includes(target.id)) : allTargets;
const directory = new URL("../public/presets/", import.meta.url);
await mkdir(directory, { recursive: true });
const entries = [];
const failures = [];
for (const target of allTargets.filter((target) => !targets.includes(target))) {
  try {
    await readFile(new URL(target.id + ".json", directory), "utf8");
    entries.push({ key: queryKey(target), url: "/presets/" + target.id + ".json" });
  } catch {}
}
let cursor = 0;
async function prepare() {
  while (cursor < targets.length) {
    const target = targets[cursor++];
    const { ra, dec, wavelength, size } = target;
    const file = new URL(target.id + ".json", directory);
    let preview;
    try {
      const parameters = new URLSearchParams({ ra, dec, wavelength, size, format: "preview", geometry: "1" });
      const response = await handleCutout(new Request("http://localhost/api/cutout?" + parameters));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      preview = payload;
      await writeFile(file, JSON.stringify(preview) + "\n");
      console.log(target.name + ": " + preview.width + "x" + preview.height + ", " + JSON.stringify(preview).length + " bytes");
    } catch (error) {
      failures.push({ id: target.id, error: error.message });
      console.warn(target.name + ": " + error.message);
      try { preview = JSON.parse(await readFile(file, "utf8")); } catch {}
    }
    if (preview) entries.push({ key: queryKey(target), url: "/presets/" + target.id + ".json" });
  }
}
await Promise.all([prepare(), prepare()]);
entries.sort((a, b) => a.key.localeCompare(b.key));
await writeFile(new URL("index.json", directory), JSON.stringify({ release: "SPHEREx DR1", generatedAt: new Date().toISOString(), entries, failures }, null, 2) + "\n");
console.log("Prepared " + entries.length + "/" + allTargets.length + " preset previews.");
if (!entries.length) process.exitCode = 1;
