import { Hono } from "hono";
import { db } from "../db";
import { petBehaviors, pets, collarDevices } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { broadcast } from "../ws";
import { dispatchPetAction } from "../pet-mode/scheduler";

const behaviorsRoute = new Hono();

function normalizeBehaviorTimestamp(timestamp: Date | string): string {
  return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
}

// 获取宠物最新行为（主页动态用）
behaviorsRoute.get("/:petId", async (c) => {
  const userId = c.get("userId" as never) as string;
  const petId = c.req.param("petId");
  const limit = Number(c.req.query("limit") ?? 20);

  // 校验宠物归属
  const [pet] = await db.select().from(pets).where(and(eq(pets.id, petId), eq(pets.userId, userId)));
  if (!pet) return c.json({ error: "Pet not found" }, 404);

  const result = await db
    .select()
    .from(petBehaviors)
    .where(eq(petBehaviors.petId, petId))
    .orderBy(desc(petBehaviors.timestamp))
    .limit(limit);

  return c.json({ behaviors: result });
});

// 项圈上报行为数据
behaviorsRoute.post("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.json<{
    petId: string;
    collarDeviceId: string;
    actionType: string;
  }>();

  // 校验宠物归属
  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, body.petId), eq(pets.userId, userId)));
  if (!pet) return c.json({ error: "Pet not found" }, 404);

  // 校验项圈归属
  const [collar] = await db
    .select()
    .from(collarDevices)
    .where(and(eq(collarDevices.id, body.collarDeviceId), eq(collarDevices.userId, userId)));
  if (!collar) return c.json({ error: "Collar not found" }, 404);
  if (collar.petId !== body.petId) return c.json({ error: "项圈与宠物不匹配" }, 400);

  const [behavior] = await db
    .insert(petBehaviors)
    .values({
      petId: body.petId,
      collarDeviceId: body.collarDeviceId,
      actionType: body.actionType,
    })
    .returning();

  broadcast(pet.userId, {
    type: "behavior:new",
    data: {
      petId: behavior.petId,
      actionType: behavior.actionType,
      timestamp: normalizeBehaviorTimestamp(behavior.timestamp),
    },
  });

  if (pet.activityMode === "real") {
    await dispatchPetAction(body.petId).catch((error) => {
      console.error("[pet-mode] real action dispatch failed:", error);
    });
  }

  return c.json({ behavior }, 201);
});

export default behaviorsRoute;
