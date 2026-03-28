import { beforeEach, describe, expect, it } from "bun:test";
import { authHeader, createApp, fakePet, jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = createApp();

function addDays(date: string, offset: number) {
  const [year, month, day] = date.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day);
  return new Date(base + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

describe("Stats Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("GET /api/stats/:petId", () => {
    it("returns complete stats payload for an authorized request", async () => {
      const headers = await authHeader("user-1");
      const pet = fakePet();
      const today = new Date().toISOString().slice(0, 10);
      const sixDaysAgo = addDays(today, -6);
      const twentyNineDaysAgo = addDays(today, -29);

      mockDb._results.select = [[pet], []];
      mockDb._results.execute = [
        [
          { day: sixDaysAgo, count: 2 },
          { day: today, count: 5 },
        ],
        [
          { day: twentyNineDaysAgo, count: 1 },
          { day: today, count: 8 },
        ],
        [
          { hour: 8, count: 3 },
          { hour: 21, count: 2 },
        ],
        [
          { type: "walking", count: 4 },
          { type: "sleeping", count: 1 },
        ],
        [
          { type: "walking", count: 5 },
          { type: "eating", count: 3 },
        ],
        [
          { type: "walking", count: 3 },
          { type: "sleeping", count: 2 },
        ],
      ];

      const res = await app.request(jsonReq("GET", "/api/stats/pet-1", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(mockDb._calls.select).toHaveLength(1);
      expect(mockDb._calls.execute).toHaveLength(6);

      expect(json.weekBars).toHaveLength(7);
      expect(json.weekBars[0]).toEqual({ day: sixDaysAgo, count: 2 });
      expect(json.weekBars[6]).toEqual({ day: today, count: 5 });

      expect(json.dayBars).toHaveLength(24);
      expect(json.dayBars[8]).toEqual({ hour: 8, count: 3 });
      expect(json.dayBars[21]).toEqual({ hour: 21, count: 2 });

      expect(json.monthBars).toHaveLength(30);
      expect(json.monthBars[0]).toEqual({ day: twentyNineDaysAgo, count: 1 });
      expect(json.monthBars[29]).toEqual({ day: today, count: 8 });

      expect(json.pieItems).toEqual([
        { type: "walking", count: 4, percentage: 80 },
        { type: "sleeping", count: 1, percentage: 20 },
      ]);
      expect(json.monthPieItems).toEqual([
        { type: "walking", count: 5, percentage: 62.5 },
        { type: "eating", count: 3, percentage: 37.5 },
      ]);
      expect(json.daySummary).toEqual({
        date: today,
        totalCount: 5,
        dominantAction: "walking",
        actionCounts: {
          walking: 3,
          sleeping: 2,
        },
      });
    });

    it("returns 404 when the user cannot access the pet", async () => {
      const headers = await authHeader("user-2");

      mockDb._results.select = [[], []];

      const res = await app.request(jsonReq("GET", "/api/stats/pet-1", { headers }));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Pet not found" });
      expect(mockDb._calls.select).toHaveLength(2);
      expect(mockDb._calls.execute).toHaveLength(0);
    });

    it("returns zero-filled buckets when there is no behavior data", async () => {
      const headers = await authHeader("user-1");
      const pet = fakePet();
      const today = new Date().toISOString().slice(0, 10);

      mockDb._results.select = [[pet], []];
      mockDb._results.execute = [[], [], [], [], [], []];

      const res = await app.request(jsonReq("GET", "/api/stats/pet-1", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.weekBars).toHaveLength(7);
      expect(json.weekBars.every((item: { count: number }) => item.count === 0)).toBe(true);
      expect(json.dayBars).toHaveLength(24);
      expect(json.dayBars.every((item: { count: number }) => item.count === 0)).toBe(true);
      expect(json.monthBars).toHaveLength(30);
      expect(json.monthBars.every((item: { count: number }) => item.count === 0)).toBe(true);
      expect(json.pieItems).toEqual([]);
      expect(json.monthPieItems).toEqual([]);
      expect(json.daySummary).toEqual({
        date: today,
        totalCount: 0,
        dominantAction: null,
        actionCounts: {},
      });
    });
  });
});
