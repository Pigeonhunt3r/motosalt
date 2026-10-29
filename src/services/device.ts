import { Platform, Share } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { routeGpx } from "../core/geo";
import type { Point, TripRoute } from "../core/models";
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
export async function currentPosition(): Promise<Point> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error(
      "Position blev ikke tilladt. Du kan søge efter et startsted i stedet.",
    );
  const result = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return { lat: result.coords.latitude, lon: result.coords.longitude };
}
export async function watchPosition(onPosition: (point: Point) => void) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error("Tillad position for at se dig selv på kortet.");
  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 25,
      timeInterval: 10000,
    },
    (result) =>
      onPosition({ lat: result.coords.latitude, lon: result.coords.longitude }),
  );
}
export async function exportGpx(route: TripRoute) {
  const content = routeGpx(route),
    name = `motosalt-${route.id.replace(/[^a-z0-9-]/gi, "").slice(0, 60)}.gpx`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/gpx+xml" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(content);
  if (await Sharing.isAvailableAsync())
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/gpx+xml",
      UTI: "com.topografix.gpx",
    });
  else await Share.share({ message: content });
}
export async function scheduleReminder(
  name: string,
  departureAt: string,
): Promise<string> {
  if (Platform.OS === "web") throw new Error("Påmindelser kræver mobilappen.");
  const when = Date.parse(departureAt) - 30 * 60000;
  if (!Number.isFinite(when) || when <= Date.now())
    throw new Error("Afgang skal ligge mere end 30 minutter fremme.");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("rides", {
      name: "Gruppeture",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error("Notifikationer blev ikke tilladt.");
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Turen nærmer sig",
      body: `${name} starter om 30 minutter. Tjek den fælles plan.`,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(when),
      channelId: "rides",
    },
  });
}
