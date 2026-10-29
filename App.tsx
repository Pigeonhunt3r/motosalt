import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PlanScreen from "./src/screens/PlanScreen";
import TripScreen from "./src/screens/TripScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import GroupScreen from "./src/screens/GroupScreen";
import type { PendingJoin } from "./src/screens/GroupScreen";
import ConditionsScreen from "./src/screens/ConditionsScreen";
import Icon from "./src/components/Icon";
import { colors } from "./src/theme";
import type {
  GroupSession,
  Point,
  Poi,
  RideGroup,
  RidePreferences,
  RiderReport,
  RouteWeather,
  RouteWinter,
  SavedTrip,
  TripRoute,
} from "./src/core/models";
import { defaultRidePreferences } from "./src/core/models";
import { nearestProgress, parseRecipe } from "./src/core/geo";
import {
  fetchRouteWeather,
  fetchStops,
  generateRoundTrip,
  routeThrough,
} from "./src/services/providers";
import {
  exportGpx,
  scheduleReminder,
  watchPosition,
} from "./src/services/device";
import { fetchRouteWinter, unavailableWinter } from "./src/services/winter";
import { errorMessage } from "./src/services/http";
import * as storage from "./src/services/storage";
import * as groups from "./src/services/groups";
import type { GroupDraft } from "./src/services/groups";

