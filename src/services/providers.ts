import {
  decodePolyline,
  distanceKm,
  nearestProgress,
  roundTripWaypoints,
  sampleRoute,
} from "../core/geo";
import type {
  Place,
  Poi,
  Point,
  RidePreferences,
  RouteWeather,
  TripRoute,
  WeatherHour,
} from "../core/models";
import { validPoint, validRoute } from "../core/models";
import { jsonRequest, ServiceError } from "./http";

interface Photon {
  features?: {
    properties?: {
      osm_id?: number;
      name?: string;
      city?: string;
      country?: string;
      street?: string;
      housenumber?: string;
    };
    geometry?: { coordinates?: number[] };
  }[];
}
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  const data = await jsonRequest<Photon>(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query.trim())}&limit=5&lang=en`,
    { signal },
  );
  if (!Array.isArray(data?.features))
    throw new ServiceError("Stedtjenesten svarede med et ukendt format.");
  return data.features.flatMap((f, i) => {
    const c = f.geometry?.coordinates,
      p = f.properties;
    if (!c || !p || !validPoint({ lat: c[1], lon: c[0] })) return [];
    const label = [p.name ?? p.street, p.city, p.country]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(", ");
    return [
      {
        id: `photon-${p.osm_id ?? i}`,
        label: label.slice(0, 200) || "Valgt sted",
        lat: c[1],
        lon: c[0],
      },
    ];
  });
}
interface Valhalla {
  trip?: {
    status?: number;
    status_message?: string;
    summary?: { length?: number; time?: number };
    legs?: {
      shape?: string;
      maneuvers?: {
        instruction?: string;
        length?: number;
        time?: number;
        begin_shape_index?: number;
      }[];
    }[];
  };
}
export function parseValhalla(
  data: Valhalla,
  start: Place,
  preferences: RidePreferences,
  waypoints: Point[],
): TripRoute {
  const trip = data?.trip;
  if (!trip || trip.status !== 0 || !Array.isArray(trip.legs) || !trip.summary)
    throw new ServiceError(
      trip?.status_message ??
        "Rutemotoren kunne ikke finde en vej mellem punkterne.",
    );
  const points: Point[] = [];
  const steps: TripRoute["steps"] = [];
  for (const leg of trip.legs) {
    const shape = decodePolyline(leg.shape ?? "");
    const duplicate =
      points.length > 0 &&
      distanceKm(points[points.length - 1], shape[0]) < 0.001;
    const offset = points.length - (duplicate ? 1 : 0);
    points.push(...(duplicate ? shape.slice(1) : shape));
    for (const m of leg.maneuvers ?? []) {
      if (
        typeof m.instruction !== "string" ||
        !Number.isInteger(m.begin_shape_index) ||
        m.begin_shape_index! < 0 ||
        m.begin_shape_index! >= shape.length
      )
        continue;
      steps.push({
        instruction: m.instruction.slice(0, 1000),
        km: m.length ?? 0,
        minutes: (m.time ?? 0) / 60,
        pointIndex: offset + m.begin_shape_index!,
      });
    }
  }
  const route: TripRoute = {
    id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Rundtur ved ${start.label.split(",")[0]}`,
    start,
    preferences,
    waypoints,
    points,
    distanceKm: Math.round((trip.summary.length ?? 0) * 10) / 10,
    minutes: Math.round((trip.summary.time ?? 0) / 60),
    steps,
    provider: "valhalla",
    createdAt: new Date().toISOString(),
    warnings: [
      "Svingønsker påvirker ruteforslaget; vejernes karakter er ikke garanteret.",
      "Køretid er uden pauser og aktuelle trafikforhold.",
      "Kontrollér vinterdata og datadækning før afgang. Ruten er ikke beregnet til at undgå salt.",
    ],
  };
  if (preferences.avoidHighways)
    route.warnings.push(
      "Motorvej fravælges så vidt muligt, men kan stadig indgå, hvis vejnettet kræver det.",
    );
  if (preferences.avoidUnpaved)
    route.warnings.push(
      "Grus fravælges efter OpenStreetMap-data; start/slut kan stadig ligge på en ubefæstet vej.",
    );
  if (!validRoute(route))
    throw new ServiceError(
      "Rutemotoren returnerede en ufuldstændig eller for stor rute.",
    );
  return route;
}
let lastRouteRequest = 0;
export async function routeThrough(
  start: Place,
  p: RidePreferences,
  waypoints: Point[],
  signal?: AbortSignal,
): Promise<TripRoute> {
  if (
    !waypoints.every(validPoint) ||
    waypoints.length < 2 ||
    waypoints.length > 12
  )
    throw new ServiceError("Vælg mellem 2 og 12 gyldige rutepunkter.");
  const wait = Math.max(0, 1100 - (Date.now() - lastRouteRequest));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  if (signal?.aborted)
    throw new ServiceError("Ruteplanlægningen blev afbrudt.");
  lastRouteRequest = Date.now();
  const costing = p.vehicle === "car" ? "auto" : "motorcycle";
  const json = {
    locations: waypoints.map((point) => ({ ...point, type: "break" })),
    costing,
    costing_options: {
      [costing]: {
        use_highways: p.avoidHighways ? 0 : p.style === "open" ? 0.65 : 0.2,
        exclude_unpaved: p.avoidUnpaved,
        use_tracks: 0,
        use_ferry: 0,
        maneuver_penalty:
          p.style === "twisty" ? 2 : p.style === "sweeping" ? 8 : 20,
      },
    },
    directions_options: { units: "kilometers", language: "da-DK" },
  };
  const data = await jsonRequest<Valhalla>(
    `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(json))}`,
    { signal },
    30000,
  );
  return parseValhalla(data, start, p, waypoints);
}
function bendScore(points: Point[]): number {
  const samples = sampleRoute(points, Math.min(100, points.length));
  let sum = 0;
  for (let i = 2; i < samples.length; i++) {
    const a = samples[i - 2],
      b = samples[i - 1],
      c = samples[i];
    const scale = Math.cos((b.lat * Math.PI) / 180);
    const x = Math.atan2(b.lat - a.lat, (b.lon - a.lon) * scale),
      y = Math.atan2(c.lat - b.lat, (c.lon - b.lon) * scale);
    let d = Math.abs(x - y);
    if (d > Math.PI) d = 2 * Math.PI - d;
    sum += Math.min(d, Math.PI / 2);
  }
  return (
    sum /
    Math.max(
      1,
      points.reduce((n, p, i) => n + (i ? distanceKm(points[i - 1], p) : 0), 0),
    )
  );
}
export async function generateRoundTrip(
  start: Place,
  p: RidePreferences,
  signal?: AbortSignal,
  onProgress?: (text: string) => void,
): Promise<TripRoute> {
  const candidates: TripRoute[] = [];
  let scaled = { ...p };
  let failure: unknown;
  for (let i = 0; i < 3; i++) {
    onProgress?.(`Undersøger vejnettet · forslag ${i + 1} af 3`);
    try {
      const route = await routeThrough(
        start,
        p,
        roundTripWaypoints(start, scaled, i),
        signal,
      );
      if (route.minutes <= p.minutes * 1.05) candidates.push(route);
      scaled = {
        ...p,
        minutes: Math.max(
          30,
          Math.min(480, scaled.minutes * ((p.minutes * 0.9) / route.minutes)),
        ),
      };
    } catch (error) {
      failure = error;
      if (signal?.aborted) throw error;
      if (
        error instanceof ServiceError &&
        [403, 429].includes(error.status ?? 0)
      )
        throw error;
    }
  }
  if (!candidates.length)
    throw (
      failure ??
      new ServiceError(
        "Ingen rundtur inden for tidsrammen. Vælg en anden retning eller mere tid.",
      )
    );
  const score = (r: TripRoute) =>
    Math.abs(p.minutes * 0.9 - r.minutes) +
    (p.style === "twisty" ? -1 : p.style === "open" ? 1 : 0) *
      Math.min(30, bendScore(r.points) * 60);
  const selected = candidates.sort((a, b) => score(a) - score(b))[0];
  if (selected.minutes > p.minutes)
    selected.warnings.push("Ruten ligger højst 5 % over din ønskede køretid.");
  return selected;
}
interface Meteo {
  hourly?: {
    time?: string[];
    rain?: (number | null)[];
    showers?: (number | null)[];
    temperature_2m?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    precipitation_probability?: (number | null)[];
    weather_code?: (number | null)[];
    visibility?: (number | null)[];
  };
  hourly_units?: Record<string, string>;
}
export function parseMeteo(data: Meteo, point: Point, label: string) {
  const h = data?.hourly;
  if (
    !h ||
    !Array.isArray(h.time) ||
    data.hourly_units?.rain !== "mm" ||
    data.hourly_units?.showers !== "mm" ||
    data.hourly_units?.temperature_2m !== "°C" ||
    data.hourly_units?.wind_speed_10m !== "km/h"
  )
    throw new ServiceError("Vejrkildens format eller enheder er ændret.");
  const numeric = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const hours: WeatherHour[] = h.time.flatMap((time, i) => {
    const utc = /Z$|[+-]\d\d:\d\d$/.test(time) ? time : `${time}Z`;
    if (!Number.isFinite(Date.parse(utc))) return [];
    const rain = numeric(h.rain?.[i]),
      showers = numeric(h.showers?.[i]);
    return [
      {
        time: utc,
        rainMm:
          rain !== null && showers !== null && rain >= 0 && showers >= 0
            ? rain + showers
            : null,
        temperatureC: numeric(h.temperature_2m?.[i]),
        windKmh: numeric(h.wind_speed_10m?.[i]),
        windGustKmh:
          data.hourly_units?.wind_gusts_10m === "km/h"
            ? numeric(h.wind_gusts_10m?.[i])
            : null,
        precipitationProbability:
          data.hourly_units?.precipitation_probability === "%"
            ? numeric(h.precipitation_probability?.[i])
            : null,
        weatherCode:
          data.hourly_units?.weather_code === "wmo code"
            ? numeric(h.weather_code?.[i])
            : null,
        visibilityM:
          data.hourly_units?.visibility === "m"
            ? numeric(h.visibility?.[i])
            : null,
      },
    ];
  });
  if (!hours.length)
    throw new ServiceError("Der blev ikke leveret timevise vejrdata.");
  return { point, label, hours };
}
export async function fetchRouteWeather(
  route: TripRoute,
  signal?: AbortSignal,
): Promise<RouteWeather> {
  const points = sampleRoute(route.points, 4).slice(0, 3),
    params = new URLSearchParams({
      latitude: points.map((p) => p.lat.toFixed(4)).join(","),
      longitude: points.map((p) => p.lon.toFixed(4)).join(","),
      hourly:
        "rain,showers,temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability,weather_code,visibility",
      past_days: "7",
      forecast_days: "3",
      timezone: "UTC",
    });
  const result = await jsonRequest<Meteo | Meteo[]>(
    `https://api.open-meteo.com/v1/forecast?${params}`,
    { signal },
  );
  const data = Array.isArray(result) ? result : [result];
  if (data.length !== points.length)
    throw new ServiceError("Der mangler vejrsvar for dele af ruten.");
  return {
    provider: "open-meteo",
    fetchedAt: new Date().toISOString(),
    samples: data.map((d, i) =>
      parseMeteo(d, points[i], ["Start", "Udgående del", "Hjemgående del"][i]),
    ),
  };
}
interface Overpass {
  elements?: {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: Point;
    tags?: Record<string, string>;
  }[];
}
export async function fetchStops(
  route: TripRoute,
  signal?: AbortSignal,
): Promise<Poi[]> {
  const anchors = sampleRoute(route.points, 5).slice(1, -1);
  const query = `[out:json][timeout:20];(${anchors.flatMap((p) => ["fuel", "cafe"].map((kind) => `nwr[amenity=${kind}](around:2000,${p.lat.toFixed(5)},${p.lon.toFixed(5)});`)).join("")});out center tags 60;`;
  const result = await jsonRequest<Overpass>(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
    { signal },
    28000,
  );
  if (!Array.isArray(result.elements))
    throw new ServiceError("Stopstederne kunne ikke læses.");
  const unique = new Map<string, Poi>();
  for (const e of result.elements) {
    const point = e.center ?? { lat: e.lat!, lon: e.lon! };
    if (!validPoint(point)) continue;
    const kind = e.tags?.amenity;
    if (kind !== "fuel" && kind !== "cafe") continue;
    const id = `${e.type}/${e.id}`;
    unique.set(id, {
      ...point,
      id,
      name: (
        e.tags?.name ??
        e.tags?.brand ??
        (kind === "fuel" ? "Tankstation" : "Café")
      ).slice(0, 120),
      kind,
      distanceFromRouteKm: nearestProgress(route.points, point).distanceKm,
    });
  }
  return [...unique.values()]
    .sort((a, b) => a.distanceFromRouteKm - b.distanceFromRouteKm)
    .slice(0, 20);
}
