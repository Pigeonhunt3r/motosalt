import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerWinterProxy } from "./winter-proxy";
test("winter proxy caches only fixed public resources and preserves source time", async () => {
  const app = Fastify();
  const urls: string[] = [];
  registerWinterProxy(app, async (url) => {
    urls.push(String(url));
    return new Response('{"1":[11,0,false,201,1]}', {
      headers: { "Last-Modified": "Tue, 27 Oct 2026 10:00:00 GMT" },
    });
  });
  try {
    for (let i = 0; i < 2; i++) {
      const r = await app.inject("/v1/winter/feed");
      assert.equal(r.statusCode, 200);
      assert.equal(r.headers["last-modified"], "Tue, 27 Oct 2026 10:00:00 GMT");
      assert.equal(r.json()["1"][0], 11);
    }
    assert.deepEqual(urls, [
      "https://storage.googleapis.com/trafikkort-data-tiles/winter.json",
    ]);
    assert.equal(
      (await app.inject("/v1/winter/tiles/147/8/100/50")).statusCode,
      200,
    );
    for (const path of [
      "/v1/winter/tiles/no/8/1/1",
      "/v1/winter/tiles/147/12/1/1",
      "/v1/winter/tiles/147/8/999/1",
    ])
      assert.equal((await app.inject(path)).statusCode, 400);
    assert.equal(urls.length, 2);
  } finally {
    await app.close();
  }
});
test("upstream failure becomes an explicit unknown response and is not cached", async () => {
  const app = Fastify();
  let calls = 0;
  registerWinterProxy(app, async () => {
    calls++;
    return new Response("unavailable", { status: 503 });
  });
  try {
    for (let i = 0; i < 2; i++) {
      const r = await app.inject("/v1/winter/feed");
      assert.equal(r.statusCode, 502);
      assert.match(r.json().message, /ukendt/);
    }
    assert.equal(calls, 2);
  } finally {
    await app.close();
  }
});
