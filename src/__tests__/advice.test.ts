import { assessRide } from "../core/advice";
import { tripFixture } from "../../tests/fixtures/trip";
import type { RouteWinter, WeatherHour } from "../core/models";
const now = Date.parse("2026-10-27T10:15:00Z");
function fixture() {
  const { route, weather } = tripFixture();
  route.minutes = 120;
  weather.fetchedAt = new Date(now).toISOString();
  for (const sample of weather.samples)
    sample.hours = Array.from({ length: 8 }, (_, i) => ({
      time: new Date(
        Date.parse("2026-10-27T09:00Z") + i * 3600000,
      ).toISOString(),
      temperatureC: 18,
      rainMm: 0,
      windKmh: 10,
      windGustKmh: 20,
      visibilityM: 20000,
      weatherCode: 0,
      precipitationProbability: 0,
    }));
  return { route, weather };
}
function withHour(patch: Partial<WeatherHour>) {
  const { route, weather } = fixture();
  Object.assign(weather.samples[1].hours[3], patch);
  return assessRide(route, weather, null, null, now);
}
function winter(): RouteWinter {
  return {
    provider: "vejdirektoratet",
    status: "available",
    fetchedAt: new Date(now).toISOString(),
    dataUpdatedAt: new Date(now - 60000).toISOString(),
    sourceUrl: "https://trafikkort.vejdirektoratet.dk/",
    totalSamples: 20,
    matchedSamples: 1,
    sections: [
      {
        id: "1",
        roadClass: "state",
        points: [],
        lastSaltingAt: null,
        saltingNow: false,
        condition: "unknown",
        matchedSamples: 1,
      },
    ],
    warnings: [],
  };
}
it("can recommend good weather while explicitly retaining unknown salt status", () => {
  const { route, weather } = fixture();
  expect(assessRide(route, weather, null, null, now)).toMatchObject({
    grade: "good",
    title: "Perfekt turvejr",
    saltLabel: "Saltstatus ukendt",
  });
});
it.each([
  [{ temperatureC: 2 }, "avoid"],
  [{ temperatureC: 5 }, "consider"],
  [{ temperatureC: 31 }, "consider"],
  [{ windKmh: 50 }, "avoid"],
  [{ windGustKmh: 70 }, "avoid"],
  [{ windGustKmh: 45 }, "consider"],
  [{ rainMm: 3 }, "avoid"],
  [{ rainMm: 0.2 }, "consider"],
  [{ precipitationProbability: 50 }, "consider"],
  [{ weatherCode: 95 }, "avoid"],
  [{ weatherCode: 66 }, "avoid"],
  [{ weatherCode: 75 }, "avoid"],
  [{ visibilityM: 900 }, "avoid"],
  [{ visibilityM: 3000 }, "consider"],
  [{ weatherCode: 45 }, "consider"],
] as [Partial<WeatherHour>, string][])(
  "reacts to route-hour hazards %p",
  (patch, grade) => expect(withHour(patch).grade).toBe(grade),
);
it.each([
  { windGustKmh: null },
  { weatherCode: null },
  { visibilityM: undefined },
  { rainMm: null },
  { precipitationProbability: NaN },
  { precipitationProbability: 110 },
  { rainMm: -1 },
  { windKmh: -1 },
  { weatherCode: 1234 },
])(
  "never gives a positive result with incomplete or invalid values %p",
  (patch) => expect(withHour(patch).grade).toBe("consider"),
);
it("requires fresh data and full temporal/spatial coverage", () => {
  const { route, weather } = fixture();
  expect(assessRide(route, null, null, null, now).grade).toBe("consider");
  weather.fetchedAt = new Date(now - 4 * 3600000).toISOString();
  expect(assessRide(route, weather, null, null, now).grade).toBe("consider");
  weather.fetchedAt = new Date(now + 1000).toISOString();
  expect(assessRide(route, weather, null, null, now).grade).toBe("consider");
  weather.fetchedAt = new Date(now).toISOString();
  weather.samples[1].hours.splice(3, 1);
  expect(assessRide(route, weather, null, null, now).grade).toBe("consider");
});
it("checks the planned departure rather than the current conditions", () => {
  const { route, weather } = fixture();
  expect(assessRide(route, weather, null, "2026-10-30T10:00Z", now).grade).toBe(
    "consider",
  );
  expect(assessRide(route, weather, null, "2026-10-26T10:00Z", now).grade).toBe(
    "consider",
  );
  expect(assessRide(route, weather, null, "invalid", now).grade).toBe(
    "consider",
  );
});
it("rejects duplicate forecast times", () => {
  const { route, weather } = fixture();
  weather.samples[0].hours.push(weather.samples[0].hours[2]);
  expect(assessRide(route, weather, null, null, now).grade).toBe("consider");
});
it("checks the last part of the ride, not just the start", () => {
  const { route, weather } = fixture();
  weather.samples[2].hours[4].weatherCode = 99;
  expect(assessRide(route, weather, null, null, now).grade).toBe("avoid");
});
it("uses fresh recent/active treatment and winter conditions conservatively", () => {
  const { route, weather } = fixture(),
    w = winter();
  w.sections[0].saltingNow = true;
  expect(assessRide(route, weather, w, null, now)).toMatchObject({
    grade: "consider",
    saltLabel: expect.stringContaining("delvis"),
  });
  w.sections[0].saltingNow = false;
  w.sections[0].lastSaltingAt = new Date(now - 3600000).toISOString();
  expect(assessRide(route, weather, w, null, now).grade).toBe("consider");
  w.sections[0].condition = "winter";
  expect(assessRide(route, weather, w, null, now).grade).toBe("avoid");
});
it("never treats stale winter information as a current registration", () => {
  const { route, weather } = fixture(),
    w = winter();
  w.sections[0].saltingNow = true;
  w.dataUpdatedAt = new Date(now - 3600000).toISOString();
  expect(assessRide(route, weather, w, null, now).saltLabel).toBe(
    "Saltstatus ukendt",
  );
});

it("keeps residual salt explicitly unknown even when every sample has an old registration", () => {
  const { route, weather } = fixture(),
    w = winter();
  w.matchedSamples = w.totalSamples;
  w.sections[0].lastSaltingAt = new Date(now - 72 * 3600000).toISOString();
  const result = assessRide(route, weather, w, null, now);
  expect(result.grade).toBe("good");
  expect(result.saltLabel).toContain("restsalt ukendt");
});
