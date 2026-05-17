import type { OtaProgressPayload, OtaStage, StatusPayload } from "shared";
import { db } from "../db";
import { deviceRegistry, otaProgress } from "../db/schema";
import { clearRetainedOtaCommand } from "./mqtt-client";
import { handleRollback } from "./rollback-handler";

const TERMINAL_STAGES = new Set<OtaStage>(["verified", "failed", "rolled_back"]);

function parseTopic(topic: string) {
  const match = /^pet\/([^/]+)\/(status|ota)$/.exec(topic);
  if (!match) return null;
  return { chipId: match[1], kind: match[2] as "status" | "ota" };
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
    .onConflictDoNothing();

  if (TERMINAL_STAGES.has(progress.stage)) {
    await clearRetainedOtaCommand(chipId);
  }

  if (progress.stage === "rolled_back") {
    await handleRollback(chipId, progress.version, progress.code, progress.reason);
  }
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

    await handleOta(parsed.chipId, payload);
  } catch (error) {
    console.error("[ota:mqtt] bad message ignored:", {
      topic,
      error: error instanceof Error ? error.message : error,
    });
  }
}
