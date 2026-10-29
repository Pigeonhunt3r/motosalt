export const formatDate = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("da-DK", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Ikke aftalt";
export const duration = (minutes: number) =>
  `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} t ` : ""}${Math.round(minutes % 60) ? `${Math.round(minutes % 60)} min` : ""}`.trim();
export function localDateFields(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}
export function parseLocalDate(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return null;
  const d = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(d.getTime())) return null;
  const expected = localDateFields(d);
  return expected.date === date && expected.time === time
    ? d.toISOString()
    : null;
}
