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
});
