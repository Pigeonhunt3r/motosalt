import { test } from "node:test";
import assert from "node:assert/strict";
import { buildServer } from "./app";
import { tripFixture } from "../tests/fixtures/trip";
import { defaultRidePreferences } from "../src/core/models";
const route = tripFixture({ ...defaultRidePreferences, minutes: 180 }).route;
const draft = {
  name: "Fyn på to hjul",
  memberName: "Arrangør",
  rangeKm: 180,
  style: "sweeping",
  meeting: "Odense havn",
  departureAt: null,
  route,
};
test("Private group flow, roles, messages, positions and removal", async () => {
  const app = await buildServer({ rateLimit: false });
  try {
    const created = await app.inject({
      method: "POST",
      url: "/v1/groups",
      payload: draft,
    });
    assert.equal(created.statusCode, 201);
    const { group, session } = created.json();
    const auth = { authorization: `Bearer ${session.token}` };
    assert.equal((await app.inject(`/v1/groups/${group.id}`)).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/v1/groups/${group.id}/join`,
          payload: {
            inviteCode: "not-a-valid-invitation-code",
            name: "Ven",
            rangeKm: 100,
            style: "twisty",
          },
        })
      ).statusCode,
      404,
    );
    const joined = await app.inject({
      method: "POST",
      url: `/v1/groups/${group.id}/join`,
      payload: {
        inviteCode: session.inviteCode,
        name: "Ven",
        rangeKm: 100,
        style: "twisty",
      },
    });
    assert.equal(joined.statusCode, 201);
    const friend = joined.json().session,
      friendAuth = { authorization: `Bearer ${friend.token}` };
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/groups/${group.id}`,
          headers: friendAuth,
          payload: { meeting: "Et andet sted" },
        })
      ).statusCode,
      403,
    );
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/groups/${group.id}/me`,
      headers: friendAuth,
      payload: { status: "fuel", location: { lat: 55.4, lon: 10.4 } },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(
      updated
        .json()
        .members.find((m: { id: string }) => m.id === friend.memberId).status,
      "fuel",
    );
    assert.equal(
      updated
        .json()
        .members.find((m: { id: string }) => m.id === friend.memberId).location
        .lat,
      55.4,
    );
    await app.inject({
      method: "PATCH",
      url: `/v1/groups/${group.id}/me`,
      headers: friendAuth,
      payload: { location: null },
    });
    const role = await app.inject({
      method: "PATCH",
      url: `/v1/groups/${group.id}`,
      headers: auth,
      payload: {
        meeting: "Kerteminde havn",
        roles: [{ memberId: friend.memberId, role: "tail" }],
      },
    });
    assert.equal(role.statusCode, 200);
    assert.equal(role.json().meeting, "Kerteminde havn");
    assert.equal(role.json().members[1].role, "tail");
    const message = await app.inject({
      method: "POST",
      url: `/v1/groups/${group.id}/messages`,
      headers: friendAuth,
      payload: { text: "Jeg er ved havnen." },
    });
    assert.equal(message.json().messages[0].author, "Ven");
    const read = await app.inject({
      url: `/v1/groups/${group.id}`,
      headers: auth,
    });
    const text = read.body;
    assert.equal(text.includes(session.token), false);
    assert.equal(text.includes(session.inviteCode), false);
    assert.equal(text.includes("token_hash"), false);
    assert.equal(read.json().members[1].location, null);
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/v1/groups/${group.id}/me`,
          headers: friendAuth,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject({ url: `/v1/groups/${group.id}`, headers: friendAuth }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/v1/groups/${group.id}/me`,
          headers: auth,
        })
      ).json().deletedGroup,
      true,
    );
    assert.equal(
      (await app.inject({ url: `/v1/groups/${group.id}`, headers: auth }))
        .statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});
test("Validation rejects malformed routes and privilege escalation", async () => {
  const app = await buildServer({ rateLimit: false });
  try {
    for (const patch of [
      { rangeKm: 0 },
      { rangeKm: 1000 },
      { route: { ...route, points: [{ lat: 99, lon: 2 }] } },
      { memberName: "   " },
      { departureAt: "nonsense" },
    ])
      assert.equal(
        (
          await app.inject({
            method: "POST",
            url: "/v1/groups",
            payload: { ...draft, ...patch },
          })
        ).statusCode,
        400,
      );
    const { group, session } = (
      await app.inject({ method: "POST", url: "/v1/groups", payload: draft })
    ).json();
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/groups/${group.id}/me`,
      headers: { authorization: `Bearer ${session.token}` },
      payload: { owner: 1, role: "tail", status: "fuel" },
    });
    // Ajv removes unknown fields; neither may change privileges or roles.
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().members[0].role, "leader");
    const stranger = await app.inject({
      method: "PATCH",
      url: `/v1/groups/${group.id}/me`,
      headers: { authorization: `Bearer ${"x".repeat(32)}` },
      payload: { status: "fuel" },
    });
    assert.equal(stranger.statusCode, 401);
  } finally {
    await app.close();
  }
});
test("Rider reports have explicit provenance and validate location", async () => {
  const app = await buildServer({ rateLimit: false });
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/reports",
          payload: { lat: 200, lon: 10, condition: "salt", note: "Test" },
        })
      ).statusCode,
      400,
    );
    const created = await app.inject({
      method: "POST",
      url: "/v1/reports",
      payload: {
        lat: 55.4,
        lon: 10.4,
        condition: "salt",
        note: "Synlige hvide spor.",
      },
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.json().source, "rider");
    const reports = (await app.inject("/v1/reports")).json();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].condition, "salt");
    assert.equal(reports[0].source, "rider");
  } finally {
    await app.close();
  }
});
test("Web preflight permits actual mutation methods only for allowed origins", async () => {
  const app = await buildServer({ rateLimit: false });
  try {
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/v1/groups/test/me",
      headers: {
        origin: "http://127.0.0.1:8081",
        "access-control-request-method": "PATCH",
      },
    });
    assert.equal(allowed.statusCode, 204);
    assert.match(
      String(allowed.headers["access-control-allow-methods"]),
      /PATCH/,
    );
    assert.match(
      String(allowed.headers["access-control-allow-methods"]),
      /DELETE/,
    );
    const denied = await app.inject({
      method: "OPTIONS",
      url: "/v1/groups/test/me",
      headers: {
        origin: "https://unconfigured.example",
        "access-control-request-method": "PATCH",
      },
    });
    assert.equal(denied.headers["access-control-allow-origin"], undefined);
  } finally {
    await app.close();
  }
});
