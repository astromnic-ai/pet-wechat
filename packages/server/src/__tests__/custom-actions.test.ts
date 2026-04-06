import { beforeEach, describe, expect, it } from "bun:test";
import { authHeader, createApp, fakeCustomAction, fakePet, jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = createApp();

describe("Custom Action Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("GET /api/pets/:id/custom-actions", () => {
    it("returns custom actions list", async () => {
      mockDb._results.select = [
        [fakePet()],
        [
          fakeCustomAction(),
          fakeCustomAction({ id: "custom-action-2", name: "Jump" }),
        ],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/pets/pet-1/custom-actions", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.customActions).toHaveLength(2);
      expect(json.customActions[0].name).toBe("Wave");
    });
  });

  describe("POST /api/pets/:id/custom-actions", () => {
    it("creates custom action successfully", async () => {
      mockDb._results.select = [[fakePet()]];
      mockDb._results.insert = [[fakeCustomAction({ name: "Spin" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/pets/pet-1/custom-actions", {
          headers,
          body: {
            name: "Spin",
            description: "Cute spin",
            videoUrl: "https://example.com/spin.mp4",
          },
        }),
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.customAction.name).toBe("Spin");
      expect((mockDb._calls.insert[0] as { values: Record<string, unknown> }).values).toMatchObject({
        petId: "pet-1",
        userId: "user-1",
        name: "Spin",
        status: "pending",
      });
    });

    it("returns 400 when name is empty", async () => {
      mockDb._results.select = [[fakePet()]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/pets/pet-1/custom-actions", {
          headers,
          body: {
            name: "   ",
            videoUrl: "https://example.com/spin.mp4",
          },
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/pets/:id/custom-actions/:actionId", () => {
    it("deletes custom action successfully", async () => {
      mockDb._results.select = [
        [fakePet()],
        [fakeCustomAction()],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/pets/pet-1/custom-actions/custom-action-1", { headers }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("rejects deleting processing action", async () => {
      mockDb._results.select = [
        [fakePet()],
        [fakeCustomAction({ status: "processing" })],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/pets/pet-1/custom-actions/custom-action-1", { headers }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("处理中的动作不能删除");
    });
  });
});
