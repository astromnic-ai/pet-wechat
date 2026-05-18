import { Hono } from "hono";
import { createFirmwarePresignedGetUrl } from "../ota/firmware-storage";
import { resolveFirmwareVersion } from "../ota/version-resolver";

const otaPublicRoute = new Hono();

otaPublicRoute.get("/check", async (c) => {
  const chipId = c.req.query("chipId")?.trim();
  const fw = c.req.query("fw")?.trim();

  if (!chipId || !fw) {
    return c.json({ v: 1, hasUpdate: false });
  }

  const firmware = await resolveFirmwareVersion({ chipId, currentFw: fw });
  if (!firmware) {
    return c.json({ v: 1, hasUpdate: false });
  }

  const url = await createFirmwarePresignedGetUrl(firmware.storageKey, 3600);
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
