import { eq } from "drizzle-orm";
import { db } from "../db";
import { dispatchJobs, otaProgress } from "../db/schema";

export type InternalReadinessDevice = {
  chipId: string;
  latestStage: string | null;
  receivedAt: string | null;
  code: string | null;
  reason: string | null;
};

export type InternalReadinessResult =
  | { ready: true; checkedChipIds: string[]; devices: InternalReadinessDevice[] }
  | {
      ready: false;
      checkedChipIds: string[];
      missingVerified: string[];
      recentFailures: string[];
      devices: InternalReadinessDevice[];
    };

const BLOCKING_STAGES = ["rolled_back", "failed"] as const;
const TERMINAL_STAGES = new Set(["verified", ...BLOCKING_STAGES]);
const RELEASE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function checkInternalReadyForRelease(
  version: string,
): Promise<InternalReadinessResult> {
  const jobs = await db
    .select()
    .from(dispatchJobs)
    .where(eq(dispatchJobs.version, version));

  const progressRows = await db
    .select()
    .from(otaProgress)
    .where(eq(otaProgress.version, version));

  // 内测既支持后台主动下发，也支持白名单设备通过 /firmware/check 主动拉取。
  // 后者不会创建 dispatch_jobs，因此必须把实际上报过该版本进度的设备纳入发布队列。
  const checkedChipIds = Array.from(new Set([
    ...jobs.flatMap((job) => job.chipIds ?? []),
    ...progressRows.map((row) => row.chipId),
  ])).sort();

  if (checkedChipIds.length === 0) {
    return {
      ready: false,
      checkedChipIds,
      missingVerified: [],
      recentFailures: [],
      devices: [],
    };
  }

  const latestTerminalByChipId = new Map<string, (typeof progressRows)[number]>();
  for (const row of progressRows) {
    if (!TERMINAL_STAGES.has(row.stage)) continue;
    const current = latestTerminalByChipId.get(row.chipId);
    if (!current || row.receivedAt.getTime() > current.receivedAt.getTime()) {
      latestTerminalByChipId.set(row.chipId, row);
    }
  }

  const since = Date.now() - RELEASE_WINDOW_MS;
  const recentFailures = checkedChipIds.filter((chipId) => {
    const latest = latestTerminalByChipId.get(chipId);
    return Boolean(
      latest &&
      BLOCKING_STAGES.includes(latest.stage as (typeof BLOCKING_STAGES)[number]) &&
      latest.receivedAt.getTime() >= since,
    );
  });
  const missingVerified = checkedChipIds
    .filter((chipId) => latestTerminalByChipId.get(chipId)?.stage !== "verified")
    .sort();
  const devices = checkedChipIds.map((chipId) => {
    const latest = latestTerminalByChipId.get(chipId);
    return {
      chipId,
      latestStage: latest?.stage ?? null,
      receivedAt: latest?.receivedAt.toISOString() ?? null,
      code: latest?.code ?? null,
      reason: latest?.reason ?? null,
    };
  });

  if (missingVerified.length > 0 || recentFailures.length > 0) {
    return {
      ready: false,
      checkedChipIds,
      missingVerified,
      recentFailures,
      devices,
    };
  }

  return { ready: true, checkedChipIds, devices };
}