type Tab = "plan" | "ride" | "saved" | "group" | "data";
const tabs: {
  id: Tab;
  label: string;
  icon: "plan" | "ride" | "group" | "data";
}[] = [
  { id: "plan", label: "Planlæg", icon: "plan" },
  { id: "ride", label: "Min tur", icon: "ride" },
  { id: "saved", label: "Mine ture", icon: "plan" },
  { id: "group", label: "Gruppen", icon: "group" },
  { id: "data", label: "Forhold", icon: "data" },
];
export default function App() {
  const [tab, setTab] = useState<Tab>("plan"),
    [start, setStart] = useState<import("./src/core/models").Place | null>(
      null,
    ),
    [preferences, setPreferences] = useState<RidePreferences>(
      defaultRidePreferences,
    );
  const [route, setRoute] = useState<TripRoute | null>(null),
    [weather, setWeather] = useState<RouteWeather | null>(null),
    [winter, setWinter] = useState<RouteWinter | null>(null),
    [winterRefresh, setWinterRefresh] = useState(0),
    [trips, setTrips] = useState<SavedTrip[]>([]),
    [pois, setPois] = useState<Poi[]>([]),
    [reports, setReports] = useState<RiderReport[]>([]),
    [reportPoint, setReportPoint] = useState<Point | null>(null),
    [mapPoint, setMapPoint] = useState<Point | null>(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [notice, setNotice] = useState("");
  const [position, setPosition] = useState<Point | null>(null),
    [tracking, setTracking] = useState(false),
    [sharing, setSharing] = useState(false);
  const [session, setSession] = useState<GroupSession | null>(null),
    [group, setGroup] = useState<RideGroup | null>(null),
    [groupBusy, setGroupBusy] = useState(false),
    [groupError, setGroupError] = useState(""),
    [checkedAt, setCheckedAt] = useState<string | null>(null),
    [pendingJoin, setPendingJoin] = useState<PendingJoin | null>(null);
  const controller = useRef<AbortController | null>(null),
    gps = useRef<{ remove: () => void } | null>(null),
    routeRef = useRef(route),
    sessionRef = useRef(session),
    sharingRef = useRef(false),
    mounted = useRef(true),
    groupSeq = useRef(0),
    gpsGeneration = useRef(0),
    gpsStarting = useRef(false),
    gpsWrite = useRef<Promise<void> | null>(null),
    groupMutating = useRef(false),
    userTouched = useRef(false);
  useEffect(() => {
    routeRef.current = route;
    sessionRef.current = session;
    sharingRef.current = sharing;
  }, [route, session, sharing]);
  const serverUrl = groups.defaultServerUrl();
  const onNotice = useCallback((text: string) => setNotice(text), []);
  const stopTracking = useCallback(async () => {
    gpsGeneration.current += 1;
    const wasSharing = sharingRef.current;
    gps.current?.remove();
    gps.current = null;
    setTracking(false);
    setPosition(null);
    setSharing(false);
    sharingRef.current = false;
    const s = sessionRef.current;
    if (s && wasSharing)
      try {
        await gpsWrite.current;
        const next = await groups.updateMember(s, { location: null });
        if (sessionRef.current?.id === s.id) setGroup(next);
      } catch {
        setNotice(
          "Positionsvisning er stoppet. Serveren kunne ikke kontaktes for at fjerne den seneste position; den mærkes som forældet.",
        );
      }
  }, []);
  const commitRoute = useCallback(
    (next: TripRoute, nextWeather: RouteWeather | null = null) => {
      void stopTracking();
      routeRef.current = next;
      setRoute(next);
      setStart(next.start);
      setPreferences(next.preferences);
      setWeather(nextWeather);
      setWinter(null);
      setPois([]);
      setReportPoint(null);
      setTab("ride");
    },
    [stopTracking],
  );
  const routeId = route?.id;
  useEffect(() => {
    const next = routeRef.current;
    if (!next || next.id !== routeId) return;
    const c = new AbortController();
    const id = next.id;
    void fetchRouteWinter(
      next,
      c.signal,
      Platform.OS === "web" ? (serverUrl ?? undefined) : undefined,
    )
      .then((result) => {
        if (!c.signal.aborted && routeRef.current?.id === id) setWinter(result);
      })
      .catch((error) => {
        if (!c.signal.aborted && routeRef.current?.id === id)
          setWinter(unavailableWinter(errorMessage(error)));
      });
    return () => c.abort();
    // Route geometry changes always receive a new id. Renaming keeps the same geometry.
  }, [routeId, winterRefresh, serverUrl]);
  useEffect(() => {
    if (!routeId) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active")
        setWinterRefresh((value) => value + 1);
    }, 5 * 60000);
    return () => clearInterval(timer);
  }, [routeId]);
  async function loadWeather(next = routeRef.current) {
    if (!next) return;
    setBusy(true);
    setWinterRefresh((value) => value + 1);
    const id = next.id;
    try {
      const result = await fetchRouteWeather(next);
      if (routeRef.current?.id === id) {
        setWeather(result);
        setNotice(
          "Vejret er opdateret. Vinteroplysninger hentes særskilt; se datadækning under Forhold.",
        );
      }
    } catch (e) {
      setNotice(
        `${errorMessage(e)} Gemte vejrdata vises fortsat, hvis de findes.`,
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function plan() {
    if (!start) {
      setNotice("Vælg et startsted i Danmark, eller brug din position.");
      return;
    }
    userTouched.current = true;
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setNotice("");
    try {
      const next = await generateRoundTrip(
        start,
        preferences,
        c.signal,
        setProgress,
      );
      if (c.signal.aborted) return;
      commitRoute(next);
      setProgress("Henter vejr langs ruten");
      try {
        const w = await fetchRouteWeather(next, c.signal);
        if (routeRef.current?.id === next.id && !c.signal.aborted)
          setWeather(w);
      } catch (e) {
        if (!c.signal.aborted)
          setNotice(
            `Ruten er klar. ${errorMessage(e)} Du kan hente vejret senere.`,
          );
      }
    } catch (e) {
      if (!c.signal.aborted) setNotice(errorMessage(e));
    } finally {
      if (controller.current === c) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setNotice("Planlægning afbrudt. Din tidligere tur er bevaret.");
  }
  async function save() {
    const r = routeRef.current;
    if (!r) return;
    try {
      setTrips(await storage.saveTrip(r, weather));
      setNotice("Turen og det senest hentede vejr er gemt på enheden.");
    } catch (e) {
      setNotice(`Turen kunne ikke gemmes. ${errorMessage(e)}`);
    }
  }
  async function shareRoute() {
    const r = routeRef.current;
    if (!r) return;
    const data = JSON.stringify({
      version: 2,
      type: "route",
      start: r.start,
      preferences: r.preferences,
      waypoints: r.waypoints,
    });
    const url = Linking.createURL("ride", { queryParams: { data } });
    await Share.share({
      message: `${r.name} · ${r.distanceKm} km. Saltstatus er ukendt.\n${url}`,
    });
    setNotice(
      "Rutelinket genskaber planen i samme app/build. Modtageren skal have netværksadgang til rutemotoren.",
    );
  }
  async function findStops() {
    if (!route) return;
    setBusy(true);
    try {
      setPois(await fetchStops(route));
      setNotice(
        "Stopsteder er hentet fra OpenStreetMap. Kontrollér adgang og åbningstid.",
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function addStop(poi: Pick<Poi, "lat" | "lon" | "name">) {
    if (!route) return;
    const progress = nearestProgress(route.points, poi).progressKm;
    const middle = [...route.waypoints.slice(1, -1), poi].sort(
      (a, b) =>
        nearestProgress(route.points, a).progressKm -
        nearestProgress(route.points, b).progressKm,
    );
    if (middle.length > 10) {
      setNotice("Ruten har allerede det maksimale antal stop.");
      return;
    }
    setBusy(true);
    try {
      const next = await routeThrough(route.start, route.preferences, [
        route.start,
        ...middle,
        route.start,
      ]);
      next.name = route.name;
      next.warnings.push(
        `Tilføjet stop: ${poi.name} ved ca. ${Math.round(progress)} km. Pausetid er ikke medregnet.`,
      );
      commitRoute(next);
      setNotice(
        "Ruten er genberegnet via stoppet. Hent nye vejrdata for den ændrede rute.",
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function startTracking(share = false) {
    if (gps.current) {
      if (share) {
        sharingRef.current = true;
        setSharing(true);
      }
      return;
    }
    if (gpsStarting.current) return;
    gpsStarting.current = true;
    const generation = ++gpsGeneration.current;
    try {
      const subscription = await watchPosition((point) => {
        if (!mounted.current || generation !== gpsGeneration.current) return;
        setPosition(point);
        const activeSession = sessionRef.current;
        if (sharingRef.current && activeSession && !gpsWrite.current) {
          const pending = groups
            .updateMember(activeSession, { location: point })
            .then(() => undefined)
            .catch(() =>
              setGroupError(
                "Positionen kunne ikke deles. Seneste serverposition kan være forældet.",
              ),
            )
            .finally(() => {
              if (gpsWrite.current === pending) gpsWrite.current = null;
            });
          gpsWrite.current = pending;
        }
      });
      if (
        !mounted.current ||
        generation !== gpsGeneration.current ||
        AppState.currentState === "background"
      ) {
        subscription.remove();
        return;
      }
      gps.current = subscription;
      setTracking(true);
      if (share) {
        sharingRef.current = true;
        setSharing(true);
      }
      setNotice("Positionsvisning er startet og virker, mens appen er åben.");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      gpsStarting.current = false;
    }
  }
  async function toggleSharing(enabled: boolean) {
    if (!sessionRef.current) {
      setNotice("Tilslut dig først en gruppe.");
      return;
    }
    if (enabled) await startTracking(true);
    else {
      sharingRef.current = false;
      setSharing(false);
      try {
        await gpsWrite.current;
        setGroup(
          await groups.updateMember(sessionRef.current, { location: null }),
        );
      } catch (e) {
        setGroupError(errorMessage(e));
      }
    }
  }
  const refreshGroup = useCallback(async (s = sessionRef.current) => {
    if (!s || groupMutating.current) return;
    const seq = ++groupSeq.current;
    try {
      const result = await groups.readGroup(s);
      if (
        mounted.current &&
        sessionRef.current?.id === s.id &&
        seq === groupSeq.current
      ) {
        setGroup(result);
        setCheckedAt(new Date().toISOString());
        setGroupError("");
      }
    } catch (e) {
      if (
        mounted.current &&
        sessionRef.current?.id === s.id &&
        seq === groupSeq.current
      )
        setGroupError(errorMessage(e));
    }
  }, []);
  async function mutateGroup(
    operation: (s: GroupSession) => Promise<RideGroup>,
  ): Promise<boolean> {
    const s = sessionRef.current;
    if (!s || groupMutating.current) return false;
    groupMutating.current = true;
    setGroupBusy(true);
    const seq = ++groupSeq.current;
    try {
      const result = await operation(s);
      if (sessionRef.current?.id === s.id && seq === groupSeq.current) {
        setGroup(result);
        setGroupError("");
        setCheckedAt(new Date().toISOString());
      }
      return true;
    } catch (e) {
      setGroupError(errorMessage(e));
      return false;
    } finally {
      groupMutating.current = false;
      setGroupBusy(false);
    }
  }
  async function installSession(result: {
    session: GroupSession;
    group: RideGroup;
  }) {
    await storage.saveGroupSession(result.session);
    sessionRef.current = result.session;
    setSession(result.session);
    setGroup(result.group);
    setGroupError("");
    setPendingJoin(null);
    setCheckedAt(new Date().toISOString());
  }
  async function createGroup(draft: GroupDraft) {
    if (!serverUrl) {
      setNotice("Denne build har ikke forbindelse til en gruppetjeneste.");
      return;
    }
    setGroupBusy(true);
    try {
      await save();
      const result = await groups.createGroup(serverUrl, draft);
      await installSession(result);
      setNotice("Gruppen er oprettet. Del invitationslinket med dine venner.");
    } catch (e) {
      setGroupError(errorMessage(e));
    } finally {
      setGroupBusy(false);
    }
  }
  async function joinGroup(profile: {
    name: string;
    rangeKm: number;
    style: "open" | "sweeping" | "twisty";
  }) {
    if (!pendingJoin) return;
    setGroupBusy(true);
    try {
      const result = await groups.joinGroup(
        pendingJoin.server,
        pendingJoin.id,
        pendingJoin.invite,
        profile,
      );
      await installSession(result);
      commitRoute(result.group.route);
      setTab("group");
      setNotice("Du er med i gruppen. Position deles ikke automatisk.");
    } catch (e) {
      setGroupError(errorMessage(e));
    } finally {
      setGroupBusy(false);
    }
  }
  async function shareGroup() {
    if (!session?.inviteCode) return;
    const url = Linking.createURL("join", {
      queryParams: {
        id: session.id,
        invite: session.inviteCode,
        server: session.serverUrl,
      },
    });
    await Share.share({
      message: `Kom med på ${group?.name ?? "Motosalt-turen"}. Alle med linket kan tilslutte sig.\n${url}`,
    });
  }
  async function leave() {
    if (!session) return;
    setGroupBusy(true);
    try {
      await groups.leaveGroup(session);
      await storage.saveGroupSession(null);
      setSession(null);
      sessionRef.current = null;
      setGroup(null);
      setSharing(false);
      sharingRef.current = false;
      setNotice(
        session.owner ? "Gruppen er slettet." : "Du har forladt gruppen.",
      );
    } catch (e) {
      setGroupError(errorMessage(e));
    } finally {
      setGroupBusy(false);
    }
  }
  async function reminder() {
    if (!group?.departureAt) return;
    try {
      const key = `motosalt:reminder:${group.id}`,
        previous = await AsyncStorage.getItem(key);
      if (previous)
        await Notifications.cancelScheduledNotificationAsync(previous);
      const id = await scheduleReminder(group.name, group.departureAt);
      await AsyncStorage.setItem(key, id);
      setNotice("Du får en lokal påmindelse ca. 30 minutter før afgang.");
    } catch (e) {
      setNotice(errorMessage(e));
    }
  }
  async function report(
    condition: RiderReport["condition"],
    note: string,
    share: boolean,
  ): Promise<boolean> {
    if (!reportPoint) return false;
    setBusy(true);
    try {
      let r: RiderReport = {
        ...reportPoint,
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        condition,
        note,
        createdAt: new Date().toISOString(),
        source: "rider",
        local: true,
      };
      if (share) {
        if (!serverUrl)
          throw new Error(
            "Observationen kan ikke deles i denne build. Gem den kun på enheden i stedet.",
          );
        r = await groups.postReport(serverUrl, {
          ...reportPoint,
          condition,
          note,
        });
      }
      setReports(await storage.storeReport(r));
      setNotice(
        share
          ? "Din observation er delt og markeret som uverificeret."
          : "Din observation er gemt på denne enhed.",
      );
      return true;
    } catch (e) {
      setNotice(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const handleUrl = useCallback(
    async (url: string) => {
      try {
        const params = Linking.parse(url).queryParams;
        if (
          typeof params?.id === "string" &&
          typeof params.invite === "string" &&
          typeof params.server === "string" &&
          params.id.length < 100 &&
          params.invite.length < 100
        ) {
          const u = new URL(params.server);
          if (!["https:", "http:"].includes(u.protocol))
            throw new Error("Ugyldig invitation.");
          setPendingJoin({
            id: params.id,
            invite: params.invite,
            server: u.origin,
          });
          setTab("group");
          if (sessionRef.current)
            setNotice(
              "Du har allerede en aktiv gruppe. Forlad den, før du bruger den nye invitation.",
            );
          return;
        }
        if (typeof params?.data === "string") {
          const recipe = parseRecipe(params.data);
          if (!recipe) {
            setNotice("Rutelinket er ugyldigt eller bruger et ældre format.");
            return;
          }
          setBusy(true);
          try {
            const next = await routeThrough(
              recipe.start,
              recipe.preferences,
              recipe.waypoints,
            );
            if (mounted.current) {
              commitRoute(next);
              setNotice(
                "Den delte rute er genberegnet på vejnettet. Saltstatus er ukendt.",
              );
            }
          } catch (e) {
            if (mounted.current) setNotice(errorMessage(e));
          } finally {
            if (mounted.current) setBusy(false);
          }
        }
      } catch {
        setNotice("Linket kunne ikke læses.");
      }
    },
    [commitRoute],
  );
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const [saved, localReports, savedSession, url] = await Promise.all([
          storage.loadTrips(),
          storage.loadReports(),
          storage.loadGroupSession(),
          Linking.getInitialURL(),
        ]);
        if (!mounted.current) return;
        setTrips(saved);
        setReports(localReports);
        if (savedSession) {
          sessionRef.current = savedSession;
          setSession(savedSession);
          void refreshGroup(savedSession);
        }
        if (url && !userTouched.current) void handleUrl(url);
      } catch {
        if (mounted.current)
          setNotice(
            "Noget gemt indhold kunne ikke læses. Du kan stadig planlægge en ny tur.",
          );
      }
    })();
    const subscription = Linking.addEventListener(
      "url",
      ({ url }) => void handleUrl(url),
    );
    return () => {
      mounted.current = false;
      controller.current?.abort();
      gpsGeneration.current += 1;
      gps.current?.remove();
      const lastSession = sessionRef.current;
      if (sharingRef.current && lastSession) {
        sharingRef.current = false;
        void Promise.resolve(gpsWrite.current)
          .then(() => groups.updateMember(lastSession, { location: null }))
          .catch(() => undefined);
      }
      subscription.remove();
    };
  }, [handleUrl, refreshGroup]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background" && gps.current) {
        void stopTracking();
      } else {
        if (state === "active" && routeRef.current)
          setWinterRefresh((value) => value + 1);
        void refreshGroup();
      }
    });
    return () => listener.remove();
  }, [refreshGroup, stopTracking]);
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refreshGroup(session);
    }, 15000);
    return () => clearInterval(timer);
  }, [session, refreshGroup]);
  useEffect(() => {
    if (!serverUrl) return;
    void groups
      .readReports(serverUrl)
      .then((remote) => {
        if (mounted.current)
          setReports((local) => [
            ...remote,
            ...local.filter((l) => !remote.some((r) => r.id === l.id)),
          ]);
      })
      .catch(() => {});
  }, [serverUrl]);
  const action = (operation: () => Promise<unknown>) =>
    void operation().catch((e) => setNotice(errorMessage(e)));
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.root} edges={["top", "left", "right"]}>
        <StatusBar style="dark" />
        <View style={s.top}>
          <Text style={s.brand}>motosalt.</Text>
          <View style={s.mode}>
            <Text style={s.modeText}>DIN NÆSTE TUR</Text>
          </View>
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {tab === "plan" && (
            <PlanScreen
              start={start}
              setStart={setStart}
              preferences={preferences}
              setPreferences={setPreferences}
              onPlan={() => void plan()}
              busy={busy}
              progress={progress}
              onCancel={cancel}
              onNotice={onNotice}
            />
          )}
          {tab === "ride" && (
            <TripScreen
              departureAt={
                group?.route.id === route?.id
                  ? (group?.departureAt ?? null)
                  : null
              }
              route={route}
              weather={weather}
              winter={winter}
              pois={pois}
              members={group?.members ?? []}
              reports={reports}
              position={position}
              tracking={tracking}
              busy={busy}
              onPlan={() => setTab("plan")}
              onSave={() => void save()}
              onExport={() => route && action(() => exportGpx(route))}
              onShare={() => action(shareRoute)}
              onWeather={() => void loadWeather()}
              onStops={() => void findStops()}
              onAddStop={(p) => void addStop(p)}
              onTracking={() =>
                tracking ? void stopTracking() : void startTracking()
              }
              onTap={(point) => setMapPoint(point)}
              onRename={(name) => {
                if (route) setRoute({ ...route, name });
              }}
            />
          )}
          {tab === "saved" && (
            <LibraryScreen
              trips={trips}
              onOpen={(trip) => {
                cancel();
                commitRoute(trip.route, trip.weather);
                setNotice("Gemt tur indlæst. Opdatér vejret inden afgang.");
              }}
              onDelete={(id) =>
                action(async () => setTrips(await storage.removeTrip(id)))
              }
              onPlan={() => setTab("plan")}
            />
          )}
          {tab === "group" && (
            <GroupScreen
              key={group?.id ?? "draft"}
              route={route}
              group={group}
              session={session}
              checkedAt={checkedAt}
              pendingJoin={pendingJoin}
              busy={groupBusy}
              error={groupError}
              sharingLocation={sharing}
              serverAvailable={!!serverUrl}
              onCreate={(draft) => void createGroup(draft)}
              onJoin={(profile) => void joinGroup(profile)}
              onStatus={(status) =>
                void mutateGroup((s) => groups.updateMember(s, { status }))
              }
              onProfile={(rangeKm) =>
                void mutateGroup((s) => groups.updateMember(s, { rangeKm }))
              }
              onPlanChange={(meeting, departureAt, next) =>
                void mutateGroup((s) =>
                  groups.updateGroup(s, {
                    meeting,
                    departureAt,
                    ...(next ? { route: next } : {}),
                  }),
                )
              }
              onRole={(memberId, role) =>
                void mutateGroup((s) =>
                  groups.updateGroup(s, { roles: [{ memberId, role }] }),
                )
              }
              onOpenRoute={() => {
                if (group) commitRoute(group.route);
              }}
              onShare={() => action(shareGroup)}
              onMessage={(text) =>
                mutateGroup((s) => groups.postMessage(s, text))
              }
              onLocation={(enabled) => void toggleSharing(enabled)}
              onLeave={() => void leave()}
              onRefresh={() => void refreshGroup()}
              onReminder={() => void reminder()}
              onNotice={onNotice}
            />
          )}
          {tab === "data" && (
            <ConditionsScreen
              departureAt={
                group?.route.id === route?.id
                  ? (group?.departureAt ?? null)
                  : null
              }
              route={route}
              weather={weather}
              winter={winter}
              reportPoint={reportPoint}
              reports={reports}
              onRefresh={() => void loadWeather()}
              onReport={(condition, note, share) =>
                report(condition, note, share)
              }
              busy={busy}
            />
          )}
        </KeyboardAvoidingView>
        <Modal
          visible={!!mapPoint}
          transparent
          animationType="fade"
          onRequestClose={() => setMapPoint(null)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              padding: 25,
              backgroundColor: "#17291f88",
            }}
          >
            <View
              style={{
                padding: 22,
                gap: 15,
                borderRadius: 18,
                backgroundColor: colors.paper,
              }}
            >
              <Text
                style={{ fontSize: 20, fontWeight: "600", color: colors.ink }}
              >
                Punkt på din tur
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kør via dette punkt"
                onPress={() => {
                  if (mapPoint) {
                    void addStop({ ...mapPoint, name: "Valgt rutepunkt" });
                    setMapPoint(null);
                  }
                }}
                style={{
                  padding: 15,
                  backgroundColor: colors.green,
                  borderRadius: 8,
                }}
              >
                <Text>Kør via dette punkt</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Observation ved dette punkt"
                onPress={() => {
                  setReportPoint(mapPoint);
                  setMapPoint(null);
                  setTab("data");
                }}
                style={{
                  padding: 15,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderRadius: 8,
                }}
              >
                <Text>Observation ved dette punkt</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fortryd kortvalg"
                onPress={() => setMapPoint(null)}
                style={{ padding: 15 }}
              >
                <Text>Fortryd</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        {!!notice && (
          <View style={s.notice} accessibilityLiveRegion="polite">
            <Text style={s.noticeText}>{notice}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Luk besked"
              onPress={() => setNotice("")}
              style={s.dismiss}
            >
              <Text>×</Text>
            </Pressable>
          </View>
        )}
        <SafeAreaView edges={["bottom"]} style={s.bottom}>
          <View style={s.tabs}>
            {tabs.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: tab === item.id }}
                onPress={() => {
                  userTouched.current = true;
                  setTab(item.id);
                }}
                style={s.tab}
              >
                <Icon
                  name={item.icon}
                  size={23}
                  color={tab === item.id ? colors.ink : "#8a957e"}
                />
                <Text
                  style={[
                    s.tabLabel,
                    tab === item.id && { color: colors.ink, fontWeight: "700" },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </SafeAreaView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingVertical: 15,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  brand: {
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: colors.ink,
  },
  mode: {
    backgroundColor: "#eaf0dc",
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  modeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: "#677e4d",
  },
  bottom: {
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  tabs: {
    flexDirection: "row",
    maxWidth: 650,
    width: "100%",
    alignSelf: "center",
    paddingVertical: 7,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 53,
  },
  tabLabel: { fontSize: 9, color: "#859077" },
  notice: {
    margin: 10,
    marginBottom: 7,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#e9efda",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    maxHeight: 120,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#425938" },
  dismiss: {
    padding: 10,
    minHeight: 40,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
