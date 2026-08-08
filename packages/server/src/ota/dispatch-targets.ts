import { compare } from "./version-cmp";

export type RegistryFirmwareDevice = {
  chipId: string;
  fw: string | null;
};

export function selectFullDispatchChipIds(
  version: string,
  devices: RegistryFirmwareDevice[],
) {
  return devices
    .filter((device) => {
      if (!device.fw) return true;

      try {
        return compare(version, device.fw) > 0;
      } catch {
        // 无法识别的设备版本视为需要升级，避免单台异常上报阻断整批下发。
        return true;
      }
    })
    .map((device) => device.chipId);
}
