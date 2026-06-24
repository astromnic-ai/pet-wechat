import { createHash, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { ALL_ACTIONS, normalizePetActionType } from "shared";
import { db } from "../db";
import { normalizeMac, NORMALIZED_MAC_REGEX } from "../utils/mac";
import { dispatchPetAction } from "../pet-mode/scheduler";
import {
  getBeijingEffectiveTypes,
  PET_SCHEDULE_TIME_ZONE,
} from "../utils/beijing-time";
import {
  behaviorScheduleBlocks,
  behaviorSchedules,
  collarDevices,
  desktopDevices,
  desktopPetBindings,
  interactionEvents,
  petAvatarActions,
  petAvatars,
  petBehaviors,
  petModePlans,
  petModeSlots,
  pets,
} from "../db/schema";
import { normalizePublicFileUrl } from "../utils/storage";
import type { PetModePlanDTO, PetModeWeekday } from "shared";
import { DEVICE_ONLINE_TIMEOUT_MS, getUsageDurationIncrementMinutes, markDesktopOnlineByChipId, normalizeDeviceChipId } from "../utils/device-status";

const deviceReportRoute = new Hono();
type DeviceHeartbeatUpdate<T> = Omit<Partial<T>, "usageDurationMinutes"> & {
  usageDurationMinutes?: number | SQL;
};

const deviceTypeSchema = z.enum(["collar", "desktop"]);
const deviceStatusSchema = z.enum(["online", "offline", "pairing"]);
const isoDatetimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "occurredAt must be a valid ISO datetime",
  });

const heartbeatBodySchema = z.object({
  macAddress: z
    .string()
    .trim()
    .transform(normalizeMac)
    .refine((value) => NORMALIZED_MAC_REGEX.test(value), {
      message: "macAddress must be a 12-digit hexadecimal MAC address",
    }),
  chipId: z.string().trim().min(1).optional(),
  type: deviceTypeSchema,
  status: deviceStatusSchema.default("online"),
  firmwareVersion: z.string().trim().min(1).optional(),
  battery: z.number().int().min(0).max(100).optional(),
  signal: z.number().int().min(-120).max(0).optional(),
});

const eventBodySchema = z.object({
  macAddress: z
    .string()
    .trim()
    .transform(normalizeMac)
    .refine((value) => NORMALIZED_MAC_REGEX.test(value), {
      message: "macAddress must be a 12-digit hexadecimal MAC address",
    }),
  chipId: z.string().trim().min(1).optional(),
  type: deviceTypeSchema,
  actionType: z.string().trim().min(1).max(64),
  occurredAt: isoDatetimeSchema.optional(),
});

const manifestQuerySchema = z.object({
  chipId: z.string().trim().min(1),
});

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function buildValidationError(error: z.ZodError) {
  return {
    error: "Invalid request body",
    details: error.issues.map((issue) => ({
      path: issue.path.join(".") || "body",
      message: issue.message,
    })),
  };
}

