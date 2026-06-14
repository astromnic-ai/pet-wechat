import { beforeEach, describe, expect, it } from "bun:test";
import { resolveCurrentAction } from "../pet-mode/scheduler";
import { getBeijingDateKey, getBeijingMinutes, getBeijingTimeValue } from "../utils/beijing-time";
import { mockDb } from "./setup";
import { fakePet } from "./helpers";

describe("Pet mode scheduler", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it("uses Beijing time when matching custom schedules and normalizes Chinese actions", async () => {
    const now = new Date("2026-06-11T11:05:00.000Z");
    mockDb._results.select = [
      [fakePet({ id: "pet-1", activityMode: "custom" })],
      [
        {
          id: "plan-1",
          petId: "pet-1",
          repeat: "weekly",
          days: ["thu"],
          date: null,
          sortOrder: 0,
        },
      ],
      [
        {
          id: "slot-1",
          planId: "plan-1",
          start: "19:00",
          end: "19:21",
          action: "跑",
          sortOrder: 0,
        },
      ],
    ];

    await expect(resolveCurrentAction("pet-1", now)).resolves.toBe("base-run");
    expect(getBeijingDateKey(now)).toBe("2026-06-11");
    expect(getBeijingTimeValue(now)).toBe("19:05");
  });

  it("uses Beijing minutes when matching system schedules", async () => {
    const now = new Date("2026-06-11T23:30:00.000Z");
    mockDb._results.select = [
      [fakePet({ id: "pet-1", species: "cat", activityMode: "free" })],
      [
        {
          id: "schedule-1",
          species: "cat",
          name: "weekday",
          effectiveType: "weekday",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        {
          id: "block-1",
          scheduleId: "schedule-1",
          actionType: "base-walk",
          startMinutes: 7 * 60,
          endMinutes: 8 * 60,
          sortOrder: 0,
        },
      ],
    ];

    await expect(resolveCurrentAction("pet-1", now)).resolves.toBe("base-walk");
    expect(getBeijingMinutes(now)).toBe(7 * 60 + 30);
  });
});
