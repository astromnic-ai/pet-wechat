import type { OtaCommandPayload } from "shared";
import { db } from "../db";
import { dispatchJobs } from "../db/schema";
import { createFirmwarePresignedGetUrl } from "./firmware-storage";
import { publishOtaCommand } from "./mqtt-client";

const BATCH_SIZE = 20;
const BATCH_INTERVAL_MS = 5000;

type FirmwareRow = {
  version: string;
  storageKey: string;
  sha256: string;
  size: number;
  force: boolean;
  minFromVersion: string | null;
};

async function publishBatch(chipIds: string[], firmware: FirmwareRow) {
  const url = await createFirmwarePresignedGetUrl(firmware.storageKey, 3600);
  const payload: OtaCommandPayload = {
    v: 1,
    version: firmware.version,
    url,
    sha256: firmware.sha256,
    size: firmware.size,
    force: firmware.force,
    minFromVersion: firmware.minFromVersion,
  };

  await Promise.all(
    chipIds.map((chipId) => publishOtaCommand(chipId, payload, { retain: true })),
  );
}

function scheduleRemaining(chipIds: string[], firmware: FirmwareRow) {
  if (chipIds.length === 0) return;

  setTimeout(() => {
    const current = chipIds.slice(0, BATCH_SIZE);
    const remaining = chipIds.slice(BATCH_SIZE);
    void publishBatch(current, firmware)
      .catch((error) => {
        console.error("[ota:dispatch] throttled batch failed:", error);
      })
      .finally(() => scheduleRemaining(remaining, firmware));
  }, BATCH_INTERVAL_MS);
}

export async function dispatchVersion(opts: {
  chipIds: string[];
  firmware: FirmwareRow;
  source?: "manual" | "auto_full" | "internal_auto";
  createdBy?: string | null;
}) {
  const uniqueChipIds = Array.from(new Set(opts.chipIds.map((id) => id.trim()).filter(Boolean)));
  const immediateChipIds = uniqueChipIds.slice(0, BATCH_SIZE);
  const throttledChipIds = uniqueChipIds.slice(BATCH_SIZE);

  await db.insert(dispatchJobs).values({
    version: opts.firmware.version,
    chipIds: uniqueChipIds,
    source: opts.source ?? "manual",
    totalCount: uniqueChipIds.length,
    immediateCount: immediateChipIds.length,
    throttledCount: throttledChipIds.length,
    createdBy: opts.createdBy ?? null,
  });

  await publishBatch(immediateChipIds, opts.firmware);
  scheduleRemaining(throttledChipIds, opts.firmware);

  return {
    dispatched: uniqueChipIds.length,
    immediate: immediateChipIds.length,
    throttled: throttledChipIds.length,
  };
}
