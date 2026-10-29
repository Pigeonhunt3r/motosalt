import type { RoadStyle } from "../domain";
export interface Point {
  lat: number;
  lon: number;
}
export interface Place extends Point {
  label: string;
  id: string;
}
export interface RidePreferences {
  vehicle?: "motorcycle" | "car";
  style: RoadStyle;
  minutes: number;
  avoidHighways: boolean;
  avoidUnpaved: boolean;
  direction: number;
}
export interface Maneuver {
  instruction: string;
  km: number;
  minutes: number;
  pointIndex: number;
}
export interface TripRoute {
  id: string;
  name: string;
  start: Place;
  preferences: RidePreferences;
  waypoints: Point[];
  points: Point[];
  distanceKm: number;
  minutes: number;
  steps: Maneuver[];
  provider: "valhalla";
  createdAt: string;
  warnings: string[];
}
export interface WeatherHour {
  time: string;
  rainMm: number | null;
  temperatureC: number | null;
  windKmh: number | null;
  windGustKmh?: number | null;
  precipitationProbability?: number | null;
  weatherCode?: number | null;
  visibilityM?: number | null;
}
export interface WeatherSample {
  point: Point;
  label: string;
  hours: WeatherHour[];
}
export interface RouteWeather {
  provider: "open-meteo";
  fetchedAt: string;
  samples: WeatherSample[];
}
export interface RainTotal {
  mm: number | null;
  hours: number;
  expectedHours: number;
  complete: boolean;
  reason?: string;
}
export interface Poi extends Point {
  id: string;
  name: string;
  kind: "fuel" | "cafe";
  distanceFromRouteKm: number;
}
export interface SavedTrip {
  route: TripRoute;
  weather: RouteWeather | null;
  savedAt: string;
}
export type MemberStatus = "ready" | "fuel" | "break" | "stopped";
export type MemberRole = "leader" | "rider" | "tail";
export interface GroupMember {
  id: string;
  name: string;
  rangeKm: number;
  role: MemberRole;
  status: MemberStatus;
  style: RoadStyle;
  updatedAt: string;
  location: (Point & { updatedAt: string }) | null;
}
export interface GroupMessage {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}
export interface RideGroup {
  id: string;
  name: string;
  meeting: string;
  departureAt: string | null;
  route: TripRoute;
  members: GroupMember[];
  messages: GroupMessage[];
  updatedAt: string;
}
export interface GroupSession {
  id: string;
  token: string;
  memberId: string;
  owner: boolean;
  inviteCode?: string;
  serverUrl: string;
}
export interface RiderReport extends Point {
  id: string;
  condition: "salt" | "wet" | "gravel" | "dry";
  note: string;
  createdAt: string;
  source: "rider";
  local?: boolean;
}
export const defaultRidePreferences: RidePreferences = {
  vehicle: "motorcycle",
  style: "sweeping",
  minutes: 120,
  avoidHighways: true,
  avoidUnpaved: true,
  direction: 0,
};
export const validPoint = (p: unknown): p is Point =>
  !!p &&
  typeof p === "object" &&
  Number.isFinite((p as Point).lat) &&
  Number.isFinite((p as Point).lon) &&
  Math.abs((p as Point).lat) <= 85 &&
  Math.abs((p as Point).lon) <= 180;
export function validRoute(value: unknown): value is TripRoute {
  if (!value || typeof value !== "object") return false;
  const r = value as TripRoute;
  return (
    typeof r.id === "string" &&
    r.id.length <= 80 &&
    typeof r.name === "string" &&
    !!r.name.trim() &&
    r.name.length <= 120 &&
    validPoint(r.start) &&
    typeof r.start.label === "string" &&
    r.start.label.length <= 200 &&
    Array.isArray(r.points) &&
    r.points.length >= 2 &&
    r.points.length <= 10000 &&
    r.points.every(validPoint) &&
    Array.isArray(r.waypoints) &&
    r.waypoints.length >= 2 &&
    r.waypoints.length <= 12 &&
    r.waypoints.every(validPoint) &&
    Number.isFinite(r.distanceKm) &&
    r.distanceKm > 0 &&
    r.distanceKm <= 2000 &&
    Number.isFinite(r.minutes) &&
    r.minutes > 0 &&
    r.minutes <= 3000 &&
    r.provider === "valhalla" &&
    Number.isFinite(Date.parse(r.createdAt)) &&
    !!r.preferences &&
    ["open", "sweeping", "twisty"].includes(r.preferences.style) &&
    Number.isFinite(r.preferences.minutes) &&
    r.preferences.minutes >= 30 &&
    r.preferences.minutes <= 480 &&
    typeof r.preferences.avoidHighways === "boolean" &&
    typeof r.preferences.avoidUnpaved === "boolean" &&
    Number.isFinite(r.preferences.direction) &&
    r.preferences.direction >= 0 &&
    r.preferences.direction <= 360 &&
    Array.isArray(r.warnings) &&
    r.warnings.length <= 20 &&
    r.warnings.every((w) => typeof w === "string" && w.length <= 500) &&
    Array.isArray(r.steps) &&
    r.steps.length <= 1000 &&
    r.steps.every(
      (s) =>
        !!s &&
        typeof s === "object" &&
        typeof s.instruction === "string" &&
        s.instruction.length <= 1000 &&
        Number.isFinite(s.km) &&
        s.km >= 0 &&
        Number.isFinite(s.minutes) &&
        s.minutes >= 0 &&
        Number.isInteger(s.pointIndex) &&
        s.pointIndex >= 0 &&
        s.pointIndex < r.points.length,
    )
  );
}

export type WinterRoadCondition = "normal" | "winter" | "outdated" | "unknown";
export interface WinterSection {
  id: string;
  points: Point[];
  roadClass: "state" | "municipal";
  lastSaltingAt: string | null;
  saltingNow: boolean;
  condition: WinterRoadCondition;
  matchedSamples: number;
}
export interface RouteWinter {
  provider: "vejdirektoratet";
  status: "available" | "unavailable";
  fetchedAt: string;
  dataUpdatedAt: string | null;
  sourceUrl: string;
  totalSamples: number;
  matchedSamples: number;
  sections: WinterSection[];
  warnings: string[];
}
