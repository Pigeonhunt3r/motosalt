import type { RainTotal, WeatherHour, RouteWeather } from "./models";
export function rainBetween(
  hours: WeatherHour[],
  from: string,
  until: string,
): RainTotal {
  const start = Date.parse(from),
    end = Date.parse(until),
    H = 3600000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return {
      mm: null,
      hours: 0,
      expectedHours: 0,
      complete: false,
      reason: "Vælg et gyldigt tidsrum, der slutter efter start.",
    };
  // Open-Meteo hourly precipitation covers the hour ending at its timestamp.
  // Only whole hours entirely after salting are counted; no fractional rain is invented.
  const first = Math.ceil(start / H) * H + H;
  const last = Math.floor(end / H) * H;
  const expected = Math.max(0, Math.floor((last - first) / H) + 1);
  if (expected === 0)
    return {
      mm: null,
      hours: 0,
      expectedHours: 0,
      complete: false,
      reason: "Der er endnu ingen hele timer i tidsrummet.",
    };
  const byTime = new Map<number, WeatherHour>();
  for (const h of hours) {
    const t = Date.parse(h.time);
    if (byTime.has(t))
      return {
        mm: null,
        hours: 0,
        expectedHours: expected,
        complete: false,
        reason: "Vejrkilden indeholder dobbelte tidspunkter.",
      };
    byTime.set(t, h);
  }
  let mm = 0,
    count = 0;
  for (let t = first; t <= last; t += H) {
    const rain = byTime.get(t)?.rainMm;
    if (typeof rain === "number" && Number.isFinite(rain) && rain >= 0) {
      mm += rain;
      count++;
    }
  }
  if (count !== expected)
    return {
      mm: null,
      hours: count,
      expectedHours: expected,
      complete: false,
      reason:
        "En eller flere timer mangler. Manglende regn tælles ikke som nul.",
    };
  return {
    mm: Math.round(mm * 10) / 10,
    hours: count,
    expectedHours: expected,
    complete: true,
  };
}
export function weatherIsStale(
  weather: RouteWeather,
  now = Date.now(),
): boolean {
  const time = Date.parse(weather.fetchedAt);
  return !Number.isFinite(time) || time > now || now - time > 3 * 3600000;
}
export function nextWeather(
  hours: WeatherHour[],
  now = Date.now(),
): WeatherHour[] {
  return hours.filter(
    (h) => Date.parse(h.time) > now && Date.parse(h.time) <= now + 6 * 3600000,
  );
}
export function weatherAlongRoute(
  weather: RouteWeather,
  departureAt: string,
  minutes: number,
) {
  const start = Date.parse(departureAt);
  if (!Number.isFinite(start) || !Number.isFinite(minutes) || minutes < 0)
    return [];
  return weather.samples.map((sample, i) => {
    const arrival = start + (i / weather.samples.length) * minutes * 60000;
    const hour =
      sample.hours.find(
        (h) =>
          Date.parse(h.time) >= arrival &&
          Date.parse(h.time) - arrival < 3600000,
      ) ?? null;
    return {
      label: sample.label,
      arrivalAt: new Date(arrival).toISOString(),
      hour,
    };
  });
}
