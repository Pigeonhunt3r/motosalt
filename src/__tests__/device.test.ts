import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { scheduleReminder } from "../services/device";
jest.unmock("../services/device");
jest.mock("expo-location", () => ({}));
jest.mock("expo-sharing", () => ({}));
jest.mock("expo-file-system", () => ({
  File: jest.fn(),
  Paths: { cache: "file:///cache" },
}));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  scheduleNotificationAsync: jest.fn(async () => "reminder-id"),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, "OS", "android");
});
afterEach(() => jest.restoreAllMocks());
it("creates an Android notification channel before requesting permission and schedules thirty minutes before departure", async () => {
  const departure = new Date(Date.now() + 2 * 3600000).toISOString();
  await expect(scheduleReminder("Min tur", departure)).resolves.toBe(
    "reminder-id",
  );
  expect(
    jest.mocked(Notifications.setNotificationChannelAsync).mock
      .invocationCallOrder[0],
  ).toBeLessThan(
    jest.mocked(Notifications.requestPermissionsAsync).mock
      .invocationCallOrder[0],
  );
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      trigger: {
        type: "date",
        date: new Date(Date.parse(departure) - 30 * 60000),
        channelId: "rides",
      },
    }),
  );
});
it("does not schedule anything if permission is refused", async () => {
  jest
    .mocked(Notifications.requestPermissionsAsync)
    .mockResolvedValueOnce({ status: "denied" } as Awaited<
      ReturnType<typeof Notifications.requestPermissionsAsync>
    >);
  await expect(
    scheduleReminder(
      "Min tur",
      new Date(Date.now() + 2 * 3600000).toISOString(),
    ),
  ).rejects.toThrow("ikke tilladt");
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});
it("rejects past and invalid departure times before asking for permission", async () => {
  for (const when of ["bad", new Date(Date.now() + 10 * 60000).toISOString()])
    await expect(scheduleReminder("Min tur", when)).rejects.toThrow(
      "30 minutter",
    );
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
});
