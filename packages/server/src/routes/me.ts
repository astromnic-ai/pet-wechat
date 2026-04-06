import { Hono } from "hono";
import { db } from "../db";
import { desktopDevices, petAvatars, pets, users } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

const meRoute = new Hono();

// 获取当前用户信息（受 authMiddleware 保护）
meRoute.get("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return c.json({ error: "User not found" }, 404);

  const ownedPets = await db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.userId, userId));
  const petIds = ownedPets.map((pet) => pet.id);

  const avatars = petIds.length
    ? await db
        .select({ id: petAvatars.id })
        .from(petAvatars)
        .where(inArray(petAvatars.petId, petIds))
    : [];

  const desktopBindings = await db
    .select({ id: desktopDevices.id })
    .from(desktopDevices)
    .where(eq(desktopDevices.userId, userId));

  return c.json({
    user,
    quotas: {
      avatarQuota: user.avatarQuota,
      avatarUsed: avatars.length,
      deviceBindingQuota: user.deviceBindingQuota,
      deviceBindingUsed: desktopBindings.length,
    },
  });
});

// 更新当前用户信息
meRoute.put("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.json();

  const [existing] = await db.select().from(users).where(eq(users.id, userId));
  if (!existing) return c.json({ error: "User not found" }, 404);

  const [user] = await db
    .update(users)
    .set({
      nickname: body.nickname ?? existing.nickname,
      avatarUrl: body.avatarUrl ?? existing.avatarUrl,
    })
    .where(eq(users.id, userId))
    .returning();
  return c.json({ user });
});

export default meRoute;
