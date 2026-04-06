import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { mockDb } from "./setup";
import { createApp, authHeader, jsonReq, fakeMessage } from "./helpers";
import adminRoute from "../routes/admin";
import { adminMiddleware } from "../middleware/admin";

const app = createApp();
const adminApp = new Hono();
adminApp.use("/api/admin/*", adminMiddleware);
adminApp.route("/api/admin", adminRoute);

describe("Message Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it("returns 401 without token", async () => {
    const res = await app.request(jsonReq("GET", "/api/messages"));
    expect(res.status).toBe(401);
  });

  // ===== GET /api/messages =====

  describe("GET /api/messages", () => {
    it("returns all messages for user", async () => {
      const msg = fakeMessage();
      mockDb._results.select = [[msg]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/messages", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveLength(1);
    });

    it("supports new message type filter", async () => {
      const msg = fakeMessage({ type: "community" });
      mockDb._results.select = [[msg]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/messages?type=community", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveLength(1);
      expect(json[0].type).toBe("community");
    });

    it("returns 400 for invalid message type filter", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/messages?type=invalid", { headers })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("无效的消息类型");
    });
  });

  describe("POST /api/admin/messages", () => {
    it("creates a message with new message type", async () => {
      const message = fakeMessage({ type: "device" });
      mockDb._results.insert = [[message]];

      const res = await adminApp.request(
        jsonReq("POST", "/api/admin/messages", {
          headers: { "X-Admin-Key": "yehey-admin-dev" },
          body: {
            userId: "user-1",
            type: "device",
            title: "Device Alert",
            content: "Desktop offline",
          },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.message.type).toBe("device");
      expect((mockDb._calls.insert[0] as any).values).toMatchObject({
        type: "device",
      });
    });

    it("rejects invalid message type", async () => {
      const res = await adminApp.request(
        jsonReq("POST", "/api/admin/messages", {
          headers: { "X-Admin-Key": "yehey-admin-dev" },
          body: {
            userId: "user-1",
            type: "invalid",
            title: "Bad",
            content: "Bad",
          },
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("无效的消息类型");
    });
  });

  // ===== GET /api/messages/unread-count =====

  describe("GET /api/messages/unread-count", () => {
    it("returns unread count", async () => {
      const unread1 = fakeMessage({ isRead: false });
      const unread2 = fakeMessage({ id: "msg-2", isRead: false });
      mockDb._results.select = [[unread1, unread2]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/messages/unread-count", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.count).toBe(2);
    });

    it("returns 0 when no unread messages", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/messages/unread-count", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.count).toBe(0);
    });
  });

  // ===== PUT /api/messages/:id/read =====

  describe("PUT /api/messages/:id/read", () => {
    it("marks a message as read", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/messages/msg-1/read", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  // ===== PUT /api/messages/read-all =====

  describe("PUT /api/messages/read-all", () => {
    it("marks all messages as read", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/messages/read-all", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
