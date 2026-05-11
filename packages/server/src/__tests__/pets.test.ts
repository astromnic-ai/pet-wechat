import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import {
  createApp,
  authHeader,
  jsonReq,
  fakeInteractionEvent,
  fakePet,
} from "./helpers";

const app = createApp();
const VALID_SOURCE_IMAGE_URL = "http://localhost:9527/storage/uploads/test/photo.jpg";

function getStableTodayEventTime(now: Date) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const elapsedTodayMs = now.getTime() - todayStart.getTime();
  return new Date(now.getTime() - Math.min(60 * 60 * 1000, Math.max(0, elapsedTodayMs)));
}

describe("Pet Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  // ===== Auth guard =====

  it("returns 401 without token for all pet endpoints", async () => {
    const res = await app.request(jsonReq("GET", "/api/pets"));
    expect(res.status).toBe(401);
  });

  // ===== GET /api/pets =====

  describe("GET /api/pets", () => {
    it("returns user's pets", async () => {
      const pet = fakePet();
      mockDb._results.select = [[pet], [], []];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/pets", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.pets).toHaveLength(1);
      expect(json.pets[0].name).toBe("Mimi");
      expect(json.pets[0].latestBehavior).toBeNull();
    });

    it("returns empty array when user has no pets", async () => {
      mockDb._results.select = [[], []];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/pets", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.pets).toHaveLength(0);
    });
  });

  // ===== GET /api/pets/:id =====

  describe("GET /api/pets/:id", () => {
    it("returns pet details with avatars and actions", async () => {
      const pet = fakePet({ draftAvatarSourceImageUrl: VALID_SOURCE_IMAGE_URL });
      // select 1: pet query, select 2: latest behavior, select 3: avatars, select 4+: actions/recent behaviors
      mockDb._results.select = [
        [pet],
        [{ actionType: "walking", timestamp: new Date("2026-03-18T10:00:00.000Z") }],
        [{ id: "avatar-1", petId: "pet-1", sourceImageUrl: "url", status: "done", createdAt: new Date() }],
        [{ id: "action-1", petAvatarId: "avatar-1", actionType: "idle", imageUrl: "url", sortOrder: 0 }],
        [{ id: "behavior-1", petId: "pet-1", collarDeviceId: "collar-1", actionType: "walking", timestamp: new Date() }],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/pets/pet-1", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.pet.id).toBe("pet-1");
      expect(json.pet.draftAvatarSourceImageUrl).toBe(VALID_SOURCE_IMAGE_URL);
      expect(json.pet.latestBehavior.actionType).toBe("walking");
      expect(json.avatars).toHaveLength(1);
      expect(json.actions).toHaveLength(1);
    });

    it("returns 404 when pet belongs to another user (ownership check)", async () => {
      // select returns empty -> pet not found for this userId
      mockDb._results.select = [[]];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("GET", "/api/pets/pet-1", { headers })
      );
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/pets/:petId/interaction-stats", () => {
    it("returns aggregated counts and buckets for owner", async () => {
      const now = new Date();
      const todayEvent = fakeInteractionEvent({
        occurredAt: getStableTodayEventTime(now),
      });
      const weekEvent = fakeInteractionEvent({
        id: "interaction-2",
        occurredAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 12, 0, 0),
      });
      const oldEvent = fakeInteractionEvent({
        id: "interaction-3",
        occurredAt: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 45, 8, 0, 0),
      });

      mockDb._results.select = [
        [fakePet()],
        [{ count: 3 }],
        [todayEvent, weekEvent, oldEvent],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/pets/pet-1/interaction-stats?range=week", { headers })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.totalCount).toBe(3);
      expect(json.todayCount).toBe(1);
      expect(json.weekCount).toBe(2);
      expect(json.monthCount).toBe(2);
      expect(json.buckets).toHaveLength(7);
    });

    it("excludes future events from day and rolling window counts", async () => {
      const now = new Date();
      const todayEvent = fakeInteractionEvent({
        occurredAt: getStableTodayEventTime(now),
      });
      const futureEvent = fakeInteractionEvent({
        id: "interaction-future",
        occurredAt: new Date(now.getTime() + 5 * 60 * 1000),
      });

      mockDb._results.select = [
        [fakePet()],
        [{ count: 2 }],
        [todayEvent, futureEvent],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/pets/pet-1/interaction-stats?range=day", { headers })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.todayCount).toBe(1);
      expect(json.weekCount).toBe(1);
      expect(json.monthCount).toBe(1);
      expect(json.buckets.reduce((sum: number, item: { count: number }) => sum + item.count, 0)).toBe(1);
    });

    it("returns 403 when pet exists but user is unauthorized", async () => {
      mockDb._results.select = [[fakePet({ userId: "user-1" })], []];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("GET", "/api/pets/pet-1/interaction-stats", { headers })
      );

      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid range", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/pets/pet-1/interaction-stats?range=year", { headers })
      );

      expect(res.status).toBe(400);
    });
  });

  // ===== POST /api/pets =====

  describe("POST /api/pets", () => {
    it("creates a pet", async () => {
      const pet = fakePet({ name: "Lucky", species: "dog" });
      mockDb._results.insert = [[pet]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/pets", {
          headers,
          body: { name: "Lucky", species: "dog" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.pet.name).toBe("Lucky");
    });
  });

  // ===== PUT /api/pets/:id =====

  describe("PUT /api/pets/:id", () => {
    it("updates own pet without renaming it", async () => {
      const existing = fakePet();
      const updated = fakePet({ name: existing.name, breed: "布偶" });
      // select: find existing, update: return updated
      mockDb._results.select = [[existing]];
      mockDb._results.update = [[updated]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/pets/pet-1", {
          headers,
          body: { name: "New Name", breed: "布偶" },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.pet.name).toBe(existing.name);
      expect((mockDb._calls.update[0] as any).set).toMatchObject({
        name: existing.name,
        breed: "布偶",
      });
    });

    it("returns 404 when updating another user's pet", async () => {
      mockDb._results.select = [[]]; // ownership check fails

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("PUT", "/api/pets/pet-1", {
          headers,
          body: { name: "Hack" },
        })
      );
      expect(res.status).toBe(404);
    });
  });

  // ===== DELETE /api/pets/:id =====

  describe("DELETE /api/pets/:id", () => {
    it("deletes own pet", async () => {
      mockDb._results.select = [[fakePet()]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/pets/pet-1", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("returns 404 when deleting another user's pet", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("DELETE", "/api/pets/pet-1", { headers })
      );
      expect(res.status).toBe(404);
    });
  });
});
