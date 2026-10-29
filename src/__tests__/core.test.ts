import {
  decodePolyline,
  distanceKm,
  parseRecipe,
  roundTripWaypoints,
  routeGpx,
} from "../core/geo";
import { defaultRidePreferences, validRoute } from "../core/models";
import { tripFixture } from "../../tests/fixtures/trip";
import { rainBetween, weatherIsStale } from "../core/rain";
import { parseMeteo, parseValhalla } from "../services/providers";

const defaultStart = {
  id: "aarhus",
  label: "Aarhus, Danmark",
  lat: 56.15,
  lon: 10.2,
};
describe("Real map geometry", () => {
  it("decodes the standard polyline reference and rejects truncation", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5)).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
    expect(() => decodePolyline("_p~i")).toThrow();
  });
  it("generates a closed loop and changes direction and style", () => {
    const a = roundTripWaypoints(defaultStart, defaultRidePreferences);
    expect(a[0]).toBe(defaultStart);
    expect(a.at(-1)).toBe(defaultStart);
    expect(a[1]).not.toEqual(
      roundTripWaypoints(defaultStart, {
        ...defaultRidePreferences,
        direction: 270,
      })[1],
    );
    expect(a[1]).not.toEqual(
      roundTripWaypoints(defaultStart, {
        ...defaultRidePreferences,
        style: "twisty",
      })[1],
    );
    expect(distanceKm(defaultStart, a[1])).toBeGreaterThan(5);
  });
  it("exports safe GPX with route geometry", () => {
    const r = tripFixture({ ...defaultRidePreferences, minutes: 180 }).route;
    r.name = "A & B <test>";
    expect(routeGpx(r)).toContain("A &amp; B &lt;test&gt;");
    expect(routeGpx(r)).toContain("<trkpt lat=");
    expect(validRoute(r)).toBe(true);
  });
  it("validates incoming route recipes", () => {
    const valid = {
      version: 2,
      type: "route",
      start: defaultStart,
      preferences: defaultRidePreferences,
      waypoints: roundTripWaypoints(defaultStart, defaultRidePreferences),
    };
    expect(parseRecipe(JSON.stringify(valid))).not.toBeNull();
    expect(
      parseRecipe(
        JSON.stringify({ ...valid, waypoints: [{ lat: 100, lon: 0 }] }),
      ),
    ).toBeNull();
    expect(parseRecipe("x".repeat(7000))).toBeNull();
  });
  it("rejects malformed routing responses", () => {
    expect(() =>
      parseValhalla(
        {
          trip: {
            status: 0,
            summary: { length: 1, time: 100 },
            legs: [{ shape: "bad" }],
          },
        },
        defaultStart,
        defaultRidePreferences,
        [defaultStart, defaultStart],
      ),
    ).toThrow();
  });
});
describe("Rain coverage and provenance", () => {
  const hours = Array.from({ length: 5 }, (_, i) => ({
    time: `2026-10-27T0${i + 1}:00:00Z`,
    rainMm: 1,
    temperatureC: 8,
    windKmh: 12,
  }));
  it("only sums complete covered hours after an exact timestamp", () => {
    expect(
      rainBetween(hours, "2026-10-27T01:00:00Z", "2026-10-27T05:30:00Z"),
    ).toMatchObject({ mm: 4, hours: 4, complete: true });
  });
  it("never attributes rain from before a fractional salting timestamp", () => {
    expect(
      rainBetween(hours, "2026-10-27T01:30:00Z", "2026-10-27T05:30:00Z"),
    ).toMatchObject({ mm: 3, hours: 3, complete: true });
  });
  it("does not silently treat gaps, nulls or duplicate observations as zero", () => {
    expect(
      rainBetween(
        hours.filter((_, i) => i !== 2),
        hours[0].time,
        hours[4].time,
      ).mm,
    ).toBeNull();
    expect(
      rainBetween(
        hours.map((h, i) => ({ ...h, rainMm: i === 2 ? null : h.rainMm })),
        hours[0].time,
        hours[4].time,
      ).complete,
    ).toBe(false);
    expect(
      rainBetween([...hours, hours[2]], hours[0].time, hours[4].time).complete,
    ).toBe(false);
  });
  it("handles invalid, reversed and too-short ranges", () => {
    expect(rainBetween(hours, "bad", hours[0].time).complete).toBe(false);
    expect(rainBetween(hours, hours[4].time, hours[0].time).mm).toBeNull();
    expect(
      rainBetween(hours, "2026-10-27T01:10:00Z", "2026-10-27T01:50:00Z").mm,
    ).toBeNull();
  });
  it("requires known units and sums rain with showers, not snow", () => {
    const input = {
      hourly_units: {
        rain: "mm",
        showers: "mm",
        temperature_2m: "°C",
        wind_speed_10m: "km/h",
      },
      hourly: {
        time: ["2026-10-27T01:00"],
        rain: [2],
        showers: [0.5],
        temperature_2m: [8],
        wind_speed_10m: [12],
      },
    };
    expect(parseMeteo(input, defaultStart, "Start").hours[0]).toMatchObject({
      rainMm: 2.5,
      time: "2026-10-27T01:00Z",
    });
    expect(() =>
      parseMeteo(
        { ...input, hourly_units: { rain: "inch" } },
        defaultStart,
        "Start",
      ),
    ).toThrow();
  });
  it("does not turn a missing shower value into a valid rainfall number", () => {
    const result = parseMeteo(
      {
        hourly_units: {
          rain: "mm",
          showers: "mm",
          temperature_2m: "°C",
          wind_speed_10m: "km/h",
        },
        hourly: { time: ["2026-10-27T01:00"], rain: [1], showers: [null] },
      },
      defaultStart,
      "Start",
    );
    expect(result.hours[0].rainMm).toBeNull();
  });
  it("marks cached weather stale after three hours", () => {
    expect(
      weatherIsStale(
        { provider: "open-meteo", samples: [], fetchedAt: "2026-10-27T01:00Z" },
        Date.parse("2026-10-27T05:00Z"),
      ),
    ).toBe(true);
  });
});
