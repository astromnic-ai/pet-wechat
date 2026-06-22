import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import { createApp, authHeader, jsonReq, fakeMessage } from "./helpers";

const app = createApp();

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

    it("supports type filter", async () => {
      const msg = fakeMessage({ type: "authorization" });
      mockDb._results.select = [[msg]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/messages?type=authorization", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveLength(1);
    });
  });

  // ===== GET /api/messages/:id =====

  describe("GET /api/messages/:id", () => {
    it("returns one message for user", async () => {
      const msg = fakeMessage({ id: "msg-1" });
      mockDb._results.select = [[msg]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/messages/msg-1", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe("msg-1");
    });

    it("returns 404 when message is missing", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/messages/missing", { headers })
      );
      expect(res.status).toBe(404);
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
