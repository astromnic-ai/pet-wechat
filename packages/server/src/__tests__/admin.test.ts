import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  customActions,
  desktopDevices,
  desktopPetBindings,
  deviceInteractions,
  petModeSchedules,
  petModes,
  users,
} from "../db/schema";
import { adminMiddleware } from "../middleware/admin";
import adminRoute from "../routes/admin";
import { jsonReq } from "./helpers";
import { mockDb } from "./setup";

const adminApp = new Hono();
adminApp.use("/api/admin/*", adminMiddleware);
adminApp.route("/api/admin", adminRoute);

describe("Admin Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("DELETE /api/admin/users/:id", () => {
    it("clears newly added relations before deleting the user", async () => {
      mockDb._results.select = [
        [{ id: "pet-1" }],
        [{ id: "desktop-1" }],
        [{ id: "avatar-1" }],
      ];

      const res = await adminApp.request(
        jsonReq("DELETE", "/api/admin/users/user-1", {
          headers: { "X-Admin-Key": "yehey-admin-dev" },
        }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const deletedTables = (mockDb._calls.delete as Array<{ table?: unknown }>).map(
        (call) => call.table,
      );
      const updatedTables = (mockDb._calls.update as Array<{ table?: unknown }>).map(
        (call) => call.table,
      );

      expect(deletedTables).toContain(petModes);
      expect(deletedTables).toContain(petModeSchedules);
      expect(deletedTables).toContain(customActions);
      expect(deletedTables).toContain(deviceInteractions);
      expect(deletedTables).toContain(users);
      expect(updatedTables).toContain(desktopPetBindings);
    });
  });

  describe("DELETE /api/admin/pets/:id", () => {
    it("clears newly added relations before deleting the pet", async () => {
      mockDb._results.select = [[{ id: "avatar-1" }]];

      const res = await adminApp.request(
        jsonReq("DELETE", "/api/admin/pets/pet-1", {
          headers: { "X-Admin-Key": "yehey-admin-dev" },
        }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const deletedTables = (mockDb._calls.delete as Array<{ table?: unknown }>).map(
        (call) => call.table,
      );
      const updatedTables = (mockDb._calls.update as Array<{ table?: unknown }>).map(
        (call) => call.table,
      );

      expect(deletedTables).toContain(petModes);
      expect(deletedTables).toContain(petModeSchedules);
      expect(deletedTables).toContain(customActions);
      expect(deletedTables).toContain(deviceInteractions);
      expect(updatedTables).toContain(desktopPetBindings);
    });
  });

  describe("DELETE /api/admin/desktops/:id", () => {
    it("cleans interaction rows when deleting a desktop", async () => {
      const res = await adminApp.request(
        jsonReq("DELETE", "/api/admin/desktops/desktop-1", {
          headers: { "X-Admin-Key": "yehey-admin-dev" },
        }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const deletedTables = (mockDb._calls.delete as Array<{ table?: unknown }>).map(
        (call) => call.table,
      );
      const updatedTables = (mockDb._calls.update as Array<{ table?: unknown }>).map(
        (call) => call.table,
      );

      expect(deletedTables).toContain(deviceInteractions);
      expect(deletedTables).toContain(desktopDevices);
      expect(updatedTables).toContain(desktopPetBindings);
    });
  });
});
