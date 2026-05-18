import { createHash } from "node:crypto";
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { firmwareVersions } from "../../db/schema";
import { ok, fail } from "../../ota/errors";
import { putFirmware } from "../../ota/firmware-storage";
import { transitionTo, FirmwareStateTransitionError } from "../../ota/state-machine";
import { isValid } from "../../ota/version-cmp";

const MAX_FIRMWARE_SIZE = 5 * 1024 * 1024;
const firmwareAdminRoute = new Hono();

firmwareAdminRoute.post("/upload", async (c) => {
  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_FIRMWARE_SIZE + 1024 * 1024) {
    return fail(c, 413, "size_exceeded", "multipart 请求超过允许大小");
  }

  const body = await c.req.parseBody();
  const version = typeof body.version === "string" ? body.version.trim() : "";
  const releaseNote = typeof body.releaseNote === "string" ? body.releaseNote : null;
  const firmware = body.firmware;

  if (!isValid(version)) {
    return fail(c, 400, "bad_request", "version 必须符合 vX.Y.Z 格式");
  }
  if (!(firmware instanceof File)) {
    return fail(c, 400, "bad_request", "缺少 firmware 文件");
  }
  if (firmware.size > MAX_FIRMWARE_SIZE) {
    return fail(c, 400, "size_exceeded", "固件文件超过 5MB");
  }

  const buffer = Buffer.from(await firmware.arrayBuffer());
  if (buffer.length > MAX_FIRMWARE_SIZE) {
    return fail(c, 400, "size_exceeded", "固件文件超过 5MB");
  }
  if (buffer[0] !== 0xe9) {
    return fail(c, 400, "bad_format", "固件文件不是 ESP32 app image");
  }

  const [existing] = await db
    .select({ id: firmwareVersions.id })
    .from(firmwareVersions)
    .where(eq(firmwareVersions.version, version))
    .limit(1);
  if (existing) {
    return fail(c, 409, "version_exists", "同版本固件已存在");
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const storageKey = `${version}/${sha256}.bin`;
  await putFirmware(buffer, storageKey, firmware.type || "application/octet-stream");

  const otaToken = c.get("otaToken");
  const [row] = await db
    .insert(firmwareVersions)
    .values({
      version,
      state: "draft",
      sha256,
      size: buffer.length,
      storageKey,
      releaseNote,
      uploadedByTokenId: otaToken?.id ?? null,
    })
    .returning();

  return ok(c, {
    version: row.version,
    sha256: row.sha256,
    size: row.size,
    uploadedAt: row.uploadedAt.toISOString(),
    initialState: "draft",
  });
});

firmwareAdminRoute.get("/versions", async (c) => {
  const rows = await db
    .select()
    .from(firmwareVersions)
    .orderBy(desc(firmwareVersions.uploadedAt))
    .limit(Math.min(Number(c.req.query("limit") ?? 50), 200));
  return ok(c, { items: rows });
});

firmwareAdminRoute.post("/versions/:id/state", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const state = body.state;
  if (!["draft", "internal", "released", "quarantine"].includes(state)) {
    return fail(c, 400, "bad_request", "state 不合法");
  }

  try {
    const row = await transitionTo(id, state, {
      operator: c.get("otaAuth")?.actor,
      reason: typeof body.reason === "string" ? body.reason : undefined,
      manual: true,
    });
    return ok(c, { item: row });
  } catch (error) {
    if (error instanceof FirmwareStateTransitionError) {
      return fail(c, 400, error.message, "固件状态流转失败");
    }
    throw error;
  }
});

export default firmwareAdminRoute;
