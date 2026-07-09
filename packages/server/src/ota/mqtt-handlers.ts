import type { OtaProgressPayload, OtaStage, StatusPayload } from "shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  desktopPetBindings,
  desktopDevices,
  deviceRegistry,
  interactionEvents,
  otaProgress,
} from "../db/schema";
import { dispatchPetAction } from "../pet-mode/scheduler";
import {
  markDesktopOfflineByChipId,
  markDesktopOnlineByChipId,
  normalizeDeviceChipId,
} from "../utils/device-status";
import { clearRetainedOtaCommand } from "./mqtt-client";
import { handleRollback } from "./rollback-handler";

const TERMINAL_STAGES = new Set<OtaStage>(["verified", "failed", "rolled_back"]);
const INTERACTION_EVENT_TYPES = new Set(["touch", "button", "imu"]);

function parseTopic(topic: string) {
  const match = /^pet\/([^/]+)\/(status|ota|event)$/.exec(topic);
  if (!match) return null;
  return { chipId: match[1], kind: match[2] as "status" | "ota" | "event" };
}

function parseJsonPayload(payload: Buffer) {
  return JSON.parse(payload.toString("utf8")) as unknown;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeStatus(value: unknown): StatusPayload {
  if (!value || typeof value !== "object") {
    throw new Error("status payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  return {
    online: payload.online === false ? false : true,
    fw: typeof payload.fw === "string" ? payload.fw : undefined,
    ip: typeof payload.ip === "string" ? payload.ip : undefined,
    rssi: asNumber(payload.rssi),
    free_heap: asNumber(payload.free_heap),
    freeHeap: asNumber(payload.freeHeap),
    mac: typeof payload.mac === "string" ? payload.mac : undefined,
  };
}

function normalizeProgress(value: unknown): OtaProgressPayload | null {
  if (!value || typeof value !== "object") return null;

  const payload = value as Record<string, unknown>;
  if (typeof payload.stage !== "string") return null;
  if (typeof payload.version !== "string") {
    throw new Error("ota progress payload missing version");
  }

  return {
    version: payload.version,
    stage: payload.stage as OtaStage,
    percent: asNumber(payload.percent),
    code: typeof payload.code === "string" ? payload.code : undefined,
    reason: typeof payload.reason === "string" ? payload.reason : undefined,
    ts: asNumber(payload.ts) ?? Date.now(),
  };
}

function normalizeEvent(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("event payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.type !== "string" || payload.type.trim().length === 0) {
    throw new Error("event payload missing type");
  }

  const type = payload.type.trim();
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const actionType = sub ? `${type}_${sub}` : type;
  if (actionType.length > 64) {
    throw new Error("event actionType is too long");
  }

  return { type, actionType };
}

async function handleStatus(chipId: string, payload: Buffer) {
  const status = normalizeStatus(parseJsonPayload(payload));
  const now = new Date();

  await db
    .insert(deviceRegistry)
    .values({
      chipId,
      online: status.online,
      fw: status.fw,
      ip: status.ip,
      rssi: status.rssi,
      freeHeap: status.free_heap ?? status.freeHeap,
      mac: status.mac,
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: deviceRegistry.chipId,
      set: {
        online: status.online,
        fw: status.fw,
        ip: status.ip,
        rssi: status.rssi,
        freeHeap: status.free_heap ?? status.freeHeap,
        mac: status.mac,
        lastSeenAt: now,
      },
    });

  if (!status.online) {
    await markDesktopOfflineByChipId(chipId, { now });
    return;
  }

  const desktop = await markDesktopOnlineByChipId(chipId, { firmwareVersion: status.fw, now });

  if (!desktop) return;
  const [binding] = await db
    .select({ petId: desktopPetBindings.petId })
    .from(desktopPetBindings)
    .where(
      and(
        eq(desktopPetBindings.desktopDeviceId, desktop.id),
        isNull(desktopPetBindings.unboundAt),
      ),
    )
    .orderBy(desc(desktopPetBindings.createdAt))
    .limit(1);

  if (binding) {
    await dispatchPetAction(binding.petId, { force: true });
  }
}

async function handleOta(chipId: string, payload: Buffer) {
  if (payload.length === 0) return;

  const progress = normalizeProgress(parseJsonPayload(payload));
  if (!progress) return;

  await db
    .insert(otaProgress)
    .values({
      chipId,
      version: progress.version,
      stage: progress.stage,
      percent: progress.percent,
      code: progress.code,
      reason: progress.reason,
      deviceTs: progress.ts,
    })
    .onConflictDoUpdate({
      target: [
        otaProgress.chipId,
        otaProgress.version,
        otaProgress.stage,
        otaProgress.deviceTs,
      ],
      set: {
        percent: progress.percent,
        code: progress.code,
        reason: progress.reason,
        receivedAt: new Date(),
      },
    });

  if (TERMINAL_STAGES.has(progress.stage) && progress.stage !== "rolled_back") {
    await clearRetainedOtaCommand(chipId);
  }

  if (progress.stage === "rolled_back") {
    await handleRollback(chipId, progress.version, progress.code, progress.reason);
  }
}

async function handleEvent(chipId: string, payload: Buffer) {
  if (payload.length === 0) return;

  const event = normalizeEvent(parseJsonPayload(payload));
  if (!INTERACTION_EVENT_TYPES.has(event.type)) return;

  const normalizedChipId = normalizeDeviceChipId(chipId);
  if (!normalizedChipId) return;

  const [desktop] = await db
    .select()
    .from(desktopDevices)
    .where(
      eq(
        sql<string>`LOWER(REPLACE(${desktopDevices.chipId}, ':', ''))`,
        normalizedChipId,
      ),
    )
    .limit(1);

  if (!desktop?.userId) return;

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

  if (!binding) return;

  await db
    .insert(interactionEvents)
    .values({
      userId: desktop.userId,
      petId: binding.petId,
      deviceId: desktop.id,
      actionType: event.actionType,
      occurredAt: new Date(),
    })
    .returning();
}

export async function handleOtaMqttMessage(
  topic: string,
  payload: Buffer,
  _retained = false,
) {
  try {
    const parsed = parseTopic(topic);
    if (!parsed) return;

    if (parsed.kind === "status") {
      await handleStatus(parsed.chipId, payload);
      return;
    }

    if (parsed.kind === "ota") {
      await handleOta(parsed.chipId, payload);
      return;
    }

    await handleEvent(parsed.chipId, payload);
  } catch (error) {
    console.error("[ota:mqtt] bad message ignored:", {
      topic,
      error: error instanceof Error ? error.message : error,
    });
  }
}
