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
  messages,
  petModes,
  petModeSchedules,
  customActions,
  deviceInteractions,
} from "../db/schema";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createId } from "../utils/id";
import { broadcast } from "../ws";

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

const TIME_PATTERN = /^\d{2}:\d{2}$/;

type AdminScheduleInput = {
  startTime: string;
  endTime: string;
  actionType: string;
};

type CustomActionStatus = "pending" | "processing" | "done" | "failed";
type InteractionType = "touch" | "shake" | "gesture";

function validateScheduleTimes(startTime: string, endTime: string) {
  if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
    return "时间格式错误";
  }

  if (startTime === endTime || startTime > endTime) {
    return "开始时间必须早于结束时间";
  }

  return null;
}

function hasScheduleOverlap(schedules: AdminScheduleInput[]) {
  const sortedSchedules = [...schedules].sort((a, b) =>
    a.startTime === b.startTime ? a.endTime.localeCompare(b.endTime) : a.startTime.localeCompare(b.startTime),
  );

  for (let index = 1; index < sortedSchedules.length; index += 1) {
    if (sortedSchedules[index].startTime < sortedSchedules[index - 1].endTime) {
      return true;
    }
  }

  return false;
}

function validateSchedulesInput(schedules: unknown) {
  if (!Array.isArray(schedules)) {
    return "schedules 必须是数组";
  }

  if (schedules.length > 20) {
    return "时间表最多 20 条";
  }

  for (const schedule of schedules) {
    if (
      !schedule ||
      typeof schedule !== "object" ||
      typeof (schedule as AdminScheduleInput).startTime !== "string" ||
      typeof (schedule as AdminScheduleInput).endTime !== "string" ||
      typeof (schedule as AdminScheduleInput).actionType !== "string" ||
      !(schedule as AdminScheduleInput).actionType.trim()
    ) {
      return "时间表数据不完整";
    }

    const timeError = validateScheduleTimes(
      (schedule as AdminScheduleInput).startTime,
      (schedule as AdminScheduleInput).endTime,
    );
    if (timeError) {
      return timeError;
    }
  }

  if (hasScheduleOverlap(schedules as AdminScheduleInput[])) {
    return "时间段与现有配置重叠";
  }

  return null;
}

function isCustomActionStatus(value: unknown): value is CustomActionStatus {
  return value === "pending" || value === "processing" || value === "done" || value === "failed";
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizePositiveInteger(value: unknown, defaultValue: number, max: number) {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < 1 || value > max) {
    return null;
  }

  return value;
}

function normalizeTimestamp(timestamp: Date | string) {
  return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
}

async function replaceSystemSchedules(
  tx: typeof db,
  petId: string,
  schedules: AdminScheduleInput[],
) {
  await tx
    .delete(petModeSchedules)
    .where(and(eq(petModeSchedules.petId, petId), eq(petModeSchedules.source, "system")));

  if (schedules.length === 0) {
    return [];
  }

  return tx
    .insert(petModeSchedules)
    .values(
      schedules.map((schedule, index) => ({
        petId,
        source: "system" as const,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        actionType: schedule.actionType.trim(),
        sortOrder: index,
      })),
    )
    .returning();
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
      nickname: body.nickname ?? "测试用户",
      wechatOpenid: body.wechatOpenid ?? null,
      phone: body.phone ?? null,
      avatarUrl: body.avatarUrl ?? null,
      avatarQuota: body.avatarQuota ?? 2,
      deviceBindingQuota: body.deviceBindingQuota ?? 3,
    })
    .returning();
  return c.json({ user }, 201);
});