function isValidDeviceSecret(expectedSecret: string, providedSecret: string): boolean {
  // Hash both sides first so timingSafeEqual always receives equal-length buffers.
  const expectedDigest = createHash("sha256").update(expectedSecret).digest();
  const providedDigest = createHash("sha256").update(providedSecret).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

async function findCollarByMac(macAddress: string) {
  const [collar] = await db
    .select()
    .from(collarDevices)
    .where(eq(collarDevices.macAddress, macAddress));

  return collar ?? null;
}

async function findCollarByChipId(chipId: string) {
  const [collar] = await db
    .select()
    .from(collarDevices)
    .where(eq(collarDevices.chipId, chipId));

  return collar ?? null;
}

async function findDesktopByMac(macAddress: string) {
  const [desktop] = await db
    .select()
    .from(desktopDevices)
    .where(eq(desktopDevices.macAddress, macAddress));

  return desktop ?? null;
}

async function findDesktopByChipId(chipId: string) {
  const [desktop] = await db
    .select()
    .from(desktopDevices)
    .where(eq(desktopDevices.chipId, chipId));

  return desktop ?? null;
}

function macToChipId(macAddress: string) {
  const normalized = normalizeMac(macAddress);
  if (!NORMALIZED_MAC_REGEX.test(normalized)) return "";
  return normalized
    .match(/.{2}/g)!
    .reverse()
    .join("")
    .toLowerCase();
}

async function findCollarByIdentity(identity: { macAddress: string; chipId?: string }) {
  const byMac = await findCollarByMac(identity.macAddress);
  if (byMac) return byMac;

  const chipId = normalizeDeviceChipId(identity.chipId);
  if (chipId) {
    const byChipId = await findCollarByChipId(chipId);
    if (byChipId) return byChipId;
  }

  const chipIdFromMac = macToChipId(identity.macAddress);
  return chipIdFromMac ? await findCollarByChipId(chipIdFromMac) : null;
}

async function findDesktopByIdentity(identity: { macAddress: string; chipId?: string }) {
  const byMac = await findDesktopByMac(identity.macAddress);
  if (byMac) return byMac;

  const chipId = normalizeDeviceChipId(identity.chipId);
  if (chipId) {
    const byChipId = await findDesktopByChipId(chipId);
    if (byChipId) return byChipId;
  }

  const chipIdFromMac = macToChipId(identity.macAddress);
  return chipIdFromMac ? await findDesktopByChipId(chipIdFromMac) : null;
}

async function getActiveDesktopPetId(desktopDeviceId: string) {
  const [binding] = await db
    .select()
    .from(desktopPetBindings)
    .where(
      and(
        eq(desktopPetBindings.desktopDeviceId, desktopDeviceId),
        isNull(desktopPetBindings.unboundAt),
      ),
    )
    .orderBy(desc(desktopPetBindings.createdAt))
    .limit(1);

  return binding?.petId ?? null;
}

async function getCollarChipId(petId: string) {
  const [collar] = await db
    .select()
    .from(collarDevices)
    .where(eq(collarDevices.petId, petId))
    .orderBy(desc(collarDevices.createdAt))
    .limit(1);

  return collar?.chipId ?? null;
}

async function buildAvatarManifestFiles(petId: string) {
  const avatars = await db
    .select()
    .from(petAvatars)
    .where(and(eq(petAvatars.petId, petId), eq(petAvatars.status, "done")))
    .orderBy(desc(petAvatars.createdAt))
    .limit(5);

  if (avatars.length === 0) {
    return [];
  }

  const actions = await db
    .select()
    .from(petAvatarActions)
    .where(inArray(petAvatarActions.petAvatarId, avatars.map((avatar) => avatar.id)))
    .orderBy(asc(petAvatarActions.sortOrder), asc(petAvatarActions.actionType), asc(petAvatarActions.id));

  const actionsByAvatarId = new Map<string, typeof actions>();
  for (const action of actions) {
    const current = actionsByAvatarId.get(action.petAvatarId) ?? [];
    current.push(action);
    actionsByAvatarId.set(action.petAvatarId, current);
  }

  for (const avatar of avatars) {
    const files = (actionsByAvatarId.get(avatar.id) ?? [])
      .filter((action) => ALL_ACTIONS.includes(action.actionType as typeof ALL_ACTIONS[number]))
      .filter((action) => action.videoUrl && action.videoHash)
      .map((action) => ({
        actionType: action.actionType,
        path: `${action.actionType}/${action.actionType}.mjpeg`,
        hash: action.videoHash as string,
        url: normalizePublicFileUrl(action.videoUrl) ?? action.videoUrl as string,
      }));

    if (new Set(files.map((file) => file.actionType)).size === ALL_ACTIONS.length) {
      return files;
    }
  }

  return [];
}

function normalizePetModeDays(value: unknown): PetModeWeekday[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PetModeWeekday =>
    ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(String(item)),
  );
}

async function getPetModeManifest(petId: string) {
  const [pet] = await db
    .select({ activityMode: pets.activityMode, species: pets.species })
    .from(pets)
    .where(eq(pets.id, petId))
    .limit(1);

  const mode = pet?.activityMode ?? "free";
  if (mode !== "custom") {
    return { mode, species: pet?.species ?? null, plans: [] as PetModePlanDTO[] };
  }

  const plans = await db
    .select()
    .from(petModePlans)
    .where(eq(petModePlans.petId, petId))
    .orderBy(asc(petModePlans.sortOrder), asc(petModePlans.id));

  if (plans.length === 0) {
    return { mode, species: pet?.species ?? null, plans: [] as PetModePlanDTO[] };
  }

  const slots = await db
    .select()
    .from(petModeSlots)
    .where(inArray(petModeSlots.planId, plans.map((plan) => plan.id)))
    .orderBy(asc(petModeSlots.sortOrder), asc(petModeSlots.id));

  const slotsByPlanId = new Map<string, typeof slots>();
  for (const slot of slots) {
    const current = slotsByPlanId.get(slot.planId) ?? [];
    current.push(slot);
    slotsByPlanId.set(slot.planId, current);
  }

  return {
    mode,
    species: pet?.species ?? null,
    plans: plans.map((plan) => ({
      id: plan.id,
      repeat: plan.repeat === "weekly" ? "weekly" : "once",
      days: normalizePetModeDays(plan.days),
      date: plan.date,
      sortOrder: plan.sortOrder,
      slots: (slotsByPlanId.get(plan.id) ?? []).map((slot) => ({
        id: slot.id,
        start: slot.start,
        end: slot.end,
        action: normalizePetActionType(slot.action),
        sortOrder: slot.sortOrder,
      })),
    })),
  };
}

