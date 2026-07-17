import { describe, expect, it } from "bun:test";
import { getDeviceDisplayName, selectPrimaryDevice } from "../src/utils/deviceDisplay";
import type { DeviceSummary } from "@pet-wechat/shared";

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

describe("selectPrimaryDevice", () => {
  const device = (overrides: Partial<DeviceSummary>): DeviceSummary => ({
    id: "device-1",
    name: "设备",
    deviceType: "desktop",
    status: "offline",
    lastOnlineAt: null,
    usageDurationMinutes: 0,
    bindings: [],
    ...overrides,
  } as DeviceSummary);

  it("only selects devices bound to the current pet", () => {
    const otherPetOnline = device({ id: "other", status: "online", bindings: [{ petId: "pet-2" }] as DeviceSummary["bindings"] });
    const currentPetOffline = device({ id: "current", bindings: [{ petId: "pet-1" }] as DeviceSummary["bindings"] });

    expect(selectPrimaryDevice([otherPetOnline, currentPetOffline], "pet-1")?.id).toBe("current");
  });

  it("prefers an online current-pet device over an offline one", () => {
    const offlineDesktop = device({ id: "desktop", bindings: [{ petId: "pet-1" }] as DeviceSummary["bindings"] });
    const onlineCollar = device({ id: "collar", deviceType: "collar", status: "online", petId: "pet-1" });

    expect(selectPrimaryDevice([offlineDesktop, onlineCollar], "pet-1")?.id).toBe("collar");
  });
});
