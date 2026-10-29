export type RoadStyle = "sweeping" | "twisty" | "open";
export function fuelStops(distanceKm: number, rangeKm: number): number[] {
  if (
    !Number.isFinite(distanceKm) ||
    !Number.isFinite(rangeKm) ||
    distanceKm <= 0 ||
    rangeKm < 60 ||
    rangeKm > 500
  )
    return [];
  const stops: number[] = [];
  const interval = Math.floor(rangeKm * 0.75);
  for (let km = interval; km < distanceKm; km += interval) stops.push(km);
  return stops;
}
