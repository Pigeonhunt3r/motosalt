import {
  parseWinterRecords,
  parseWinterVersion,
  winterTilesForPoint,
  distanceToLine,
  WINTER_GRID,
} from "../core/winter";
const source = "2026-10-27T10:00:00Z",
  epoch = Date.parse(source) / 1000;
it("decodes the official five-value rows and retains unknown timestamps", () => {
  const rows = parseWinterRecords(
    {
      "1": [11, epoch - 3600, true, 202, 112],
      "2": [22, 0, false, 201, 211],
      "3": [31, epoch, false, 201, 312],
      "4": [-99, epoch, false, 201, 112],
    },
    source,
  );
  expect([...rows.keys()]).toEqual(["1", "2"]);
  expect(rows.get("1")).toMatchObject({
    roadClass: "state",
    lastSaltingAt: "2026-10-27T09:00:00.000Z",
    saltingNow: true,
    condition: "winter",
  });
  expect(rows.get("2")).toMatchObject({
    roadClass: "municipal",
    lastSaltingAt: null,
    condition: "normal",
  });
});
it("does not invent a valid event for future, missing or malformed values", () => {
  const rows = parseWinterRecords(
    {
      "1": [21, epoch + 999999, false, 203, 1],
      "2": [21, "bad", false, -99, 1],
      "3": [21, epoch, "false", 201, 1],
    },
    source,
  );
  expect(rows.get("1")).toMatchObject({
    lastSaltingAt: null,
    condition: "outdated",
  });
  expect(rows.get("2")?.lastSaltingAt).toBeNull();
  expect(rows.has("3")).toBe(false);
});
it.each([null, [], { wrong: "format" }, { "3": [31, 0, false, 201, 1] }])(
  "rejects changed/unrecognised feed schema %p",
  (value) => expect(() => parseWinterRecords(value, source)).toThrow(),
);
it("accepts a genuinely empty feed without claiming coverage", () =>
  expect(parseWinterRecords({}, source).size).toBe(0));
it("validates timestamps and exact metadata version formats", () => {
  expect(() => parseWinterRecords({}, "bad")).toThrow();
  expect(parseWinterVersion({ version: 147 })).toBe("147");
  for (const version of ["../secret", null, -1, "x".repeat(100)])
    expect(() => parseWinterVersion({ version })).toThrow();
});
it("selects neighboring tiles at boundaries and excludes points outside Denmark", () => {
  const { minX, maxY, width, zoom } = WINTER_GRID,
    span = width / 2 ** zoom;
  const tiles = winterTilesForPoint({ lat: 55.6, lon: 12 }, [
    minX + 100 * span + 10,
    maxY - 50 * span - 10,
  ]);
  expect(tiles.map((t) => t.key)).toEqual(
    expect.arrayContaining(["8/100/50", "8/99/50", "8/100/49", "8/99/49"]),
  );
  expect(winterTilesForPoint({ lat: 50, lon: 12 }, [500000, 6000000])).toEqual(
    [],
  );
});
it("matches line segments in metres rather than just distant vertices", () => {
  expect(
    distanceToLine(
      [5, 2],
      [
        [0, 0],
        [10, 0],
      ],
    ),
  ).toBe(2);
  expect(
    distanceToLine(
      [-3, 4],
      [
        [0, 0],
        [10, 0],
      ],
    ),
  ).toBe(5);
  expect(
    distanceToLine(
      [3, 4],
      [
        [0, 0],
        [0, 0],
      ],
    ),
  ).toBe(5);
  expect(distanceToLine([0, 0], [])).toBe(Infinity);
});
