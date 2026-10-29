import { Text, View } from "react-native";
import type { RouteWeather, RouteWinter, TripRoute } from "../core/models";
import { assessRide } from "../core/advice";
import { useNow } from "../hooks/useNow";
import { formatDate } from "../format";
import { Badge, Body, Eyebrow, Hint } from "../ui";
export default function RideAdvice({
  route,
  weather,
  winter,
  departureAt,
}: {
  route: TripRoute;
  weather: RouteWeather | null;
  winter: RouteWinter | null;
  departureAt: string | null;
}) {
  const now = useNow(),
    advice = assessRide(route, weather, winter, departureAt, now);
  const palette =
    advice.grade === "good"
      ? { bg: "#e8f1db", border: "#a7c481", ink: "#34552c" }
      : advice.grade === "avoid"
        ? { bg: "#fae7e0", border: "#d89c87", ink: "#863f2a" }
        : { bg: "#f7efd9", border: "#d5be7d", ink: "#6d571c" };
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: palette.bg,
        borderColor: palette.border,
        borderWidth: 1,
        borderRadius: 17,
        padding: 19,
        gap: 10,
      }}
    >
      <Eyebrow>VEJRVURDERING PÅ DIN PLANLAGTE TUR</Eyebrow>
      <Text
        accessibilityRole="header"
        style={{ fontSize: 25, fontWeight: "700", color: palette.ink }}
      >
        {advice.title}
      </Text>
      <Body>{advice.summary}</Body>
      {advice.reasons.slice(0, 4).map((reason) => (
        <Hint key={reason}>• {reason}</Hint>
      ))}
      <Badge
        label={advice.saltLabel}
        warning={advice.saltLabel.includes("ukendt")}
      />
      <Hint>
        En vejrvurdering, ikke et løfte om saltfri eller sikker vej. Kilde:
        Open-Meteo
        {winter?.status === "available"
          ? " og Vejdirektoratets offentlige vinteroplysninger"
          : ""}
        .
      </Hint>
      <Hint>
        {advice.sourceTime
          ? `Data hentet ${formatDate(advice.sourceTime)}.`
          : "Hent vejrdata for en vurdering."}{" "}
        {advice.checkedHours} af {advice.expectedHours} nødvendige timepunkter
        kontrolleret.
      </Hint>
    </View>
  );
}
