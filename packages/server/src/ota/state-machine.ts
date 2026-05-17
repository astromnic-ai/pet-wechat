import type { FirmwareState } from "shared";
import { eq, or } from "drizzle-orm";
import { db } from "../db";
import { firmwareVersions } from "../db/schema";
import { checkInternalReadyForRelease } from "./internal-readiness";

export type TransitionContext = {
  operator?: string;
  reason?: string;
  triggeredBy?: string;
  manual?: boolean;
};

export class FirmwareStateTransitionError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "FirmwareStateTransitionError";
  }
}

function transitionAllowed(
  from: FirmwareState,
  to: FirmwareState,
  ctx: TransitionContext,
) {
  if (from === to) return true;
  if (from === "draft" && to === "internal") return true;
  if (from === "internal" && to === "released") return true;
  if (to === "quarantine") return true;
  if (from === "quarantine" && to === "released") return ctx.manual === true;
  return false;
}

function appendTransitionLog(
  current: string | null,
  from: FirmwareState,
  to: FirmwareState,
  ctx: TransitionContext,
) {
  const actor = ctx.triggeredBy
    ? `triggeredBy=${ctx.triggeredBy}`
    : `operator=${ctx.operator ?? "system"}`;
  const reason = ctx.reason ? ` reason=${ctx.reason}` : "";
  const line = `[${new Date().toISOString()}] state ${from}->${to} ${actor}${reason}`;
  return current ? `${current}\n${line}` : line;
}

export async function transitionTo(
  versionOrId: string,
  newState: FirmwareState,
  ctx: TransitionContext = {},
) {
  const [current] = await db
    .select()
    .from(firmwareVersions)
    .where(
      or(
        eq(firmwareVersions.id, versionOrId),
        eq(firmwareVersions.version, versionOrId),
      ),
    )
    .limit(1);

  if (!current) {
    throw new FirmwareStateTransitionError("firmware_version_not_found");
  }

  const currentState = current.state as FirmwareState;
  if (!transitionAllowed(currentState, newState, ctx)) {
    throw new FirmwareStateTransitionError("invalid_state_transition", {
      from: currentState,
      to: newState,
    });
  }

  if (currentState === "internal" && newState === "released") {
    const readiness = await checkInternalReadyForRelease(current.version);
    if (!readiness.ok) {
      throw new FirmwareStateTransitionError(
        "internal_release_not_ready",
        readiness,
      );
    }
  }

  const now = new Date();
  const updates: Partial<typeof firmwareVersions.$inferInsert> = {
    state: newState,
    releaseNote: appendTransitionLog(current.releaseNote, currentState, newState, ctx),
  };

  if (newState === "quarantine") {
    updates.quarantinedAt = now;
    updates.quarantinedReason =
      ctx.reason ??
      (ctx.triggeredBy ? `rolled_back by ${ctx.triggeredBy}` : "manual quarantine");
  }

  const [updated] = await db
    .update(firmwareVersions)
    .set(updates)
    .where(eq(firmwareVersions.id, current.id))
    .returning();

  return updated;
}
