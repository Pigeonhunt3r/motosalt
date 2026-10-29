import { readFile } from "node:fs/promises";
import { fetchStops } from "../src/services/providers";
import { validRoute } from "../src/core/models";
async function main() {
  const data = JSON.parse(
    await readFile("/tmp/motosalt-live-trip.json", "utf8"),
  );
  if (!validRoute(data.route)) throw new Error("Kør først npm run test:live.");
  const stops = await fetchStops(data.route);
  console.log(`PASS Overpass: ${stops.length} parsed stops near the route.`);
}
void main().catch((error) => {
  console.error(
    "UNAVAILABLE optional POI provider:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
