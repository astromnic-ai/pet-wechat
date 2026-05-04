import { Hono } from "hono";
import { db } from "../db";
import {
  pets,
  petAvatars,
  petAvatarActions,
  petBehaviors,
  interactionEvents,
  collarDevices,
  desktopPetBindings,
  deviceAuthorizations,
} from "../db/schema";
import { eq, and, isNull, inArray, gte, desc } from "drizzle-orm";
import type { AvatarStatus, PetLatestBehavior } from "shared";
import { interactionRangeSchema } from "../validators/user-end";
import { rewriteLocalAssetUrl } from "../utils/publicUrl";

const petsRoute = new Hono();

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

type LatestAvatarSummary = {
  avatarId: string;
  status: AvatarStatus;
  sourceImageUrl: string;
  imageUrl: string | null;
};

async function getLatestAvatarSummaryMap(petIds: string[]) {
  const latestAvatarSummaryMap = new Map<string, LatestAvatarSummary>();
  if (petIds.length === 0) return latestAvatarSummaryMap;

  const latestAvatars = await db
    .select({
      id: petAvatars.id,
      petId: petAvatars.petId,
      status: petAvatars.status,
      sourceImageUrl: petAvatars.sourceImageUrl,
    })
    .from(petAvatars)
    .where(inArray(petAvatars.petId, petIds))
    .orderBy(desc(petAvatars.createdAt));

  const latestAvatarByPetId = new Map<string, (typeof latestAvatars)[number]>();
  for (const avatar of latestAvatars) {
    if (latestAvatarByPetId.has(avatar.petId)) continue;
    latestAvatarByPetId.set(avatar.petId, avatar);
  }

  const latestDoneAvatarIds = Array.from(latestAvatarByPetId.values())
    .filter((avatar) => avatar.status === "done")
    .map((avatar) => avatar.id);

  const primaryImageByAvatarId = new Map<string, string>();

  if (latestDoneAvatarIds.length > 0) {
    const primaryActions = await db
      .select({
        petAvatarId: petAvatarActions.petAvatarId,
        imageUrl: petAvatarActions.imageUrl,
        sortOrder: petAvatarActions.sortOrder,
      })
      .from(petAvatarActions)
      .where(inArray(petAvatarActions.petAvatarId, latestDoneAvatarIds))
      .orderBy(petAvatarActions.sortOrder);

    for (const action of primaryActions) {
      if (primaryImageByAvatarId.has(action.petAvatarId)) continue;
      primaryImageByAvatarId.set(action.petAvatarId, action.imageUrl);
    }
  }

  for (const [petId, avatar] of latestAvatarByPetId) {
    latestAvatarSummaryMap.set(petId, {
      avatarId: avatar.id,
      status: avatar.status,
      sourceImageUrl: avatar.sourceImageUrl,
      imageUrl: primaryImageByAvatarId.get(avatar.id) ?? null,
    });
  }

  return latestAvatarSummaryMap;
}

function attachPetSummary<T extends typeof pets.$inferSelect>(
  petList: T[],
  latestBehaviorMap: Map<string, PetLatestBehavior>,
  latestAvatarSummaryMap: Map<string, LatestAvatarSummary>,
  requestUrl: string,
) {
  return petList.map((pet) => ({
    ...pet,
    latestBehavior: latestBehaviorMap.get(pet.id) ?? null,
    avatarImageUrl: rewriteLocalAssetUrl(
      latestAvatarSummaryMap.get(pet.id)?.imageUrl ?? null,
      requestUrl,
    ),
    latestAvatarId: latestAvatarSummaryMap.get(pet.id)?.avatarId ?? null,
    latestAvatarStatus: latestAvatarSummaryMap.get(pet.id)?.status ?? null,
    latestAvatarSourceImageUrl: rewriteLocalAssetUrl(
      latestAvatarSummaryMap.get(pet.id)?.sourceImageUrl ?? null,
      requestUrl,
    ),
  }));
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
) {
  const now = new Date();

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

  const latestAvatarSummaryMap = await getLatestAvatarSummaryMap([
    ...ownPets.map((pet) => pet.id),
    ...authorizedPets.map((pet) => pet.id),
  ]);

  return c.json({
    pets: attachPetSummary(ownPets, latestBehaviorMap, latestAvatarSummaryMap, c.req.url),
    authorizedPets: attachPetSummary(
      authorizedPets,
      latestBehaviorMap,
      latestAvatarSummaryMap,
      c.req.url,
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

  const events = await db
    .select({
      occurredAt: interactionEvents.occurredAt,
    })
    .from(interactionEvents)
    .where(eq(interactionEvents.petId, petId));

  const now = new Date();
  const todayStart = getStartOfLocalDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 29);
  const occurredAtList = events
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
    totalCount: events.length,
    todayCount,
    weekCount,
    monthCount,
    ...(range
      ? {
          buckets: buildInteractionBuckets(range, occurredAtList),
        }
      : {}),
  });
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
    pet: { ...pet, activityScore, latestBehavior },
    avatars: avatars.map((avatar) => ({
      ...avatar,
      sourceImageUrl: rewriteLocalAssetUrl(avatar.sourceImageUrl, c.req.url),
    })),
    actions: actions.map((action) => ({
      ...action,
      imageUrl: rewriteLocalAssetUrl(action.imageUrl, c.req.url) ?? action.imageUrl,
    })),
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
      name: body.name ?? existing.name,
      species: body.species ?? existing.species,
      breed: body.breed ?? existing.breed,
      gender: body.gender ?? existing.gender,
      birthday: body.birthday ?? existing.birthday,
      weight: body.weight ?? existing.weight,
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
  return c.json({ success: true });
});

export default petsRoute;
