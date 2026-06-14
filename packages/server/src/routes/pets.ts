import { Hono } from "hono";
import { db } from "../db";
import {
  pets,
  petAvatars,
  petAvatarActions,
  petBehaviors,
  petModePlans,
  petModeSlots,
  interactionEvents,
  collarDevices,
  desktopDevices,
  desktopPetBindings,
  deviceAuthorizations,
} from "../db/schema";
import { eq, and, isNull, inArray, gte, lte, desc, asc, sql } from "drizzle-orm";
import type { PetActivityMode, PetLatestBehavior, PetModePlanDTO, PetModeWeekday } from "shared";
import { normalizePublicFileUrl } from "../utils/storage";
import { interactionRangeSchema } from "../validators/user-end";
import { dispatchPetAction } from "../pet-mode/scheduler";
import { clearRetainedDesktopConfig } from "../ota/mqtt-client";
import { normalizePetActionType } from "../utils/pet-actions";

const petsRoute = new Hono();
const PET_ACTIVITY_MODES = ["free", "custom", "real"] as const;
const PET_MODE_REPEATS = ["once", "weekly"] as const;
const PET_MODE_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function normalizeBehaviorTimestamp(timestamp: Date | string): string {
  return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
}

async function getLatestBehaviorMap(petIds: string[]) {
  const latestBehaviorMap = new Map<string, PetLatestBehavior>();
  if (petIds.length === 0) return latestBehaviorMap;

  // 按时间倒序查询，应用层取每只宠物的第一条（即最新）
  const behaviors = await db
    .select({
      petId: petBehaviors.petId,
      actionType: petBehaviors.actionType,
      timestamp: petBehaviors.timestamp,
    })
    .from(petBehaviors)
    .where(inArray(petBehaviors.petId, petIds))
    .orderBy(desc(petBehaviors.timestamp));

  for (const behavior of behaviors) {
    if (latestBehaviorMap.has(behavior.petId)) continue;

    latestBehaviorMap.set(behavior.petId, {
      actionType: behavior.actionType,
      timestamp: normalizeBehaviorTimestamp(behavior.timestamp),
    });
  }

  return latestBehaviorMap;
}

async function getLatestBehavior(petId: string) {
  const [behavior] = await db
    .select({
      actionType: petBehaviors.actionType,
      timestamp: petBehaviors.timestamp,
    })
    .from(petBehaviors)
    .where(eq(petBehaviors.petId, petId))
    .orderBy(desc(petBehaviors.timestamp))
    .limit(1);

  if (!behavior) return null;

  return {
    actionType: behavior.actionType,
    timestamp: normalizeBehaviorTimestamp(behavior.timestamp),
  } satisfies PetLatestBehavior;
}

async function getLatestAvatarImageMap(petIds: string[]) {
  const latestAvatarImageMap = new Map<string, string>();
  if (petIds.length === 0) return latestAvatarImageMap;

  // 对每个 petId 取最新一条 done avatar（使用 SQL 子查询避免全量扫描）
  // Drizzle 不支持 DISTINCT ON，改用应用层去重但限制查询量
  const doneAvatars = await db
    .select({
      id: petAvatars.id,
      petId: petAvatars.petId,
    })
    .from(petAvatars)
    .where(
      and(
        inArray(petAvatars.petId, petIds),
        eq(petAvatars.status, "done"),
      )
    )
    .orderBy(desc(petAvatars.createdAt))
    .limit(petIds.length); // 最多只取 petIds.length 条，每个宠物最多 1 条

  const latestAvatarByPetId = new Map<string, string>();
  for (const avatar of doneAvatars) {
    if (latestAvatarByPetId.has(avatar.petId)) continue;
    latestAvatarByPetId.set(avatar.petId, avatar.id);
  }

  const latestAvatarIds = Array.from(latestAvatarByPetId.values());
  if (latestAvatarIds.length === 0) return latestAvatarImageMap;

  // 取每个 avatar 的第一张 action 图片（按 sortOrder 最小的）
  const primaryActions = await db
    .select({
      petAvatarId: petAvatarActions.petAvatarId,
      imageUrl: petAvatarActions.imageUrl,
      sortOrder: petAvatarActions.sortOrder,
    })
    .from(petAvatarActions)
    .where(inArray(petAvatarActions.petAvatarId, latestAvatarIds))
    .orderBy(petAvatarActions.sortOrder);

  // 应用层去重：每个 avatarId 只取 sortOrder 最小的
  const primaryImageByAvatarId = new Map<string, string>();
  for (const action of primaryActions) {
    if (primaryImageByAvatarId.has(action.petAvatarId)) continue;
    primaryImageByAvatarId.set(action.petAvatarId, action.imageUrl);
  }

  for (const [petId, avatarId] of latestAvatarByPetId) {
    const imageUrl = primaryImageByAvatarId.get(avatarId);
    if (!imageUrl) continue;
    latestAvatarImageMap.set(petId, imageUrl);
  }

  return latestAvatarImageMap;
}