adminRoute.put("/users/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const allowed = pick(body, [
    "nickname",
    "phone",
    "wechatOpenid",
    "avatarUrl",
    "avatarQuota",
    "deviceBindingQuota",
  ]);
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
    const userDesktops = await tx.select({ id: desktopDevices.id }).from(desktopDevices).where(eq(desktopDevices.userId, id));
    const desktopIds = userDesktops.map((desktop) => desktop.id);

    if (petIds.length > 0) {
      // 清理宠物关联的 avatar actions 和 avatars
      const avatars = await tx.select({ id: petAvatars.id }).from(petAvatars).where(inArray(petAvatars.petId, petIds));
      const avatarIds = avatars.map((a) => a.id);
      if (avatarIds.length > 0) {
        await tx.delete(petAvatarActions).where(inArray(petAvatarActions.petAvatarId, avatarIds));
      }
      await tx.delete(petAvatars).where(inArray(petAvatars.petId, petIds));
      await tx.delete(petBehaviors).where(inArray(petBehaviors.petId, petIds));
      await tx.delete(petModes).where(inArray(petModes.petId, petIds));
      await tx.delete(petModeSchedules).where(inArray(petModeSchedules.petId, petIds));
      await tx.delete(customActions).where(inArray(customActions.petId, petIds));
      await tx.delete(deviceInteractions).where(inArray(deviceInteractions.petId, petIds));
      await tx.update(desktopPetBindings).set({ unboundAt: new Date() }).where(inArray(desktopPetBindings.petId, petIds));
      await tx.delete(deviceAuthorizations).where(inArray(deviceAuthorizations.petId, petIds));
      // 解除项圈与宠物的绑定
      await tx.update(collarDevices).set({ petId: null }).where(inArray(collarDevices.petId, petIds));
    }

    // 清理该用户的桌面端绑定
    if (desktopIds.length > 0) {
      await tx.update(desktopPetBindings).set({ unboundAt: new Date() }).where(
        inArray(desktopPetBindings.desktopDeviceId, desktopIds)
      );
      await tx.delete(deviceInteractions).where(inArray(deviceInteractions.desktopDeviceId, desktopIds));
    }
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
      description: body.description ?? null,
      color: body.color ?? null,
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
  const allowed = pick(body, ["name", "species", "breed", "description", "color", "gender", "birthday", "weight", "userId"]);
  const [pet] = await db
    .update(pets)
    .set({ ...allowed, updatedAt: new Date() })
    .where(eq(pets.id, id))
    .returning();
  if (!pet) return c.json({ error: "Pet not found" }, 404);
  return c.json({ pet });
});

adminRoute.get("/pets/:id/mode/schedules", async (c) => {
  const petId = c.req.param("id");
  const schedules = await db
    .select()
    .from(petModeSchedules)
    .where(and(eq(petModeSchedules.petId, petId), eq(petModeSchedules.source, "system")))
    .orderBy(asc(petModeSchedules.sortOrder), asc(petModeSchedules.startTime));

  return c.json({ schedules });
});

adminRoute.put("/pets/:id/mode/schedules", async (c) => {
  const petId = c.req.param("id");
  const body = await c.req.json<{ schedules?: AdminScheduleInput[] }>();
  const validationError = validateSchedulesInput(body.schedules);

  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  const schedules = await db.transaction((tx) =>
    replaceSystemSchedules(tx as typeof db, petId, body.schedules ?? []),
  );

  return c.json({ schedules });
});

