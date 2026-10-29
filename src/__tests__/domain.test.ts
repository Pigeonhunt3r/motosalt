import { fuelStops } from "../domain";
describe("Fuel planning", () => {
  it("reserves 25 percent of the shortest supplied range", () => {
    expect(fuelStops(148, 100)).toEqual([75]);
    expect(fuelStops(200, 60)).toEqual([45, 90, 135, 180]);
  });
  it("does not invent a stop after arrival", () => {
    expect(fuelStops(75, 100)).toEqual([]);
    expect(fuelStops(74, 100)).toEqual([]);
  });
  it.each([0, -1, 59, 501, NaN, Infinity])(
    "rejects invalid range %s",
    (range) => expect(fuelStops(148, range)).toEqual([]),
  );
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid route distance %s",
    (distance) => expect(fuelStops(distance, 100)).toEqual([]),
  );
});
