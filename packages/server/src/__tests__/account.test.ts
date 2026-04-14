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
  });
});
