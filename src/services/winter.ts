import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import proj4 from "proj4";
import type {
  Point,
  RouteWinter,
  TripRoute,
  WinterSection,
} from "../core/models";
import { sampleRoute } from "../core/geo";
import {
  distanceToLine,
  parseWinterRecords,
  parseWinterVersion,
  winterTilesForPoint,
  WINTER_SOURCE,
  WINTER_FEED,
  WINTER_METADATA,
  WINTER_TILES,
} from "../core/winter";
import type { GridTile } from "../core/winter";
import { jsonRequest, errorMessage } from "./http";
const DK_PROJECTION =
  "+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";
interface RoadLine {
  key: string;
  featureId: string;
  xy: [number, number][];
  bounds: [number, number, number, number];
}
const tileCache = new Map<string, RoadLine[]>();
let cachedFeed: { time: number; updatedAt: string; data: unknown } | null =
  null;
const projected = (p: Point) =>
  proj4("EPSG:4326", DK_PROJECTION, [p.lon, p.lat]) as [number, number];
export function unavailableWinter(reason: string): RouteWinter {
  return {
    provider: "vejdirektoratet",
    status: "unavailable",
    fetchedAt: new Date().toISOString(),
    dataUpdatedAt: null,
    sourceUrl: WINTER_SOURCE,
    totalSamples: 0,
    matchedSamples: 0,
    sections: [],
    warnings: [
      reason,
      "Manglende registrering er ikke dokumentation for, at en vej er saltfri.",
    ],
  };
}
async function feed(signal: AbortSignal, proxy?: string) {
  if (cachedFeed && Date.now() - cachedFeed.time < 5 * 60000) return cachedFeed;
  const response = await fetch(
    proxy ? `${proxy}/v1/winter/feed` : WINTER_FEED,
    { signal, headers: { Accept: "application/json" } },
  );
  if (!response.ok)
    throw new Error(`Vinterkilden svarede HTTP ${response.status}.`);
  const modified = response.headers.get("last-modified"),
    epoch = Date.parse(modified ?? "");
  if (!Number.isFinite(epoch) || epoch > Date.now() + 300000)
    throw new Error("Vinterkilden mangler et gyldigt datatidspunkt.");
  const data: unknown = await response.json(),
    updatedAt = new Date(epoch).toISOString();
  cachedFeed = { time: Date.now(), updatedAt, data };
  return cachedFeed;
}
export async function decodeWinterTile(
  bytes: Uint8Array,
  tile: GridTile,
): Promise<RoadLine[]> {
  const vector = new VectorTile(new Pbf(bytes)),
    lines: RoadLine[] = [];
  for (const [name, layer] of Object.entries(vector.layers)) {
    if (layer.length > 15000) throw new Error("Vinterkortfeltet er for stort.");
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type !== 2) continue;
      const featureId = String(f.properties.featureId ?? "");
      if (!/^\d+$/.test(featureId)) continue;
      const geometry = f.loadGeometry();
      for (let j = 0; j < geometry.length; j++) {
        const line = geometry[j];
        if (line.length < 2 || line.length > 20000) continue;
        const xy = line.map(
          (p) =>
            [
              tile.left + (p.x / f.extent) * tile.span,
              tile.top - (p.y / f.extent) * tile.span,
            ] as [number, number],
        );
        const bounds: [number, number, number, number] = [
          Math.min(...xy.map((p) => p[0])),
          Math.min(...xy.map((p) => p[1])),
          Math.max(...xy.map((p) => p[0])),
          Math.max(...xy.map((p) => p[1])),
        ];
        lines.push({
          key: `${tile.key}:${name}:${i}:${j}`,
          featureId,
          xy,
          bounds,
        });
      }
    }
  }
  return lines;
}
async function loadTile(
  version: string,
  tile: GridTile,
  signal: AbortSignal,
  proxy?: string,
) {
  const key = `${version}/${tile.key}`,
    cached = tileCache.get(key);
  if (cached) return cached;
  const response = await fetch(
    proxy
      ? `${proxy}/v1/winter/tiles/${version}/${tile.key}`
      : `${WINTER_TILES}/v${version}/${tile.key}.pbf`,
    { signal },
  );
  if (response.status === 404) return [];
  if (!response.ok)
    throw new Error(`Vinterkortfelt svarede HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 4e6)
    throw new Error("Vinterkortfeltet overskrider størrelsesgrænsen.");
  const lines = await decodeWinterTile(bytes, tile);
  tileCache.set(key, lines);
  if (tileCache.size > 160) tileCache.delete(tileCache.keys().next().value!);
  return lines;
}
export async function fetchRouteWinter(
  route: TripRoute,
  parentSignal?: AbortSignal,
  proxy?: string,
): Promise<RouteWinter> {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 35000);
  const cancel = () => controller.abort();
  parentSignal?.addEventListener("abort", cancel, { once: true });
  try {
    if (parentSignal?.aborted) controller.abort();
    const current = await feed(controller.signal, proxy);
    if (Date.now() - Date.parse(current.updatedAt) > 30 * 60000)
      return {
        ...unavailableWinter(
          "Vinterkildens seneste opdatering er mere end 30 minutter gammel.",
        ),
        dataUpdatedAt: current.updatedAt,
      };
    const records = parseWinterRecords(current.data, current.updatedAt),
      metadata = await jsonRequest<unknown>(
        proxy ? `${proxy}/v1/winter/metadata` : WINTER_METADATA,
        { signal: controller.signal },
      ),
      version = parseWinterVersion(metadata);
    const points = sampleRoute(
      route.points,
      Math.max(2, Math.min(201, Math.ceil(route.distanceKm) + 1)),
    );
    const samples = points.map((p) => ({
      point: p,
      xy: projected(p),
      tiles: winterTilesForPoint(p, projected(p)),
    }));
    const tiles = new Map<string, GridTile>();
    for (const sample of samples)
      for (const tile of sample.tiles) tiles.set(tile.key, tile);
    const selected = [...tiles.values()].slice(0, 96),
      data = new Map<string, RoadLine[]>();
    let failed = 0;
    for (let offset = 0; offset < selected.length; offset += 4) {
      const batch = selected.slice(offset, offset + 4);
      await Promise.all(
        batch.map(async (t) => {
          try {
            data.set(
              t.key,
              await loadTile(version, t, controller.signal, proxy),
            );
          } catch {
            failed++;
          }
        }),
      );
      if (controller.signal.aborted) break;
    }
    const sections = new Map<string, WinterSection>();
    let matched = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i],
        candidates: { line: RoadLine; distance: number }[] = [];
      for (const tile of s.tiles)
        for (const line of data.get(tile.key) ?? []) {
          if (!records.has(line.featureId)) continue;
          const b = line.bounds;
          if (
            s.xy[0] < b[0] - 35 ||
            s.xy[0] > b[2] + 35 ||
            s.xy[1] < b[1] - 35 ||
            s.xy[1] > b[3] + 35
          )
            continue;
          const distance = distanceToLine(s.xy, line.xy);
          if (distance <= 35) candidates.push({ line, distance });
        }
      candidates.sort((a, b) => a.distance - b.distance);
      const nearest = candidates[0],
        other = candidates.find(
          (c) => c.line.featureId !== nearest?.line.featureId,
        );
      if (!nearest || (other && other.distance - nearest.distance < 8))
        continue;
      const record = records.get(nearest.line.featureId)!;
      matched++;
      const prior = sections.get(nearest.line.key);
      if (prior) {
        prior.matchedSamples++;
        continue;
      }
      const coordinates = nearest.line.xy.map((xy) => {
        const p = proj4(DK_PROJECTION, "EPSG:4326", xy);
        return { lat: p[1], lon: p[0] };
      });
      sections.set(nearest.line.key, {
        ...record,
        id: nearest.line.key,
        points: coordinates,
        matchedSamples: 1,
      });
      if (i % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const warnings = [
      "Geografisk nærhed til vintervejnettet er ikke en garanti for den præcise vej. Tvetydige eller umatchede rutepunkter vises som ukendte.",
      "Registreret saltning/snerydning er ikke en måling af restsalt.",
    ];
    if (failed || selected.length < tiles.size)
      warnings.push(
        "Nogle vinterkortfelter kunne ikke kontrolleres. Dækningen er ufuldstændig.",
      );
    return {
      provider: "vejdirektoratet",
      status: "available",
      fetchedAt: new Date().toISOString(),
      dataUpdatedAt: current.updatedAt,
      sourceUrl: WINTER_SOURCE,
      totalSamples: points.length,
      matchedSamples: matched,
      sections: [...sections.values()],
      warnings,
    };
  } catch (error) {
    return unavailableWinter(
      `Vinteroplysninger kunne ikke hentes. ${errorMessage(error)}`,
    );
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", cancel);
  }
}
