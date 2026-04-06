import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import { createApp, authHeader, jsonReq, fakeUser } from "./helpers";

const app = createApp();

describe("Me Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("GET /api/me", () => {
    it("returns quotas for current user", async () => {
      const user = fakeUser({ avatarQuota: 5, deviceBindingQuota: 4 });
      mockDb._results.select = [
        [user],
        [{ id: "pet-1" }, { id: "pet-2" }],
        [{ id: "avatar-1" }, { id: "avatar-2" }, { id: "avatar-3" }],
        [{ id: "desktop-1" }, { id: "desktop-2" }],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/me", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.id).toBe("user-1");
      expect(json.quotas).toEqual({
        avatarQuota: 5,
        avatarUsed: 3,
        deviceBindingQuota: 4,
        deviceBindingUsed: 2,
      });
    });
  });

  describe("PUT /api/me", () => {
    it("returns 401 without token", async () => {
      const res = await app.request(jsonReq("PUT", "/api/me"));
      expect(res.status).toBe(401);
    });

    it("updates nickname", async () => {
      const existing = fakeUser();
      const updated = fakeUser({ nickname: "New Name" });
      mockDb._results.select = [[existing]];
      mockDb._results.update = [[updated]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/me", {
          headers,
          body: { nickname: "New Name" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.nickname).toBe("New Name");
    });

    it("updates avatarUrl", async () => {
      const existing = fakeUser();
      const updated = fakeUser({ avatarUrl: "https://example.com/new.jpg" });
      mockDb._results.select = [[existing]];
      mockDb._results.update = [[updated]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/me", {
          headers,
          body: { avatarUrl: "https://example.com/new.jpg" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.avatarUrl).toBe("https://example.com/new.jpg");
    });

    it("returns 404 when user not found", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("nonexistent");
      const res = await app.request(
        jsonReq("PUT", "/api/me", {
          headers,
          body: { nickname: "Ghost" },
        })
      );
      expect(res.status).toBe(404);
    });
  });
});
