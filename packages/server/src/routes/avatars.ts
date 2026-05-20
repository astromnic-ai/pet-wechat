import { createHash } from "node:crypto";
import { Hono } from "hono";
import { db } from "../db";
import { messages, petAvatars, petAvatarActions, pets, users } from "../db/schema";
import { eq, and, ne, asc, desc } from "drizzle-orm";
import { broadcast } from "../ws";
import { getUserAvatarQuotaSummary } from "../utils/avatarQuota";
import { isManagedStorageUrl, normalizePublicFileUrl, uploadFile } from "../utils/storage";

const avatarsRoute = new Hono();
const MAX_CUSTOM_ACTION_VIDEO_SIZE = 50 * 1024 * 1024;
const CUSTOM_ACTION_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/mpeg",
  "video/mjpeg",
  "video/x-motion-jpeg",
]);

function resolveCustomActionVideoContentType(file: File) {
  if (CUSTOM_ACTION_VIDEO_TYPES.has(file.type)) {
    return file.type;
  }

  if (/\.(mp4|mov|mpeg|mpg|mjpeg|mjpg)$/i.test(file.name)) {
    if (/\.(mjpeg|mjpg)$/i.test(file.name)) return "video/mjpeg";
    if (/\.mov$/i.test(file.name)) return "video/quicktime";
    if (/\.(mpeg|mpg)$/i.test(file.name)) return "video/mpeg";
    return "video/mp4";
  }

  return null;
}

function toPetAvatarActionResponse(action: typeof petAvatarActions.$inferSelect) {
  return {
    ...action,
    imageUrl: normalizePublicFileUrl(action.imageUrl) ?? action.imageUrl,
    videoUrl: normalizePublicFileUrl(action.videoUrl) ?? action.videoUrl,
  };
}

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

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return c.json({ error: "User not found" }, 404);

  const quotaSummary = await getUserAvatarQuotaSummary(userId, user.avatarQuota);
  if (quotaSummary.remainingQuota <= 0) {
    return c.json({ error: "暂无可用定制次数，请先绑定摆台或购买套餐" }, 400);
  }

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

  await db
    .update(pets)
    .set({ draftAvatarSourceImageUrl: null, updatedAt: new Date() })
    .where(and(eq(pets.id, body.petId), eq(pets.userId, userId)));

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

avatarsRoute.post("/custom-action", async (c) => {
  const userId = c.get("userId" as never) as string;
  const body = await c.req.parseBody().catch(() => null);
  if (!body) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const petId = typeof body.petId === "string" ? body.petId.trim() : "";
  const actionName = typeof body.actionName === "string" ? body.actionName.trim() : "";
  const file = body.file;

  if (!petId) {
    return c.json({ error: "petId is required" }, 400);
  }
  if (!actionName || actionName.length > 64) {
    return c.json({ error: "Invalid actionName" }, 400);
  }
  if (!file || typeof file === "string" || Array.isArray(file)) {
    return c.json({ error: "未检测到上传文件" }, 400);
  }

  const uploadedFile = file as File;
  const contentType = resolveCustomActionVideoContentType(uploadedFile);
  if (!contentType) {
    return c.json({ error: "不支持的视频格式，请上传 MP4/MOV/MJPEG 视频" }, 400);
  }
  if (uploadedFile.size > MAX_CUSTOM_ACTION_VIDEO_SIZE) {
    return c.json({ error: "文件过大，请上传 50MB 以内的视频" }, 400);
  }

  const [pet] = await db
    .select()
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.userId, userId)));
  if (!pet) return c.json({ error: "Pet not found" }, 404);

  const [avatar] = await db
    .select()
    .from(petAvatars)
    .where(and(eq(petAvatars.petId, petId), eq(petAvatars.status, "done")))
    .orderBy(desc(petAvatars.createdAt))
    .limit(1);
  if (!avatar) {
    return c.json({ error: "请先完成宠物形象定制，再添加自定义动作" }, 400);
  }

  const buffer = Buffer.from(await uploadedFile.arrayBuffer());
  const videoHash = createHash("sha256").update(buffer).digest("hex");
  const safeActionKey = actionName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "custom";
  const ext = contentType === "video/quicktime"
    ? "mov"
    : contentType === "video/mpeg"
      ? "mpeg"
      : contentType === "video/mjpeg" || contentType === "video/x-motion-jpeg"
        ? "mjpeg"
        : "mp4";
  const videoUrl = await uploadFile(
    `avatars/${avatar.id}/custom-${safeActionKey}-${Date.now()}.${ext}`,
    buffer,
    contentType,
  );

  const [lastAction] = await db
    .select()
    .from(petAvatarActions)
    .where(eq(petAvatarActions.petAvatarId, avatar.id))
    .orderBy(desc(petAvatarActions.sortOrder), desc(petAvatarActions.id))
    .limit(1);

  const [action] = await db
    .insert(petAvatarActions)
    .values({
      petAvatarId: avatar.id,
      actionType: actionName,
      imageUrl: avatar.sourceImageUrl,
      videoUrl,
      videoHash,
      sortOrder: (lastAction?.sortOrder ?? -1) + 1,
    })
    .onConflictDoUpdate({
      target: [petAvatarActions.petAvatarId, petAvatarActions.actionType],
      set: {
        imageUrl: avatar.sourceImageUrl,
        videoUrl,
        videoHash,
      },
    })
    .returning();

  return c.json({ avatar, action: toPetAvatarActionResponse(action) }, 201);
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
