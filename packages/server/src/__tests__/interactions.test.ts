import { beforeEach, describe, expect, it } from "bun:test";
import {
  authHeader,
  createApp,
  fakeBinding,
  fakeInteraction,
  fakePet,
  jsonReq,
} from "./helpers";
import { mockDb } from "./setup";

const app = createApp();

describe("Interaction Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("POST /api/interactions", () => {
    it("reports interaction successfully", async () => {
      const timestamp = "2026-04-06T08:30:00.000Z";
      mockDb._results.select = [
        [fakeBinding()],
        [fakePet()],
      ];
      mockDb._results.insert = [[fakeInteraction({ interactionType: "shake", count: 3 })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/interactions", {
          headers,
          body: {
            desktopDeviceId: "desktop-1",
            petId: "pet-1",
            interactionType: "shake",
            count: 3,
            timestamp,
          },
        }),
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.interaction.interactionType).toBe("shake");
      expect((mockDb._calls.insert[0] as { values: Record<string, unknown> }).values).toMatchObject({
        desktopDeviceId: "desktop-1",
        petId: "pet-1",
        interactionType: "shake",
        count: 3,
        timestamp: new Date(timestamp),
      });
    });

    it("returns 400 for invalid interactionType", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/interactions", {
          headers,
          body: {
            desktopDeviceId: "desktop-1",
            petId: "pet-1",
            interactionType: "invalid",
          },
        }),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when count is out of range", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/interactions", {
          headers,
          body: {
            desktopDeviceId: "desktop-1",
            petId: "pet-1",
            interactionType: "touch",
            count: 1001,
          },
        }),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when timestamp is more than one hour in the future", async () => {
      const headers = await authHeader("user-1");
      const futureTimestamp = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const res = await app.request(
        jsonReq("POST", "/api/interactions", {
          headers,
          body: {
            desktopDeviceId: "desktop-1",
            petId: "pet-1",
            interactionType: "touch",
            timestamp: futureTimestamp,
          },
        }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("timestamp 不能晚于当前时间 1 小时");
    });
  });

  describe("GET /api/interactions/:petId/stats", () => {
    it("returns aggregated stats", async () => {
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

      mockDb._results.select = [
        [fakePet()],
        [
          fakeInteraction({ id: "interaction-1", interactionType: "touch", count: 2, timestamp: yesterday }),
          fakeInteraction({ id: "interaction-2", interactionType: "shake", count: 3, timestamp: today }),
          fakeInteraction({ id: "interaction-3", interactionType: "touch", count: 1, timestamp: today }),
        ],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/interactions/pet-1/stats?range=week", { headers }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.totalCount).toBe(6);
      expect(json.byType).toEqual({
        touch: 3,
        shake: 3,
        gesture: 0,
      });
      expect(json.trend).toEqual([
        { date: yesterday.toISOString().slice(0, 10), count: 2 },
        { date: today.toISOString().slice(0, 10), count: 4 },
      ]);
    });
  });

  describe("POST /api/admin/interactions/auto", () => {
    it("generates interactions in batch", async () => {
      mockDb._results.select = [[fakeBinding()]];
      mockDb._results.insert = [[
        fakeInteraction({ id: "interaction-1", count: 2 }),
        fakeInteraction({ id: "interaction-2", interactionType: "gesture", count: 5 }),
        fakeInteraction({ id: "interaction-3", interactionType: "shake", count: 1 }),
      ]];

      const res = await app.request(
        jsonReq("POST", "/api/admin/interactions/auto", {
          headers: { "X-Admin-Key": "yehey-admin-dev" },
          body: {
            petId: "pet-1",
            desktopDeviceId: "desktop-1",
            count: 3,
            intervalMinutes: 15,
          },
        }),
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.count).toBe(3);
      expect(json.interactions).toHaveLength(3);
      expect(((mockDb._calls.insert[0] as { values: Array<Record<string, unknown>> }).values)).toHaveLength(3);
    });
  });
});
