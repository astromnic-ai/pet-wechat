import { beforeEach, describe, expect, it } from "bun:test";
import { authHeader, createApp, fakeMode, fakeSchedule, jsonReq } from "./helpers";
import { mockDb } from "./setup";

const app = createApp();

describe("Pet Mode Routes", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  describe("GET /api/pets/:id/mode", () => {
    it("lazy init defaults to free mode", async () => {
      mockDb._results.select = [[{ id: "pet-1" }], [], []];
      mockDb._results.insert = [[fakeMode({ petId: "pet-1", mode: "free" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/pets/pet-1/mode", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mode).toBe("free");
      expect(json.schedules).toEqual([]);
      expect((mockDb._calls.insert[0] as any).values).toMatchObject({
        petId: "pet-1",
        mode: "free",
      });
    });

    it("returns schedules for the active source", async () => {
      const customSchedule = fakeSchedule({
        id: "schedule-2",
        source: "custom",
        startTime: "12:00",
        endTime: "13:00",
        actionType: "playing",
      });
      mockDb._results.select = [
        [{ id: "pet-1" }],
        [fakeMode({ petId: "pet-1", mode: "custom" })],
        [customSchedule],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(jsonReq("GET", "/api/pets/pet-1/mode", { headers }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mode).toBe("custom");
      expect(json.schedules).toHaveLength(1);
      expect(json.schedules[0].source).toBe("custom");
    });
  });

  describe("PUT /api/pets/:id/mode", () => {
    it("switches mode successfully", async () => {
      mockDb._results.select = [[{ id: "pet-1" }]];
      mockDb._results.insert = [[fakeMode({ petId: "pet-1", mode: "custom" })]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/pets/pet-1/mode", {
          headers,
          body: { mode: "custom" },
        }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mode.mode).toBe("custom");
    });

    it("returns 400 when switching to real mode without collar", async () => {
      mockDb._results.select = [[{ id: "pet-1" }], []];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/pets/pet-1/mode", {
          headers,
          body: { mode: "real" },
        }),
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("请先绑定项圈设备");
    });
  });

  describe("POST /api/pets/:id/mode/schedules", () => {
    it("creates schedule successfully", async () => {
      const createdSchedule = fakeSchedule({
        id: "schedule-2",
        source: "custom",
        startTime: "10:00",
        endTime: "11:00",
        actionType: "playing",
        sortOrder: 0,
      });
      mockDb._results.select = [[{ id: "pet-1" }], []];
      mockDb._results.insert = [[createdSchedule]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/pets/pet-1/mode/schedules", {
          headers,
          body: {
            startTime: "10:00",
            endTime: "11:00",
            actionType: "playing",
          },
        }),
      );

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.schedule.id).toBe("schedule-2");
      expect((mockDb._calls.insert[0] as any).values).toMatchObject({
        source: "custom",
        sortOrder: 0,
      });
    });

    it("returns 400 for invalid time format", async () => {
      mockDb._results.select = [[{ id: "pet-1" }]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/pets/pet-1/mode/schedules", {
          headers,
          body: {
            startTime: "9:00",
            endTime: "10:00",
            actionType: "playing",
          },
        }),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when schedules overlap", async () => {
      mockDb._results.select = [
        [{ id: "pet-1" }],
        [fakeSchedule({ source: "custom", startTime: "09:00", endTime: "10:00" })],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/pets/pet-1/mode/schedules", {
          headers,
          body: {
            startTime: "09:30",
            endTime: "10:30",
            actionType: "resting",
          },
        }),
      );

      expect(res.status).toBe(400);
    });

    it("returns 400 when custom schedules exceed 20", async () => {
      mockDb._results.select = [
        [{ id: "pet-1" }],
        Array.from({ length: 20 }, (_, index) =>
          fakeSchedule({
            id: `schedule-${index + 1}`,
            source: "custom",
            startTime: `${String(index).padStart(2, "0")}:00`,
            endTime: `${String(index).padStart(2, "0")}:30`,
            sortOrder: index,
          }),
        ),
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("POST", "/api/pets/pet-1/mode/schedules", {
          headers,
          body: {
            startTime: "21:00",
            endTime: "21:30",
            actionType: "resting",
          },
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/pets/:id/mode/schedules/:scheduleId", () => {
    it("updates schedule successfully", async () => {
      mockDb._results.select = [
        [{ id: "pet-1" }],
        [fakeSchedule({ id: "schedule-1", source: "custom", startTime: "09:00", endTime: "10:00" })],
        [fakeSchedule({ id: "schedule-1", source: "custom", startTime: "09:00", endTime: "10:00" })],
      ];
      mockDb._results.update = [[
        fakeSchedule({
          id: "schedule-1",
          source: "custom",
          startTime: "10:00",
          endTime: "11:00",
          actionType: "playing",
        }),
      ]];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/pets/pet-1/mode/schedules/schedule-1", {
          headers,
          body: {
            startTime: "10:00",
            endTime: "11:00",
            actionType: "playing",
          },
        }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.schedule.startTime).toBe("10:00");
      expect(json.schedule.actionType).toBe("playing");
    });

    it("returns 403 when modifying system schedule", async () => {
      mockDb._results.select = [
        [{ id: "pet-1" }],
        [fakeSchedule({ id: "schedule-1", source: "system" })],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("PUT", "/api/pets/pet-1/mode/schedules/schedule-1", {
          headers,
          body: { actionType: "playing" },
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  describe("DELETE /api/pets/:id/mode/schedules/:scheduleId", () => {
    it("deletes schedule successfully", async () => {
      mockDb._results.select = [
        [{ id: "pet-1" }],
        [fakeSchedule({ id: "schedule-1", source: "custom" })],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/pets/pet-1/mode/schedules/schedule-1", { headers }),
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("returns 403 when deleting system schedule", async () => {
      mockDb._results.select = [
        [{ id: "pet-1" }],
        [fakeSchedule({ id: "schedule-1", source: "system" })],
      ];

      const headers = await authHeader("user-1");
      const res = await app.request(
        jsonReq("DELETE", "/api/pets/pet-1/mode/schedules/schedule-1", { headers }),
      );

      expect(res.status).toBe(403);
    });
  });
});
