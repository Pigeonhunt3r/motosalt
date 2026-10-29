// Manual live test. No simulated source data or disabled TLS verification.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { defaultRidePreferences } from "../src/core/models";
import { generateRoundTrip } from "../src/services/providers";
import { fetchRouteWinter } from "../src/services/winter";
async function main() {
  const places = [
    { id: "aarhus", label: "Aarhus, Danmark", lat: 56.1629, lon: 10.2039 },
    { id: "roskilde", label: "Roskilde, Danmark", lat: 55.6419, lon: 12.0878 },
    { id: "roenne", label: "Rønne, Danmark", lat: 55.1009, lon: 14.7066 },
  ];
  const results = [];
  for (const place of places) {
    const route = await generateRoundTrip(place, {
      ...defaultRidePreferences,
      minutes: 60,
    });
    const winter = await fetchRouteWinter(route);
    assert.equal(winter.status, "available", winter.warnings.join(" "));
    assert.ok(winter.matchedSamples <= winter.totalSamples);
    for (const section of winter.sections) {
      assert.ok(
        section.points.every(
          (p) => p.lat >= 54 && p.lat <= 58.3 && p.lon >= 7 && p.lon <= 16,
        ),
      );
      assert.ok(
        section.lastSaltingAt === null ||
          Date.parse(section.lastSaltingAt) <=
            Date.parse(winter.dataUpdatedAt!) + 300000,
      );
    }
    console.log(
      `${place.label}: ${winter.matchedSamples}/${winter.totalSamples} matched control points; ${winter.sections.length} sections; source ${winter.dataUpdatedAt}. Unmatched points remain unknown.`,
    );
    results.push({ route, winter });
  }
  await writeFile(
    "/tmp/motosalt-winter-coverage.json",
    JSON.stringify(results),
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