adminRoute.post("/pets/batch-schedules", async (c) => {
  const body = await c.req.json<{ petIds?: string[]; schedules?: AdminScheduleInput[] }>();

  if (!Array.isArray(body.petIds) || body.petIds.length === 0) {
    return c.json({ error: "petIds 必须是非空数组" }, 400);
  }

  if (body.petIds.length > 50) {
    return c.json({ error: "petIds 最多 50 个" }, 400);
  }

  const validationError = validateSchedulesInput(body.schedules);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  await db.transaction(async (tx) => {
    for (const petId of body.petIds ?? []) {
      await replaceSystemSchedules(tx as typeof db, petId, body.schedules ?? []);
    }
  });

  return c.json({ updatedCount: body.petIds.length });
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
    await tx.delete(petModes).where(eq(petModes.petId, id));
    await tx.delete(petModeSchedules).where(eq(petModeSchedules.petId, id));
    await tx.delete(customActions).where(eq(customActions.petId, id));
    await tx.delete(deviceInteractions).where(eq(deviceInteractions.petId, id));
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
      name: body.name ?? "模拟项圈",
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
      name: body.name ?? "模拟摆台",
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
  await db.delete(deviceInteractions).where(eq(deviceInteractions.desktopDeviceId, id));
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

// ===== 消息 =====

adminRoute.post("/messages", async (c) => {
  const body = await c.req.json();
  const [message] = await db
    .insert(messages)
    .values({
      userId: body.userId,
      type: body.type,
      title: body.title,
      content: body.content,
      isRead: body.isRead ?? false,
    })
    .returning();

  return c.json({ message }, 201);
});

// ===== 自定义动作 =====

adminRoute.get("/custom-actions", async (c) => {
  const status = c.req.query("status");

  if (status && !isCustomActionStatus(status)) {
    return c.json({ error: "无效的 status" }, 400);
  }

  const result = status
    ? await db
        .select()
        .from(customActions)
        .where(eq(customActions.status, status))
        .orderBy(desc(customActions.createdAt))
    : await db
        .select()
        .from(customActions)
        .orderBy(desc(customActions.createdAt));

  return c.json({ customActions: result });
});

adminRoute.put("/custom-actions/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    status?: CustomActionStatus;
    resultImageUrl?: string;
  }>();

  if (!isCustomActionStatus(body.status)) {
    return c.json({ error: "无效的 status" }, 400);
  }

  const [existingAction] = await db
    .select()
    .from(customActions)
    .where(eq(customActions.id, id))
    .limit(1);

  if (!existingAction) {
    return c.json({ error: "Custom action not found" }, 404);
  }

  const resultImageUrl = normalizeOptionalString(body.resultImageUrl);
  const canUpdateToProcessing = existingAction.status === "pending" && body.status === "processing";
  const canUpdateToDone = existingAction.status === "processing" && body.status === "done";
  const canUpdateToFailed = existingAction.status === "processing" && body.status === "failed";

  if (!canUpdateToProcessing && !canUpdateToDone && !canUpdateToFailed) {
    return c.json({ error: "非法的状态迁移" }, 400);
  }

  if (body.status === "done" && !resultImageUrl) {
    return c.json({ error: "resultImageUrl 必填" }, 400);
  }

  const [customAction] = await db
    .update(customActions)
    .set({
      status: body.status,
      resultImageUrl: body.status === "done" ? resultImageUrl : existingAction.resultImageUrl,
    })
    .where(eq(customActions.id, id))
    .returning();

  if (customAction.status === "done") {
    broadcast(existingAction.userId, {
      type: "custom-action:done",
      data: {
        petId: customAction.petId,
        actionId: customAction.id,
        resultImageUrl: customAction.resultImageUrl,
      },
    });
  }

  return c.json({ customAction });
});

// ===== 互动记录 =====

adminRoute.get("/interactions", async (c) => {
  const limitParam = Number(c.req.query("limit") ?? 50);
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : 50;

  const interactions = await db
    .select()
    .from(deviceInteractions)
    .orderBy(desc(deviceInteractions.timestamp))
    .limit(limit);

  return c.json({ interactions });
});

adminRoute.post("/interactions/auto", async (c) => {
  const body = await c.req.json<{
    petId?: string;
    desktopDeviceId?: string;
    count?: number;
    intervalMinutes?: number;
  }>();

  if (typeof body.petId !== "string" || typeof body.desktopDeviceId !== "string") {
    return c.json({ error: "petId 和 desktopDeviceId 必填" }, 400);
  }

  const count = normalizePositiveInteger(body.count, 10, 1000);
  const intervalMinutes = normalizePositiveInteger(body.intervalMinutes, 30, 10_080);

  if (count === null) {
    return c.json({ error: "count 必须是 1-1000 的正整数" }, 400);
  }

  if (intervalMinutes === null) {
    return c.json({ error: "intervalMinutes 必须是正整数" }, 400);
  }

  const [binding] = await db
    .select()
    .from(desktopPetBindings)
    .where(
      and(
        eq(desktopPetBindings.desktopDeviceId, body.desktopDeviceId),
        eq(desktopPetBindings.petId, body.petId),
        isNull(desktopPetBindings.unboundAt),
      ),
    )
    .limit(1);

  if (!binding) {
    return c.json({ error: "桌面设备与宠物未绑定" }, 400);
  }

  const interactionTypes: InteractionType[] = ["touch", "shake", "gesture"];
  const now = Date.now();
  const values = Array.from({ length: count }, (_, index) => ({
    petId: body.petId as string,
    desktopDeviceId: body.desktopDeviceId as string,
    interactionType: interactionTypes[Math.floor(Math.random() * interactionTypes.length)],
    count: Math.floor(Math.random() * 5) + 1,
    timestamp: new Date(now - index * intervalMinutes * 60 * 1000),
  }));

  const interactions = await db.insert(deviceInteractions).values(values).returning();
  return c.json({ interactions, count: interactions.length }, 201);
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
