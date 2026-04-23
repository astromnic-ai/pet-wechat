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
    expect(json.desktops[0].bindingPets).toEqual([
      { id: "pet-1", name: "Mimi", avatarImageUrl: null },
      { id: "pet-2", name: "Coco", avatarImageUrl: null },
    ]);
  });

  it("attaches latest uploaded pet image for bound collars", async () => {
    const collar = {
      id: "collar-1",
      userId: "user-1",
      petId: "pet-1",
      name: "Hallway Collar",
      macAddress: "AA:BB:CC:DD:EE:FF",
      status: "online",
      battery: 90,
      signal: -55,
      firmwareVersion: "1.0.0",
      claimStatus: "occupied",
      usageDurationMinutes: 12,
      upgradeStatus: "idle",
      lastOnlineAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockDb._results.select = [
      [
        {
          collar,
          ownerNickname: "Alice",
          petName: "Mimi",
        },
      ],
      [
        {
          petId: "pet-1",
          sourceImageUrl: "https://example.com/upload.jpg",
        },
      ],
    ];

    const res = await app.request(jsonReq("GET", "/api/admin/collars"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.collars[0].petImageUrl).toBe("https://example.com/upload.jpg");
  });
});
