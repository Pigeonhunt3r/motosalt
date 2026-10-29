import { Platform } from "react-native";
import Constants from "expo-constants";
import type {
  GroupSession,
  RideGroup,
  TripRoute,
  MemberStatus,
  MemberRole,
  Point,
  RiderReport,
} from "../core/models";
import { jsonRequest } from "./http";
export function defaultServerUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  )
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return __DEV__ && host ? `http://${host}:3001` : null;
}
function validateServerUrl(value: string) {
  const u = new URL(value);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !["http:", "https:"].includes(u.protocol)
  )
    throw new Error("Ugyldig gruppeserver.");
  if (
    u.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(u.hostname) &&
    !/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)
  )
    throw new Error("En offentlig gruppeserver skal bruge HTTPS.");
  return u.origin;
}
const headers = (session: GroupSession) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${session.token}`,
});
export interface GroupDraft {
  name: string;
  memberName: string;
  rangeKm: number;
  style: "open" | "sweeping" | "twisty";
  meeting: string;
  departureAt: string | null;
  route: TripRoute;
}
export async function createGroup(serverUrl: string, draft: GroupDraft) {
  const base = validateServerUrl(serverUrl);
  const result = await jsonRequest<{
    group: RideGroup;
    session: Omit<GroupSession, "serverUrl">;
  }>(`${base}/v1/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return { ...result, session: { ...result.session, serverUrl: base } };
}
export async function joinGroup(
  serverUrl: string,
  id: string,
  inviteCode: string,
  profile: {
    name: string;
    rangeKm: number;
    style: "open" | "sweeping" | "twisty";
  },
) {
  const base = validateServerUrl(serverUrl);
  const result = await jsonRequest<{
    group: RideGroup;
    session: Omit<GroupSession, "serverUrl">;
  }>(`${base}/v1/groups/${encodeURIComponent(id)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...profile, inviteCode }),
  });
  return { ...result, session: { ...result.session, serverUrl: base } };
}
export const readGroup = (s: GroupSession) =>
  jsonRequest<RideGroup>(
    `${validateServerUrl(s.serverUrl)}/v1/groups/${encodeURIComponent(s.id)}`,
    { headers: headers(s) },
  );
export const updateMember = (
  s: GroupSession,
  patch: {
    status?: MemberStatus;
    rangeKm?: number;
    style?: "open" | "sweeping" | "twisty";
    location?: Point | null;
  },
) =>
  jsonRequest<RideGroup>(
    `${validateServerUrl(s.serverUrl)}/v1/groups/${encodeURIComponent(s.id)}/me`,
    { method: "PATCH", headers: headers(s), body: JSON.stringify(patch) },
  );
export const updateGroup = (
  s: GroupSession,
  patch: {
    meeting?: string;
    departureAt?: string | null;
    route?: TripRoute;
    roles?: { memberId: string; role: MemberRole }[];
  },
) =>
  jsonRequest<RideGroup>(
    `${validateServerUrl(s.serverUrl)}/v1/groups/${encodeURIComponent(s.id)}`,
    { method: "PATCH", headers: headers(s), body: JSON.stringify(patch) },
  );
export const postMessage = (s: GroupSession, text: string) =>
  jsonRequest<RideGroup>(
    `${validateServerUrl(s.serverUrl)}/v1/groups/${encodeURIComponent(s.id)}/messages`,
    { method: "POST", headers: headers(s), body: JSON.stringify({ text }) },
  );
export const leaveGroup = (s: GroupSession) =>
  jsonRequest<{ left: boolean }>(
    `${validateServerUrl(s.serverUrl)}/v1/groups/${encodeURIComponent(s.id)}/me`,
    { method: "DELETE", headers: { Authorization: `Bearer ${s.token}` } },
  );
export const readReports = (serverUrl: string) =>
  jsonRequest<RiderReport[]>(`${validateServerUrl(serverUrl)}/v1/reports`);
export const postReport = (
  serverUrl: string,
  r: Omit<RiderReport, "id" | "createdAt" | "source" | "local">,
) =>
  jsonRequest<RiderReport>(`${validateServerUrl(serverUrl)}/v1/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(r),
  });
