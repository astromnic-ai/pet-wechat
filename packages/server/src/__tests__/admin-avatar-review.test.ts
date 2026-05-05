import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import avatarsRoute from "../routes/admin/avatars";
import { fakeAvatar, fakeAvatarAction, jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = new Hono();
app.route("/api/admin", avatarsRoute);
const TEST_MJPEG = new Uint8Array([0xff, 0xd8, 104, 101, 108, 108, 111, 0xff, 0xd9]);

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
      imageUrl: "https://test-storage.local/avatars/avatar-1/lay-thumb.jpg",
      videoUrl: "https://test-storage.local/avatars/avatar-1/lay.mjpeg",
      videoHash: "ac39d47c7b92ef8b2393ffff158c34707441867980f143f41f076b3bc8a6a6a1",
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
    formData.append("file", new File([TEST_MJPEG], "lay.mjpeg", { type: "video/mjpeg" }));

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
      videoHash: "ac39d47c7b92ef8b2393ffff158c34707441867980f143f41f076b3bc8a6a6a1",
      imageUrl: "https://test-storage.local/avatars/avatar-1/lay-thumb.jpg",
    });
  });
});
