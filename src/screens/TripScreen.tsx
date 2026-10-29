import RideAdvice from "../components/RideAdvice";
import { useNow } from "../hooks/useNow";
import { useState } from "react";
import { Text, View } from "react-native";
import LiveMap from "../components/LiveMap";
import type {
  TripRoute,
  RouteWeather,
  RouteWinter,
  Poi,
  Point,
  GroupMember,
  RiderReport,
} from "../core/models";
import { nearestProgress } from "../core/geo";
import { nextWeather, weatherIsStale, weatherAlongRoute } from "../core/rain";
import {
  Badge,
  Body,
  Button,
  Card,
  Eyebrow,
  Field,
  Heading,
  Hint,
  Page,
  Title,
  Toggle,
} from "../ui";
import { u } from "../theme";
import { duration, formatDate } from "../format";
export default function TripScreen({
  route,
  weather,
  winter,
  pois,
  members,
  reports,
  position,
  tracking,
  busy,
  onPlan,
  onSave,
  onExport,
  onShare,
  onWeather,
  onStops,
  onAddStop,
  onTracking,
  onTap,
  onRename,
  departureAt,
}: {
  route: TripRoute | null;
  weather: RouteWeather | null;
  winter: RouteWinter | null;
  pois: Poi[];
  members: GroupMember[];
  reports: RiderReport[];
  position: Point | null;
  tracking: boolean;
  busy: boolean;
  onPlan: () => void;
  onSave: () => void;
  onExport: () => void;
  onShare: () => void;
  onWeather: () => void;
  onStops: () => void;
  onAddStop: (p: Poi) => void;
  onTracking: () => void;
  onTap: (p: Point) => void;
  onRename: (name: string) => void;
  departureAt: string | null;
}) {
  const now = useNow();
  const [showSalt, setShowSalt] = useState(true),
    [showSteps, setShowSteps] = useState(false);
  if (!route)
    return (
      <Page>
        <Title>Din næste tur.</Title>
        <Body muted>Planlæg en rundtur eller åbn en af dine gemte ture.</Body>
        <Button label="Planlæg en tur" onPress={onPlan} />
      </Page>
    );
  const progress = position ? nearestProgress(route.points, position) : null;
  const upcoming = progress
    ? route.steps.find((step) => step.pointIndex > progress.pointIndex)
    : null;
  const hours = weather
    ? nextWeather(weather.samples[0]?.hours ?? [], now)
    : [];
  return (
    <Page>
      <Eyebrow>DIN TUR PÅ RIGTIGE VEJE</Eyebrow>
      <Title>{route.name}</Title>
      <Body muted>{route.start.label} · rundtur</Body>
      <RideAdvice
        route={route}
        weather={weather}
        winter={winter}
        departureAt={departureAt}
      />
      <Card>
        <Toggle
          label="Vis registreret vinterdrift"
          value={showSalt}
          onChange={setShowSalt}
        />
        <LiveMap
          payload={{
            route,
            center: route.start,
            position,
            showSalt,
            winter,
            pois,
            members,
            reports,
          }}
          onTap={onTap}
          height={350}
        />
        {showSalt && (
          <Badge
            label={
              winter?.status === "available"
                ? `${winter.matchedSamples} af ${winter.totalSamples} rutepunkter med vinteroplysninger`
                : "Saltstatus ukendt"
            }
            warning={
              !winter ||
              winter.status !== "available" ||
              winter.matchedSamples < winter.totalSamples ||
              winter.matchedSamples === 0
            }
          />
        )}
        <Hint>
          Grå stiplet rute: saltstatus ukendt. Gul: nylig/igangværende
          vinterbehandling. Rød: meldt vinterføre. Grå vinterstrækning: øvrig
          registrering. Farverne er ikke en vurdering af restsalt.
        </Hint>
        <Hint>
          OpenStreetMap-kort. Tryk på kortet for at tilføje et rutestop eller en
          kørerobservation. Kortfelter kræver forbindelse.
        </Hint>
        <View style={[u.row, { justifyContent: "space-between" }]}>
          <View>
            <Text style={u.stat}>{route.distanceKm} km</Text>
            <Hint>rute på vejnettet</Hint>
          </View>
          <View>
            <Text style={u.stat}>{duration(route.minutes)}</Text>
            <Hint>uden pauser</Hint>
          </View>
        </View>
        <Field
          label="Turens navn"
          value={route.name}
          maxLength={120}
          onChangeText={onRename}
        />
        <View style={u.row}>
          <View style={{ flex: 1 }}>
            <Button label="Gem tur" secondary onPress={onSave} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Del tur" secondary onPress={onShare} />
          </View>
        </View>
        <Button label="Eksportér GPX" secondary onPress={onExport} />
        <Hint>
          GPX er et spor til en kompatibel navigationsapp. Kontrollér ruten og
          kortdata inden afgang.
        </Hint>
      </Card>
      <Card>
        <Heading>
          {tracking ? "Din tur er startet" : "Se din position på ruten"}
        </Heading>
        <Body muted>
          Position bruges kun, mens appen er åben. Deling med gruppen er et
          separat tilvalg.
        </Body>
        {progress && (
          <>
            <Badge
              label={
                progress.distanceKm > 0.2
                  ? "Du er uden for ruten"
                  : "Position tæt ved ruten"
              }
              warning={progress.distanceKm > 0.2}
            />
            <Body>
              {progress.progressKm.toFixed(1)} km langs kortsporet ·{" "}
              {Math.round(progress.distanceKm * 1000)} m fra nærmeste rutepunkt.
            </Body>
            {upcoming && <Body>Næste rutetrin: {upcoming.instruction}</Body>}
          </>
        )}
        <Button
          label={tracking ? "Stop positionsvisning" : "Start positionsvisning"}
          onPress={onTracking}
        />
        <Hint>
          Dette er rutetrin og kortvisning, ikke stemmestyret navigation eller
          baggrundssporing.
        </Hint>
      </Card>
      <Card>
        <Heading>Vejret langs turen</Heading>
        {weather ? (
          <>
            <Badge label="Open-Meteo · vejrmodeller" />
            <Hint>
              Hentet {formatDate(weather.fetchedAt)}
              {weatherIsStale(weather)
                ? " · forældet, opdatér inden turen"
                : ""}
            </Hint>
            {hours.length ? (
              <View
                style={[
                  u.row,
                  { justifyContent: "space-between", alignItems: "flex-end" },
                ]}
              >
                {hours.slice(0, 6).map((h) => (
                  <View
                    key={h.time}
                    style={{ alignItems: "center", gap: 5, minWidth: 35 }}
                  >
                    <Text style={u.hint}>{new Date(h.time).getHours()}:00</Text>
                    <View
                      style={{
                        width: 19,
                        height: Math.max(3, Math.min(45, (h.rainMm ?? 0) * 12)),
                        backgroundColor: "#8ba6b6",
                        borderRadius: 3,
                      }}
                    />
                    <Text style={u.hint}>
                      {h.rainMm === null ? "?" : `${h.rainMm.toFixed(1)}`}
                    </Text>
                    <Text style={u.hint}>
                      {h.temperatureC === null
                        ? "—"
                        : `${Math.round(h.temperatureC)}°`}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Hint>Ingen kommende timer i den gemte vejrserie.</Hint>
            )}
            {weatherAlongRoute(
              weather,
              departureAt ?? new Date(now).toISOString(),
              route.minutes,
            ).map((sample) => (
              <View key={sample.label} style={u.item}>
                <Body>
                  {sample.label} omkring {formatDate(sample.arrivalAt)}
                </Body>
                <Hint>
                  {sample.hour
                    ? `${sample.hour.temperatureC ?? "ukendt"} °C · ${sample.hour.rainMm ?? "ukendt"} mm/time · vind ${sample.hour.windKmh ?? "ukendt"} km/t`
                    : "Ingen timeprognose i det gemte tidsrum."}
                </Hint>
                {sample.hour?.temperatureC !== null &&
                  sample.hour &&
                  sample.hour.temperatureC <= 0 && (
                    <Badge
                      label="Modellen varsler mulighed for frost"
                      warning
                    />
                  )}
              </View>
            ))}
            <Hint>
              Omtrentlige ankomsttider uden pauser; ikke en trafikprognose.
            </Hint>
            <Hint>
              Timevis modelregn i mm og temperatur ved rutens start. Se
              regnhistorik for flere rutepunkter under Forhold.
            </Hint>
          </>
        ) : (
          <Body muted>
            Vejrdata er ikke hentet. Ruteplanlægning kan stadig bruges.
          </Body>
        )}
        <Button
          label="Opdatér vejret"
          secondary
          onPress={onWeather}
          disabled={busy}
        />
      </Card>
      <Card>
        <Heading>Pauser på din vej</Heading>
        <Body muted>Find caféer og tankstationer i nærheden af ruten.</Body>
        <Button
          label="Find stop nær ruten"
          secondary
          busy={busy}
          onPress={onStops}
        />
        {pois.map((poi) => (
          <View style={u.item} key={poi.id}>
            <Body>
              {poi.name} · {poi.kind === "fuel" ? "tankstation" : "café"}
            </Body>
            <Hint>
              {poi.distanceFromRouteKm.toFixed(1)} km fra kortsporet. Åbningstid
              og adgang er ikke bekræftet.
            </Hint>
            <Button
              label={`Kør via ${poi.name}`}
              secondary
              disabled={busy}
              onPress={() => onAddStop(poi)}
            />
          </View>
        ))}
        <Hint>
          OpenStreetMap-data. Tilføjelse som stop beregner ruten på ny; pausetid
          tælles ikke med.
        </Hint>
      </Card>
      <Card>
        <Heading>Rutetrin</Heading>
        <Button
          label={showSteps ? "Skjul rutetrin" : "Vis rutetrin"}
          secondary
          onPress={() => setShowSteps(!showSteps)}
        />
        {showSteps &&
          (route.steps.length ? (
            route.steps.slice(0, 100).map((step, i) => (
              <View key={i} style={u.item}>
                <Body>
                  {i + 1}. {step.instruction}
                </Body>
                <Hint>
                  {step.km.toFixed(1)} km ·{" "}
                  {duration(step.minutes) || "Under 1 min"}
                </Hint>
              </View>
            ))
          ) : (
            <Hint>Der mangler rutetrin i det gemte svar. Genberegn turen.</Hint>
          ))}
        {showSteps && route.steps.length > 100 && (
          <Hint>Viser de første 100 trin. GPX indeholder hele sporet.</Hint>
        )}
      </Card>
      <Card tint>
        <Heading>Om denne rute</Heading>
        {route.warnings.map((warning, i) => (
          <Hint key={i}>{warning}</Hint>
        ))}
        <Hint>
          Kilde: Valhalla / OpenStreetMap · beregnet{" "}
          {formatDate(route.createdAt)}.
        </Hint>
      </Card>
    </Page>
  );
}
