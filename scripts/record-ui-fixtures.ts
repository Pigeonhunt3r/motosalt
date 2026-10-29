// Manual consumer-test fixtures; all network data is fetched with normal Node TLS verification.
import { readFile, writeFile } from "node:fs/promises";
import { sampleRoute } from "../src/core/geo";
import { parseMeteo, parseValhalla } from "../src/services/providers";
import type { TripRoute } from "../src/core/models";
async function main() {
  const routes = JSON.parse(
    await readFile("/tmp/motosalt-denmark-coverage.json", "utf8"),
  ) as TripRoute[];
  const route = routes[Number(process.argv[2] ?? 0)];
  const q = new URLSearchParams({
    q: route.start.label,
    limit: "5",
    lang: "en",
  });
  const photon = await fetch(`https://photon.komoot.io/api/?${q}`).then((r) => {
    if (!r.ok) throw new Error(`Photon ${r.status}`);
    return r.json();
  });
  const p = route.preferences;
  const costing = p.vehicle === "car" ? "auto" : "motorcycle";
  const payload = {
    locations: route.waypoints.map((point) => ({ ...point, type: "break" })),
    costing,
    costing_options: {
      [costing]: {
        use_highways: p.avoidHighways ? 0 : 0.2,
        exclude_unpaved: p.avoidUnpaved,
        use_tracks: 0,
        use_ferry: 0,
        maneuver_penalty: 8,
      },
    },
    directions_options: { units: "kilometers", language: "da-DK" },
  };
  const valhalla = await fetch(
    `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(payload))}`,
  ).then((r) => {
    if (!r.ok) throw new Error(`Valhalla ${r.status}`);
    return r.json();
  });
  parseValhalla(valhalla, route.start, p, route.waypoints);
  const points = sampleRoute(route.points, 4).slice(0, 3);
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(","),
    longitude: points.map((p) => p.lon.toFixed(4)).join(","),
    hourly:
      "rain,showers,temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,weather_code,visibility",
    past_days: "7",
    forecast_days: "3",
    timezone: "UTC",
  });
  const meteo = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params}`,
  ).then((r) => {
    if (!r.ok) throw new Error(`Meteo ${r.status}`);
    return r.json();
  });
  for (let i = 0; i < 3; i++) parseMeteo(meteo[i], points[i], "Point");
  await writeFile(
    "/tmp/motosalt-ui-fixtures.json",
    JSON.stringify({ photon, valhalla, meteo }),
  );
  console.log(
    "Recorded and validated public Photon, Valhalla and Open-Meteo responses for an Aarhus UI test.",
  );
  const carPayload = {
    ...payload,
    costing: "auto",
    costing_options: { auto: payload.costing_options[costing] },
  };
  const carData = await fetch(
    `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(carPayload))}`,
  ).then((r) => r.json());
  const car = parseValhalla(
    carData,
    route.start,
    { ...p, vehicle: "car" },
    route.waypoints,
  );
  console.log(
    `PASS car profile: ${car.distanceKm} km, ${car.steps.length} routing steps.`,
  );
}
void main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
