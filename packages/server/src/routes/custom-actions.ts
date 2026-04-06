import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { customActions, pets } from "../db/schema";

const customActionsRoute = new Hono();

async function ensureOwnedPet(userId: string, petId: string) {
  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)))
    .limit(1);

  return pet ?? null;
}

function normalizeRequiredString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

customActionsRoute.get("/:id/custom-actions", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const pet = await ensureOwnedPet(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const result = await db
    .select()
    .from(customActions)
    .where(eq(customActions.petId, petId))
    .orderBy(desc(customActions.createdAt));

  return c.json({ customActions: result });
});

customActionsRoute.post("/:id/custom-actions", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const pet = await ensureOwnedPet(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const body = await c.req.json<{
    name?: string;
    description?: string;
    videoUrl?: string;
  }>();
  const name = normalizeRequiredString(body.name);
  const videoUrl = normalizeRequiredString(body.videoUrl);

  if (!name) {
    return c.json({ error: "name 不能为空" }, 400);
  }

  if (!videoUrl) {
    return c.json({ error: "videoUrl 不能为空" }, 400);
  }

  const [customAction] = await db
    .insert(customActions)
    .values({
      petId,
      userId,
      name,
      description: normalizeOptionalString(body.description),
      videoUrl,
      status: "pending",
      resultImageUrl: null,
    })
    .returning();

  return c.json({ customAction }, 201);
});

customActionsRoute.delete("/:id/custom-actions/:actionId", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("id");
  const actionId = c.req.param("actionId");
  const pet = await ensureOwnedPet(userId, petId);

  if (!pet) {
    return c.json({ error: "Pet not found" }, 404);
  }

  const [action] = await db
    .select()
    .from(customActions)
    .where(and(eq(customActions.id, actionId), eq(customActions.petId, petId)))
    .limit(1);

  if (!action) {
    return c.json({ error: "Custom action not found" }, 404);
  }

  if (action.status === "processing") {
    return c.json({ error: "处理中的动作不能删除" }, 400);
  }

  await db
    .delete(customActions)
    .where(and(eq(customActions.id, actionId), eq(customActions.petId, petId)));

  return c.json({ success: true });
});

export default customActionsRoute;
