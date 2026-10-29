import type { Point, TripRoute, RidePreferences, Place } from "./models";
import { validPoint } from "./models";
const rad = (x: number) => (x * Math.PI) / 180;
export function distanceKm(a: Point, b: Point): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) *
      Math.cos(rad(b.lat)) *
      Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function destination(start: Point, km: number, degrees: number): Point {
  const d = km / 6371,
    b = rad(degrees),
    lat = rad(start.lat),
    lon = rad(start.lon);
  const phi = Math.asin(
    Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(b),
  );
  return {
    lat: (phi * 180) / Math.PI,
    lon:
      ((((lon +
        Math.atan2(
          Math.sin(b) * Math.sin(d) * Math.cos(lat),
          Math.cos(d) - Math.sin(lat) * Math.sin(phi),
        )) *
        180) /
        Math.PI +
        540) %
        360) -
      180,
  };
}
export function roundTripWaypoints(
  start: Point,
  p: RidePreferences,
  variation = 0,
): Point[] {
  const averageSpeed =
    p.style === "twisty" ? 40 : p.style === "sweeping" ? 50 : 60;
  const target = (p.minutes / 60) * averageSpeed;
  const radius = Math.max(4, target / (p.style === "twisty" ? 7.5 : 6.8));
  const angle = p.direction + variation * 65;
  return [
    start,
    destination(start, radius, angle - 40),
    destination(start, radius * 1.25, angle + 10),
    destination(start, radius, angle + 65),
    start,
  ];
}
export function decodePolyline(encoded: string, precision = 6): Point[] {
  if (typeof encoded !== "string" || encoded.length > 200000)
    throw new Error("Ugyldig rutegeometri.");
  let index = 0,
    lat = 0,
    lon = 0;
  const points: Point[] = [];
  function next() {
    let result = 0,
      shift = 0,
      byte = 0;
    do {
      if (index >= encoded.length || shift > 30)
        throw new Error("Ufuldstændig rutegeometri.");
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error("Ugyldig rutegeometri.");
      result |= (byte & 31) << shift;
      shift += 5;
    } while (byte >= 32);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
  while (index < encoded.length) {
    lat += next();
    lon += next();
    const p = { lat: lat / 10 ** precision, lon: lon / 10 ** precision };
    if (!validPoint(p)) throw new Error("Rutepunkt uden for kortet.");
    points.push(p);
    if (points.length > 10000) throw new Error("Ruten er for detaljeret.");
  }
  if (points.length < 2) throw new Error("Ruten mangler geometri.");
  return points;
}
export function sampleRoute(points: Point[], count = 3): Point[] {
  if (!points.length) return [];
  const cumulative = [0];
  for (let i = 1; i < points.length; i++)
    cumulative.push(cumulative[i - 1] + distanceKm(points[i - 1], points[i]));
  const length = cumulative[cumulative.length - 1];
  return Array.from({ length: count }, (_, i) => {
    const target = length * (i / Math.max(1, count - 1));
    const index = cumulative.findIndex((v) => v >= target);
    return points[Math.max(0, index)];
  });
}
export function nearestProgress(points: Point[], position: Point) {
  let nearest = 0,
    distance = Infinity,
    progress = 0,
    total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i) total += distanceKm(points[i - 1], points[i]);
    const d = distanceKm(points[i], position);
    if (d < distance) {
      distance = d;
      nearest = i;
      progress = total;
    }
  }
  return {
    pointIndex: nearest,
    distanceKm: distance,
    progressKm: progress,
    totalKm: total,
  };
}
export const escapeXml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export function routeGpx(route: TripRoute): string {
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Motosalt" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(route.name)}</name><desc>${escapeXml("Rute fra Valhalla / OpenStreetMap. Saltforhold kan være ukendte.")}</desc></metadata><trk><name>${escapeXml(route.name)}</name><trkseg>${route.points.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"/>`).join("")}</trkseg></trk></gpx>`;
}
export interface RouteRecipe {
  version: 2;
  type: "route";
  start: Place;
  preferences: RidePreferences;
  waypoints: Point[];
}
export function parseRecipe(input: string): RouteRecipe | null {
  try {
    if (input.length > 6000) return null;
    const r = JSON.parse(input) as RouteRecipe;
    if (
      r.version !== 2 ||
      r.type !== "route" ||
      !validPoint(r.start) ||
      typeof r.start.label !== "string" ||
      r.start.label.length > 200 ||
      !Array.isArray(r.waypoints) ||
      r.waypoints.length < 2 ||
      r.waypoints.length > 12 ||
      !r.waypoints.every(validPoint)
    )
      return null;
    const p = r.preferences;
    if (
      !p ||
      (p.vehicle !== undefined && !["motorcycle", "car"].includes(p.vehicle)) ||
      !["open", "sweeping", "twisty"].includes(p.style) ||
      !Number.isFinite(p.minutes) ||
      p.minutes < 30 ||
      p.minutes > 480 ||
      typeof p.avoidHighways !== "boolean" ||
      typeof p.avoidUnpaved !== "boolean" ||
      !Number.isFinite(p.direction) ||
      p.direction < 0 ||
      p.direction > 360
    )
      return null;
    return {
      version: 2,
      type: "route",
      start: { ...r.start, label: r.start.label.slice(0, 200) },
      preferences: p,
      waypoints: r.waypoints,
    };
  } catch {
    return null;
  }
}
