import { Hono } from "hono";
import { and, eq, inArray, isNull, sql, desc } from "drizzle-orm";
import { db } from "../../db";
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
} from "../../db/schema";
import { pick } from "./utils";
import { clearRetainedDesktopConfig } from "../../ota/mqtt-client";

const usersRoute = new Hono();

async function clearDesktopConfigsSafely(chipIds: string[]) {
  await Promise.all(
    Array.from(new Set(chipIds.filter(Boolean))).map((chipId) =>
      clearRetainedDesktopConfig(chipId, "user-delete").catch((error) => {
        console.error("[admin/users] failed to clear desktop config after user delete", {
          chipId,
          error,
        });
      }),
    ),
  );
}

usersRoute.get("/users", async (c) => {
  const result = await db.select().from(users).orderBy(desc(users.createdAt));
  return c.json({ users: result });
});

usersRoute.get("/users/enhanced", async (c) => {
  const result = await db
    .select({
      user: users,
      petCount: sql<number>`(
        select count(*)::int
        from pets
        where pets.user_id = ${users.id}
      )`,
      deviceCount: sql<number>`(
        (
          select count(*)::int
          from collar_devices
          where collar_devices.user_id = ${users.id}
        ) + (
          select count(*)::int
          from desktop_devices
          where desktop_devices.user_id = ${users.id}
        )
      )`,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return c.json({
    users: result.map((row) => ({
      ...row.user,
      petCount: Number(row.petCount),
      deviceCount: Number(row.deviceCount),
    })),
  });
});

usersRoute.get("/users/:id/detail", async (c) => {
  const id = c.req.param("id");
  const [[user], userPets, userCollars, userDesktops] = await Promise.all([
    db.select().from(users).where(eq(users.id, id)).limit(1),
    db.select().from(pets).where(eq(pets.userId, id)).orderBy(desc(pets.createdAt)),
    db.select().from(collarDevices).where(eq(collarDevices.userId, id)).orderBy(desc(collarDevices.createdAt)),
    db.select().from(desktopDevices).where(eq(desktopDevices.userId, id)).orderBy(desc(desktopDevices.createdAt)),
  ]);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    user,
    pets: userPets,
    devices: {
      collars: userCollars,
      desktops: userDesktops,
    },
  });
});

usersRoute.post("/users", async (c) => {
  const body = await c.req.json();
  const [user] = await db
    .insert(users)
    .values({
      nickname: body.nickname?.trim() || "",
      wechatOpenid: body.wechatOpenid ?? null,
      phone: body.phone ?? null,
      avatarUrl: body.avatarUrl ?? null,
      avatarQuota: body.avatarQuota ?? 0,
    })
    .returning();
  return c.json({ user }, 201);
});

usersRoute.put("/users/:id", async (c) => {
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

usersRoute.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  const userPets = await db.select({ id: pets.id }).from(pets).where(eq(pets.userId, id));
  const petIds = userPets.map((pet) => pet.id);
  const ownedDesktops = await db.select({ chipId: desktopDevices.chipId }).from(desktopDevices).where(eq(desktopDevices.userId, id));
  const boundDesktopIds =
    petIds.length > 0
      ? (
          await db
            .select({ desktopDeviceId: desktopPetBindings.desktopDeviceId })
            .from(desktopPetBindings)
            .where(and(inArray(desktopPetBindings.petId, petIds), isNull(desktopPetBindings.unboundAt)))
        ).map((binding) => binding.desktopDeviceId)
      : [];
  const boundDesktops =
    boundDesktopIds.length > 0
      ? await db.select({ chipId: desktopDevices.chipId }).from(desktopDevices).where(inArray(desktopDevices.id, boundDesktopIds))
      : [];
  const chipIdsToClear = [...ownedDesktops, ...boundDesktops]
    .map((desktop) => desktop.chipId)
    .filter((chipId): chipId is string => Boolean(chipId));

  await db.transaction(async (tx) => {
    if (petIds.length > 0) {
      const avatars = await tx.select({ id: petAvatars.id }).from(petAvatars).where(inArray(petAvatars.petId, petIds));
      const avatarIds = avatars.map((avatar) => avatar.id);
      if (avatarIds.length > 0) {
        await tx.delete(petAvatarActions).where(inArray(petAvatarActions.petAvatarId, avatarIds));
      }
      await tx.delete(petAvatars).where(inArray(petAvatars.petId, petIds));
      await tx.delete(petBehaviors).where(inArray(petBehaviors.petId, petIds));
      await tx.update(desktopPetBindings).set({ unboundAt: new Date() }).where(inArray(desktopPetBindings.petId, petIds));
      await tx.delete(deviceAuthorizations).where(inArray(deviceAuthorizations.petId, petIds));
      await tx.update(collarDevices).set({ petId: null }).where(inArray(collarDevices.petId, petIds));
    }

    await tx
      .update(desktopPetBindings)
      .set({ unboundAt: new Date() })
      .where(
        sql`${desktopPetBindings.desktopDeviceId} IN (
          SELECT ${desktopDevices.id}
          FROM ${desktopDevices}
          WHERE ${desktopDevices.userId} = ${id}
        )`,
      );
    await tx.delete(collarDevices).where(eq(collarDevices.userId, id));
    await tx.delete(desktopDevices).where(eq(desktopDevices.userId, id));
    await tx.delete(deviceAuthorizations).where(eq(deviceAuthorizations.fromUserId, id));
    await tx.delete(deviceAuthorizations).where(eq(deviceAuthorizations.toUserId, id));
    await tx.delete(pets).where(eq(pets.userId, id));
    await tx.delete(users).where(eq(users.id, id));
  });
  await clearDesktopConfigsSafely(chipIdsToClear);
  return c.json({ success: true });
});

export default usersRoute;
