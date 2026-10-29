import { writeFile } from "node:fs/promises";
import { searchPlaces, generateRoundTrip } from "../src/services/providers";
import { defaultRidePreferences } from "../src/core/models";
import { distanceKm } from "../src/core/geo";
async function main() {
  const cases = [
    { city: "Aarhus, Danmark", direction: 270 },
    { city: "Roskilde, Danmark", direction: 180 },
    { city: "Rønne, Danmark", direction: 60 },
  ];
  const verified = [];
  for (const item of cases) {
    const places = await searchPlaces(item.city);
    if (!places.length) throw new Error(`Intet sted fundet: ${item.city}`);
    const route = await generateRoundTrip(places[0], {
      ...defaultRidePreferences,
      minutes: 60,
      direction: item.direction,
    });
    if (distanceKm(route.points[0], route.points.at(-1)!) > 0.2)
      throw new Error("Ruten er ikke en lukket rundtur.");
    verified.push(route);
    console.log(
      `PASS ${item.city}: ${route.distanceKm} km, ${route.minutes} min, ${route.steps.length} steps.`,
    );
  }
  await writeFile(
    "/tmp/motosalt-denmark-coverage.json",
    JSON.stringify(verified),
  );
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
