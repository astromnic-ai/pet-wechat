import { Hono } from "hono";
import { db } from "../db";
import { messages, petAvatars, petAvatarActions, pets } from "../db/schema";
import { eq, and, ne, asc } from "drizzle-orm";
import { broadcast } from "../ws";
import { isManagedStorageUrl } from "../utils/storage";

const avatarsRoute = new Hono();

// 上传图片，创建定制任务
avatarsRoute.post("/", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.json<{
    petId: string;
    sourceImageUrl: string;
    additionalImages?: string[];
  }>();

  if (!isManagedStorageUrl(body.sourceImageUrl)) {
    return c.json({ error: "Invalid sourceImageUrl" }, 400);
  }

  // 检查宠物归属
  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, body.petId), eq(pets.userId, userId)));
  if (!pet) return c.json({ error: "Pet not found" }, 404);

  // 校验 additionalImages 中的 URL
  if (body.additionalImages?.some((url) => !isManagedStorageUrl(url))) {
    return c.json({ error: "Invalid additionalImages URL" }, 400);
  }

  // 创建定制任务
  const [avatar] = await db
    .insert(petAvatars)
    .values({
      petId: body.petId,
      sourceImageUrl: body.sourceImageUrl,
      additionalImageUrls: body.additionalImages?.length
        ? JSON.stringify(body.additionalImages)
        : null,
      status: "pending",
    })
    .returning();

  return c.json({ avatar }, 201);
});

// 查询定制状态
avatarsRoute.get("/:id", async (c) => {
  const userId = c.get("userId" as never) as string;
  const avatarId = c.req.param("id");
  const [avatar] = await db
    .select()
    .from(petAvatars)
    .where(eq(petAvatars.id, avatarId));
  if (!avatar) return c.json({ error: "Avatar not found" }, 404);

  // 校验宠物归属
  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, avatar.petId), eq(pets.userId, userId)));
  if (!pet) return c.json({ error: "Unauthorized" }, 403);

  const actions = await db
    .select()
    .from(petAvatarActions)
    .where(eq(petAvatarActions.petAvatarId, avatarId));

  return c.json({ avatar, actions });
});

avatarsRoute.post("/:id/actions", async (c) => {
  const userId = c.get("userId" as never) as string;
  const avatarId = c.req.param("id");
  const body = await c.req.json<{
    actions: { actionType: string; imageUrl: string; sortOrder: number }[];
  }>();

  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    return c.json({ error: "actions is required" }, 400);
  }
  if (body.actions.some((action) => !isManagedStorageUrl(action.imageUrl))) {
    return c.json({ error: "Invalid action imageUrl" }, 400);
  }

  const [avatar] = await db
    .select()
    .from(petAvatars)
    .where(eq(petAvatars.id, avatarId));
  if (!avatar) return c.json({ error: "Avatar not found" }, 404);

  // 校验宠物归属
  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, avatar.petId), eq(pets.userId, userId)));
  if (!pet) return c.json({ error: "Unauthorized" }, 403);

  if (avatar.status === "done") {
    const existingActions = await db
      .select()
      .from(petAvatarActions)
      .where(eq(petAvatarActions.petAvatarId, avatarId))
      .orderBy(asc(petAvatarActions.sortOrder));
    return c.json({ actions: existingActions });
  }

  let resultActions: typeof petAvatarActions.$inferSelect[] = [];
  let shouldNotify = false;

  await db.transaction(async (tx) => {
    const [updatedAvatar] = await tx
      .update(petAvatars)
      .set({ status: "done" })
      .where(
        and(
          eq(petAvatars.id, avatarId),
          ne(petAvatars.status, "done"),
        ),
      )
      .returning({ id: petAvatars.id });

    if (!updatedAvatar) {
      resultActions = await tx
        .select()
        .from(petAvatarActions)
        .where(eq(petAvatarActions.petAvatarId, avatarId))
        .orderBy(asc(petAvatarActions.sortOrder));
      return;
    }

    resultActions = await tx
      .insert(petAvatarActions)
      .values(
        body.actions.map((action) => ({
          petAvatarId: avatarId,
          actionType: action.actionType,
          imageUrl: action.imageUrl,
          sortOrder: action.sortOrder,
        })),
      )
      .returning();

    await tx.insert(messages).values({
      userId: pet.userId,
      type: "system",
      title: "形象已就绪",
      content: `${pet.name} 的新形象已生成，快去主页看看吧。`,
    });

    shouldNotify = true;
  });

  if (shouldNotify) {
    broadcast(pet.userId, {
      type: "message:new",
      data: {
        title: "形象已就绪",
        content: `${pet.name} 的新形象已生成，快去主页看看吧。`,
        messageType: "system",
      },
    });
    broadcast(pet.userId, {
      type: "avatar:done",
      data: {
        petId: pet.id,
        avatarId,
        petName: pet.name,
      },
    });
  }

  return c.json({ actions: resultActions });
});

export default avatarsRoute;
