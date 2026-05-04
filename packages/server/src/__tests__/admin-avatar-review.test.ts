import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import avatarsRoute from "../routes/admin/avatars";
import { fakeAvatar, fakeAvatarAction, jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = new Hono();
app.route("/api/admin", avatarsRoute);

describe("Admin Avatar Review Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it("returns todayCompleted in avatar review stats", async () => {
    mockDb._results.execute = [[
      {
        pending_review: 3,
        approved_total: 8,
        synced_to_devices: 5,
        today_new_uploads: 4,
        today_completed: 6,
      },
    ]];

    const res = await app.request(jsonReq("GET", "/api/admin/avatar-review/stats"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      pendingReview: 3,
      approvedTotal: 8,
      syncedToDevices: 5,
      todayNewUploads: 4,
      todayCompleted: 6,
    });
  });

  it("uploads an action video and stores sha256", async () => {
    const avatar = fakeAvatar({ id: "avatar-1", petId: "pet-1", status: "processing" });
    const action = fakeAvatarAction({ id: "action-1", petAvatarId: "avatar-1", actionType: "lay" });
    const updatedAction = {
      ...action,
      videoUrl: "https://test-storage.local/avatars/avatar-1/lay.mjpeg",
      videoHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    };

    mockDb._results.select = [
      [{
        avatar,
        petId: "pet-1",
        petName: "Mimi",
        petSpecies: "cat",
        petBreed: null,
        petGender: "unknown",
        petBirthday: null,
        petWeight: null,
        userId: "user-1",
        userNickname: "Test User",
        userAvatarUrl: null,
        userWechatOpenid: null,
        userPhone: null,
      }],
      [action],
    ];
    mockDb._results.update = [[updatedAction]];

    const formData = new FormData();
    formData.append("file", new File(["hello"], "lay.mjpeg", { type: "video/mjpeg" }));

    const res = await app.request(
      new Request("http://localhost/api/admin/avatars/avatar-1/actions/action-1/video", {
        method: "POST",
        body: formData,
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ action: updatedAction });
    expect((mockDb._calls.update[0] as any).set).toEqual({
      videoUrl: "https://test-storage.local/avatars/avatar-1/lay.mjpeg",
      videoHash: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    });
  });
});
