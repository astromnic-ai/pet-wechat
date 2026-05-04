import { describe, it, expect, beforeEach } from "bun:test";
import { mockDb } from "./setup";
import {
  createApp,
  authHeader,
  jsonReq,
  fakePet,
  fakeUser,
  fakeAvatar,
} from "./helpers";

const app = createApp();
const VALID_SOURCE_IMAGE_URL = "http://localhost:9527/storage/uploads/test/photo.jpg";
const VALID_ACTION_IMAGE_URL = "http://localhost:9527/storage/uploads/test/action.jpg";

describe("Avatar Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it("returns 401 without token", async () => {
    const res = await app.request(
      jsonReq("POST", "/api/avatars", { body: { petId: "pet-1", sourceImageUrl: VALID_SOURCE_IMAGE_URL } })
    );
    expect(res.status).toBe(401);
  });

  // ===== POST /api/avatars =====

  describe("POST /api/avatars", () => {
    it("creates avatar when pet owned", async () => {
      const pet = fakePet();
      const user = fakeUser({ avatarQuota: 1 });
      const avatar = fakeAvatar();
      // select 1: pet ownership
      mockDb._results.select = [[pet]];
      // insert 1: create avatar
      mockDb._results.insert = [[avatar]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "pet-1", sourceImageUrl: VALID_SOURCE_IMAGE_URL },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.avatar.id).toBe("avatar-1");
    });

    it("rejects placeholder external source image urls", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "pet-1", sourceImageUrl: "https://example.com/photo.jpg" },
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 when pet not owned by user", async () => {
      mockDb._results.select = [[]]; // pet ownership fails

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "pet-1", sourceImageUrl: VALID_SOURCE_IMAGE_URL },
        })
      );
      expect(res.status).toBe(404);
    });

    it("still creates avatar when quota is 0 because quota is display-only", async () => {
      const pet = fakePet();
      const avatar = fakeAvatar();
      mockDb._results.select = [[pet]];
      mockDb._results.insert = [[avatar]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "pet-1", sourceImageUrl: VALID_SOURCE_IMAGE_URL },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.avatar.id).toBe("avatar-1");
    });
  });

  // ===== GET /api/avatars/:id =====

  describe("GET /api/avatars/:id", () => {
    it("returns avatar with actions when pet is owned", async () => {
      const avatar = fakeAvatar({ status: "done" });
      const pet = fakePet();
      const action = {
        id: "action-1",
        petAvatarId: "avatar-1",
        actionType: "idle",
        imageUrl: VALID_ACTION_IMAGE_URL,
        sortOrder: 0,
      };
      // select 1: avatar by id, select 2: pet ownership, select 3: actions
      mockDb._results.select = [[avatar], [pet], [action]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/avatars/avatar-1", { headers })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.avatar.status).toBe("done");
      expect(json.actions).toHaveLength(1);
    });

    it("returns 404 when avatar doesn't exist", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("GET", "/api/avatars/nonexistent", { headers })
      );
      expect(res.status).toBe(404);
    });

    it("returns 403 when pet is not owned by user (cross-user access)", async () => {
      const avatar = fakeAvatar();
      // select 1: avatar exists, select 2: pet ownership fails
      mockDb._results.select = [[avatar], []];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("GET", "/api/avatars/avatar-1", { headers })
      );
      expect(res.status).toBe(403);
    });
  });

  // ===== POST /api/avatars/:id/actions (admin upload) =====

  describe("POST /api/avatars/:id/actions", () => {
    it("uploads actions and marks avatar as done", async () => {
      const avatar = fakeAvatar();
      const pet = fakePet();
      // select 1: avatar, select 2: pet ownership
      mockDb._results.select = [[avatar], [pet]];
      const action = {
        id: "action-1",
        petAvatarId: "avatar-1",
        actionType: "idle",
        imageUrl: "https://example.com/action.jpg",
        sortOrder: 0,
      };
      mockDb._results.insert = [[action]];
      mockDb._results.update = [[{ id: avatar.id }]]; // mark as done

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars/avatar-1/actions", {
          headers,
          body: {
            actions: [
              { actionType: "idle", imageUrl: VALID_ACTION_IMAGE_URL, sortOrder: 0 },
            ],
          },
        })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.actions).toHaveLength(1);
    });

    it("rejects placeholder external action image urls", async () => {
      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars/avatar-1/actions", {
          headers,
          body: { actions: [{ actionType: "idle", imageUrl: "https://example.com/action.jpg", sortOrder: 0 }] },
        })
      );
      expect(res.status).toBe(400);
    });

    it("returns 403 when pet not owned by user", async () => {
      const avatar = fakeAvatar();
      // select 1: avatar found, select 2: pet ownership fails
      mockDb._results.select = [[avatar], []];

      const headers = await authHeader("user-2");
      const res = await app.request(
        jsonReq("POST", "/api/avatars/avatar-1/actions", {
          headers,
          body: { actions: [{ actionType: "idle", imageUrl: VALID_ACTION_IMAGE_URL, sortOrder: 0 }] },
        })
      );
      expect(res.status).toBe(403);
    });

    it("returns 404 when avatar doesn't exist", async () => {
      mockDb._results.select = [[]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars/nonexistent/actions", {
          headers,
          body: { actions: [{ actionType: "idle", imageUrl: VALID_ACTION_IMAGE_URL, sortOrder: 0 }] },
        })
      );
      expect(res.status).toBe(404);
    });
  });
});
