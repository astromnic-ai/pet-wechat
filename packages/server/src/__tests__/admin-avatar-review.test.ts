import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import avatarsRoute from "../routes/admin/avatars";
import { jsonReq } from "./helpers";
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
});
