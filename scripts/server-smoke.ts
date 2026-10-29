import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { tripFixture } from "../tests/fixtures/trip";
import { defaultRidePreferences } from "../src/core/models";
async function unusedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Ingen testport.");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
async function main() {
  const temp = await mkdtemp(path.join(tmpdir(), "motosalt-server-test-")),
    port = await unusedPort();
  await writeFile(
    path.join(temp, ".env"),
    `MOTOSALT_API_PORT=${port}\nMOTOSALT_DATABASE_PATH=${path.join(temp, "test.sqlite")}\n`,
  );
  let child: ReturnType<typeof spawn> | null = null;
  const stop = async () => {
    const c = child;
    if (c && c.exitCode === null) {
      const exit = once(c, "exit");
      c.kill("SIGTERM");
      await exit;
    }
    child = null;
  };
  const start = async () => {
    const env = { ...process.env };
    delete env.MOTOSALT_API_PORT;
    delete env.MOTOSALT_DATABASE_PATH;
    const c = spawn(
      process.execPath,
      [path.resolve("server-dist/server/index.js")],
      {
        cwd: temp,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child = c;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Serveren startede ikke."));
      }, 10000);
      c.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Serverprocessen sluttede før start."));
      });
      c.stdout?.on("data", (buffer) => {
        if (String(buffer).includes("Motosalt API klar")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  };
  try {
    await start();
    const base = `http://127.0.0.1:${port}`;
    assert.equal(
      (await fetch(`${base}/health`).then((r) => r.json())).status,
      "ok",
    );
    const created = await fetch(`${base}/v1/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Persistence check",
        memberName: "Test rider",
        rangeKm: 150,
        style: "sweeping",
        meeting: "Test meeting",
        departureAt: null,
        route: tripFixture({ ...defaultRidePreferences, minutes: 180 }).route,
      }),
    });
    assert.equal(created.status, 201);
    const result = await created.json();
    await stop();
    await start();
    const persisted = await fetch(`${base}/v1/groups/${result.group.id}`, {
      headers: { Authorization: `Bearer ${result.session.token}` },
    });
    assert.equal(persisted.status, 200);
    assert.equal((await persisted.json()).name, "Persistence check");
    assert.equal(
      (
        await fetch(`${base}/v1/groups/${result.group.id}/me`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${result.session.token}` },
        })
      ).status,
      200,
    );
    console.log(
      "PASS compiled API: startup, functional request, restart, SQLite persistence, authorised deletion.",
    );
  } finally {
    await stop();
    await rm(temp, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