async function getSystemScheduleManifest(species: string, now = new Date()) {
  const effectiveTypes = getBeijingEffectiveTypes(now);
  const schedules = await db
    .select()
    .from(behaviorSchedules)
    .where(
      and(
        eq(behaviorSchedules.species, species),
        eq(behaviorSchedules.isActive, true),
        inArray(behaviorSchedules.effectiveType, effectiveTypes),
      ),
    )
    .orderBy(asc(behaviorSchedules.createdAt));

  const schedule = schedules.sort((a, b) => {
    const aPriority = effectiveTypes.indexOf(a.effectiveType);
    const bPriority = effectiveTypes.indexOf(b.effectiveType);
    return aPriority - bPriority;
  })[0];

  if (!schedule) {
    return { timeZone: PET_SCHEDULE_TIME_ZONE, schedule: null, blocks: [] };
  }

  const blocks = await db
    .select()
    .from(behaviorScheduleBlocks)
    .where(eq(behaviorScheduleBlocks.scheduleId, schedule.id))
    .orderBy(asc(behaviorScheduleBlocks.sortOrder), asc(behaviorScheduleBlocks.startMinutes));

  return {
    timeZone: PET_SCHEDULE_TIME_ZONE,
    schedule,
    blocks,
  };
}

deviceReportRoute.use("*", async (c, next) => {
  if (c.req.path.endsWith("/tabletop/manifest")) {
    await next();
    return;
  }

  const expectedSecret = process.env.DEVICE_REPORT_SECRET?.trim();
  if (!expectedSecret) {
    return c.json({ error: "Device report secret is not configured" }, 503);
  }

  const providedSecret = c.req.header("X-Device-Secret");
  if (!providedSecret || !isValidDeviceSecret(expectedSecret, providedSecret)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

deviceReportRoute.get("/tabletop/manifest", async (c) => {
  const parsedQuery = manifestQuerySchema.safeParse({ chipId: c.req.query("chipId") });
  if (!parsedQuery.success) {
    return c.json({ error: "chipId is required" }, 400);
  }

  const chipId = normalizeDeviceChipId(parsedQuery.data.chipId);
  const now = new Date();
  let desktop = await findDesktopByChipId(chipId);

  if (!desktop) {
    const [createdDesktop] = await db
      .insert(desktopDevices)
      .values({
        name: `摆台-${chipId.slice(-6)}`,
        chipId,
        macAddress: chipId,
        claimStatus: "unclaimed",
        status: "online",
        lastOnlineAt: now,
        updatedAt: now,
      })
      .returning();

    desktop = createdDesktop ?? null;
  } else {
    desktop = await markDesktopOnlineByChipId(chipId, { now }) ?? desktop;
  }

  if (!desktop) {
    return c.json({ collarChipId: null, files: [], allActionTypes: ALL_ACTIONS });
  }

  const petId = await getActiveDesktopPetId(desktop.id);
  if (!petId) {
    return c.json({ collarChipId: null, files: [], allActionTypes: ALL_ACTIONS });
  }

  const [collarChipId, files, activityMode] = await Promise.all([
    getCollarChipId(petId),
    buildAvatarManifestFiles(petId),
    getPetModeManifest(petId),
  ]);
  const systemSchedule = activityMode.species
    ? await getSystemScheduleManifest(activityMode.species)
    : { timeZone: PET_SCHEDULE_TIME_ZONE, schedule: null, blocks: [] };

  return c.json({
    collarChipId,
    files,
    allActionTypes: ALL_ACTIONS,
    scheduleTimeZone: PET_SCHEDULE_TIME_ZONE,
    activityMode: activityMode.mode,
    modePlans: activityMode.plans,
    systemSchedule,
  });
});

deviceReportRoute.post("/heartbeat", async (c) => {
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = heartbeatBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json(buildValidationError(parsedBody.error), 400);
  }

  const body = parsedBody.data;
  const now = new Date();

  if (body.type === "collar") {
    const collar = await findCollarByIdentity(body);
    if (!collar) {
      return c.json({ error: "Device not registered" }, 404);
    }

    const updatePayload: DeviceHeartbeatUpdate<typeof collarDevices.$inferInsert> = {
      status: body.status,
      lastOnlineAt: now,
      updatedAt: now,
    };

    if (body.firmwareVersion !== undefined) {
      updatePayload.firmwareVersion = body.firmwareVersion;
    }
    if (body.battery !== undefined) {
      updatePayload.battery = body.battery;
    }
    if (body.signal !== undefined) {
      updatePayload.signal = body.signal;
    }
    const usageIncrement = body.status === "online"
      ? getUsageDurationIncrementMinutes(collar.lastOnlineAt, now)
      : 0;
    if (usageIncrement > 0) {
      updatePayload.usageDurationMinutes = sql`${collarDevices.usageDurationMinutes} + ${usageIncrement}`;
    }

    const [updated] = await db
      .update(collarDevices)
      .set(updatePayload)
      .where(eq(collarDevices.id, collar.id))
      .returning();

    return c.json({
      success: true,
      deviceId: updated.id,
      type: body.type,
      lastOnlineAt: toIsoString(updated.lastOnlineAt),
    });
  }

  const desktop = await findDesktopByIdentity(body);
  if (!desktop) {
    return c.json({ error: "Device not registered" }, 404);
  }

  const updatePayload: DeviceHeartbeatUpdate<typeof desktopDevices.$inferInsert> = {
    status: body.status,
    lastOnlineAt: now,
    updatedAt: now,
  };

  if (body.firmwareVersion !== undefined) {
    updatePayload.firmwareVersion = body.firmwareVersion;
  }
  const usageIncrement = body.status === "online"
    ? getUsageDurationIncrementMinutes(desktop.lastOnlineAt, now)
    : 0;
  if (usageIncrement > 0) {
    updatePayload.usageDurationMinutes = sql`${desktopDevices.usageDurationMinutes} + ${usageIncrement}`;
  }

  const [updated] = await db
    .update(desktopDevices)
    .set(updatePayload)
    .where(eq(desktopDevices.id, desktop.id))
    .returning();

  return c.json({
    success: true,
    deviceId: updated.id,
    type: body.type,
    lastOnlineAt: toIsoString(updated.lastOnlineAt),
  });
});

deviceReportRoute.post("/event", async (c) => {
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = eventBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json(buildValidationError(parsedBody.error), 400);
  }

  const body = parsedBody.data;
  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();

  if (body.type === "collar") {
    const collar = await findCollarByIdentity(body);
    if (!collar) {
      return c.json({ error: "Device not registered" }, 404);
    }
    if (!collar.petId) {
      return c.json({ error: "Collar has no bound pet" }, 400);
    }

    const [behavior] = await db
      .insert(petBehaviors)
      .values({
        petId: collar.petId,
        collarDeviceId: collar.id,
        actionType: body.actionType,
        timestamp: occurredAt,
      })
      .returning();

    const [pet] = await db
      .select({ activityMode: pets.activityMode })
      .from(pets)
      .where(eq(pets.id, collar.petId))
      .limit(1);

    if (pet?.activityMode === "real") {
      await dispatchPetAction(collar.petId).catch((error) => {
        console.error("[pet-mode] real action dispatch failed:", error);
      });
    }

    return c.json(
      {
        success: true,
        eventId: behavior.id,
        occurredAt: toIsoString(behavior.timestamp),
      },
      201,
    );
  }

  const desktop = await findDesktopByIdentity(body);
  if (!desktop) {
    return c.json({ error: "Device not registered" }, 404);
  }
  if (!desktop.userId) {
    return c.json({ error: "Desktop not bound to user or pet" }, 400);
  }

  const [binding] = await db
    .select()
    .from(desktopPetBindings)
    .where(
      and(
        eq(desktopPetBindings.desktopDeviceId, desktop.id),
        isNull(desktopPetBindings.unboundAt),
      ),
    )
    .orderBy(desc(desktopPetBindings.createdAt))
    .limit(1);

  if (!binding) {
    return c.json({ error: "Desktop not bound to user or pet" }, 400);
  }

  const [event] = await db
    .insert(interactionEvents)
    .values({
      userId: desktop.userId,
      petId: binding.petId,
      deviceId: desktop.id,
      actionType: body.actionType,
      occurredAt,
    })
    .returning();

  return c.json(
    {
      success: true,
      eventId: event.id,
      occurredAt: toIsoString(event.occurredAt),
    },
    201,
  );
});

export default deviceReportRoute;
