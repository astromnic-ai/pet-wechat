import { Hono } from "hono";
import { and, eq, inArray, isNull, desc } from "drizzle-orm";
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

const petsRoute = new Hono();

async function clearDesktopConfigsSafely(chipIds: string[]) {
  await Promise.all(
    Array.from(new Set(chipIds.filter(Boolean))).map((chipId) =>
      clearRetainedDesktopConfig(chipId, "pet-delete").catch((error) => {
        console.error("[admin/pets] failed to clear desktop config after pet delete", {
          chipId,
          error,
        });
      }),
    ),
  );
}

petsRoute.get("/pets", async (c) => {
  const result = await db
    .select({
      pet: pets,
      ownerNickname: users.nickname,
    })
    .from(pets)
    .leftJoin(users, eq(pets.userId, users.id))
    .orderBy(desc(pets.createdAt));
  return c.json({
    pets: result.map((row) => ({ ...row.pet, ownerNickname: row.ownerNickname })),
  });
});

petsRoute.post("/pets", async (c) => {
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

petsRoute.put("/pets/:id", async (c) => {
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

petsRoute.delete("/pets/:id", async (c) => {
  const id = c.req.param("id");
  const activeBindings = await db
    .select({ desktopDeviceId: desktopPetBindings.desktopDeviceId })
    .from(desktopPetBindings)
    .where(and(eq(desktopPetBindings.petId, id), isNull(desktopPetBindings.unboundAt)));
  const desktopIds = activeBindings.map((binding) => binding.desktopDeviceId);
  const boundDesktops =
    desktopIds.length > 0
      ? await db.select({ chipId: desktopDevices.chipId }).from(desktopDevices).where(inArray(desktopDevices.id, desktopIds))
      : [];
  const chipIdsToClear = boundDesktops.map((desktop) => desktop.chipId).filter((chipId): chipId is string => Boolean(chipId));

  await db.transaction(async (tx) => {
    const avatars = await tx.select({ id: petAvatars.id }).from(petAvatars).where(eq(petAvatars.petId, id));
    const avatarIds = avatars.map((avatar) => avatar.id);
    if (avatarIds.length > 0) {
      await tx.delete(petAvatarActions).where(inArray(petAvatarActions.petAvatarId, avatarIds));
    }
    await tx.delete(petAvatars).where(eq(petAvatars.petId, id));
    await tx.delete(petBehaviors).where(eq(petBehaviors.petId, id));
    await tx.update(desktopPetBindings).set({ unboundAt: new Date() }).where(eq(desktopPetBindings.petId, id));
    await tx.delete(deviceAuthorizations).where(eq(deviceAuthorizations.petId, id));
    await tx.update(collarDevices).set({ petId: null }).where(eq(collarDevices.petId, id));
    await tx.delete(pets).where(eq(pets.id, id));
  });
  await clearDesktopConfigsSafely(chipIdsToClear);
  return c.json({ success: true });
});

export default petsRoute;
