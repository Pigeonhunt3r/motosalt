jest.mock("@react-native-async-storage/async-storage", () => {
  const values = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
      clear: jest.fn(async () => {
        values.clear();
      }),
    },
  };
});
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));
jest.mock("expo-linking", () => ({
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  parse: (url: string) => ({
    queryParams: Object.fromEntries(new URL(url).searchParams),
  }),
  createURL: (
    path: string,
    { queryParams }: { queryParams: Record<string, string> },
  ) => `motosalt://${path}?${new URLSearchParams(queryParams)}`,
}));
jest.mock("expo-notifications", () => ({
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
}));
jest.mock("./services/device", () => ({
  currentPosition: jest.fn(async () => ({ lat: 55.4, lon: 10.4 })),
  watchPosition: jest.fn(async () => ({ remove: jest.fn() })),
  exportGpx: jest.fn(async () => undefined),
  scheduleReminder: jest.fn(async () => "notification-id"),
}));
jest.mock("./components/LiveMap", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: () =>
      React.createElement(View, { accessibilityLabel: "Interaktivt rutekort" }),
  };
});
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
