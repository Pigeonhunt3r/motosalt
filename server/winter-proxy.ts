import type { FastifyInstance, FastifyReply } from "fastify";
// Fixed public upstreams only: clients cannot supply URLs or forwarding headers.
export function registerWinterProxy(
  app: FastifyInstance,
  request: typeof fetch = fetch,
) {
  type Entry = {
    body: Buffer;
    modified: string | null;
    time: number;
    type: string;
  };
  const cache = new Map<string, Entry>(),
    pending = new Map<string, Promise<Entry>>();
  let bytes = 0;
  async function load(url: string, type: string, ttl: number): Promise<Entry> {
    const prior = cache.get(url);
    if (prior && Date.now() - prior.time < ttl) return prior;
    const running = pending.get(url);
    if (running) return running;
    const operation = (async () => {
      const response = await request(url, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error("Vinterkilden er midlertidigt utilgængelig.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Tomt svar fra vinterkilden.");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 4_000_000) {
            await reader.cancel();
            throw new Error("Vinterkildens svar er for stort.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const entry = {
        body: Buffer.concat(chunks),
        modified: response.headers.get("last-modified"),
        time: Date.now(),
        type,
      };
      if (prior) {
        bytes -= prior.body.length;
        cache.delete(url);
      }
      while (cache.size >= 100 || bytes + entry.body.length > 20_000_000) {
        const key = cache.keys().next().value;
        if (!key) break;
        bytes -= cache.get(key)!.body.length;
        cache.delete(key);
      }
      cache.set(url, entry);
      bytes += entry.body.length;
      return entry;
    })();
    pending.set(url, operation);
    try {
      return await operation;
    } finally {
      pending.delete(url);
    }
  }
  async function send(
    reply: FastifyReply,
    url: string,
    type: string,
    ttl: number,
  ) {
    try {
      const entry = await load(url, type, ttl);
      reply
        .type(type)
        .header("Cache-Control", `public, max-age=${Math.floor(ttl / 1000)}`);
      if (entry.modified) reply.header("Last-Modified", entry.modified);
      return reply.send(entry.body);
    } catch {
      return reply.code(502).send({
        message: "Vinteroplysninger kunne ikke hentes. Saltstatus er ukendt.",
      });
    }
  }
  app.get("/v1/winter/feed", (_req, reply) =>
    send(
      reply,
      "https://storage.googleapis.com/trafikkort-data-tiles/winter.json",
      "application/json",
      30000,
    ),
  );
  app.get("/v1/winter/metadata", (_req, reply) =>
    send(
      reply,
      "https://storage.googleapis.com/trafikkort-data-tiles/winter-network-metadata.json",
      "application/json",
      60000,
    ),
  );
  app.get<{ Params: { version: string; z: string; x: string; y: string } }>(
    "/v1/winter/tiles/:version/:z/:x/:y",
    (req, reply) => {
      const { version, z, x, y } = req.params;
      if (
        !/^\d{1,16}$/.test(version) ||
        z !== "8" ||
        ![x, y].every((v) => /^\d{1,3}$/.test(v) && Number(v) < 256)
      )
        return reply.code(400).send({ message: "Ugyldigt vinterkortfelt." });
      return send(
        reply,
        `https://tiles.trafikinfo.net/winter-network/v${version}/${z}/${x}/${y}.pbf`,
        "application/vnd.mapbox-vector-tile",
        12 * 3600000,
      );
    },
  );
  app.addHook("onClose", async () => {
    cache.clear();
    pending.clear();
  });
}