function attachPetSummary<T extends typeof pets.$inferSelect>(
  petList: T[],
  latestBehaviorMap: Map<string, PetLatestBehavior>,
  latestAvatarImageMap: Map<string, string>,
) {
  return petList.map((pet) => ({
    ...pet,
    latestBehavior: latestBehaviorMap.get(pet.id) ?? null,
    avatarImageUrl: latestAvatarImageMap.get(pet.id) ?? null,
    draftAvatarSourceImageUrl: normalizePublicFileUrl(pet.draftAvatarSourceImageUrl) ?? pet.draftAvatarSourceImageUrl,
  }));
}

function toPetAvatarActionResponse(action: typeof petAvatarActions.$inferSelect) {
  return {
    ...action,
    imageUrl: normalizePublicFileUrl(action.imageUrl) ?? action.imageUrl,
    videoUrl: normalizePublicFileUrl(action.videoUrl) ?? action.videoUrl,
  };
}

function getStartOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatMonthDay(date: Date) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseOccurredAt(occurredAt: Date | string) {
  const next = new Date(occurredAt);
  if (Number.isNaN(next.getTime())) {
    return null;
  }

  return next;
}

function buildInteractionBuckets(
  range: "day" | "week" | "month",
  occurredAtList: Date[],
  now: Date,
) {
  if (range === "day") {
    const todayStart = getStartOfLocalDay(now);
    const counts = new Array(24).fill(0);

    occurredAtList.forEach((occurredAt) => {
      if (occurredAt < todayStart || occurredAt > now) return;
      counts[occurredAt.getHours()] += 1;
    });

    return counts.map((count, hour) => ({
      label: `${String(hour).padStart(2, "0")}:00`,
      count,
    }));
  }

  const bucketCount = range === "week" ? 7 : 30;
  const startDate = getStartOfLocalDay(now);
  startDate.setDate(startDate.getDate() - (bucketCount - 1));

  const keys = Array.from({ length: bucketCount }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      key: getLocalDateKey(date),
      label: formatMonthDay(date),
    };
  });

  const countMap = new Map(keys.map((item) => [item.key, 0]));

  occurredAtList.forEach((occurredAt) => {
    if (occurredAt > now) return;
    const key = getLocalDateKey(occurredAt);
    if (!countMap.has(key)) return;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  });

  return keys.map((item) => ({
    label: item.label,
    count: countMap.get(item.key) ?? 0,
  }));
}

async function getPetAccessState(userId: string, petId: string) {
  const [pet] = await db.select().from(pets).where(eq(pets.id, petId)).limit(1);
  if (!pet) {
    return { pet: null, hasAccess: false };
  }

  if (pet.userId === userId) {
    return { pet, hasAccess: true };
  }

  const [authorization] = await db
    .select({ id: deviceAuthorizations.id })
    .from(deviceAuthorizations)
    .where(
      and(
        eq(deviceAuthorizations.petId, petId),
        eq(deviceAuthorizations.toUserId, userId),
        eq(deviceAuthorizations.status, "accepted"),
      ),
    )
    .limit(1);

  return {
    pet,
    hasAccess: Boolean(authorization),
  };
}

function isPetActivityMode(value: unknown): value is PetActivityMode {
  return PET_ACTIVITY_MODES.includes(value as PetActivityMode);
}

function normalizePetModeDays(value: unknown): PetModeWeekday[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PetModeWeekday =>
    PET_MODE_WEEKDAYS.includes(item as PetModeWeekday),
  );
}

