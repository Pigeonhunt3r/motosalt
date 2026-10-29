import type {
  RouteWeather,
  RouteWinter,
  TripRoute,
  WeatherHour,
} from "./models";
import { weatherIsStale } from "./rain";
export type AdviceGrade = "good" | "consider" | "avoid";
export interface RideAdvice {
  grade: AdviceGrade;
  title: string;
  summary: string;
  reasons: string[];
  checkedHours: number;
  expectedHours: number;
  saltLabel: string;
  sourceTime: string | null;
}
const H = 3600000;
const winterCodes = new Set([56, 57, 66, 67, 71, 73, 75, 77, 85, 86]);
const stormCodes = new Set([95, 96, 99]);
const validCodes = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
]);
export function assessRide(
  route: TripRoute,
  weather: RouteWeather | null,
  winter: RouteWinter | null,
  departureAt: string | null,
  now: number,
): RideAdvice {
  const reasons: string[] = [];
  let grade: AdviceGrade = "good",
    checked = 0,
    expected = 0;
  const raise = (level: AdviceGrade, text: string) => {
    if (level === "avoid" || (level === "consider" && grade === "good"))
      grade = level;
    if (!reasons.includes(text)) reasons.push(text);
  };
  const start = departureAt ? Date.parse(departureAt) : now;
  let lastSourceTime: string | null = weather?.fetchedAt ?? null;
  if (!Number.isFinite(start) || start < now - 15 * 60000)
    raise(
      "consider",
      "Afgangstidspunktet er ugyldigt eller ligger i fortiden.",
    );
  if (!weather || weather.samples.length !== 3)
    raise("consider", "Der mangler vejrdata ved dele af ruten.");
  if (weather && weatherIsStale(weather, now))
    raise("consider", "Vejrdata er forældede. Hent nye data før afgang.");
  if (weather && Number.isFinite(start)) {
    for (let i = 0; i < weather.samples.length; i++) {
      const sample = weather.samples[i],
        from = start + (i / weather.samples.length) * route.minutes * 60000,
        to = start + ((i + 1) / weather.samples.length) * route.minutes * 60000;
      const first = Math.floor(from / H) * H,
        last = Math.ceil(to / H) * H,
        byTime = new Map<number, WeatherHour>();
      let duplicate = false;
      for (const hour of sample.hours) {
        const t = Date.parse(hour.time);
        if (byTime.has(t)) duplicate = true;
        byTime.set(t, hour);
      }
      if (duplicate)
        raise("consider", "Vejrserien indeholder dobbelte tidspunkter.");
      for (let time = first; time <= last; time += H) {
        expected++;
        const hour = byTime.get(time);
        if (!hour) {
          raise(
            "consider",
            "Timeprognosen dækker ikke hele den planlagte tur.",
          );
          continue;
        }
        const values = [
          hour.temperatureC,
          hour.windKmh,
          hour.windGustKmh,
          hour.weatherCode,
          hour.visibilityM,
        ];
        const rainRelevant = time > from;
        if (
          values.some((v) => typeof v !== "number" || !Number.isFinite(v)) ||
          (rainRelevant &&
            (hour.rainMm === null ||
              hour.precipitationProbability === null ||
              hour.precipitationProbability === undefined))
        ) {
          raise(
            "consider",
            "Prognosen mangler temperatur, vindstød, sigtbarhed eller nedbørsdata.",
          );
          continue;
        }
        if (
          hour.temperatureC! < -90 ||
          hour.temperatureC! > 65 ||
          hour.windKmh! < 0 ||
          hour.windGustKmh! < 0 ||
          hour.visibilityM! < 0 ||
          !validCodes.has(hour.weatherCode!) ||
          (rainRelevant &&
            (typeof hour.rainMm !== "number" ||
              !Number.isFinite(hour.rainMm) ||
              hour.rainMm < 0 ||
              typeof hour.precipitationProbability !== "number" ||
              !Number.isFinite(hour.precipitationProbability) ||
              hour.precipitationProbability < 0 ||
              hour.precipitationProbability > 100))
        ) {
          raise("consider", "Prognosen indeholder ugyldige måleværdier.");
          continue;
        }
        checked++;
        const temp = hour.temperatureC!,
          wind = hour.windKmh!,
          gust = hour.windGustKmh!,
          code = hour.weatherCode!,
          visibility = hour.visibilityM!;
        if (temp <= 2)
          raise(
            "avoid",
            "Temperatur tæt på frysepunktet: risiko for glatte veje kan ikke udelukkes.",
          );
        else if (temp < 10)
          raise(
            "consider",
            "Køligt langs ruten; vejtemperatur kan være lavere end lufttemperaturen.",
          );
        else if (temp >= 30)
          raise("consider", "Varmt langs ruten. Planlæg vand og pauser.");
        if (wind >= 50 || gust >= 70)
          raise("avoid", "Kraftig vind eller vindstød på ruten.");
        else if (wind >= 30 || gust >= 45)
          raise("consider", "Mærkbar vind eller vindstød langs ruten.");
        if (stormCodes.has(code))
          raise("avoid", "Prognosen viser risiko for torden eller hagl.");
        if (winterCodes.has(code))
          raise("avoid", "Prognosen viser sne eller nedbør, der kan fryse.");
        if (visibility < 1000)
          raise("avoid", "Meget lav sigtbarhed på dele af ruten.");
        else if (visibility < 5000 || code === 45 || code === 48)
          raise("consider", "Nedsat sigtbarhed eller tåge på ruten.");
        if (rainRelevant) {
          if (hour.rainMm! >= 3)
            raise("avoid", "Kraftig nedbør i den planlagte køretid.");
          else if (hour.rainMm! >= 0.2 || hour.precipitationProbability! >= 45)
            raise(
              "consider",
              "Regn eller betydelig risiko for nedbør under turen.",
            );
        }
      }
    }
  }
  const winterTime = Date.parse(winter?.dataUpdatedAt ?? "");
  const winterFresh =
    winter?.status === "available" &&
    Number.isFinite(winterTime) &&
    winterTime <= now &&
    now - winterTime <= 30 * 60000;
  let saltLabel = "Saltstatus ukendt";
  if (winterFresh && winter.sections.length) {
    const active = winter.sections.some((s) => s.saltingNow),
      slippery = winter.sections.some((s) => s.condition === "winter");
    const recent = winter.sections.some(
      (s) =>
        s.lastSaltingAt &&
        now - Date.parse(s.lastSaltingAt) >= 0 &&
        now - Date.parse(s.lastSaltingAt) < 48 * H,
    );
    if (active) {
      saltLabel = "Saltning/snerydning registreret i gang";
      raise(
        "consider",
        "Der er registreret igangværende vinterarbejde på matchede veje.",
      );
    } else if (recent) {
      saltLabel = "Saltning/snerydning registreret inden for 48 timer";
      raise(
        "consider",
        "Nylig registreret vinterbehandling. Regn dokumenterer ikke, at salt er væk.",
      );
    } else saltLabel = "Se registrerede vinteroplysninger";
    saltLabel += " · restsalt ukendt";
    if (slippery)
      raise(
        "avoid",
        "Vejdirektoratets feed melder vinterføre på en matchet strækning.",
      );
    if (winter.matchedSamples < winter.totalSamples)
      saltLabel += " · delvis datadækning";
    lastSourceTime = weather?.fetchedAt ?? winter.fetchedAt;
  }
  if (grade === "good")
    reasons.push(
      "Tørt turvejr, behagelig temperatur og begrænset vind ved de kontrollerede rutepunkter.",
    );
  const titles = {
    good: "Perfekt turvejr",
    consider: "Genovervej",
    avoid: "Anbefales ikke",
  };
  return {
    grade,
    title: titles[grade],
    summary:
      grade === "good"
        ? "Vejrprognosen passer godt til en køretur."
        : grade === "avoid"
          ? "Prognosen eller registrerede vinterforhold taler imod at køre nu."
          : "Tjek forholdene og overvej et andet tidspunkt.",
    reasons,
    checkedHours: checked,
    expectedHours: expected,
    saltLabel,
    sourceTime: lastSourceTime,
  };
}
