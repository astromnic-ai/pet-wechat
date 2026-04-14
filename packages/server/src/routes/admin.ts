import { Hono } from "hono";
import { db } from "../db";
import {
  users,
  pets,
  collarDevices,
  desktopDevices,
  desktopPetBindings,
  petBehaviors,
  petAvatars,
  petAvatarActions,
  deviceAuthorizations,
} from "../db/schema";
import { eq, desc, sql, inArray, isNull } from "drizzle-orm";
import { createId } from "../utils/id";

function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result as Partial<T>;
}

async function validateCollarPetBinding(collarDeviceId: string, petId: string) {
  const [collar] = await db.select().from(collarDevices).where(eq(collarDevices.id, collarDeviceId));
  if (!collar) {
    return { valid: false as const, status: 404 as const, error: "Collar not found" };
  }
  if (collar.petId !== petId) {
    return { valid: false as const, status: 400 as const, error: "项圈与宠物不匹配" };
  }
  return { valid: true as const, collar };
}

const adminRoute = new Hono();

// ===== 用户 =====

adminRoute.get("/users", async (c) => {
  const result = await db.select().from(users).orderBy(desc(users.createdAt));
  return c.json({ users: result });
});

adminRoute.post("/users", async (c) => {
  const body = await c.req.json();
  const [user] = await db
    .insert(users)
    .values({
      nickname: body.nickname?.trim() || "",
      wechatOpenid: body.wechatOpenid ?? null,
      phone: body.phone ?? null,
      avatarUrl: body.avatarUrl ?? null,
      avatarQuota: body.avatarQuota ?? 2,
    })
    .returning();
  return c.json({ user }, 201);
});

adminRoute.put("/users/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const allowed = pick(body, ["nickname", "phone", "wechatOpenid", "avatarUrl", "avatarQuota"]);
  const [user] = await db
    .update(users)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ user });
});

adminRoute.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  await db.transaction(async (tx) => {
    // 查出该用户的所有宠物 ID
    const userPets = await tx.select({ id: pets.id }).from(pets).where(eq(pets.userId, id));
    const petIds = userPets.map((p) => p.id);

    if (petIds.length > 0) {
      // 清理宠物关联的 avatar actions 和 avatars
      const avatars = await tx.select({ id: petAvatars.id }).from(petAvatars).where(inArray(petAvatars.petId, petIds));
      const avatarIds = avatars.map((a) => a.id);
      if (avatarIds.length > 0) {
        await tx.delete(petAvatarActions).where(inArray(petAvatarActions.petAvatarId, avatarIds));
      }
      await tx.delete(petAvatars).where(inArray(petAvatars.petId, petIds));
      await tx.delete(petBehaviors).where(inArray(petBehaviors.petId, petIds));
      await tx.update(desktopPetBindings).set({ unboundAt: new Date() }).where(inArray(desktopPetBindings.petId, petIds));
      await tx.delete(deviceAuthorizations).where(inArray(deviceAuthorizations.petId, petIds));
      // 解除项圈与宠物的绑定
      await tx.update(collarDevices).set({ petId: null }).where(inArray(collarDevices.petId, petIds));
    }

    // 清理该用户的桌面端绑定
    await tx.update(desktopPetBindings).set({ unboundAt: new Date() }).where(
      eq(desktopPetBindings.desktopDeviceId, sql`ANY(SELECT id FROM desktop_devices WHERE user_id = ${id})`)
    );
    await tx.delete(collarDevices).where(eq(collarDevices.userId, id));
    await tx.delete(desktopDevices).where(eq(desktopDevices.userId, id));
    await tx.delete(deviceAuthorizations).where(eq(deviceAuthorizations.fromUserId, id));
    await tx.delete(deviceAuthorizations).where(eq(deviceAuthorizations.toUserId, id));
    await tx.delete(pets).where(eq(pets.userId, id));
    await tx.delete(users).where(eq(users.id, id));
  });
  return c.json({ success: true });
});

// ===== 宠物 =====

adminRoute.get("/pets", async (c) => {
  const result = await db
    .select({
      pet: pets,
      ownerNickname: users.nickname,
    })
    .from(pets)
    .leftJoin(users, eq(pets.userId, users.id))
    .orderBy(desc(pets.createdAt));
  return c.json({
    pets: result.map((r) => ({ ...r.pet, ownerNickname: r.ownerNickname })),
  });
});

