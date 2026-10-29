import AsyncStorage from "@react-native-async-storage/async-storage";
import { tripFixture } from "../../tests/fixtures/trip";
import { defaultRidePreferences, validRoute } from "../core/models";
import {
  loadTrips,
  saveTrip,
  removeTrip,
  loadReports,
} from "../services/storage";
beforeEach(async () => AsyncStorage.clear());
it("keeps concurrent saves and stores each route in a separate record", async () => {
  const a = tripFixture({ ...defaultRidePreferences, minutes: 180 }).route,
    b = { ...a, id: "another", name: "En anden tur" };
  await Promise.all([saveTrip(a, null), saveTrip(b, null)]);
  expect((await loadTrips()).map((t) => t.route.id)).toEqual(["another", a.id]);
  expect(
    JSON.parse((await AsyncStorage.getItem("motosalt:trip-index:v3"))!),
  ).toEqual(["another", a.id]);
  await removeTrip(a.id);
  expect((await loadTrips()).map((t) => t.route.id)).toEqual(["another"]);
});
it("ignores corrupt legacy rows and report data instead of failing the whole app", async () => {
  await AsyncStorage.setItem("motosalt:trips:v2", '[null,{"route":{}}]');
  await AsyncStorage.setItem(
    "motosalt:reports:v2",
    '[null,42,{"lat":55,"lon":10}]',
  );
  expect(await loadTrips()).toEqual([]);
  expect(await loadReports()).toEqual([]);
});
it("rejects null navigation steps without throwing", () => {
  const route = tripFixture({ ...defaultRidePreferences, minutes: 180 }).route;
  expect(validRoute({ ...route, steps: [null] })).toBe(false);
});
it("preserves legacy trips when adding a new one", async () => {
  const d = tripFixture({ ...defaultRidePreferences, minutes: 180 });
  await AsyncStorage.setItem(
    "motosalt:trips:v2",
    JSON.stringify([
      { route: d.route, weather: d.weather, savedAt: new Date().toISOString() },
    ]),
  );
  await saveTrip({ ...d.route, id: "new" }, null);
  expect(await loadTrips()).toHaveLength(2);
});
