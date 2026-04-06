import { Hono } from "hono";
import { db } from "../db";
import {
  pets,
  petAvatars,
  petAvatarActions,
  petBehaviors,
  petModes,
  petModeSchedules,
  customActions,
  deviceInteractions,
  collarDevices,
  desktopPetBindings,
  deviceAuthorizations,
} from "../db/schema";
import { eq, and, isNull, inArray, gte, desc } from "drizzle-orm";
import type { PetLatestBehavior } from "shared";

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
  }));
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

// 获取单个宠物详情（含动态图像）
petsRoute.get("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");

  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)));
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

  return c.json({ pet: { ...pet, activityScore, latestBehavior }, avatars, actions });
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
      description: body.description ?? null,
      color: body.color ?? null,
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
      description: body.description ?? existing.description,
      color: body.color ?? existing.color,
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
  await db.delete(petModes).where(eq(petModes.petId, petId));
  await db.delete(petModeSchedules).where(eq(petModeSchedules.petId, petId));
  await db.delete(customActions).where(eq(customActions.petId, petId));
  await db.delete(deviceInteractions).where(eq(deviceInteractions.petId, petId));
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
