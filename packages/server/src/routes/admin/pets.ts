import { Hono } from "hono";
import { eq, inArray, desc } from "drizzle-orm";
import { db } from "../../db";
import {
  users,
  pets,
  collarDevices,
  desktopPetBindings,
  petBehaviors,
  petAvatars,
  petAvatarActions,
  deviceAuthorizations,
} from "../../db/schema";
import { pick } from "./index";

const petsRoute = new Hono();

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
  return c.json({ success: true });
});

export default petsRoute;
