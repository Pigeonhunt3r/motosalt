import { registerWinterProxy } from "./winter-proxy";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { validPoint, validRoute } from "../src/core/models";
import type {
  TripRoute,
  RideGroup,
  GroupMember,
  RiderReport,
  MemberStatus,
  MemberRole,
} from "../src/core/models";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const token = () => randomBytes(24).toString("base64url");
const now = () => new Date().toISOString();
const clean = (v: unknown, max = 120) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const statuses: MemberStatus[] = ["ready", "fuel", "break", "stopped"];
const roles: MemberRole[] = ["leader", "rider", "tail"];
interface GroupRow {
  id: string;
  name: string;
  meeting: string;
  departure_at: string | null;
  route_json: string;
  invite_hash: string;
  updated_at: string;
}
interface MemberRow {
  id: string;
  group_id: string;
  name: string;
  range_km: number;
  role: MemberRole;
  status: MemberStatus;
  style: "open" | "sweeping" | "twisty";
  location_json: string | null;
  token_hash: string;
  owner: number;
  updated_at: string;
}
interface MessageRow {
  id: string;
  name: string;
  text: string;
  created_at: string;
}
interface ReportRow {
  id: string;
  lat: number;
  lon: number;
  condition: RiderReport["condition"];
  note: string;
  created_at: string;
}
export async function buildServer(
  options: {
    databasePath?: string;
    rateLimit?: boolean;
    corsOrigins?: string[];
  } = {},
) {
  const app = Fastify({ logger: false, bodyLimit: 1500000, trustProxy: false });
  await app.register(cors, {
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"],
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      let allowed = false;
      try {
        const u = new URL(origin);
        allowed =
          ["localhost", "127.0.0.1"].includes(u.hostname) ||
          (options.corsOrigins ?? []).includes(origin);
      } catch {}
      callback(null, allowed);
    },
  });
  if (options.rateLimit !== false)
    await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  const db = new DatabaseSync(options.databasePath ?? ":memory:");
  db.exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS groups(id TEXT PRIMARY KEY,name TEXT NOT NULL,meeting TEXT NOT NULL,departure_at TEXT,route_json TEXT NOT NULL,invite_hash TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,name TEXT NOT NULL,range_km INTEGER NOT NULL,role TEXT NOT NULL,status TEXT NOT NULL,style TEXT NOT NULL,location_json TEXT,token_hash TEXT UNIQUE NOT NULL,owner INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,text TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,lat REAL NOT NULL,lon REAL NOT NULL,condition TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS members_group ON members(group_id);
 CREATE INDEX IF NOT EXISTS messages_group ON messages(group_id,created_at);
 CREATE INDEX IF NOT EXISTS reports_created ON reports(created_at);`);
  app.addHook("onClose", async () => db.close());
  const getGroup = (id: string) =>
    db.prepare("SELECT * FROM groups WHERE id=?").get(id) as unknown as
      GroupRow | undefined;
  const getMember = (groupId: string, bearer: string | undefined) => {
    if (!bearer?.startsWith("Bearer ") || bearer.length > 200) return undefined;
    return db
      .prepare("SELECT * FROM members WHERE group_id=? AND token_hash=?")
      .get(groupId, hash(bearer.slice(7))) as unknown as MemberRow | undefined;
  };
  const view = (g: GroupRow): RideGroup => ({
    id: g.id,
    name: g.name,
    meeting: g.meeting,
    departureAt: g.departure_at,
    route: JSON.parse(g.route_json) as TripRoute,
    updatedAt: g.updated_at,
    members: (
      db
        .prepare(
          "SELECT * FROM members WHERE group_id=? ORDER BY owner DESC,updated_at",
        )
        .all(g.id) as unknown as MemberRow[]
    ).map((m) => ({
      id: m.id,
      name: m.name,
      rangeKm: m.range_km,
      role: m.role,
      status: m.status,
      style: m.style,
      updatedAt: m.updated_at,
      location: m.location_json ? JSON.parse(m.location_json) : null,
    })),
    messages: (
      db
        .prepare(
          "SELECT messages.id,members.name,messages.text,messages.created_at FROM messages JOIN members ON messages.member_id=members.id WHERE messages.group_id=? ORDER BY messages.created_at DESC LIMIT 50",
        )
        .all(g.id) as unknown as MessageRow[]
    )
      .reverse()
      .map((m) => ({
        id: m.id,
        author: m.name,
        text: m.text,
        createdAt: m.created_at,
      })),
  });
  registerWinterProxy(app);
  app.get("/health", async () => ({
    status: "ok",
    service: "motosalt",
    version: 2,
  }));
  const memberProperties = {
    name: { type: "string", minLength: 1, maxLength: 60 },
    rangeKm: { type: "integer", minimum: 60, maximum: 500 },
    style: { type: "string", enum: ["open", "sweeping", "twisty"] },
  };
  app.post<{
    Body: {
      name: string;
      memberName: string;
      rangeKm: number;
      style: "open" | "sweeping" | "twisty";
      meeting: string;
      departureAt?: string | null;
      route: TripRoute;
    };
  }>(
    "/v1/groups",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "memberName",
            "rangeKm",
            "style",
            "meeting",
            "route",
          ],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 60 },
            memberName: memberProperties.name,
            rangeKm: memberProperties.rangeKm,
            style: memberProperties.style,
            meeting: { type: "string", minLength: 1, maxLength: 200 },
            departureAt: {
              anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }],
            },
            route: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const b = request.body;
      if (
        !clean(b.name) ||
        !clean(b.memberName) ||
        !clean(b.meeting) ||
        !validRoute(b.route) ||
        (b.departureAt && !Number.isFinite(Date.parse(b.departureAt)))
      )
        return reply.code(400).send({ error: "Ugyldig gruppe eller rute." });
      const id = randomUUID(),
        memberId = randomUUID(),
        memberToken = token(),
        inviteCode = token(),
        time = now();
      db.exec("BEGIN");
      try {
        db.prepare("INSERT INTO groups VALUES(?,?,?,?,?,?,?)").run(
          id,
          clean(b.name, 60),
          clean(b.meeting, 200),
          b.departureAt ?? null,
          JSON.stringify(b.route),
          hash(inviteCode),
          time,
        );
        db.prepare("INSERT INTO members VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
          memberId,
          id,
          clean(b.memberName, 60),
          b.rangeKm,
          "leader",
          "ready",
          b.style,
          null,
          hash(memberToken),
          1,
          time,
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return reply.code(201).send({
        group: view(getGroup(id)!),
        session: {
          id,
          memberId,
          token: memberToken,
          owner: true,
          inviteCode,
        },
      });
    },
  );
  app.post<{
    Params: { id: string };
    Body: {
      inviteCode: string;
      name: string;
      rangeKm: number;
      style: "open" | "sweeping" | "twisty";
    };
  }>(
    "/v1/groups/:id/join",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["inviteCode", "name", "rangeKm", "style"],
          properties: {
            inviteCode: { type: "string", minLength: 20, maxLength: 100 },
            ...memberProperties,
          },
        },
      },
    },
    async (request, reply) => {
      const g = getGroup(request.params.id),
        b = request.body;
      if (!g || g.invite_hash !== hash(b.inviteCode))
        return reply
          .code(404)
          .send({ error: "Invitationen findes ikke eller er udløbet." });
      if (!clean(b.name))
        return reply.code(400).send({ error: "Skriv dit navn." });
      const count = db
        .prepare("SELECT COUNT(*) AS count FROM members WHERE group_id=?")
        .get(g.id) as { count: number };
      if (count.count >= 20)
        return reply
          .code(409)
          .send({ error: "Gruppen har allerede 20 deltagere." });
      const memberId = randomUUID(),
        memberToken = token(),
        time = now();
      db.prepare("INSERT INTO members VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(
        memberId,
        g.id,
        clean(b.name, 60),
        b.rangeKm,
        "rider",
        "ready",
        b.style,
        null,
        hash(memberToken),
        0,
        time,
      );
      return reply.code(201).send({
        group: view(g),
        session: { id: g.id, memberId, token: memberToken, owner: false },
      });
    },
  );
  app.get<{ Params: { id: string } }>(
    "/v1/groups/:id",
    async (request, reply) => {
      const g = getGroup(request.params.id),
        m = getMember(request.params.id, request.headers.authorization);
      if (!g || !m)
        return reply
          .code(401)
          .send({ error: "Gruppen kræver en gyldig deltageradgang." });
      return view(g);
    },
  );
  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      rangeKm?: number;
      style?: GroupMember["style"];
      status?: MemberStatus;
      location?: { lat: number; lon: number } | null;
    };
  }>(
    "/v1/groups/:id/me",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            ...memberProperties,
            status: { type: "string", enum: statuses },
            location: {
              anyOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["lat", "lon"],
                  properties: {
                    lat: { type: "number", minimum: -85, maximum: 85 },
                    lon: { type: "number", minimum: -180, maximum: 180 },
                  },
                },
              ],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const m = getMember(request.params.id, request.headers.authorization),
        g = getGroup(request.params.id);
      if (!m || !g)
        return reply.code(401).send({ error: "Ugyldig deltageradgang." });
      const b = request.body;
      if (b.name !== undefined && !clean(b.name))
        return reply.code(400).send({ error: "Navnet er tomt." });
      const location =
        b.location === undefined
          ? m.location_json
          : b.location === null
            ? null
            : JSON.stringify({ ...b.location, updatedAt: now() });
      db.prepare(
        "UPDATE members SET name=?,range_km=?,style=?,status=?,location_json=?,updated_at=? WHERE id=?",
      ).run(
        b.name === undefined ? m.name : clean(b.name, 60),
        b.rangeKm ?? m.range_km,
        b.style ?? m.style,
        b.status ?? m.status,
        location,
        now(),
        m.id,
      );
      return view(g);
    },
  );
  app.patch<{
    Params: { id: string };
    Body: {
      meeting?: string;
      departureAt?: string | null;
      route?: TripRoute;
      roles?: { memberId: string; role: MemberRole }[];
    };
  }>(
    "/v1/groups/:id",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            meeting: { type: "string", minLength: 1, maxLength: 200 },
            departureAt: {
              anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }],
            },
            route: { type: "object" },
            roles: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["memberId", "role"],
                properties: {
                  memberId: { type: "string", maxLength: 80 },
                  role: { type: "string", enum: roles },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const m = getMember(request.params.id, request.headers.authorization),
        g = getGroup(request.params.id);
      if (!m || !g)
        return reply.code(401).send({ error: "Ugyldig deltageradgang." });
      if (!m.owner)
        return reply
          .code(403)
          .send({ error: "Kun arrangøren kan ændre planen." });
      const b = request.body;
      if (
        (b.route !== undefined && !validRoute(b.route)) ||
        (b.departureAt && !Number.isFinite(Date.parse(b.departureAt))) ||
        (b.meeting !== undefined && !clean(b.meeting))
      )
        return reply.code(400).send({ error: "Ugyldig plan." });
      for (const role of b.roles ?? []) {
        if (
          !db
            .prepare("SELECT id FROM members WHERE id=? AND group_id=?")
            .get(role.memberId, g.id)
        )
          return reply
            .code(400)
            .send({ error: "Deltageren findes ikke i gruppen." });
      }
      db.exec("BEGIN");
      try {
        for (const role of b.roles ?? []) {
          const target = db
            .prepare("SELECT id FROM members WHERE id=? AND group_id=?")
            .get(role.memberId, g.id);
          if (!target) throw new Error("Deltageren findes ikke i gruppen.");
          if (role.role !== "rider")
            db.prepare(
              "UPDATE members SET role='rider' WHERE group_id=? AND role=?",
            ).run(g.id, role.role);
          db.prepare("UPDATE members SET role=? WHERE id=? AND group_id=?").run(
            role.role,
            role.memberId,
            g.id,
          );
        }
        db.prepare(
          "UPDATE groups SET meeting=?,departure_at=?,route_json=?,updated_at=? WHERE id=?",
        ).run(
          b.meeting === undefined ? g.meeting : clean(b.meeting, 200),
          b.departureAt === undefined ? g.departure_at : b.departureAt,
          b.route === undefined ? g.route_json : JSON.stringify(b.route),
          now(),
          g.id,
        );
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return view(getGroup(g.id)!);
    },
  );
  app.post<{ Params: { id: string }; Body: { text: string } }>(
    "/v1/groups/:id/messages",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["text"],
          properties: {
            text: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const m = getMember(request.params.id, request.headers.authorization),
        g = getGroup(request.params.id);
      if (!m || !g)
        return reply.code(401).send({ error: "Ugyldig deltageradgang." });
      if (!clean(request.body.text, 500))
        return reply.code(400).send({ error: "Beskeden er tom." });
      db.prepare("INSERT INTO messages VALUES(?,?,?,?,?)").run(
        randomUUID(),
        g.id,
        m.id,
        clean(request.body.text, 500),
        now(),
      );
      return view(g);
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/v1/groups/:id/me",
    async (request, reply) => {
      const m = getMember(request.params.id, request.headers.authorization);
      if (!m) return reply.code(401).send({ error: "Ugyldig deltageradgang." });
      if (m.owner) db.prepare("DELETE FROM groups WHERE id=?").run(m.group_id);
      else db.prepare("DELETE FROM members WHERE id=?").run(m.id);
      return { left: true, deletedGroup: !!m.owner };
    },
  );
  app.get<{ Querystring: { lat?: string; lon?: string } }>(
    "/v1/reports",
    async (_request) => {
      const time = new Date(Date.now() - 48 * 3600000).toISOString();
      const rows = db
        .prepare(
          "SELECT * FROM reports WHERE created_at>=? ORDER BY created_at DESC LIMIT 100",
        )
        .all(time) as unknown as ReportRow[];
      return rows.map((r) => ({
        ...r,
        source: "rider",
        createdAt: r.created_at,
      }));
    },
  );
  app.post<{
    Body: {
      lat: number;
      lon: number;
      condition: RiderReport["condition"];
      note: string;
    };
  }>(
    "/v1/reports",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["lat", "lon", "condition", "note"],
          properties: {
            lat: { type: "number", minimum: -85, maximum: 85 },
            lon: { type: "number", minimum: -180, maximum: 180 },
            condition: {
              type: "string",
              enum: ["salt", "wet", "gravel", "dry"],
            },
            note: { type: "string", minLength: 1, maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!validPoint(request.body) || !clean(request.body.note, 500))
        return reply.code(400).send({ error: "Ugyldig observation." });
      const r = {
        id: randomUUID(),
        ...request.body,
        note: clean(request.body.note, 500),
        createdAt: now(),
        source: "rider" as const,
      };
      db.prepare("INSERT INTO reports VALUES(?,?,?,?,?,?)").run(
        r.id,
        r.lat,
        r.lon,
        r.condition,
        r.note,
        r.createdAt,
      );
      return reply.code(201).send(r);
    },
  );
  return app;
}
