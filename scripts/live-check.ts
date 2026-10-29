import {
  searchPlaces,
  generateRoundTrip,
  fetchRouteWeather,
} from "../src/services/providers";
import { defaultRidePreferences, validRoute } from "../src/core/models";
import { rainBetween } from "../src/core/rain";
import { parseValhalla } from "../src/services/providers";
import { readFile, writeFile } from "node:fs/promises";
async function main() {
  const places = await searchPlaces("Odense, Danmark");
  if (!places.length)
    throw new Error("Stedsøgning returnerede ingen resultater.");
  console.log("PASS Photon: place with coordinates.");
  const start = places[0],
    preferences = { ...defaultRidePreferences, minutes: 60, direction: 90 };
  const route = await generateRoundTrip(start, preferences, undefined, (text) =>
    console.log(text),
  );
  if (
    !validRoute(route) ||
    route.provider !== "valhalla" ||
    !route.steps.length
  )
    throw new Error("Ruten blev ikke valideret.");
  console.log(
    `PASS Valhalla: ${route.distanceKm} km, ${route.minutes} min, ${route.points.length} points, ${route.steps.length} steps.`,
  );
  const weather = await fetchRouteWeather(route);
  if (weather.samples.length !== 3) throw new Error("Der mangler vejrprøver.");
  const now = new Date(),
    from = new Date(now.getTime() - 24 * 3600000).toISOString();
  const totals = weather.samples.map((s) =>
    rainBetween(s.hours, from, now.toISOString()),
  );
  if (totals.some((t) => !t.complete))
    throw new Error("Regnhistorikken har huller.");
  console.log(
    "PASS Open-Meteo: 3 route samples, complete hourly model rainfall coverage.",
  );
  await writeFile(
    "/tmp/motosalt-live-trip.json",
    JSON.stringify({ route, weather, stops: [] }),
  );
  console.log("UNRUN optional POI lookup: run npm run test:stops separately.");
  try {
    const fixture = JSON.parse(
      await readFile("/tmp/motosalt-valhalla-live.json", "utf8"),
    );
    parseValhalla(fixture, start, preferences, [start, start]);
    console.log("PASS previously fetched Valhalla wire response.");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
