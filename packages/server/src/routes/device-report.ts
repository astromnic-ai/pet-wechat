import { createHash, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { normalizeMac, NORMALIZED_MAC_REGEX } from "../utils/mac";
import {
  collarDevices,
  desktopDevices,
  desktopPetBindings,
  interactionEvents,
  petBehaviors,
} from "../db/schema";

const deviceReportRoute = new Hono();

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
  type: deviceTypeSchema,
  actionType: z.string().trim().min(1).max(64),
  occurredAt: isoDatetimeSchema.optional(),
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

async function findDesktopByMac(macAddress: string) {
  const [desktop] = await db
    .select()
    .from(desktopDevices)
    .where(eq(desktopDevices.macAddress, macAddress));

  return desktop ?? null;
}

deviceReportRoute.use("*", async (c, next) => {
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

deviceReportRoute.post("/heartbeat", async (c) => {
  const rawBody = await c.req.json().catch(() => null);
  const parsedBody = heartbeatBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return c.json(buildValidationError(parsedBody.error), 400);
  }

  const body = parsedBody.data;
  const now = new Date();

  if (body.type === "collar") {
    const collar = await findCollarByMac(body.macAddress);
    if (!collar) {
      return c.json({ error: "Device not registered" }, 404);
    }

    const updatePayload: Partial<typeof collarDevices.$inferInsert> = {
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

  const desktop = await findDesktopByMac(body.macAddress);
  if (!desktop) {
    return c.json({ error: "Device not registered" }, 404);
  }

  const updatePayload: Partial<typeof desktopDevices.$inferInsert> = {
    status: body.status,
    lastOnlineAt: now,
    updatedAt: now,
  };

  if (body.firmwareVersion !== undefined) {
    updatePayload.firmwareVersion = body.firmwareVersion;
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
    const collar = await findCollarByMac(body.macAddress);
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

    return c.json(
      {
        success: true,
        eventId: behavior.id,
        occurredAt: toIsoString(behavior.timestamp),
      },
      201,
    );
  }

  const desktop = await findDesktopByMac(body.macAddress);
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
