import { beforeEach, describe, expect, it } from "bun:test";
import { authHeader, createApp, jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = createApp();

describe("Content Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("GET /api/content/:slug", () => {
    it("returns parsed markdown content", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/content/help", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.slug).toBe("help");
      expect(json.title).toBe("帮助中心");
      expect(json.body).toContain("常见问题");
      expect(typeof json.version).toBe("string");
      expect(typeof json.updatedAt).toBe("string");
    });

    it("returns 404 for unsupported slug", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/content/unknown", { headers }));

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Content not found" });
    });
  });
});
