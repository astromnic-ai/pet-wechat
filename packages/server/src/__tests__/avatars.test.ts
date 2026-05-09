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
      // select 1: pet ownership, 2: user, 3: desktop quota count, 4: used quota count
      mockDb._results.select = [[pet], [user], [{ count: 0 }], [{ count: 0 }]];
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

    it("clears pet draft image after creating avatar", async () => {
      const pet = fakePet({ draftAvatarSourceImageUrl: VALID_SOURCE_IMAGE_URL });
      const user = fakeUser({ avatarQuota: 1 });
      const avatar = fakeAvatar();
      mockDb._results.select = [[pet], [user], [{ count: 0 }], [{ count: 0 }]];
      mockDb._results.insert = [[avatar]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "pet-1", sourceImageUrl: VALID_SOURCE_IMAGE_URL },
        })
      );

      expect(res.status).toBe(201);
      expect(mockDb._calls.update).toHaveLength(1);
      expect((mockDb._calls.update[0] as any).set).toMatchObject({
        draftAvatarSourceImageUrl: null,
      });
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

    it("returns 400 when no available quota remains", async () => {
      const pet = fakePet();
      const user = fakeUser({ avatarQuota: 0 });
      mockDb._results.select = [[pet], [user], [{ count: 0 }], [{ count: 0 }]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "pet-1", sourceImageUrl: VALID_SOURCE_IMAGE_URL },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("暂无可用定制次数");
    });

    it("creates avatar when user has a desktop-provided quota", async () => {
      const pet = fakePet();
      const user = fakeUser({ avatarQuota: 0 });
      const avatar = fakeAvatar();
      mockDb._results.select = [[pet], [user], [{ count: 1 }], [{ count: 0 }]];
      mockDb._results.insert = [[avatar]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "pet-1", sourceImageUrl: VALID_SOURCE_IMAGE_URL },
        })
      );
      expect(res.status).toBe(201);
    });

    it("allows up to three avatar creations from one desktop quota source", async () => {
      const pet = fakePet();
      const user = fakeUser({ avatarQuota: 0 });
      const avatar = fakeAvatar();
      mockDb._results.select = [[pet], [user], [{ count: 1 }], [{ count: 2 }]];
      mockDb._results.insert = [[avatar]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/avatars", {
          headers,
          body: { petId: "pet-1", sourceImageUrl: VALID_SOURCE_IMAGE_URL },
        })
      );
      expect(res.status).toBe(201);
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