adminRoute.post("/pets", async (c) => {
  const body = await c.req.json();
  const [pet] = await db
    .insert(pets)
    .values({
      userId: body.userId,
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

adminRoute.put("/pets/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const allowed = pick(body, ["name", "species", "breed", "gender", "birthday", "weight", "userId"]);
  const [pet] = await db
    .update(pets)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(pets.id, id))
    .returning();
  if (!pet) return c.json({ error: "Pet not found" }, 404);
  return c.json({ pet });
});

adminRoute.delete("/pets/:id", async (c) => {
  const id = c.req.param("id");
  await db.transaction(async (tx) => {
    // 清理 avatar actions 和 avatars
    const avatars = await tx.select({ id: petAvatars.id }).from(petAvatars).where(eq(petAvatars.petId, id));
    const avatarIds = avatars.map((a) => a.id);
    if (avatarIds.length > 0) {
      await tx.delete(petAvatarActions).where(inArray(petAvatarActions.petAvatarId, avatarIds));
    }
    await tx.delete(petAvatars).where(eq(petAvatars.petId, id));
    await tx.delete(petBehaviors).where(eq(petBehaviors.petId, id));
    await tx.update(desktopPetBindings)
      .set({ unboundAt: new Date() })
      .where(eq(desktopPetBindings.petId, id));
    await tx.delete(deviceAuthorizations).where(eq(deviceAuthorizations.petId, id));
    // 解除项圈与该宠物的绑定
    await tx.update(collarDevices).set({ petId: null }).where(eq(collarDevices.petId, id));
    await tx.delete(pets).where(eq(pets.id, id));
  });
  return c.json({ success: true });
});

// ===== 项圈设备 =====

adminRoute.get("/collars", async (c) => {
  const result = await db
    .select({
      collar: collarDevices,
      ownerNickname: users.nickname,
      petName: pets.name,
    })
    .from(collarDevices)
    .leftJoin(users, eq(collarDevices.userId, users.id))
    .leftJoin(pets, eq(collarDevices.petId, pets.id))
    .orderBy(desc(collarDevices.createdAt));
  return c.json({
    collars: result.map((r) => ({
      ...r.collar,
      ownerNickname: r.ownerNickname,
      petName: r.petName,
    })),
  });
});

adminRoute.post("/collars", async (c) => {
  const body = await c.req.json();
  const [collar] = await db
    .insert(collarDevices)
    .values({
      userId: body.userId ?? null,
      name: body.name?.trim() || "未命名项圈",
      macAddress: body.macAddress ?? `MOCK:${createId().slice(0, 11).replace(/(.{2})/g, "$1:").slice(0, 17)}`,
      // 无主设备不允许绑定宠物
      petId: body.userId ? (body.petId ?? null) : null,
      status: body.status ?? "offline",
      battery: body.battery ?? 100,
      signal: body.signal ?? -50,
      firmwareVersion: body.firmwareVersion ?? "1.0.0",
    })
    .returning();
  return c.json({ collar }, 201);
});

adminRoute.put("/collars/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const allowed = pick(body, ["name", "macAddress", "petId", "status", "battery", "signal", "firmwareVersion", "userId"]);
  const [collar] = await db
    .update(collarDevices)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(collarDevices.id, id))
    .returning();
  if (!collar) return c.json({ error: "Collar not found" }, 404);
  return c.json({ collar });
});

adminRoute.delete("/collars/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(petBehaviors).where(eq(petBehaviors.collarDeviceId, id));
  await db.delete(collarDevices).where(eq(collarDevices.id, id));
  return c.json({ success: true });
});

// ===== 桌面摆台 =====

adminRoute.get("/desktops", async (c) => {
  const result = await db
    .select({
      desktop: desktopDevices,
      ownerNickname: users.nickname,
    })
    .from(desktopDevices)
    .leftJoin(users, eq(desktopDevices.userId, users.id))
    .orderBy(desc(desktopDevices.createdAt));
  return c.json({
    desktops: result.map((r) => ({
      ...r.desktop,
      ownerNickname: r.ownerNickname,
    })),
  });
});

