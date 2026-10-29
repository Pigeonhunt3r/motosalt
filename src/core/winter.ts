import type { Point, WinterRoadCondition } from "./models";
export const WINTER_SOURCE = "https://trafikkort.vejdirektoratet.dk/";
export const WINTER_FEED =
  "https://storage.googleapis.com/trafikkort-data-tiles/winter.json";
export const WINTER_METADATA =
  "https://storage.googleapis.com/trafikkort-data-tiles/winter-network-metadata.json";
export const WINTER_TILES = "https://tiles.trafikinfo.net/winter-network";
// Projection extent and default 512px vector tile grid used by the official map.
export const WINTER_GRID = {
  minX: 120000,
  maxY: 6500000,
  width: 1258291.2,
  zoom: 8,
};
export interface WinterRecord {
  id: string;
  roadClass: "state" | "municipal";
  lastSaltingAt: string | null;
  saltingNow: boolean;
  condition: WinterRoadCondition;
}
export function parseWinterRecords(
  value: unknown,
  sourceTime: string,
): Map<string, WinterRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Vinterkildens dataformat er ændret.");
  const result = new Map<string, WinterRecord>(),
    source = Date.parse(sourceTime);
  if (!Number.isFinite(source))
    throw new Error("Vinterdata mangler et gyldigt opdateringstidspunkt.");
  for (const [id, row] of Object.entries(value)) {
    if (!/^\d+$/.test(id) || !Array.isArray(row) || row.length < 5) continue;
    const roadClass = Number(row[0]),
      epoch = Number(row[1]),
      condition = Number(row[3]);
    if (
      ![11, 21, 22, 23, 24].includes(roadClass) ||
      typeof row[2] !== "boolean"
    )
      continue;
    const event =
      epoch > 0 && Number.isFinite(epoch) && epoch * 1000 <= source + 300000
        ? new Date(epoch * 1000).toISOString()
        : null;
    result.set(id, {
      id,
      roadClass: roadClass === 11 ? "state" : "municipal",
      lastSaltingAt: event,
      saltingNow: row[2],
      condition:
        condition === 201
          ? "normal"
          : condition === 202
            ? "winter"
            : condition === 203
              ? "outdated"
              : "unknown",
    });
  }
  if (!result.size && Object.keys(value).length)
    throw new Error("Ingen genkendelige vinteroplysninger i svaret.");
  return result;
}
export function parseWinterVersion(value: unknown): string {
  if (!value || typeof value !== "object" || !("version" in value))
    throw new Error("Vintervejnettets version mangler.");
  const version = String(value.version);
  if (!/^\d{1,16}$/.test(version))
    throw new Error("Vintervejnettets version har ukendt format.");
  return version;
}
export interface GridTile {
  z: number;
  x: number;
  y: number;
  key: string;
  span: number;
  left: number;
  top: number;
}
export function winterTilesForPoint(
  point: Point,
  projected: [number, number],
): GridTile[] {
  if (point.lat < 54 || point.lat > 58.3 || point.lon < 7 || point.lon > 16)
    return [];
  const g = WINTER_GRID,
    span = g.width / 2 ** g.zoom,
    x = Math.floor((projected[0] - g.minX) / span),
    y = Math.floor((g.maxY - projected[1]) / span);
  const rx = projected[0] - g.minX - x * span,
    ry = g.maxY - projected[1] - y * span;
  const xs = [x],
    ys = [y];
  if (rx < 45) xs.push(x - 1);
  if (span - rx < 45) xs.push(x + 1);
  if (ry < 45) ys.push(y - 1);
  if (span - ry < 45) ys.push(y + 1);
  return xs.flatMap((tx) =>
    ys.map((ty) => ({
      z: g.zoom,
      x: tx,
      y: ty,
      key: `${g.zoom}/${tx}/${ty}`,
      span,
      left: g.minX + tx * span,
      top: g.maxY - ty * span,
    })),
  );
}
export function distanceToLine(
  point: [number, number],
  line: [number, number][],
): number {
  let min = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      den = dx * dx + dy * dy,
      t = den
        ? Math.max(
            0,
            Math.min(
              1,
              ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / den,
            ),
          )
        : 0;
    min = Math.min(
      min,
      Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy),
    );
  }
  return min;
}
