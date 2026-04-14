import { beforeEach, describe, expect, it } from "bun:test";
import { authHeader, createApp, jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = createApp();

describe("Settings Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("GET /api/settings", () => {
    it("returns defaults when no record exists", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/settings", { headers }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        settings: {
          messageEnabled: true,
          soundEnabled: true,
          theme: "system",
          language: "zh-CN",
        },
      });
    });
  });

  describe("PUT /api/settings", () => {
    it("upserts partial settings changes", async () => {
      mockDb._results.select = [[]];
      mockDb._results.insert = [[
        {
          userId: "user-1",
          messageEnabled: true,
          soundEnabled: false,
          theme: "system",
          language: "zh-CN",
          updatedAt: new Date(),
        },
      ]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/settings", {
          headers,
          body: { soundEnabled: false },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.settings.soundEnabled).toBe(false);
      expect(json.settings.messageEnabled).toBe(true);
    });

    it("returns 400 for invalid theme", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/settings", {
          headers,
          body: { theme: "sepia" },
        })
      );

      expect(res.status).toBe(400);
    });
  });
});
