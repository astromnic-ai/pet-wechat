import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import customizationRoute from "../routes/admin/customization";
import { jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = new Hono();
app.route("/api/admin", customizationRoute);

describe("Admin Customization Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it("returns task summaries with pet and user profile fields", async () => {
    mockDb._results.execute = [
      [
        {
          avatar_id: "avatar-1",
          pet_id: "pet-1",
          pet_name: "Mimi",
          pet_species: "cat",
          pet_breed: "英短",
          pet_gender: "female",
          pet_birthday: "2024-10-01",
          user_id: "user-1",
          user_nickname: "Alice",
          user_avatar_url: "https://example.com/user.png",
          user_phone: "13800000000",
          status: "processing",
          default_preview_url: "https://example.com/avatar.png",
          base_action_count: 2,
          personalized_action_count: 1,
          total_action_count: 3,
          category_status: "partial",
          is_new_today: true,
          created_at: "2026-04-19T08:00:00.000Z",
          reviewed_at: "2026-04-19T09:00:00.000Z",
        },
      ],
      [{ total: 1 }],
    ];

    const res = await app.request(jsonReq("GET", "/api/admin/customization/tasks"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items[0]).toMatchObject({
      avatarId: "avatar-1",
      petBreed: "英短",
      petGender: "female",
      petBirthday: "2024-10-01",
      userAvatarUrl: "https://example.com/user.png",
      userPhone: "13800000000",
    });
    expect(json.total).toBe(1);
  });
});
