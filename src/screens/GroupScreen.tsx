import { useNow } from "../hooks/useNow";
import { useState } from "react";
import { Text, View } from "react-native";
import type {
  GroupSession,
  RideGroup,
  TripRoute,
  MemberStatus,
  MemberRole,
} from "../core/models";
import { fuelStops } from "../domain";
import type { GroupDraft } from "../services/groups";
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
export interface PendingJoin {
  id: string;
  invite: string;
  server: string;
}
const statuses = [
  { id: "ready" as const, label: "Klar" },
  { id: "fuel" as const, label: "Brug for benzin" },
  { id: "break" as const, label: "Brug for pause" },
  { id: "stopped" as const, label: "Holder stille" },
];
const roleName = (role: MemberRole) =>
  role === "leader" ? "Leder" : role === "tail" ? "Bagtrop" : "Deltager";
export default function GroupScreen({
  route,
  group,
  session,
  checkedAt,
  pendingJoin,
  busy,
  error,
  sharingLocation,
  serverAvailable,
  onCreate,
  onJoin,
  onStatus,
  onProfile,
  onPlanChange,
  onRole,
  onOpenRoute,
  onShare,
  onMessage,
  onLocation,
  onLeave,
  onRefresh,
  onReminder,
  onNotice,
}: {
  route: TripRoute | null;
  group: RideGroup | null;
  session: GroupSession | null;
  checkedAt: string | null;
  pendingJoin: PendingJoin | null;
  busy: boolean;
  error: string;
  sharingLocation: boolean;
  serverAvailable: boolean;
  onCreate: (draft: GroupDraft) => void;
  onJoin: (profile: {
    name: string;
    rangeKm: number;
    style: "open" | "sweeping" | "twisty";
  }) => void;
  onStatus: (s: MemberStatus) => void;
  onProfile: (rangeKm: number) => void;
  onPlanChange: (
    meeting: string,
    departureAt: string | null,
    route?: TripRoute,
  ) => void;
  onRole: (id: string, role: MemberRole) => void;
  onOpenRoute: () => void;
  onShare: () => void;
  onMessage: (text: string) => Promise<boolean>;
  onLocation: (enabled: boolean) => void;
  onLeave: () => void;
  onRefresh: () => void;
  onReminder: () => void;
  onNotice: (s: string) => void;
}) {
  const now = useNow();
  const [name, setName] = useState(""),
    [groupName, setGroupName] = useState("Søndagsturen"),
    [range, setRange] = useState(() =>
      String(
        group?.members.find((m) => m.id === session?.memberId)?.rangeKm ?? 180,
      ),
    ),
    [meeting, setMeeting] = useState(
      group?.meeting ?? route?.start.label ?? "",
    ),
    [departure, setDeparture] = useState(() =>
      localDateFields(new Date(Date.now() + 86400000)),
    ),
    [useDeparture, setUseDeparture] = useState(false),
    [message, setMessage] = useState(""),
    [confirmLeave, setConfirmLeave] = useState(false);
  const rangeNumber = Number(range);
  const validProfile =
    name.trim() &&
    /^\d+$/.test(range) &&
    rangeNumber >= 60 &&
    rangeNumber <= 500;
  const minRange = group
    ? Math.min(...group.members.map((m) => m.rangeKm))
    : rangeNumber;
  const myMember = group?.members.find((m) => m.id === session?.memberId);
  const conflict = group
    ? new Set(group.members.map((m) => m.style)).size > 1
    : false;
  function create() {
    const departureAt = useDeparture
      ? parseLocalDate(departure.date, departure.time)
      : null;
    if (!route || !validProfile || !groupName.trim() || !meeting.trim()) {
      onNotice(
        "Udfyld gruppenavn, dit navn, mødested og en rækkevidde på 60–500 km.",
      );
      return;
    }
    if (
      useDeparture &&
      (!departureAt || Date.parse(departureAt) <= Date.now())
    ) {
      onNotice("Vælg en gyldig afgang i fremtiden.");
      return;
    }
    onCreate({
      name: groupName.trim(),
      memberName: name.trim(),
      rangeKm: rangeNumber,
      style: route.preferences.style,
      meeting: meeting.trim(),
      departureAt,
      route,
    });
  }
  return (
    <Page>
      <Eyebrow>GODE TURE BLIVER BEDRE SAMMEN</Eyebrow>
      <Title>Samme plan.{"\n"}Hele flokken.</Title>
      <Body muted>
        Hold styr på mødested, pausebehov og gruppens korteste rækkevidde.
      </Body>
      {!!error && (
        <View style={u.error}>
          <Body>{error}</Body>
          <Hint>
            Den senest hentede plan vises fortsat. Ændringer er ikke gemt, før
            serveren har bekræftet dem.
          </Hint>
        </View>
      )}
      {pendingJoin && !group && (
        <Card tint>
          <Heading>Du er inviteret</Heading>
          <Body>
            Gruppen deles fra {new URL(pendingJoin.server).hostname}. Dit navn
            og dine gruppeoplysninger bliver synlige for de andre deltagere, når
            du tilslutter dig.
          </Body>
          <Field
            label="Dit navn"
            value={name}
            onChangeText={setName}
            maxLength={60}
          />
          <Field
            label="Din rækkevidde (km)"
            value={range}
            onChangeText={setRange}
            keyboardType="number-pad"
            maxLength={3}
          />
          <Button
            label="Tilslut mig gruppen"
            busy={busy}
            disabled={!validProfile}
            onPress={() =>
              onJoin({
                name: name.trim(),
                rangeKm: rangeNumber,
                style: route?.preferences.style ?? "sweeping",
              })
            }
          />
        </Card>
      )}
      {!group && !pendingJoin && (
        <Card>
          <Heading>Start en gruppetur</Heading>
          {route ? (
            <>
              <Badge label={route.name} />
              <Field
                label="Gruppens navn"
                value={groupName}
                onChangeText={setGroupName}
                maxLength={60}
              />
              <Field
                label="Dit navn"
                value={name}
                onChangeText={setName}
                maxLength={60}
              />
              <Field
                label="Din rækkevidde (km)"
                value={range}
                onChangeText={setRange}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Field
                label="Mødested"
                value={meeting}
                onChangeText={setMeeting}
                maxLength={200}
              />
              <Toggle
                label="Aftal afgangstid"
                value={useDeparture}
                onChange={setUseDeparture}
              />
              {useDeparture && (
                <View style={u.row}>
                  <Field
                    label="Afgangsdato (ÅÅÅÅ-MM-DD)"
                    value={departure.date}
                    onChangeText={(date) =>
                      setDeparture({ ...departure, date })
                    }
                  />
                  <Field
                    label="Afgangstid (TT:MM)"
                    value={departure.time}
                    onChangeText={(time) =>
                      setDeparture({ ...departure, time })
                    }
                  />
                </View>
              )}
              <Button
                label="Opret fælles gruppetur"
                busy={busy}
                disabled={!serverAvailable}
                onPress={create}
              />
              <Hint>
                Alle med invitationslinket kan tilslutte sig. Position deles kun
                ved et særskilt tilvalg.
              </Hint>
              {!serverAvailable && (
                <Body muted>
                  Gruppedeling er ikke tilgængelig i denne build. Du kan stadig
                  gemme ruten og dele GPX.
                </Body>
              )}
            </>
          ) : (
            <Body>Find først en rute eller åbn en gemt tur.</Body>
          )}
        </Card>
      )}
      {group && session && (
        <>
          <Card>
            <Heading>{group.name}</Heading>
            <Badge
              label={error ? "Viser senest hentede plan" : "Delt gruppe"}
            />
            <Hint>
              Kontrolleret {formatDate(checkedAt)}. Opdateres mens appen er
              åben.
            </Hint>
            <Body>
              {group.route.name} · {group.route.distanceKm} km
            </Body>
            <Body>Mødested: {group.meeting}</Body>
            <Body>Afgang: {formatDate(group.departureAt)}</Body>
            <Button
              label="Åbn den fælles rute"
              secondary
              onPress={onOpenRoute}
            />
            <Button
              label="Opdatér gruppe"
              secondary
              busy={busy}
              onPress={onRefresh}
            />
            {session.owner && (
              <Button label="Del invitationslink" secondary onPress={onShare} />
            )}
            <Button
              label="Påmind mig 30 minutter før"
              secondary
              disabled={!group.departureAt}
              onPress={onReminder}
            />
            <Hint>
              En lokal påmindelse på din telefon; ingen salt- eller vejralarm.
            </Hint>
          </Card>
          <Card>
            <Heading>{group.members.length} kørere · én plan</Heading>
            {conflict && (
              <Badge label="Forskellige vejpræferencer i gruppen" warning />
            )}
            <Body>Planlæg tankstop efter {minRange} km rækkevidde.</Body>
            {fuelStops(group.route.distanceKm, minRange).map((km) => (
              <Hint key={km}>
                Tankstop omkring {km} km, med 25 % planlægningsreserve. Vælg et
                faktisk sted på kortet.
              </Hint>
            ))}
            {!fuelStops(group.route.distanceKm, minRange).length && (
              <Hint>
                Ingen beregnede tankstop nødvendige ved fuld tank og den oplyste
                rækkevidde.
              </Hint>
            )}
            {group.members.map((member) => (
              <View key={member.id} style={u.item}>
                <View style={u.row}>
                  <Text style={[u.body, { fontWeight: "600" }]}>
                    {member.name}
                    {member.id === session.memberId ? " (dig)" : ""}
                  </Text>
                  <Badge label={roleName(member.role)} />
                </View>
                <Body>
                  {statuses.find((s) => s.id === member.status)?.label} ·{" "}
                  {member.rangeKm} km rækkevidde
                </Body>
                <Hint>
                  Vejønske:{" "}
                  {member.style === "twisty"
                    ? "tætte sving"
                    : member.style === "open"
                      ? "åbne veje"
                      : "bløde sving"}{" "}
                  · ændret {formatDate(member.updatedAt)}
                </Hint>
                {member.location && (
                  <Hint>
                    Position: {formatDate(member.location.updatedAt)}
                    {now - Date.parse(member.location.updatedAt) > 120000
                      ? " · forældet"
                      : ""}
                  </Hint>
                )}
                {session.owner && (
                  <View style={u.row}>
                    {(["leader", "rider", "tail"] as const).map((role) => (
                      <Chip
                        key={role}
                        label={`${roleName(role)}: ${member.name}`}
                        selected={member.role === role}
                        onPress={() => onRole(member.id, role)}
                      />
                    ))}
                  </View>
                )}
              </View>
            ))}
          </Card>
          <Card>
            <Heading>Din status</Heading>
            <Hint>Brug knapperne, når du holder stille.</Hint>
            <View style={u.row}>
              {statuses.map((status) => (
                <Chip
                  key={status.id}
                  label={status.label}
                  selected={myMember?.status === status.id}
                  onPress={() => onStatus(status.id)}
                />
              ))}
            </View>
            <Field
              label="Opdatér din rækkevidde (km)"
              value={range}
              keyboardType="number-pad"
              onChangeText={setRange}
              maxLength={3}
            />
            <Button
              label="Gem min rækkevidde"
              secondary
              disabled={
                !/^\d+$/.test(range) || rangeNumber < 60 || rangeNumber > 500
              }
              onPress={() => onProfile(rangeNumber)}
            />
            <Toggle
              label="Del min position med gruppen"
              value={sharingLocation}
              onChange={onLocation}
            />
            <Hint>
              Kræver positionsadgang og virker kun, mens appen er åben. Slå fra
              for at fjerne din aktuelle position fra gruppen. Gamle positioner
              mærkes som forældede.
            </Hint>
          </Card>
          {session.owner && (
            <Card>
              <Heading>Opdatér fælles plan</Heading>
              <Field
                label="Nyt mødested"
                value={meeting}
                onChangeText={setMeeting}
                maxLength={200}
              />
              <Toggle
                label="Sæt ny afgangstid"
                value={useDeparture}
                onChange={setUseDeparture}
              />
              {useDeparture && (
                <View style={u.row}>
                  <Field
                    label="Ny dato (ÅÅÅÅ-MM-DD)"
                    value={departure.date}
                    onChangeText={(date) =>
                      setDeparture({ ...departure, date })
                    }
                  />
                  <Field
                    label="Ny tid (TT:MM)"
                    value={departure.time}
                    onChangeText={(time) =>
                      setDeparture({ ...departure, time })
                    }
                  />
                </View>
              )}
              <Button
                label="Gem mødested og afgang"
                secondary
                disabled={busy}
                onPress={() => {
                  const at = useDeparture
                    ? parseLocalDate(departure.date, departure.time)
                    : group.departureAt;
                  if (
                    !meeting.trim() ||
                    (useDeparture && (!at || Date.parse(at) <= Date.now()))
                  ) {
                    onNotice("Kontrollér mødested og afgangstid.");
                    return;
                  }
                  onPlanChange(meeting.trim(), at);
                }}
              />
              {route && (
                <Button
                  label="Brug min valgte rute i gruppen"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    onPlanChange(group.meeting, group.departureAt, route)
                  }
                />
              )}
            </Card>
          )}
          <Card>
            <Heading>Beskeder til flokken</Heading>
            {group.messages.length ? (
              group.messages.map((m) => (
                <View key={m.id} style={u.item}>
                  <Body>
                    {m.author}: {m.text}
                  </Body>
                  <Hint>{formatDate(m.createdAt)}</Hint>
                </View>
              ))
            ) : (
              <Hint>Ingen beskeder endnu.</Hint>
            )}
            <Field
              label="Besked til gruppen"
              value={message}
              maxLength={500}
              multiline
              onChangeText={setMessage}
            />
            <Button
              label="Send besked"
              disabled={!message.trim() || busy}
              onPress={() => {
                void onMessage(message.trim()).then((sent) => {
                  if (sent) setMessage("");
                });
              }}
            />
          </Card>
          <Card>
            {confirmLeave ? (
              <>
                <Body>
                  {session.owner
                    ? "Det sletter gruppen, beskeder og deltageradgang for alle."
                    : "Din deltageradgang og delte position bliver fjernet."}
                </Body>
                <Button
                  label={
                    session.owner
                      ? "Ja, slet hele gruppen"
                      : "Ja, forlad gruppen"
                  }
                  onPress={onLeave}
                />
                <Button
                  label="Fortryd"
                  secondary
                  onPress={() => setConfirmLeave(false)}
                />
              </>
            ) : (
              <Button
                label={session.owner ? "Slet gruppen" : "Forlad gruppen"}
                secondary
                onPress={() => setConfirmLeave(true)}
              />
            )}
          </Card>
        </>
      )}
    </Page>
  );
}
