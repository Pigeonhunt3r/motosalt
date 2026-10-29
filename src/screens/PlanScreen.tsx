import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Icon from "../components/Icon";
import type { Place, RidePreferences } from "../core/models";
import { searchPlaces } from "../services/providers";
import { currentPosition } from "../services/device";
import { errorMessage } from "../services/http";
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
const roadStyles = [
  {
    id: "sweeping" as const,
    name: "Bløde sving",
    description: "Roligt flow på landevejen",
  },
  {
    id: "twisty" as const,
    name: "Tætte sving",
    description: "Mere variation og flere kurver",
  },
  {
    id: "open" as const,
    name: "Åbne veje",
    description: "Lange kig og færre manøvrer",
  },
];
export default function PlanScreen({
  start,
  setStart,
  preferences,
  setPreferences,
  onPlan,
  busy,
  progress,
  onCancel,
  onNotice,
}: {
  start: Place | null;
  setStart: (p: Place) => void;
  preferences: RidePreferences;
  setPreferences: (p: RidePreferences) => void;
  onPlan: () => void;
  busy: boolean;
  progress: string;
  onCancel: () => void;
  onNotice: (s: string) => void;
}) {
  const [query, setQuery] = useState(start?.label ?? ""),
    [places, setPlaces] = useState<Place[]>([]),
    [searching, setSearching] = useState(false);
  async function search() {
    setSearching(true);
    try {
      const results = await searchPlaces(query);
      setPlaces(results);
      if (!results.length)
        onNotice("Ingen steder fundet. Prøv bynavn og land.");
    } catch (e) {
      onNotice(errorMessage(e));
    } finally {
      setSearching(false);
    }
  }
  async function gps() {
    setSearching(true);
    try {
      const p = await currentPosition();
      const location = { ...p, id: "gps", label: "Min aktuelle position" };
      setStart(location);
      setQuery(location.label);
      setPlaces([]);
    } catch (e) {
      onNotice(errorMessage(e));
    } finally {
      setSearching(false);
    }
  }
  const change = <K extends keyof RidePreferences>(
    key: K,
    value: RidePreferences[K],
  ) => setPreferences({ ...preferences, [key]: value });
  return (
    <Page>
      <Eyebrow>MINDRE TVIVL. MERE LANDEVEJ.</Eyebrow>
      <Title>Vejen er en del{"\n"}af turen.</Title>
      <Body muted>
        Find ture i hele Danmark, følg vejret og tag flokken med.
      </Body>
      <Card>
        <Heading>Hvor starter turen?</Heading>
        <Field
          label="Søg by eller adresse"
          value={query}
          placeholder="By, postnummer eller adresse i Danmark"
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => void search()}
        />
        <Button
          label="Søg sted"
          secondary
          busy={searching}
          onPress={() => void search()}
        />
        {places.map((place) => (
          <Pressable
            key={place.id}
            accessibilityRole="button"
            accessibilityLabel={`Start i ${place.label}`}
            style={u.item}
            onPress={() => {
              setStart(place);
              setQuery(place.label);
              setPlaces([]);
            }}
          >
            <Body>{place.label}</Body>
          </Pressable>
        ))}
        {start ? (
          <Badge label={`Valgt: ${start.label}`} />
        ) : (
          <Hint>
            Intet startsted valgt. Brug søgningen eller din aktuelle position.
          </Hint>
        )}
        <Button
          label="Brug min position"
          secondary
          disabled={searching}
          onPress={() => void gps()}
        />
      </Card>
      <Card>
        <Eyebrow>KØRETØJ</Eyebrow>
        <View style={u.row}>
          <Chip
            label="Motorcykel"
            selected={(preferences.vehicle ?? "motorcycle") === "motorcycle"}
            onPress={() => change("vehicle", "motorcycle")}
          />
          <Chip
            label="Klassisk bil"
            selected={preferences.vehicle === "car"}
            onPress={() => change("vehicle", "car")}
          />
        </View>
        <Heading>Din slags vej</Heading>
        {roadStyles.map((style) => (
          <Pressable
            key={style.id}
            accessibilityRole="radio"
            accessibilityLabel={style.name}
            accessibilityState={{ checked: preferences.style === style.id }}
            onPress={() => change("style", style.id)}
            style={[u.choice, preferences.style === style.id && u.selected]}
          >
            <Icon name={style.id} size={30} />
            <View style={{ flex: 1 }}>
              <Text style={[u.body, { fontWeight: "600" }]}>{style.name}</Text>
              <Hint>{style.description}</Hint>
            </View>
            <Text>{preferences.style === style.id ? "●" : "○"}</Text>
          </Pressable>
        ))}
        <Hint>
          Ønskerne påvirker rutepunkter og rutemotorens vejvalg; faktisk
          kurvekarakter er ikke garanteret.
        </Hint>
        <Eyebrow>TID PÅ VEJEN · UDEN PAUSER</Eyebrow>
        <View style={u.row}>
          {[60, 120, 180, 240].map((minutes) => (
            <Chip
              key={minutes}
              label={`${minutes / 60} timer`}
              selected={preferences.minutes === minutes}
              onPress={() => change("minutes", minutes)}
            />
          ))}
        </View>
        <Eyebrow>RETNING FRA START</Eyebrow>
        <View style={u.row}>
          {[
            { label: "Nord", angle: 0 },
            { label: "Øst", angle: 90 },
            { label: "Syd", angle: 180 },
            { label: "Vest", angle: 270 },
          ].map((d) => (
            <Chip
              key={d.angle}
              label={d.label}
              selected={preferences.direction === d.angle}
              onPress={() => change("direction", d.angle)}
            />
          ))}
        </View>
        <Toggle
          label="Foretræk uden motorvej"
          value={preferences.avoidHighways}
          onChange={(v) => change("avoidHighways", v)}
        />
        <Toggle
          label="Fravælg ubefæstede veje"
          value={preferences.avoidUnpaved}
          onChange={(v) => change("avoidUnpaved", v)}
        />
        <Hint>
          Vejvalg afhænger af kortdækningen. Start og slut kan ligge på en
          ubefæstet vej. Salt kan endnu ikke bruges som rutefilter.
        </Hint>
        <Button label="Find min rundtur" busy={busy} onPress={onPlan} />
        {busy && (
          <>
            <Hint>{progress}</Hint>
            <Button label="Afbryd planlægning" secondary onPress={onCancel} />
          </>
        )}
      </Card>
      <Card tint>
        <Heading>Solskin er ikke alt.</Heading>
        <Body muted>
          Se turvejr, modelberegnet regn og registreret vinterdrift langs din
          tur. Manglende eller forældede oplysninger vises som ukendte.
        </Body>
      </Card>
    </Page>
  );
}
