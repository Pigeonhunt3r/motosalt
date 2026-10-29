import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Share } from "react-native";
import App from "../../App";
import { tripFixture } from "../../tests/fixtures/trip";
import * as winterApi from "../services/winter";
import { defaultRidePreferences } from "../core/models";
import * as api from "../services/groups";
import * as providers from "../services/providers";
jest.mock("../services/groups", () => ({
  defaultServerUrl: () => "http://localhost:3001",
  readReports: jest.fn(async () => []),
  createGroup: jest.fn(),
  readGroup: jest.fn(),
  updateMember: jest.fn(),
  updateGroup: jest.fn(),
  postMessage: jest.fn(),
}));
jest.mock("../services/providers", () => ({
  ...jest.requireActual("../services/providers"),
  generateRoundTrip: jest.fn(),
  fetchRouteWeather: jest.fn(),
  searchPlaces: jest.fn(),
}));
jest.mock("../services/winter", () => ({
  fetchRouteWinter: jest.fn(async () => ({
    provider: "vejdirektoratet",
    status: "unavailable",
    fetchedAt: new Date().toISOString(),
    dataUpdatedAt: null,
    sourceUrl: "https://trafikkort.vejdirektoratet.dk/",
    totalSamples: 0,
    matchedSamples: 0,
    sections: [],
    warnings: ["Test: utilgængelig kilde"],
  })),
  unavailableWinter: jest.fn(),
}));
beforeEach(async () => {
  await AsyncStorage.clear();
  jest
    .spyOn(Share, "share")
    .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  jest.mocked(providers.generateRoundTrip).mockReset();
  jest
    .mocked(providers.generateRoundTrip)
    .mockResolvedValue(tripFixture().route);
  jest
    .mocked(providers.fetchRouteWeather)
    .mockResolvedValue(tripFixture().weather);
});
afterEach(() => jest.restoreAllMocks());
async function openLive() {
  await fireEvent.press(
    screen.getByRole("button", { name: "Brug min position" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Find min rundtur" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Gem tur" })).toBeOnTheScreen(),
  );
}
it("plans a real-provider trip, saves and opens it, then confirms deletion", async () => {
  await render(<App />);
  await openLive();
  expect(screen.getByText(tripFixture().route.name)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Gem tur" }));
  await fireEvent.press(screen.getByRole("tab", { name: "Mine ture" }));
  await fireEvent.press(
    screen.getByRole("button", { name: `Åbn ${tripFixture().route.name}` }),
  );
  expect(screen.getByText(tripFixture().route.name)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("tab", { name: "Mine ture" }));
  await fireEvent.press(
    screen.getByRole("button", { name: `Slet ${tripFixture().route.name}` }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Ja, slet turen" }));
  expect(screen.getByText("Du har endnu ikke gemt en tur.")).toBeOnTheScreen();
});
it("keeps an existing route when live planning fails instead of silently showing fake data", async () => {
  await render(<App />);
  await openLive();
  jest
    .mocked(providers.generateRoundTrip)
    .mockRejectedValue(new Error("Rutemotoren er utilgængelig."));
  await fireEvent.press(screen.getByRole("tab", { name: "Planlæg" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Brug min position" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Find min rundtur" }),
  );
  expect(screen.getByText("Rutemotoren er utilgængelig.")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("tab", { name: "Min tur" }));
  expect(screen.getByText(tripFixture().route.name)).toBeOnTheScreen();
  expect(screen.queryByText("DEMODATA")).toBeNull();
});
it("requires the user to choose a start and exposes no demo entry", async () => {
  await render(<App />);
  expect(screen.getByLabelText("Søg by eller adresse")).toHaveDisplayValue("");
  await fireEvent.press(
    screen.getByRole("button", { name: "Find min rundtur" }),
  );
  expect(providers.generateRoundTrip).not.toHaveBeenCalled();
  expect(
    screen.getByText("Vælg et startsted i Danmark, eller brug din position."),
  ).toBeOnTheScreen();
  expect(screen.queryByText("Prøv en demotur på Fyn")).toBeNull();
});
it("searches for a real start place and requires a deliberate choice", async () => {
  jest
    .mocked(providers.searchPlaces)
    .mockResolvedValue([
      { id: "a", lat: 56.15, lon: 10.2, label: "Aarhus, Danmark" },
    ]);
  await render(<App />);
  await fireEvent.changeText(
    screen.getByLabelText("Søg by eller adresse"),
    "Aarhus",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Søg sted" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "Start i Aarhus, Danmark" }),
  );
  expect(screen.getByText("Valgt: Aarhus, Danmark")).toBeOnTheScreen();
});
it("creates a shared group with the chosen route and updates a member status", async () => {
  const route = tripFixture({ ...defaultRidePreferences, minutes: 180 }).route;
  const group = {
    id: "group-id",
    name: "Søndagsturen",
    meeting: route.start.label,
    departureAt: null,
    route,
    members: [
      {
        id: "member-id",
        name: "Anna",
        rangeKm: 180,
        role: "leader" as const,
        status: "ready" as const,
        style: "sweeping" as const,
        location: null,
        updatedAt: new Date().toISOString(),
      },
    ],
    messages: [],
    updatedAt: new Date().toISOString(),
  };
  jest.mocked(api.createGroup).mockResolvedValue({
    group,
    session: {
      id: group.id,
      memberId: "member-id",
      token: "test-token",
      owner: true,
      inviteCode: "test-invite",
      serverUrl: "http://localhost:3001",
    },
  });
  jest.mocked(api.updateMember).mockResolvedValue({
    ...group,
    members: [{ ...group.members[0], status: "fuel" }],
  });
  await render(<App />);
  await openLive();
  await fireEvent.press(screen.getByRole("tab", { name: "Gruppen" }));
  await fireEvent.changeText(screen.getByLabelText("Dit navn"), "Anna");
  await fireEvent.press(
    screen.getByRole("button", { name: "Opret fælles gruppetur" }),
  );
  await waitFor(() =>
    expect(screen.getByText("Delt gruppe")).toBeOnTheScreen(),
  );
  expect(api.createGroup).toHaveBeenCalledWith(
    "http://localhost:3001",
    expect.objectContaining({
      memberName: "Anna",
      route: expect.objectContaining({ id: route.id }),
    }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "Brug for benzin" }));
  expect(api.updateMember).toHaveBeenCalledWith(
    expect.objectContaining({ id: "group-id" }),
    { status: "fuel" },
  );
});

it("keeps the live route and weather advice when the winter source is unavailable", async () => {
  await render(<App />);
  await openLive();
  await waitFor(() => expect(winterApi.fetchRouteWinter).toHaveBeenCalled());
  expect(screen.getAllByText("Saltstatus ukendt").length).toBeGreaterThan(0);
  expect(screen.getByText("Perfekt turvejr")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("tab", { name: "Forhold" }));
  expect(screen.getByText("Test: utilgængelig kilde")).toBeOnTheScreen();
});
