import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import { mockDb } from "./setup";
import { createApp, authHeader, jsonReq, fakeUser } from "./helpers";

const app = createApp();
const originalPassword = Bun.password;

describe("Auth Routes", () => {
  beforeAll(() => {
    Bun.password = {
      ...originalPassword,
      hash: async (value: string) => `hashed:${value}`,
      verify: async (value: string, hash: string) => hash === `hashed:${value}`,
    };
  });

  afterAll(() => {
    Bun.password = originalPassword;
  });

  beforeEach(() => {
    mockDb._reset();
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
    it("returns 400 when verification code and password are both missing", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/auth/phone", { body: { phone: "13800138000" } })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when verification code and password are both provided", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/auth/phone", {
          body: {
            phone: "13800138000",
            code: "123456",
            password: "secret123",
          },
        })
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

    it("logs in with password", async () => {
      const user = fakeUser({
        phone: "13800138000",
        passwordHash: "hashed:secret123",
      });
      mockDb._results.select = [[user]];

      const res = await app.request(
        jsonReq("POST", "/api/auth/phone", {
          body: { phone: "13800138000", password: "secret123" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.token).toBeDefined();
      expect(json.user.id).toBe(user.id);
    });

    it("returns 401 when password is wrong", async () => {
      const user = fakeUser({
        phone: "13800138000",
        passwordHash: "hashed:secret123",
      });
      mockDb._results.select = [[user]];

      const res = await app.request(
        jsonReq("POST", "/api/auth/phone", {
          body: { phone: "13800138000", password: "wrongpass" },
        })
      );
      expect(res.status).toBe(401);
    });

    it("returns 401 when password login user does not exist", async () => {
      mockDb._results.select = [[]];

      const res = await app.request(
        jsonReq("POST", "/api/auth/phone", {
          body: { phone: "13800138000", password: "secret123" },
        })
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/register", () => {
    it("registers successfully", async () => {
      const user = fakeUser({
        phone: "13800138000",
        nickname: "用户8000",
        passwordHash: "hashed:secret123",
      });
      mockDb._results.select = [[]];
      mockDb._results.insert = [[user]];

      const res = await app.request(
        jsonReq("POST", "/api/auth/register", {
          body: {
            phone: "13800138000",
            code: "123456",
            password: "secret123",
          },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.token).toBeDefined();
      expect(json.user.phone).toBe("13800138000");
      expect((mockDb._calls.insert[0] as any).values).toMatchObject({
        phone: "13800138000",
        nickname: "用户8000",
        passwordHash: "hashed:secret123",
      });
    });

    it("returns 409 when phone already exists", async () => {
      mockDb._results.select = [[fakeUser({ phone: "13800138000" })]];

      const res = await app.request(
        jsonReq("POST", "/api/auth/register", {
          body: {
            phone: "13800138000",
            code: "123456",
            password: "secret123",
          },
        })
      );
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toBe("手机号已注册");
    });

    it("returns 400 for invalid phone", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/auth/register", {
          body: {
            phone: "12345",
            code: "123456",
            password: "secret123",
          },
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid password length", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/auth/register", {
          body: {
            phone: "13800138000",
            code: "123456",
            password: "12345",
          },
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid verification code", async () => {
      const res = await app.request(
        jsonReq("POST", "/api/auth/register", {
          body: {
            phone: "13800138000",
            code: "000000",
            password: "secret123",
          },
        })
      );
      expect(res.status).toBe(400);
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
