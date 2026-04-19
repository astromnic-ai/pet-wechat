import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import devicesRoute from "../routes/admin/devices";
import { jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = new Hono();
app.route("/api/admin", devicesRoute);

describe("Admin Device Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it("groups active desktop bindings into a single desktop row", async () => {
    const desktop = {
      id: "desktop-1",
      userId: "user-1",
      name: "Living Room Display",
      macAddress: "11:22:33:44:55:66",
      status: "online",
      firmwareVersion: "1.0.0",
      lastOnlineAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockDb._results.select = [[
      {
        desktop,
        ownerNickname: "Alice",
        bindingId: "binding-1",
        bindingPetId: "pet-1",
        bindingPetName: "Mimi",
      },
      {
        desktop,
        ownerNickname: "Alice",
        bindingId: "binding-2",
        bindingPetId: "pet-2",
        bindingPetName: "Coco",
      },
    ]];

    const res = await app.request(jsonReq("GET", "/api/admin/desktops"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.desktops).toHaveLength(1);
    expect(json.desktops[0].ownerNickname).toBe("Alice");
    expect(json.desktops[0].bindingPetNames).toEqual(["Mimi", "Coco"]);
    expect(json.desktops[0].activeBindingCount).toBe(2);
  });

  it("accepts species=other on the unified devices list", async () => {
    mockDb._results.execute = [
      [
        {
          type: "desktop",
          id: "desktop-1",
          name: "Lobby Display",
          mac_address: "11:22:33:44:55:66",
          status: "offline",
          claim_status: "occupied",
          upgrade_status: "idle",
          firmware_version: "2.1.0",
          user_id: "user-1",
          user_nickname: "Alice",
          pet_id: null,
          pet_name: null,
          pet_species: null,
          pet_avatar_url: null,
          battery: null,
          signal: null,
          last_online_at: null,
          created_at: "2026-04-19T08:00:00.000Z",
          has_uploaded_avatar: false,
          avatar_uploaded: 0,
          avatar_total: 10,
          avatar_approved: 0,
          avatar_pending: 0,
          binding_count: 0,
          binding_started_at: null,
        },
      ],
      [{ total: 1 }],
    ];

    const res = await app.request(jsonReq("GET", "/api/admin/devices?species=other"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].petSpecies).toBeNull();
    expect(json.items[0].firmwareVersion).toBe("2.1.0");
  });

  it("returns firmwareVersion in device detail", async () => {
    mockDb._results.execute = [
      [
        {
          type: "collar",
          id: "collar-1",
          name: "Mimi Collar",
          mac_address: "AA:BB:CC:DD:EE:FF",
          status: "online",
          claim_status: "occupied",
          upgrade_status: "idle",
          firmware_version: "1.2.3",
          user_id: "user-1",
          user_nickname: "Alice",
          pet_id: "pet-1",
          pet_name: "Mimi",
          pet_species: "cat",
          pet_avatar_url: "https://example.com/pet.png",
          battery: 90,
          signal: 80,
          last_online_at: "2026-04-19T10:00:00.000Z",
          created_at: "2026-04-01T08:00:00.000Z",
          has_uploaded_avatar: true,
          avatar_uploaded: 10,
          avatar_total: 10,
          avatar_approved: 1,
          avatar_pending: 0,
          binding_count: 1,
          binding_started_at: "2026-04-01T08:00:00.000Z",
          owner_avatar_url: "https://example.com/user.png",
        },
      ],
      [],
    ];

    const res = await app.request(jsonReq("GET", "/api/admin/devices/collar/collar-1/detail"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.device.firmwareVersion).toBe("1.2.3");
  });
});
