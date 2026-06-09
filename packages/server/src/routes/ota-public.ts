import { Hono } from "hono";
import { createFirmwareDownloadUrl } from "../ota/firmware-storage";
import { resolveFirmwareVersion } from "../ota/version-resolver";
import { markDesktopOnlineByChipId } from "../utils/device-status";

const otaPublicRoute = new Hono();

otaPublicRoute.get("/check", async (c) => {
  const chipId = c.req.query("chipId")?.trim();
  const fw = c.req.query("fw")?.trim();

  if (!chipId || !fw) {
    return c.json({ v: 1, hasUpdate: false });
  }

  await markDesktopOnlineByChipId(chipId, { firmwareVersion: fw });

  const firmware = await resolveFirmwareVersion({ chipId, currentFw: fw });
  if (!firmware) {
    return c.json({ v: 1, hasUpdate: false });
  }

  const url = await createFirmwareDownloadUrl(firmware.storageKey);
  return c.json({
    v: 1,
    hasUpdate: true,
    version: firmware.version,
    url,
    sha256: firmware.sha256,
    size: firmware.size,
    force: firmware.force,
    minFromVersion: firmware.minFromVersion,
    releaseNote: firmware.releaseNote,
  });
});

export default otaPublicRoute;