adminRoute.post("/desktops", async (c) => {
  const body = await c.req.json();
  const [desktop] = await db
    .insert(desktopDevices)
    .values({
      userId: body.userId ?? null,
      name: body.name?.trim() || "未命名桌面端",
      macAddress: body.macAddress ?? `MOCK:${createId().slice(0, 11).replace(/(.{2})/g, "$1:").slice(0, 17)}`,
      status: body.status ?? "offline",
      firmwareVersion: body.firmwareVersion ?? "1.0.0",
    })
    .returning();
  return c.json({ desktop }, 201);
});

adminRoute.put("/desktops/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const allowed = pick(body, ["name", "macAddress", "status", "firmwareVersion", "userId"]);
  const [desktop] = await db
    .update(desktopDevices)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(desktopDevices.id, id))
    .returning();
  if (!desktop) return c.json({ error: "Desktop not found" }, 404);
  return c.json({ desktop });
});

adminRoute.delete("/desktops/:id", async (c) => {
  const id = c.req.param("id");
  await db
    .update(desktopPetBindings)
    .set({ unboundAt: new Date() })
    .where(eq(desktopPetBindings.desktopDeviceId, id));
  await db.delete(desktopDevices).where(eq(desktopDevices.id, id));
  return c.json({ success: true });
});

// ===== 行为事件 =====

adminRoute.get("/behaviors", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const result = await db
    .select({
      behavior: petBehaviors,
      petName: pets.name,
      collarName: collarDevices.name,
    })
    .from(petBehaviors)
    .leftJoin(pets, eq(petBehaviors.petId, pets.id))
    .leftJoin(collarDevices, eq(petBehaviors.collarDeviceId, collarDevices.id))
    .orderBy(desc(petBehaviors.timestamp))
    .limit(limit);
  return c.json({
    behaviors: result.map((r) => ({
      ...r.behavior,
      petName: r.petName,
      collarName: r.collarName,
    })),
  });
});

adminRoute.post("/behaviors", async (c) => {
  const body = await c.req.json();
  const validation = await validateCollarPetBinding(body.collarDeviceId, body.petId);
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.status);
  }
  const [behavior] = await db
    .insert(petBehaviors)
    .values({
      petId: body.petId,
      collarDeviceId: body.collarDeviceId,
      actionType: body.actionType,
      timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
    })
    .returning();
  return c.json({ behavior }, 201);
});

// 自动生成随机行为事件
adminRoute.post("/behaviors/auto", async (c) => {
  const body = await c.req.json<{
    petId: string;
    collarDeviceId: string;
    count?: number;
    intervalMinutes?: number;
  }>();

  const count = Math.min(body.count ?? 10, 100);
  const intervalMinutes = body.intervalMinutes ?? 30;
  const actionTypes = ["walking", "running", "sleeping", "eating", "playing", "resting", "jumping"];
  const now = Date.now();
  const validation = await validateCollarPetBinding(body.collarDeviceId, body.petId);
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.status);
  }

  const values = Array.from({ length: count }, (_, i) => ({
    petId: body.petId,
    collarDeviceId: body.collarDeviceId,
    actionType: actionTypes[Math.floor(Math.random() * actionTypes.length)],
    timestamp: new Date(now - i * intervalMinutes * 60 * 1000),
  }));

  const behaviors = await db.insert(petBehaviors).values(values).returning();
  return c.json({ behaviors, count: behaviors.length }, 201);
});

// ===== 统计概览 =====

adminRoute.get("/stats", async (c) => {
  const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
  const [petCount] = await db.select({ count: sql<number>`count(*)` }).from(pets);
  const [collarCount] = await db.select({ count: sql<number>`count(*)` }).from(collarDevices);
  const [desktopCount] = await db.select({ count: sql<number>`count(*)` }).from(desktopDevices);
  const [behaviorCount] = await db.select({ count: sql<number>`count(*)` }).from(petBehaviors);

  return c.json({
    users: Number(userCount.count),
    pets: Number(petCount.count),
    collars: Number(collarCount.count),
    desktops: Number(desktopCount.count),
    behaviors: Number(behaviorCount.count),
  });
});

export default adminRoute;