function normalizePetModePlanInput(value: any, index: number): PetModePlanDTO {
  const repeat = PET_MODE_REPEATS.includes(value?.repeat) ? value.repeat : "once";
  const days = normalizePetModeDays(value?.days);
  return {
    id: typeof value?.id === "string" && value.id ? value.id : `plan-${Date.now()}-${index}`,
    repeat,
    days,
    date: typeof value?.date === "string" && value.date ? value.date : null,
    sortOrder: Number.isFinite(Number(value?.sortOrder)) ? Number(value.sortOrder) : index,
    slots: Array.isArray(value?.slots)
      ? value.slots.map((slot: any, slotIndex: number) => ({
          id: typeof slot?.id === "string" && slot.id ? slot.id : `slot-${Date.now()}-${index}-${slotIndex}`,
          start: typeof slot?.start === "string" ? slot.start : "00:00",
          end: typeof slot?.end === "string" ? slot.end : "00:00",
          action: typeof slot?.action === "string" ? normalizePetActionType(slot.action) : "",
          sortOrder: Number.isFinite(Number(slot?.sortOrder)) ? Number(slot.sortOrder) : slotIndex,
        }))
      : [],
  };
}

async function getPetModePlans(petId: string): Promise<PetModePlanDTO[]> {
  const plans = await db
    .select()
    .from(petModePlans)
    .where(eq(petModePlans.petId, petId))
    .orderBy(asc(petModePlans.sortOrder), asc(petModePlans.id));

  if (plans.length === 0) return [];

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

  return plans.map((plan) => ({
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
  }));
}

async function getPetModeResponse(petId: string, mode: PetActivityMode) {
  return {
    mode,
    plans: await getPetModePlans(petId),
  };
}

async function dispatchPetActionSafely(petId: string) {
  try {
    await dispatchPetAction(petId);
  } catch (error) {
    console.error("[pet-mode] action dispatch failed:", error);
  }
}

async function clearDesktopConfigsSafely(chipIds: string[]) {
  await Promise.all(
    Array.from(new Set(chipIds.filter(Boolean))).map((chipId) =>
      clearRetainedDesktopConfig(chipId).catch((error) => {
        console.error("[pets] failed to clear desktop config after pet unbind", {
          chipId,
          error,
        });
      }),
    ),
  );
}

async function getDesktopChipIdsBoundToPet(petId: string) {
  const bindings = await db
    .select({ desktopDeviceId: desktopPetBindings.desktopDeviceId })
    .from(desktopPetBindings)
    .where(and(eq(desktopPetBindings.petId, petId), isNull(desktopPetBindings.unboundAt)));

  const desktopIds = bindings.map((binding) => binding.desktopDeviceId);
  if (desktopIds.length === 0) return [];

  const desktops = await db
    .select({ chipId: desktopDevices.chipId })
    .from(desktopDevices)
    .where(inArray(desktopDevices.id, desktopIds));

  return desktops.map((desktop) => desktop.chipId).filter((chipId): chipId is string => Boolean(chipId));
}

// 获取当前用户的所有宠物（含被授权的宠物）
petsRoute.get("/", async (c) => {
  const userId = c.get("userId" as never) as string;

  // 自己的宠物
  const ownPets = await db.select().from(pets).where(eq(pets.userId, userId));

  // 被授权的宠物
  const authorizedRecords = await db
    .select()
    .from(deviceAuthorizations)
    .where(
      and(
        eq(deviceAuthorizations.toUserId, userId),
        eq(deviceAuthorizations.status, "accepted"),
      )
    );
  const authorizedPetIds = authorizedRecords.map((a) => a.petId);
  let authorizedPets: typeof ownPets = [];
  if (authorizedPetIds.length > 0) {
    authorizedPets = await db
      .select()
      .from(pets)
      .where(inArray(pets.id, authorizedPetIds));
  }

  const latestBehaviorMap = await getLatestBehaviorMap([
    ...ownPets.map((pet) => pet.id),
    ...authorizedPets.map((pet) => pet.id),
  ]);

  const latestAvatarImageMap = await getLatestAvatarImageMap([
    ...ownPets.map((pet) => pet.id),
    ...authorizedPets.map((pet) => pet.id),
  ]);

  return c.json({
    pets: attachPetSummary(ownPets, latestBehaviorMap, latestAvatarImageMap),
    authorizedPets: attachPetSummary(
      authorizedPets,
      latestBehaviorMap,
      latestAvatarImageMap,
    ),
  });
});

