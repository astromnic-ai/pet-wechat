import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import { createApp, authHeader, jsonReq, fakeUser } from "./helpers";

const app = createApp();

describe("Auth Routes", () => {
  beforeEach(() => {
    mockDb._reset();
    process.env.WX_APPID = "test-appid";
    process.env.WX_SECRET = "test-secret";
  });

  // ===== POST /api/auth/wechat =====

  describe("POST /api/auth/wechat", () => {
    it("returns 400 when code is missing", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/auth/wechat", { body: {} })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it("creates or returns user via upsert", async () => {
      const user = fakeUser({ wechatOpenid: "mock_openid_default_user" });
      // upsert uses insert().onConflictDoUpdate().returning()
      mockDb._results.insert = [[user]];
      const originalFetch = globalThis.fetch;
      (globalThis as { fetch: typeof fetch }).fetch = (async () =>
        new Response(
          JSON.stringify({ openid: "mock_openid_default_user" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )) as unknown as typeof fetch;

      try {
        const res = await app.request(
          jsonReq("POST", "/api/auth/wechat", { body: { code: "test-code" } })
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.token).toBeDefined();
        expect(json.user.id).toBe(user.id);
      } finally {
        (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
      }
    });
  });

  // ===== POST /api/auth/phone =====

  describe("POST /api/auth/phone", () => {
    it("returns 400 when phone or code is missing", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/auth/phone", { body: { phone: "13800138000" } })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when verification code is wrong", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/auth/phone", {
          body: { phone: "13800138000", code: "000000" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("验证码");
    });

    it("creates or returns user via upsert", async () => {
      const user = fakeUser({ phone: "13800138000" });
      // upsert uses insert().onConflictDoUpdate().returning()
      mockDb._results.insert = [[user]];

      const res = await app.request(
        jsonReq("POST", "/api/auth/phone", {
          body: { phone: "13800138000", code: "123456" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token).toBeDefined();
      expect(json.user.id).toBe(user.id);
    });
  });

  // ===== GET /api/me =====

  describe("GET /api/me", () => {
    it("returns 401 without token", async () => {
      const res = await app.request(jsonReq("GET", "/api/me"));
      expect(res.status).toBe(401);
    });

    it("returns current user with valid token", async () => {
      const user = fakeUser();
      mockDb._results.select = [[user]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/me", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.id).toBe("user-1");
    });

    it("returns 404 when user not in db", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("nonexistent");
      const res = await app.request(
        jsonReq("GET", "/api/me", { headers })
      );
      expect(res.status).toBe(404);
    });
  });
});
