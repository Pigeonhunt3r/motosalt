import { mkdir } from "node:fs/promises";
import path from "node:path";
import { buildServer } from "./app";
async function main() {
  try {
    process.loadEnvFile(path.join(process.cwd(), ".env"));
  } catch (error) {
    if (!(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ))
      throw error;
  }
  const databasePath =
    process.env.MOTOSALT_DATABASE_PATH ??
    path.join(process.cwd(), ".data", "motosalt.sqlite");
  await mkdir(path.dirname(databasePath), { recursive: true });
  const app = await buildServer({
    databasePath,
    corsOrigins: (process.env.MOTOSALT_CORS_ORIGINS ?? "")
      .split(",")
      .filter(Boolean),
  });
  const port = Number(process.env.MOTOSALT_API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("MOTOSALT_API_PORT skal være en gyldig port.");
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Motosalt API klar på port ${port}.`);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => void app.close().then(() => process.exit(0)));
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
