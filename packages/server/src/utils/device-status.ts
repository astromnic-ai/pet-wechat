import type { DeviceStatus, DeviceType } from "shared";

export const DEVICE_ONLINE_TIMEOUT_MS = 10 * 60 * 1000;

export function getEffectiveDeviceStatus(options: {
  type: DeviceType;
  status: DeviceStatus;
  lastOnlineAt: Date | string | null | undefined;
  now?: Date;
}): DeviceStatus {
  if (options.type !== "desktop" || options.status !== "online") {
    return options.status;
  }

  if (!options.lastOnlineAt) {
    return "offline";
  }

  const lastOnlineTime = new Date(options.lastOnlineAt).getTime();
  if (Number.isNaN(lastOnlineTime)) {
    return "offline";
  }

  const nowTime = options.now?.getTime() ?? Date.now();
  return nowTime - lastOnlineTime > DEVICE_ONLINE_TIMEOUT_MS ? "offline" : "online";
}
