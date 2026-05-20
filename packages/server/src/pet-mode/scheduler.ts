import { actionToLabel } from "shared";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  behaviorScheduleBlocks,
  behaviorSchedules,
  desktopPetBindings,
  petBehaviors,
  petModePlans,
  petModeSlots,
  pets,
} from "../db/schema";
import { isConnected, publishPetAction } from "../ota/mqtt-client";

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const lastDispatchedActions = new Map<string, string>();

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function getLocalDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getLocalMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function getEffectiveTypes(date: Date): Array<"friday" | "weekday" | "everyday"> {
  const day = date.getDay();
  const types: Array<"friday" | "weekday" | "everyday"> = ["everyday"];
  if (day >= 1 && day <= 5) {
    types.unshift("weekday");
  }
  if (day === 5) {
    types.unshift("friday");
  }
  return types;
}

function getEffectiveTypePriority(type: string) {
  if (type === "friday") return 0;
  if (type === "weekday") return 1;
  return 2;
}

function isCurrentSlot(start: string, end: string, now: string) {
  return start <= now && now < end;
}

async function resolveFreeAction(
  species: string,
  now: Date,
): Promise<string | null> {
  const effectiveTypes = getEffectiveTypes(now);
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

  const schedule = schedules.sort(
    (a, b) =>
      getEffectiveTypePriority(a.effectiveType) -
      getEffectiveTypePriority(b.effectiveType),
  )[0];

  if (!schedule) return null;

  const currentMinutes = getLocalMinutes(now);
  const blocks = await db
    .select()
    .from(behaviorScheduleBlocks)
    .where(eq(behaviorScheduleBlocks.scheduleId, schedule.id))
    .orderBy(asc(behaviorScheduleBlocks.sortOrder), asc(behaviorScheduleBlocks.startMinutes));

  return blocks.find(
    (item) =>
      item.startMinutes <= currentMinutes && currentMinutes < item.endMinutes,
  )?.actionType ?? null;
}

async function resolveCustomAction(petId: string, now: Date): Promise<string | null> {
  const plans = await db
    .select()
    .from(petModePlans)
    .where(eq(petModePlans.petId, petId))
    .orderBy(asc(petModePlans.sortOrder), asc(petModePlans.id));

  if (plans.length === 0) return null;

  const today = getLocalDateKey(now);
  const weekday = WEEKDAYS[now.getDay()];
  const plan = plans.find((item) => {
    if (item.repeat === "weekly") {
      return Array.isArray(item.days) && item.days.includes(weekday);
    }
    return item.date === today;
  });

  if (!plan) return null;

  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  const slots = await db
    .select()
    .from(petModeSlots)
    .where(eq(petModeSlots.planId, plan.id))
    .orderBy(asc(petModeSlots.sortOrder), asc(petModeSlots.id));

  return slots.find((slot) => isCurrentSlot(slot.start, slot.end, currentTime))
    ?.action ?? null;
}

async function resolveRealAction(petId: string): Promise<string | null> {
  const [behavior] = await db
    .select({ actionType: petBehaviors.actionType })
    .from(petBehaviors)
    .where(eq(petBehaviors.petId, petId))
    .orderBy(desc(petBehaviors.timestamp))
    .limit(1);

  return behavior?.actionType ?? null;
}

export async function resolveCurrentAction(petId: string): Promise<string | null> {
  const [pet] = await db
    .select({
      id: pets.id,
      species: pets.species,
      activityMode: pets.activityMode,
    })
    .from(pets)
    .where(eq(pets.id, petId))
    .limit(1);

  if (!pet) return null;

  const now = new Date();
  if (pet.activityMode === "free") {
    return resolveFreeAction(pet.species, now);
  }
  if (pet.activityMode === "custom") {
    return resolveCustomAction(pet.id, now);
  }
  return resolveRealAction(pet.id);
}

export async function dispatchPetAction(
  petId: string,
  opts: { force?: boolean } = {},
) {
  const action = await resolveCurrentAction(petId);
  if (!action) return;

  if (!opts.force && lastDispatchedActions.get(petId) === action) {
    return;
  }

  if (!isConnected()) {
    console.error("[pet-mode] mqtt client is not connected, skip action publish", {
      petId,
      action,
    });
    return;
  }

  const label = actionToLabel(action);
  await publishPetAction(petId, {
    v: 1,
    action,
    ...(label === undefined ? {} : { label }),
  });
  lastDispatchedActions.set(petId, action);
}

async function tickPetModeScheduler() {
  const rows = await db
    .select({ petId: pets.id })
    .from(pets)
    .innerJoin(
      desktopPetBindings,
      eq(desktopPetBindings.petId, pets.id),
    )
    .where(
      and(
        inArray(pets.activityMode, ["free", "custom"]),
        isNull(desktopPetBindings.unboundAt),
      ),
    );

  const petIds = Array.from(new Set(rows.map((row) => row.petId)));
  await Promise.all(
    petIds.map((petId) =>
      dispatchPetAction(petId).catch((error) => {
        console.error("[pet-mode] scheduled dispatch failed:", { petId, error });
      }),
    ),
  );
}

export function startPetModeScheduler() {
  if (schedulerTimer) return;

  schedulerTimer = setInterval(() => {
    void tickPetModeScheduler().catch((error) => {
      console.error("[pet-mode] scheduler tick failed:", error);
    });
  }, 60_000);

  void tickPetModeScheduler().catch((error) => {
    console.error("[pet-mode] scheduler initial tick failed:", error);
  });
}

export function stopPetModeScheduler() {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}
