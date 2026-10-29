// Recorded public Valhalla response, used only by automated tests and runtime checks.
import recorded from "./recorded-route.json";
import { validRoute } from "../../src/core/models";
import type {
  TripRoute,
  RouteWeather,
  RidePreferences,
} from "../../src/core/models";
export function tripFixture(preferences?: RidePreferences): {
  route: TripRoute;
  weather: RouteWeather;
} {
  const route = JSON.parse(JSON.stringify(recorded)) as TripRoute;
  if (preferences) route.preferences = preferences;
  if (!validRoute(route)) throw new Error("Recorded route fixture is invalid.");
  const now = Math.floor(Date.now() / 3600000) * 3600000;
  const weather: RouteWeather = {
    provider: "open-meteo",
    fetchedAt: new Date().toISOString(),
    samples: [0, 1, 2].map((i) => ({
      point: route.points[Math.floor(((route.points.length - 1) * i) / 3)],
      label: ["Start", "Udgående del", "Hjemgående del"][i],
      hours: Array.from({ length: 10 * 24 }, (_, j) => ({
        time: new Date(now + (j - 7 * 24) * 3600000).toISOString(),
        rainMm: 0,
        temperatureC: 15,
        windKmh: 12,
        windGustKmh: 18,
        precipitationProbability: 0,
        weatherCode: 0,
        visibilityM: 20000,
      })),
    })),
  };
  return { route, weather };
}
