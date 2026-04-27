import { beforeEach, describe, expect, it } from "bun:test";
import { authHeader, createApp, fakeUser, jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = createApp();

describe("Account Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("POST /api/account/bind-phone/send-code", () => {
    it("returns mock code for a valid phone", async () => {
      mockDb._results.select = [[fakeUser()]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-phone/send-code", {
          headers,
          body: { phone: "13800138000" },
        })
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        accepted: true,
        mockCode: "000000",
      });
    });

    it("returns 404 when current user does not exist", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-missing");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-phone/send-code", {
          headers,
          body: { phone: "13800138000" },
        })
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/account/bind-phone/verify", () => {
    it("updates phone when verification succeeds", async () => {
      mockDb._results.select = [[fakeUser()], []];
      mockDb._results.update = [[fakeUser({ phone: "13800138000" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-phone/verify", {
          headers,
          body: { phone: "13800138000", code: "000000" },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.phone).toBe("13800138000");
    });

    it("returns 404 when current user does not exist", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-missing");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-phone/verify", {
          headers,
          body: { phone: "13800138000", code: "000000" },
        })
      );

      expect(res.status).toBe(404);
    });

    it("returns 409 when current account already has another phone", async () => {
      mockDb._results.select = [[fakeUser({ phone: "13900139000" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-phone/verify", {
          headers,
          body: { phone: "13800138000", code: "000000" },
        })
      );

      expect(res.status).toBe(409);
    });

    it("returns 409 when phone is already used by another account", async () => {
      mockDb._results.select = [[fakeUser()], [{ id: "user-2" }]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-phone/verify", {
          headers,
          body: { phone: "13800138000", code: "000000" },
        })
      );

      expect(res.status).toBe(409);
    });
  });

  describe("POST /api/account/bind-email/send-code", () => {
    it("returns mock code for a valid email", async () => {
      mockDb._results.select = [[fakeUser()]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-email/send-code", {
          headers,
          body: { email: "user@example.com" },
        })
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        accepted: true,
        mockCode: "000000",
      });
    });

    it("returns 404 when current user does not exist", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-missing");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-email/send-code", {
          headers,
          body: { email: "user@example.com" },
        })
      );

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/account/bind-email/verify", () => {
    it("updates email when verification succeeds", async () => {
      mockDb._results.select = [[fakeUser()], []];
      mockDb._results.update = [[fakeUser({ email: "user@example.com" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-email/verify", {
          headers,
          body: { email: "user@example.com", code: "000000" },
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.user.email).toBe("user@example.com");
    });

    it("returns 400 for wrong code", async () => {
      mockDb._results.select = [[fakeUser()]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-email/verify", {
          headers,
          body: { email: "user@example.com", code: "123123" },
        })
      );

      expect(res.status).toBe(400);
    });

    it("returns 404 when current user does not exist", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-missing");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-email/verify", {
          headers,
          body: { email: "user@example.com", code: "000000" },
        })
      );

      expect(res.status).toBe(404);
    });

    it("returns 409 when current account already has another email", async () => {
      mockDb._results.select = [[fakeUser({ email: "old@example.com" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-email/verify", {
          headers,
          body: { email: "user@example.com", code: "000000" },
        })
      );

      expect(res.status).toBe(409);
    });

    it("returns 409 when email is already used by another account", async () => {
      mockDb._results.select = [[fakeUser()], [{ id: "user-2" }]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/account/bind-email/verify", {
          headers,
          body: { email: "user@example.com", code: "000000" },
        })
      );

      expect(res.status).toBe(409);
    });
  });
});
