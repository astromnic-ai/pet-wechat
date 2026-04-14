import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import { createApp, authHeader, jsonReq, fakeUser } from "./helpers";

const app = createApp();

describe("Me Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("GET /api/me", () => {
    it("returns email in current user payload", async () => {
      mockDb._results.select = [[fakeUser({ email: "user@example.com" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/me", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.email).toBe("user@example.com");
    });
  });

  describe("PUT /api/me", () => {
    it("returns 401 without token", async () => {
      const res = await app.request(jsonReq("PUT", "/api/me"));
      expect(res.status).toBe(401);
    });

    it("updates nickname", async () => {
      const existing = fakeUser({ email: "user@example.com" });
      const updated = fakeUser({ nickname: "New Name", email: "user@example.com" });
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
      expect(json.user.email).toBe("user@example.com");
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

    it("clears avatarUrl when null is provided", async () => {
      const existing = fakeUser({ avatarUrl: "https://example.com/existing.jpg" });
      const updated = fakeUser({ avatarUrl: null });
      mockDb._results.select = [[existing]];
      mockDb._results.update = [[updated]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/me", {
          headers,
          body: { avatarUrl: null },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.avatarUrl).toBeNull();
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

    it("returns 400 when trying to update email directly", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/me", {
          headers,
          body: { email: "user@example.com" },
        })
      );

      expect(res.status).toBe(400);
    });
  });
});
