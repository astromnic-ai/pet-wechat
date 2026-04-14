import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mockDb } from "./setup";
import { createApp, authHeader, jsonReq, fakeUser } from "./helpers";

const app = createApp();
const originalFetch = globalThis.fetch;

function mockWechatFetch(url: string | URL | Request) {
  const value = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

  if (value.includes("/sns/jscode2session")) {
    return Promise.resolve(
      new Response(JSON.stringify({ openid: "mock_openid_default_user" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  if (value.includes("/cgi-bin/token")) {
    return Promise.resolve(
      new Response(JSON.stringify({ access_token: "wechat-access-token", expires_in: 7200 }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  if (value.includes("/wxa/business/getuserphonenumber")) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          phone_info: {
            phoneNumber: "13800138000",
            purePhoneNumber: "13800138000",
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  }

  throw new Error(`Unexpected fetch in auth.test.ts: ${value}`);
}

describe("Auth Routes", () => {
  beforeEach(() => {
    mockDb._reset();
    process.env.WX_APPID = "test-appid";
    process.env.WX_SECRET = "test-secret";
    globalThis.fetch = mockWechatFetch as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.WX_APPID;
    delete process.env.WX_SECRET;
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

      const res = await app.request(
        jsonReq("POST", "/api/auth/wechat", { body: { code: "test-code" } })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token).toBeDefined();
      expect(json.user.id).toBe(user.id);
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
