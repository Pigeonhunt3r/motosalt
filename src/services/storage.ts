import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type {
  SavedTrip,
  TripRoute,
  RouteWeather,
  GroupSession,
  RiderReport,
} from "../core/models";
import { validRoute, validPoint } from "../core/models";
const LEGACY_TRIPS = "motosalt:trips:v2",
  INDEX = "motosalt:trip-index:v3",
  GROUP = "motosalt:group-session:v2",
  REPORTS = "motosalt:reports:v2";
const tripKey = (id: string) => `motosalt:trip:v3:${id}`;
function parse(value: string | null): unknown {
  try {
    return JSON.parse(value ?? "null");
  } catch {
    return null;
  }
}
function validWeather(value: unknown): value is RouteWeather {
  if (!value || typeof value !== "object") return false;
  const w = value as RouteWeather;
  return (
    w.provider === "open-meteo" &&
    Number.isFinite(Date.parse(w.fetchedAt)) &&
    Array.isArray(w.samples) &&
    w.samples.length <= 5 &&
    w.samples.every(
      (s) =>
        !!s &&
        validPoint(s.point) &&
        typeof s.label === "string" &&
        Array.isArray(s.hours) &&
        s.hours.length <= 500 &&
        s.hours.every(
          (h) =>
            !!h &&
            Number.isFinite(Date.parse(h.time)) &&
            [h.rainMm, h.temperatureC, h.windKmh].every(
              (n) =>
                n === null || (typeof n === "number" && Number.isFinite(n)),
            ),
        ),
    )
  );
}
function savedTrip(value: unknown): SavedTrip | null {
  if (!value || typeof value !== "object") return null;
  const v = value as SavedTrip;
  if (
    !validRoute(v.route) ||
    typeof v.savedAt !== "string" ||
    !Number.isFinite(Date.parse(v.savedAt))
  )
    return null;
  return {
    ...v,
    weather: validWeather(v.weather) ? v.weather : null,
  };
}
async function readTrips(): Promise<SavedTrip[]> {
  const index = parse(await AsyncStorage.getItem(INDEX));
  if (Array.isArray(index)) {
    const ids = [
      ...new Set(
        index.filter(
          (id): id is string => typeof id === "string" && id.length <= 80,
        ),
      ),
    ].slice(0, 30);
    const values = await Promise.all(
      ids.map(async (id) =>
        savedTrip(parse(await AsyncStorage.getItem(tripKey(id)))),
      ),
    );
    return values.filter((v): v is SavedTrip => v !== null);
  }
  const legacy = parse(await AsyncStorage.getItem(LEGACY_TRIPS));
  return Array.isArray(legacy)
    ? legacy
        .map(savedTrip)
        .filter((v): v is SavedTrip => v !== null)
        .slice(0, 30)
    : [];
}
let writes: Promise<unknown> = Promise.resolve();
function withWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = writes.then(operation, operation);
  writes = next.catch(() => undefined);
  return next;
}
export async function loadTrips(): Promise<SavedTrip[]> {
  await writes;
  return readTrips();
}
export function saveTrip(
  route: TripRoute,
  weather: RouteWeather | null,
): Promise<SavedTrip[]> {
  return withWrite(async () => {
    if (!validRoute(route)) throw new Error("Turen kunne ikke valideres.");
    const previous = await readTrips();
    const safeWeather = validWeather(weather) ? weather : null;
    const trips = [
      { route, weather: safeWeather, savedAt: new Date().toISOString() },
      ...previous.filter((t) => t.route.id !== route.id),
    ].slice(0, 30);
    // Each trip gets its own entry: Android's per-entry cursor limit must not cap the entire library.
    for (const trip of trips)
      await AsyncStorage.setItem(tripKey(trip.route.id), JSON.stringify(trip));
    await AsyncStorage.setItem(
      INDEX,
      JSON.stringify(trips.map((t) => t.route.id)),
    );
    for (const old of previous)
      if (!trips.some((t) => t.route.id === old.route.id))
        await AsyncStorage.removeItem(tripKey(old.route.id));
    return trips;
  });
}
export function removeTrip(id: string): Promise<SavedTrip[]> {
  return withWrite(async () => {
    const trips = (await readTrips()).filter((t) => t.route.id !== id);
    for (const trip of trips)
      await AsyncStorage.setItem(tripKey(trip.route.id), JSON.stringify(trip));
    await AsyncStorage.setItem(
      INDEX,
      JSON.stringify(trips.map((t) => t.route.id)),
    );
    await AsyncStorage.removeItem(tripKey(id));
    return trips;
  });
}
export async function saveGroupSession(session: GroupSession | null) {
  if (Platform.OS === "web") {
    if (session) window.sessionStorage.setItem(GROUP, JSON.stringify(session));
    else window.sessionStorage.removeItem(GROUP);
  } else {
    if (session) await SecureStore.setItemAsync(GROUP, JSON.stringify(session));
    else await SecureStore.deleteItemAsync(GROUP);
  }
}
export async function loadGroupSession(): Promise<GroupSession | null> {
  const value = parse(
    Platform.OS === "web"
      ? window.sessionStorage.getItem(GROUP)
      : await SecureStore.getItemAsync(GROUP),
  ) as GroupSession | null;
  if (
    !value ||
    typeof value.id !== "string" ||
    value.id.length > 100 ||
    typeof value.token !== "string" ||
    value.token.length > 200 ||
    typeof value.memberId !== "string" ||
    typeof value.serverUrl !== "string" ||
    typeof value.owner !== "boolean"
  )
    return null;
  return value;
}
export async function loadReports(): Promise<RiderReport[]> {
  const value = parse(await AsyncStorage.getItem(REPORTS));
  return Array.isArray(value)
    ? value
        .filter(
          (r): r is RiderReport =>
            !!r &&
            typeof r === "object" &&
            typeof r.id === "string" &&
            ["salt", "wet", "gravel", "dry"].includes(r.condition) &&
            typeof r.note === "string" &&
            r.note.length <= 500 &&
            Number.isFinite(Date.parse(r.createdAt)) &&
            validPoint(r),
        )
        .slice(0, 100)
    : [];
}
export function storeReport(report: RiderReport) {
  return withWrite(async () => {
    const reports = [
      report,
      ...(await loadReports()).filter((r) => r.id !== report.id),
    ].slice(0, 100);
    await AsyncStorage.setItem(REPORTS, JSON.stringify(reports));
    return reports;
  });
}
