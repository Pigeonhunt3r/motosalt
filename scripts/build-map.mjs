import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const js = await readFile(require.resolve("leaflet/dist/leaflet.js"), "utf8");
const css = await readFile(require.resolve("leaflet/dist/leaflet.css"), "utf8");
await mkdir(new URL("../src/generated/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/generated/map-assets.ts", import.meta.url),
  `// Generated from the installed, lockfile-verified Leaflet dependency.\nexport const leafletJs = ${JSON.stringify(js)};\nexport const leafletCss = ${JSON.stringify(css)};\n`,
);
