import { describe, expect, it } from "bun:test";
import { getDeviceDisplayName } from "../src/utils/deviceDisplay";

describe("getDeviceDisplayName", () => {
  it("keeps the desktop device name and adds the bound pet name", () => {
    expect(
      getDeviceDisplayName({
        petName: "毛毛",
        deviceName: "PetTabletop",
        fallbackName: "桌面摆台",
      }),
    ).toBe("毛毛的PetTabletop");
  });

  it("uses the desktop fallback when the device has no name", () => {
    expect(
      getDeviceDisplayName({
        petName: "毛毛",
        deviceName: "",
        fallbackName: "桌面摆台",
      }),
    ).toBe("毛毛的桌面摆台");
  });
});
