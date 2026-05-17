import { Hono } from "hono";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  deviceRegistry,
  dispatchJobs,
  firmwareVersions,
  internalDevices,
  otaProgress,
} from "../../db/schema";
import { dispatchVersion } from "../../ota/dispatch";
import { ok, fail } from "../../ota/errors";
import { compare } from "../../ota/version-cmp";

const otaAdminRoute = new Hono();

async function getFirmware(version: string) {
  const [row] = await db
    .select()
    .from(firmwareVersions)
    .where(eq(firmwareVersions.version, version))
    .limit(1);
  return row ?? null;
}

async function filterInternalChipIds(chipIds: string[]) {
  if (chipIds.length === 0) return { allowed: [], skipped: [] };
  const rows = await db
    .select({ chipId: internalDevices.chipId })
    .from(internalDevices)
    .where(inArray(internalDevices.chipId, chipIds));
  const allowedSet = new Set(rows.map((row) => row.chipId));
  return {
    allowed: chipIds.filter((chipId) => allowedSet.has(chipId)),
    skipped: chipIds.filter((chipId) => !allowedSet.has(chipId)),
  };
}

async function prepareDispatch(version: string, chipIds: string[]) {
  const firmware = await getFirmware(version);
  if (!firmware) {
    return { error: ["not_found", "固件版本不存在"] as const };
  }
  if (firmware.state === "draft" || firmware.state === "quarantine") {
    return { error: ["bad_request", "draft/quarantine 状态不可下发"] as const };
  }
  if (chipIds.length === 0) {
    return { error: ["bad_request", "chipIds 不能为空"] as const };
  }

  if (firmware.state === "internal") {
    const filtered = await filterInternalChipIds(chipIds);
    return { firmware, chipIds: filtered.allowed, skipped: filtered.skipped };
  }

  return { firmware, chipIds, skipped: [] };
}

otaAdminRoute.post("/dispatch", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const version = typeof body.version === "string" ? body.version.trim() : "";
  const chipIds = Array.isArray(body.chipIds)
    ? body.chipIds.filter((id: unknown): id is string => typeof id === "string")
    : [];

  const prepared = await prepareDispatch(version, chipIds);
  if (prepared.error) {
    const [code, message] = prepared.error;
    return fail(c, code === "not_found" ? 404 : 400, code, message);
  }
  if (prepared.chipIds.length === 0) {
    return ok(c, {
      dispatched: 0,
      version,
      immediate: 0,
      throttled: 0,
      skipped: prepared.skipped,
    });
  }

  const result = await dispatchVersion({
    chipIds: prepared.chipIds,
    firmware: prepared.firmware,
    source: "manual",
    createdBy: c.get("otaAuth")?.actor,
  });

  return ok(c, { version, ...result, skipped: prepared.skipped });
});

otaAdminRoute.post("/dispatch-all", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const version = typeof body.version === "string" ? body.version.trim() : "";
  const firmware = await getFirmware(version);
  if (!firmware) {
    return fail(c, 404, "not_found", "固件版本不存在");
  }
  if (firmware.state !== "released") {
    return fail(c, 400, "bad_request", "仅 released 版本可全量下发");
  }

  const rows = await db
    .select({ chipId: deviceRegistry.chipId, fw: deviceRegistry.fw })
    .from(deviceRegistry)
    .where(eq(deviceRegistry.online, true));
  const chipIds = rows
    .filter((row) => !row.fw || compare(version, row.fw) > 0)
    .map((row) => row.chipId);

  const result = await dispatchVersion({
    chipIds,
    firmware,
    source: "auto_full",
    createdBy: c.get("otaAuth")?.actor,
  });

  return ok(c, { version, ...result });
});

otaAdminRoute.get("/dispatch-jobs", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const jobs = await db
    .select()
    .from(dispatchJobs)
    .orderBy(desc(dispatchJobs.dispatchedAt))
    .limit(limit);

  const versions = Array.from(new Set(jobs.map((job) => job.version)));
  const progressRows =
    versions.length === 0
      ? []
      : await db
          .select({
            version: otaProgress.version,
            stage: otaProgress.stage,
            total: count(),
          })
          .from(otaProgress)
          .where(inArray(otaProgress.version, versions))
          .groupBy(otaProgress.version, otaProgress.stage);

  return ok(c, {
    items: jobs.map((job) => ({
      ...job,
      progress: progressRows
        .filter((row) => row.version === job.version)
        .reduce<Record<string, number>>((acc, row) => {
          acc[row.stage] = Number(row.total);
          return acc;
        }, {}),
    })),
  });
});

otaAdminRoute.get("/registry", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const online = c.req.query("online");
  const version = c.req.query("version");
  const conditions = [];
  if (online === "true") conditions.push(eq(deviceRegistry.online, true));
  if (online === "false") conditions.push(eq(deviceRegistry.online, false));

  const rows = await db
    .select()
    .from(deviceRegistry)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(deviceRegistry.lastSeenAt))
    .limit(limit);

  return ok(c, {
    items: version ? rows.filter((row) => !row.fw || compare(version, row.fw) >= 0) : rows,
  });
});

otaAdminRoute.get("/internal-devices", async (c) => {
  const rows = await db
    .select()
    .from(internalDevices)
    .orderBy(desc(internalDevices.addedAt));
  return ok(c, { items: rows });
});

otaAdminRoute.post("/internal-devices", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const chipId = typeof body.chipId === "string" ? body.chipId.trim() : "";
  if (!chipId) {
    return fail(c, 400, "bad_request", "chipId 不能为空");
  }

  const [row] = await db
    .insert(internalDevices)
    .values({
      chipId,
      note: typeof body.note === "string" ? body.note : null,
      addedBy: c.get("otaAuth")?.actor ?? "system",
    })
    .onConflictDoUpdate({
      target: internalDevices.chipId,
      set: {
        note: typeof body.note === "string" ? body.note : null,
        addedBy: c.get("otaAuth")?.actor ?? "system",
        addedAt: sql`now()`,
      },
    })
    .returning();

  return ok(c, { item: row });
});

otaAdminRoute.delete("/internal-devices/:chipId", async (c) => {
  await db.delete(internalDevices).where(eq(internalDevices.chipId, c.req.param("chipId")));
  return ok(c, { chipId: c.req.param("chipId") });
});

export default otaAdminRoute;