petsRoute.get("/:petId/interaction-stats", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("petId");
  const rawRange = c.req.query("range");
  let range: "day" | "week" | "month" | undefined;

  if (rawRange) {
    const parsedRange = interactionRangeSchema.safeParse(rawRange);
    if (!parsedRange.success) {
      return c.json({ error: "Invalid range" }, 400);
    }
    range = parsedRange.data;
  }

  const { pet, hasAccess } = await getPetAccessState(userId, petId);
  if (!pet) return c.json({ error: "Pet not found" }, 404);
  if (!hasAccess) return c.json({ error: "Unauthorized" }, 403);

  const now = new Date();
  const todayStart = getStartOfLocalDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 29);
  const [countRows, recentEvents] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(interactionEvents)
      .where(eq(interactionEvents.petId, petId)),
    db
      .select({
        occurredAt: interactionEvents.occurredAt,
      })
      .from(interactionEvents)
      .where(
        and(
          eq(interactionEvents.petId, petId),
          gte(interactionEvents.occurredAt, monthStart),
          lte(interactionEvents.occurredAt, now),
        ),
      ),
  ]);

  const occurredAtList = recentEvents
    .map((event) => parseOccurredAt(event.occurredAt))
    .filter((occurredAt): occurredAt is Date => occurredAt !== null);

  const todayCount = occurredAtList.filter(
    (occurredAt) => occurredAt >= todayStart && occurredAt <= now,
  ).length;
  const weekCount = occurredAtList.filter(
    (occurredAt) => occurredAt >= weekStart && occurredAt <= now,
  ).length;
  const monthCount = occurredAtList.filter(
    (occurredAt) => occurredAt >= monthStart && occurredAt <= now,
  ).length;

  return c.json({
    totalCount: Number(countRows[0]?.count ?? 0),
    todayCount,
    weekCount,
    monthCount,
    ...(range
      ? {
          buckets: buildInteractionBuckets(range, occurredAtList, now),
        }
      : {}),
  });
});

petsRoute.get("/:petId/activity-mode", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("petId");

  const { pet, hasAccess } = await getPetAccessState(userId, petId);
  if (!pet) return c.json({ error: "Pet not found" }, 404);
  if (!hasAccess) return c.json({ error: "Unauthorized" }, 403);
  if (pet.userId !== userId) return c.json({ error: "Pet not found" }, 404);

  return c.json(await getPetModeResponse(petId, pet.activityMode));
});

petsRoute.put("/:petId/activity-mode", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("petId");
  const body = await c.req.json();

  if (!isPetActivityMode(body?.mode)) {
    return c.json({ error: "Invalid mode" }, 400);
  }

  const { pet, hasAccess } = await getPetAccessState(userId, petId);
  if (!pet) return c.json({ error: "Pet not found" }, 404);
  if (!hasAccess) return c.json({ error: "Unauthorized" }, 403);
  if (pet.userId !== userId) return c.json({ error: "Pet not found" }, 404);

  const [updated] = await db
    .update(pets)
    .set({ activityMode: body.mode, updatedAt: new Date() })
    .where(eq(pets.id, petId))
    .returning();

  await dispatchPetActionSafely(petId);
  return c.json(await getPetModeResponse(petId, updated.activityMode));
});

petsRoute.put("/:petId/custom-plans", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("petId");
  const body = await c.req.json();

  if (!Array.isArray(body?.plans)) {
    return c.json({ error: "Invalid plans" }, 400);
  }

  const { pet, hasAccess } = await getPetAccessState(userId, petId);
  if (!pet) return c.json({ error: "Pet not found" }, 404);
  if (!hasAccess) return c.json({ error: "Unauthorized" }, 403);
  if (pet.userId !== userId) return c.json({ error: "Pet not found" }, 404);

  const nextPlans: PetModePlanDTO[] = body.plans.map((plan: any, index: number) =>
    normalizePetModePlanInput(plan, index),
  );

  await db.transaction(async (tx) => {
    await tx.delete(petModePlans).where(eq(petModePlans.petId, petId));

    for (const plan of nextPlans) {
      await tx.insert(petModePlans).values({
        id: plan.id,
        petId,
        repeat: plan.repeat,
        days: plan.days,
        date: plan.date,
        sortOrder: plan.sortOrder ?? 0,
        updatedAt: new Date(),
      });

      if (plan.slots.length > 0) {
        await tx.insert(petModeSlots).values(
          plan.slots.map((slot, slotIndex) => ({
            id: slot.id,
            planId: plan.id,
            start: slot.start,
            end: slot.end,
            action: slot.action,
            sortOrder: slot.sortOrder ?? slotIndex,
          })),
        );
      }
    }
  });

  if (pet.activityMode === "custom") {
    await dispatchPetActionSafely(petId);
  }

  return c.json(await getPetModeResponse(petId, pet.activityMode));
});

