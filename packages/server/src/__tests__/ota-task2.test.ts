import { beforeEach, describe, expect, it } from "bun:test";
import { handleRollback } from "../ota/rollback-handler";
import { compare, isValid } from "../ota/version-cmp";
import { mockDb } from "./setup";

describe("OTA version compare", () => {
  it("validates v-prefixed semantic versions", () => {
    expect(isValid("v1.2.3")).toBe(true);
    expect(isValid("1.2.3")).toBe(false);
    expect(isValid("v1.2")).toBe(false);
    expect(isValid("v1.2.x")).toBe(false);
  });

  it("compares major, minor, and patch numbers", () => {
    expect(compare("v1.2.4", "v1.2.3")).toBe(1);
    expect(compare("v1.3.0", "v1.9.9")).toBe(-1);
    expect(compare("v2.0.0", "v1.99.99")).toBe(1);
    expect(compare("v1.2.3", "v1.2.3")).toBe(0);
    expect(() => compare("bad", "v1.0.0")).toThrow("Invalid semantic version");
  });
});

describe("OTA rollback handler", () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it("quarantines only on first rollback insert", async () => {
    const cleared: string[] = [];
    const quarantined: string[] = [];

    mockDb._results.insert = [[{ id: "rollback-1" }], []];

    const first = await handleRollback("chip-a", "v1.2.3", "boot_fail", "rollback", {
      clearRetained: async (chipId) => {
        cleared.push(chipId);
      },
      quarantine: async (version) => {
        quarantined.push(version);
        return { version };
      },
    });
    const second = await handleRollback("chip-a", "v1.2.3", "boot_fail", "rollback", {
      clearRetained: async (chipId) => {
        cleared.push(chipId);
      },
      quarantine: async (version) => {
        quarantined.push(version);
        return { version };
      },
    });

    expect(first.firstSeen).toBe(true);
    expect(second.firstSeen).toBe(false);
    expect(cleared).toEqual(["chip-a", "chip-a"]);
    expect(quarantined).toEqual(["v1.2.3"]);
    expect(mockDb._calls.update).toHaveLength(1);
  });
});
