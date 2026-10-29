import RideAdvice from "../components/RideAdvice";
import { useNow } from "../hooks/useNow";
import { useState } from "react";
import { View } from "react-native";
import type {
  TripRoute,
  RouteWeather,
  RouteWinter,
  Point,
  RiderReport,
} from "../core/models";
import { distanceKm } from "../core/geo";
import { rainBetween, weatherIsStale } from "../core/rain";
import {
  Badge,
  Body,
  Button,
  Card,
  Chip,
  Eyebrow,
  Field,
  Heading,
  Hint,
  Page,
  Title,
  Toggle,
} from "../ui";
import { u } from "../theme";
import { formatDate, localDateFields, parseLocalDate } from "../format";
export default function ConditionsScreen({
  route,
  weather,
  winter,
  departureAt,
  reportPoint,
  reports,
  onRefresh,
  onReport,
  busy,
}: {
  route: TripRoute | null;
  weather: RouteWeather | null;
  winter: RouteWinter | null;
  departureAt: string | null;
  reportPoint: Point | null;
  reports: RiderReport[];
  onRefresh: () => void;
  onReport: (
    condition: RiderReport["condition"],
    note: string,
    share: boolean,
  ) => Promise<boolean>;
  busy: boolean;
}) {
  const now = useNow();
  const [fields, setFields] = useState(() =>
      localDateFields(new Date(Date.now() - 2 * 86400000)),
    ),
    [condition, setCondition] = useState<RiderReport["condition"]>("salt"),
    [note, setNote] = useState(""),
    [share, setShare] = useState(false);
  const asOf = new Date(now).toISOString();
  const start = parseLocalDate(fields.date, fields.time);
  const periodStart = new Date(now - 24 * 3600000).toISOString();
  return (
    <Page>
      <Eyebrow>GENNEMSIGTIGE DATA. BEDRE BESLUTNINGER.</Eyebrow>
      <Title>Solskin er{"\n"}ikke alt.</Title>
      {route && (
        <RideAdvice
          route={route}
          weather={weather}
          winter={winter}
          departureAt={departureAt}
        />
      )}
      <Card>
        <Heading>Registreret vinterdrift</Heading>
        <Body>
          Salt er ikke noget, en almindelig vejrprognose kan måle. Vi viser
          registrerede oplysninger, datadækning og kilde, når de kan hentes.
        </Body>
        <Badge
          label={
            winter?.status === "available"
              ? "Vejdirektoratets offentlige vinteroplysninger"
              : "Saltstatus ukendt"
          }
          warning={!winter || winter.status !== "available"}
        />
        {winter?.status === "available" && (
          <>
            <Hint>
              Data opdateret {formatDate(winter.dataUpdatedAt)} ·{" "}
              {winter.matchedSamples} af {winter.totalSamples} kontrolpunkter
              matchet.
            </Hint>
            {winter.sections.slice(0, 12).map((section) => {
              const point =
                section.points[Math.floor(section.points.length / 2)];
              const sample = point
                ? weather?.samples
                    .slice()
                    .sort(
                      (a, b) =>
                        distanceKm(a.point, point) - distanceKm(b.point, point),
                    )[0]
                : null;
              const separation =
                sample && point ? distanceKm(sample.point, point) : Infinity;
              const rain =
                sample && section.lastSaltingAt
                  ? rainBetween(sample.hours, section.lastSaltingAt, asOf)
                  : null;
              return (
                <View key={section.id} style={u.item}>
                  <Body>
                    {section.roadClass === "state"
                      ? "Statsvej"
                      : "Kommunal vej"}{" "}
                    ·{" "}
                    {section.saltingNow
                      ? "vinterarbejde registreret i gang"
                      : section.lastSaltingAt
                        ? `senest registreret ${formatDate(section.lastSaltingAt)}`
                        : "saltningstidspunkt ukendt"}
                  </Body>
                  <Hint>
                    Føre:{" "}
                    {section.condition === "winter"
                      ? "vinterføre meldt"
                      : section.condition === "normal"
                        ? "normale forhold meldt"
                        : section.condition === "outdated"
                          ? "forældet melding"
                          : "ukendt"}
                    . Oplysningen er ikke en måling af restsalt.
                  </Hint>
                  {section.lastSaltingAt && (
                    <Hint>
                      Modelregn siden registrering:{" "}
                      {sample && separation <= 25 && rain?.complete
                        ? `${rain.mm} mm ved ${sample.label} (${separation.toFixed(1)} km fra strækningens midte)`
                        : "ukendt; vejrdata dækker ikke hele perioden eller området"}
                      .{" "}
                      {rain?.complete
                        ? "Kun hele timer; lokal nedbør kan afvige."
                        : ""}
                    </Hint>
                  )}
                </View>
              );
            })}
          </>
        )}
        {(
          winter?.warnings ?? [
            "Ingen aktuel, dækkende saltningshistorik er tilgængelig for denne tur.",
          ]
        ).map((w) => (
          <Hint key={w}>{w}</Hint>
        ))}
        <Hint>Regn og en tør vej dokumenterer ikke, at vejen er saltfri.</Hint>
      </Card>
      <Card>
        <Heading>Regn langs ruten · seneste 24 timer</Heading>
        {weather ? (
          <>
            <Badge label="Open-Meteo · modelberegnet regn + byger" />
            <Hint>
              Hentet {formatDate(weather.fetchedAt)}
              {weatherIsStale(weather) ? " · data er forældede" : ""}
            </Hint>
            {weather.samples.map((sample) => {
              const total = rainBetween(sample.hours, periodStart, asOf);
              return (
                <View key={sample.label} style={u.item}>
                  <Heading>
                    {sample.label}:{" "}
                    {total.complete ? `${total.mm} mm` : "ukendt"}
                  </Heading>
                  <Hint>
                    {total.hours} af {total.expectedHours} hele timer med data.
                    {total.reason ? ` ${total.reason}` : ""}
                  </Hint>
                </View>
              );
            })}
            <Hint>
              Punkter langs ruten repræsenterer vejrmodellens gitter. Lokale
              forhold mellem punkterne kan afvige. Timerne er modeldata, ikke
              regnmålere på den enkelte vej.
            </Hint>
          </>
        ) : (
          <Body muted>
            Find en tur og hent vejret for at se regnhistorikken.
          </Body>
        )}
        <Button
          label="Opdatér vejr og vinterdata"
          secondary
          disabled={!route || busy}
          onPress={onRefresh}
        />
      </Card>
      <Card>
        <Heading>Regn siden et kendt tidspunkt</Heading>
        <Body muted>
          Har du selv oplysninger om en saltning? Vælg tidspunktet for at se den
          modelberegnede regn bagefter. Oplysningen bliver ikke behandlet som
          verificeret saltningshistorik.
        </Body>
        <View style={u.row}>
          <Field
            label="Dato (ÅÅÅÅ-MM-DD)"
            value={fields.date}
            maxLength={10}
            onChangeText={(date) => setFields({ ...fields, date })}
            placeholder="2026-10-27"
          />
          <Field
            label="Klokkeslæt (TT:MM)"
            value={fields.time}
            maxLength={5}
            onChangeText={(time) => setFields({ ...fields, time })}
            placeholder="08:00"
          />
        </View>
        <Hint>
          Telefonens lokale tidszone. Kun hele timer efter tidspunktet tælles
          med.
        </Hint>
        {!start ? (
          <Body>Indtast en gyldig dato og tid.</Body>
        ) : (
          weather?.samples.map((sample) => {
            const total = rainBetween(sample.hours, start, asOf);
            return (
              <View key={sample.label} style={u.item}>
                <Body>
                  {sample.label}: {total.complete ? `${total.mm} mm` : "ukendt"}
                </Body>
                <Hint>
                  {total.reason ??
                    `${total.hours} hele timer. Deltimer udelades; dette er ikke et saltfrit-stempel.`}
                </Hint>
              </View>
            );
          })
        )}
        <Badge label="Saltstatus forbliver ukendt uden dækkende historik" />
      </Card>
      {reportPoint && (
        <Card>
          <Heading>Din observation på vejen</Heading>
          <Hint>
            Valgt sted: {reportPoint.lat.toFixed(4)},{" "}
            {reportPoint.lon.toFixed(4)}. Placér et nyt punkt ved at trykke på
            rutekortet.
          </Hint>
          <View style={u.row}>
            {(
              [
                { id: "salt", label: "Synligt salt" },
                { id: "wet", label: "Våd vej" },
                { id: "gravel", label: "Grus" },
                { id: "dry", label: "Tør vej" },
              ] as const
            ).map((c) => (
              <Chip
                key={c.id}
                label={c.label}
                selected={condition === c.id}
                onPress={() => setCondition(c.id)}
              />
            ))}
          </View>
          <Field
            label="Hvad så du?"
            multiline
            maxLength={500}
            value={note}
            onChangeText={setNote}
            placeholder="Beskriv vejstrækningen og din observation"
          />
          <Toggle
            label="Del observationen med andre"
            value={share}
            onChange={setShare}
          />
          <Hint>
            {share
              ? "Position og tekst bliver synlige for andre. Skriv ikke personoplysninger. Observationen er uverificeret."
              : "Gemmes kun på denne enhed. En tør vej er ikke bevis for fravær af salt."}
          </Hint>
          <Button
            label="Gem kørerobservation"
            busy={busy}
            disabled={!note.trim()}
            onPress={() => {
              void onReport(condition, note.trim(), share).then((saved) => {
                if (saved) setNote("");
              });
            }}
          />
        </Card>
      )}
      <Card>
        <Heading>Seneste kørerobservationer</Heading>
        <Hint>
          Observationer fra kørere, ikke officielle målinger. De ændrer ikke
          automatisk saltvurderingen.
        </Hint>
        {reports.length ? (
          reports.slice(0, 15).map((report) => (
            <View key={report.id} style={u.item}>
              <Badge
                label={`${report.local ? "Kun denne enhed" : "Delt observation"} · ${report.condition === "salt" ? "salt" : report.condition === "wet" ? "våd" : report.condition === "gravel" ? "grus" : "tør"}`}
              />
              <Body>{report.note}</Body>
              <Hint>
                {formatDate(report.createdAt)} · {report.lat.toFixed(3)},{" "}
                {report.lon.toFixed(3)}
              </Hint>
            </View>
          ))
        ) : (
          <Hint>
            Ingen observationer. Tryk på det rigtige rutekort for at tilføje en.
          </Hint>
        )}
      </Card>
      <Card>
        <Heading>Det vi ved — og ikke ved</Heading>
        <Body muted>
          Vejdirektoratets offentlige trafikkort viser registreret
          saltning/snerydning, ikke kemiske målinger af restsalt. Kun entydige
          geografiske match vises. Manglende, gamle eller tvetydige
          registreringer giver ukendt saltstatus. Manglende regntimer tælles
          aldrig som nul.
        </Body>
        <Hint>
          Open-Meteo-data: CC BY 4.0. Gratis API-adgang er til ikke-kommerciel
          brug; en kommerciel udgivelse kræver afklarede API-vilkår. Kort og
          vejdata: OpenStreetMap-bidragsydere. Rutemotor: Valhalla.
        </Hint>
      </Card>
    </Page>
  );
}