// 获取单个宠物详情（含动态图像）
petsRoute.get("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");

  let [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)));

  if (!pet) {
    const [authorization] = await db
      .select()
      .from(deviceAuthorizations)
      .where(
        and(
          eq(deviceAuthorizations.petId, petId),
          eq(deviceAuthorizations.toUserId, userId),
          eq(deviceAuthorizations.status, "accepted"),
        )
      )
      .limit(1);

    if (authorization) {
      [pet] = await db
        .select()
        .from(pets)
        .where(eq(pets.id, petId))
        .limit(1);
    }
  }

  if (!pet) return c.json({ error: "Pet not found" }, 404);

  const latestBehavior = await getLatestBehavior(petId);

  const avatars = await db
    .select()
    .from(petAvatars)
    .where(eq(petAvatars.petId, petId));

  const avatarIds = avatars.map((a) => a.id);
  const actions: (typeof petAvatarActions.$inferSelect)[] =
    avatarIds.length > 0
      ? await db
          .select()
          .from(petAvatarActions)
          .where(inArray(petAvatarActions.petAvatarId, avatarIds))
      : [];

  // 计算活跃值：基于最近 7 天的行为记录数量
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const behaviors = await db
    .select()
    .from(petBehaviors)
    .where(and(eq(petBehaviors.petId, petId), gte(petBehaviors.timestamp, sevenDaysAgo)));
  const recentCount = behaviors.length;
  // TODO: 活跃值算法待产品定义，当前简单按行为次数映射 0-100
  const activityScore = Math.min(100, recentCount * 10);

  return c.json({
    pet: {
      ...pet,
      activityScore,
      latestBehavior,
      draftAvatarSourceImageUrl:
        normalizePublicFileUrl(pet.draftAvatarSourceImageUrl) ?? pet.draftAvatarSourceImageUrl,
    },
    avatars,
    actions: actions.map(toPetAvatarActionResponse),
  });
});

// 创建宠物
petsRoute.post("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.json();

  const [pet] = await db
    .insert(pets)
    .values({
      userId,
      name: body.name,
      species: body.species,
      breed: body.breed ?? null,
      gender: body.gender ?? "unknown",
      birthday: body.birthday ?? null,
      weight: body.weight ?? null,
    })
    .returning();

  return c.json({ pet }, 201);
});

// 更新宠物信息
petsRoute.put("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const body = await c.req.json();

  const [existing] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)));
  if (!existing) return c.json({ error: "Pet not found" }, 404);

  const [pet] = await db
    .update(pets)
    .set({
      name: existing.name,
      species: body.species ?? existing.species,
      breed: body.breed ?? existing.breed,
      gender: body.gender ?? existing.gender,
      birthday: body.birthday ?? existing.birthday,
      weight: body.weight ?? existing.weight,
      draftAvatarSourceImageUrl:
        body.draftAvatarSourceImageUrl === undefined
          ? existing.draftAvatarSourceImageUrl
          : body.draftAvatarSourceImageUrl || null,
      updatedAt: new Date(),
    })
    .where(eq(pets.id, petId))
    .returning();

  return c.json({ pet });
});

// 删除宠物
petsRoute.delete("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");

  const [existing] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)));
  if (!existing) return c.json({ error: "Pet not found" }, 404);

  const desktopChipIdsToClear = await getDesktopChipIdsBoundToPet(petId);

  // 级联删除关联数据
  const avatars = await db
    .select({ id: petAvatars.id })
    .from(petAvatars)
    .where(eq(petAvatars.petId, petId));
  const avatarIds = avatars.map((a) => a.id);
  if (avatarIds.length > 0) {
    await db
      .delete(petAvatarActions)
      .where(inArray(petAvatarActions.petAvatarId, avatarIds));
  }
  await db.delete(petAvatars).where(eq(petAvatars.petId, petId));
  await db.delete(petBehaviors).where(eq(petBehaviors.petId, petId));
  // 软删除绑定记录
  await db
    .update(desktopPetBindings)
    .set({ unboundAt: new Date() })
    .where(and(eq(desktopPetBindings.petId, petId), isNull(desktopPetBindings.unboundAt)));
  await db.delete(deviceAuthorizations).where(eq(deviceAuthorizations.petId, petId));
  // 解除项圈与该宠物的关联（不删除项圈本身）
  await db
    .update(collarDevices)
    .set({ petId: null })
    .where(eq(collarDevices.petId, petId));

  await db.delete(pets).where(eq(pets.id, petId));
  await clearDesktopConfigsSafely(desktopChipIdsToClear);
  return c.json({ success: true });
});

export default petsRoute;
