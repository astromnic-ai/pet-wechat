import { createHash } from "node:crypto";
import { Hono } from "hono";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { ALL_ACTIONS, BASIC_ACTIONS, FUN_ACTIONS, INTERACTIVE_ACTIONS } from "shared";
import { db } from "../../db";
import { desktopDevices, desktopPetBindings, messages, petAvatars, petAvatarActions, pets, users } from "../../db/schema";
import { extractFirstJpegFrame } from "../../utils/mjpeg";
import { isManagedStorageUrl, normalizePublicFileUrl, uploadFile } from "../../utils/storage";
import { broadcast } from "../../ws";
import { publishDesktopConfig } from "../../ota/mqtt-client";

const avatarsRoute = new Hono();

const VALID_AVATAR_STATUSES = new Set([
  "pending",
  "processing",
  "done",
  "failed",
  "approved",
  "rejected",
]);
const EDITABLE_ACTION_STATUSES = new Set(["approved", "processing"]);
const VALID_ACTIONS = new Set<string>(ALL_ACTIONS);
const ADMIN_TIME_ZONE = "Asia/Shanghai";
const MAX_ACTION_VIDEO_SIZE = 50 * 1024 * 1024;
const ACTION_VIDEO_TYPES = new Set(["video/mjpeg", "video/x-motion-jpeg"]);
const ACTION_CATEGORY_TYPES = {
  basic: BASIC_ACTIONS,
  fun: FUN_ACTIONS,
  interactive: INTERACTIVE_ACTIONS,
} as const;
type AvatarStatus = (typeof petAvatars.$inferSelect)["status"];
type AvatarAction = typeof petAvatarActions.$inferSelect;
type ActionCategory = keyof typeof ACTION_CATEGORY_TYPES;

type AvatarRow = {
  avatar: typeof petAvatars.$inferSelect;
  petId: string | null;
  petName: string | null;
  petSpecies: string | null;
  petBreed: string | null;
  petGender: string | null;
  petBirthday: string | null;
  petWeight: number | null;
  userId: string | null;
  userNickname: string | null;
  userAvatarUrl: string | null;
  userWechatOpenid: string | null;
  userPhone: string | null;
};

function toAvatarResponse(row: AvatarRow) {
  const normalizedAdditionalImages = row.avatar.additionalImageUrls
    ? (() => {
        try {
          const parsed = JSON.parse(row.avatar.additionalImageUrls);
          if (!Array.isArray(parsed)) {
            return row.avatar.additionalImageUrls;
          }

          return JSON.stringify(
            parsed.map((item) =>
              typeof item === "string" ? normalizePublicFileUrl(item) ?? item : item,
            ),
          );
        } catch {
          return row.avatar.additionalImageUrls;
        }
      })()
    : null;

  return {
    ...row.avatar,
    sourceImageUrl:
      normalizePublicFileUrl(row.avatar.sourceImageUrl) ?? row.avatar.sourceImageUrl,
    homepageImageUrl:
      normalizePublicFileUrl(row.avatar.homepageImageUrl) ?? row.avatar.homepageImageUrl,
    additionalImageUrls: normalizedAdditionalImages,
    pet: row.petId
      ? {
          id: row.petId,
          name: row.petName,
          species: row.petSpecies,
          breed: row.petBreed,
          gender: row.petGender,
          birthday: row.petBirthday,
          weight: row.petWeight,
        }
      : null,
    user: row.userId
      ? {
          id: row.userId,
          nickname: row.userNickname,
          avatarUrl: row.userAvatarUrl,
          wechatOpenid: row.userWechatOpenid,
          phone: row.userPhone,
        }
      : null,
  };
}

function toActionResponse(action: AvatarAction) {
  return {
    ...action,
    imageUrl: normalizePublicFileUrl(action.imageUrl) ?? action.imageUrl,
    videoUrl: normalizePublicFileUrl(action.videoUrl) ?? action.videoUrl,
  };
}

function isPngUrl(url: string) {
  return /\.png(?:$|[?#])/i.test(url);
}

async function getAvatarRow(avatarId: string) {
  const [row] = await db
    .select({
      avatar: petAvatars,
      petId: pets.id,
      petName: pets.name,
      petSpecies: pets.species,
      petBreed: pets.breed,
      petGender: pets.gender,
      petBirthday: pets.birthday,
      petWeight: pets.weight,
      userId: users.id,
      userNickname: users.nickname,
      userAvatarUrl: users.avatarUrl,
      userWechatOpenid: users.wechatOpenid,
      userPhone: users.phone,
    })
    .from(petAvatars)
    .leftJoin(pets, eq(petAvatars.petId, pets.id))
    .leftJoin(users, eq(pets.userId, users.id))
    .where(eq(petAvatars.id, avatarId));

  return row ?? null;
}

async function getAvatarActions(avatarId: string) {
  const actions = await db
    .select()
    .from(petAvatarActions)
    .where(eq(petAvatarActions.petAvatarId, avatarId))
    .orderBy(asc(petAvatarActions.sortOrder), asc(petAvatarActions.actionType), asc(petAvatarActions.id));

  return actions.map(toActionResponse);
}

async function republishDesktopConfigsForPet(petId: string, reason: string) {
  const bindings = await db
    .select({
      desktopId: desktopDevices.id,
      chipId: desktopDevices.chipId,
      bindingId: desktopPetBindings.id,
      bindingType: desktopPetBindings.bindingType,
      petId: desktopPetBindings.petId,
    })
    .from(desktopPetBindings)
    .leftJoin(desktopDevices, eq(desktopDevices.id, desktopPetBindings.desktopDeviceId))
    .where(and(eq(desktopPetBindings.petId, petId), isNull(desktopPetBindings.unboundAt)));

  await Promise.all(
    bindings
      .filter((binding) => Boolean(binding.chipId))
      .map((binding) =>
        publishDesktopConfig(binding.chipId as string, {
          v: 1,
          state: "bound",
          petId: binding.petId,
          bindingId: binding.bindingId,
          bindingType: binding.bindingType,
        }).catch((error) => {
          console.error("[admin/avatars] failed to republish desktop config", {
            reason,
            petId,
            desktopId: binding.desktopId,
            chipId: binding.chipId,
            error,
          });
        }),
      ),
  );
}

function resolveActionVideoContentType(file: File) {
  if (ACTION_VIDEO_TYPES.has(file.type)) {
    return file.type;
  }

  if (/\.(mjpeg|mjpg)$/i.test(file.name)) {
    return "video/mjpeg";
  }

  return null;
}

function getAvatarOwnerContext(row: AvatarRow) {
  if (!row.petId || !row.petName || !row.userId) {
    return null;
  }

  return {
    petId: row.petId,
    petName: row.petName,
    userId: row.userId,
  };
}

function getActionCategoryTypes(category: string): readonly string[] | null {
  if (category === "basic" || category === "fun" || category === "interactive") {
    return ACTION_CATEGORY_TYPES[category];
  }

  return null;
}

function buildApprovalMessage() {
  return {
    title: "进度更新：您的宝贝数字影像开始“加载”啦！",
    content:
      "您的宠物图像已通过审核，现在正式进入【24组动态影像定制】阶段。请耐心等待，您的桌面小精灵正在赶来的路上。",
  };
}

function buildRejectMessage(reason: string, titleOverride?: string) {
  const withTitle = (message: { title: string; content: string }) => ({
    ...message,
    title: titleOverride?.trim() || message.title,
  });

  switch (reason) {
    case "该图片不是宠物图片":
      return withTitle({
        title: "图像审核未通过：未检测到宠物形象",
        content:
          "抱歉，您上传的图片中似乎没有发现可爱的宠物身影。本产品暂仅支持【猫/狗】的宠物专项影像定制，请重新上传一张宠物的清晰美照吧。",
      });
    case "宠物形象有遮挡":
      return withTitle({
        title: "图像审核未通过：宠物身体存在遮挡",
        content:
          "宠物照片被其他物体遮挡住了一部分。为了保证定制出的动作（如扑、跳、滚）足够完整自然，请上传一张【全身无遮挡】的宠物全身或半身照。",
      });
    case "宠物面部不完全":
      return withTitle({
        title: "图像审核未通过：面部识别不完整",
        content:
          "您上传的图片中，宠物的面部五官不完整，请重新上传一张【正面】的照片。",
      });
    case "光线过暗":
      return withTitle({
        title: "图像审核未通过：环境光线太暗啦",
        content:
          "图片光线不足影响宠物定制细节效果，建议您在【光线充足的白天】或【明亮的室内】为宝贝重新拍一张照片哦。",
      });
    default:
      return withTitle({
        title: "图像审核未通过",
        content: `抱歉，您上传的宠物图片未通过审核：${reason}。请根据提示调整后重新上传。`,
      });
  }
}

function appendAvatarRetryAction(content: string, params: { petId: string; avatarId: string }) {
  const action = new URLSearchParams({
    type: "avatar-retry",
    petId: params.petId,
    avatarId: params.avatarId,
  });
  return `${content}\n\n#action:${action.toString()}`;
}

function broadcastSystemMessage(userId: string, payload: { title: string; content: string }) {
  broadcast(userId, {
    type: "message:new",
    data: {
      title: payload.title,
      content: payload.content,
      messageType: "system",
    },
  });
}

avatarsRoute.get("/avatars", async (c) => {
  const status = c.req.query("status");

  if (status && !VALID_AVATAR_STATUSES.has(status)) {
    return c.json({ error: "Invalid status" }, 400);
  }

  const query = db
    .select({
      avatar: petAvatars,
      petId: pets.id,
      petName: pets.name,
      petSpecies: pets.species,
      petBreed: pets.breed,
      petGender: pets.gender,
      petBirthday: pets.birthday,
      petWeight: pets.weight,
      userId: users.id,
      userNickname: users.nickname,
      userAvatarUrl: users.avatarUrl,
      userWechatOpenid: users.wechatOpenid,
      userPhone: users.phone,
    })
    .from(petAvatars)
    .leftJoin(pets, eq(petAvatars.petId, pets.id))
    .leftJoin(users, eq(pets.userId, users.id));

  const rows = status
    ? await query.where(eq(petAvatars.status, status as AvatarStatus)).orderBy(desc(petAvatars.createdAt))
    : await query.orderBy(desc(petAvatars.createdAt));

  return c.json({
    avatars: rows.map((row) => toAvatarResponse(row as AvatarRow)),
  });
});

avatarsRoute.get("/avatars/:id", async (c) => {
  const avatarId = c.req.param("id");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  const actions = await getAvatarActions(avatarId);

  return c.json({
    avatar: {
      ...toAvatarResponse(row),
      actions,
    },
  });
});

avatarsRoute.put("/avatars/:id/approve", async (c) => {
  const avatarId = c.req.param("id");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (row.avatar.status === "approved" || row.avatar.status === "processing" || row.avatar.status === "done") {
    return c.json({ avatar: toAvatarResponse(row) });
  }

  if (row.avatar.status !== "pending" && row.avatar.status !== "rejected") {
    return c.json({ error: "Avatar cannot be approved" }, 400);
  }

  const ownerContext = getAvatarOwnerContext(row);
  if (!ownerContext) {
    return c.json({ error: "Avatar relation not found" }, 400);
  }

  const reviewedAt = new Date();
  const approvalMessage = buildApprovalMessage();

  const [avatar] = await db.transaction(async (tx) => {
    const [updatedAvatar] = await tx
      .update(petAvatars)
      .set({
        status: "approved",
        rejectReason: null,
        reviewedAt,
      })
      .where(eq(petAvatars.id, avatarId))
      .returning();

    await tx.insert(messages).values({
      userId: ownerContext.userId,
      type: "system",
      title: approvalMessage.title,
      content: approvalMessage.content,
    });

    return [updatedAvatar];
  });

  broadcastSystemMessage(ownerContext.userId, approvalMessage);

  return c.json({
    avatar: toAvatarResponse({
      ...row,
      avatar: avatar ?? {
        ...row.avatar,
        status: "approved",
        rejectReason: null,
        reviewedAt,
      },
    }),
  });
});

avatarsRoute.put("/avatars/:id/reject", async (c) => {
  const avatarId = c.req.param("id");
  const body = await c.req.json<{ reason?: string; title?: string }>();
  const reason = body.reason?.trim();
  const title = body.title?.trim();

  if (!reason) {
    return c.json({ error: "reason is required" }, 400);
  }

  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (row.avatar.status === "approved" || row.avatar.status === "processing" || row.avatar.status === "done") {
    return c.json({ error: "Avatar cannot be rejected" }, 400);
  }

  if (row.avatar.status !== "pending" && row.avatar.status !== "rejected") {
    return c.json({ error: "Avatar cannot be rejected" }, 400);
  }

  const ownerContext = getAvatarOwnerContext(row);
  if (!ownerContext) {
    return c.json({ error: "Avatar relation not found" }, 400);
  }

  const nextReviewedAt = row.avatar.status === "pending" ? new Date() : row.avatar.reviewedAt;
  const rejectMessageBase = buildRejectMessage(reason, title);
  const rejectMessage = {
    ...rejectMessageBase,
    content: appendAvatarRetryAction(rejectMessageBase.content, {
      petId: ownerContext.petId,
      avatarId,
    }),
  };

  const [avatar] = await db.transaction(async (tx) => {
    const [updatedAvatar] = await tx
      .update(petAvatars)
      .set(
        row.avatar.status === "pending"
          ? {
              status: "rejected",
              rejectReason: reason,
              reviewedAt: nextReviewedAt,
            }
          : {
              rejectReason: reason,
            },
      )
      .where(eq(petAvatars.id, avatarId))
      .returning();

    await tx.insert(messages).values({
      userId: ownerContext.userId,
      type: "system",
      title: rejectMessage.title,
      content: rejectMessage.content,
    });

    return [updatedAvatar];
  });

  broadcastSystemMessage(ownerContext.userId, rejectMessageBase);

  return c.json({
    avatar: toAvatarResponse({
      ...row,
      avatar:
        avatar ??
        (row.avatar.status === "pending"
          ? {
              ...row.avatar,
              status: "rejected",
              rejectReason: reason,
              reviewedAt: nextReviewedAt,
            }
          : {
              ...row.avatar,
              rejectReason: reason,
            }),
    }),
  });
});

avatarsRoute.get("/avatars/:id/actions", async (c) => {
  const avatarId = c.req.param("id");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  const actions = await getAvatarActions(avatarId);

  return c.json({ actions });
});

avatarsRoute.put("/avatars/:id/meta", async (c) => {
  const avatarId = c.req.param("id");
  const body = await c.req.json<{ petDescription?: string | null; funFact?: string | null }>();
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  const petDescription = typeof body.petDescription === "string" ? body.petDescription.trim() : "";
  const funFact = typeof body.funFact === "string" ? body.funFact.trim() : "";

  const [avatar] = await db
    .update(petAvatars)
    .set({
      petDescription: petDescription || null,
      funFact: funFact || null,
    })
    .where(eq(petAvatars.id, avatarId))
    .returning();

  return c.json({
    avatar: toAvatarResponse({
      ...row,
      avatar: avatar ?? {
        ...row.avatar,
        petDescription: petDescription || null,
        funFact: funFact || null,
      },
    }),
  });
});

avatarsRoute.put("/avatars/:id/homepage-image", async (c) => {
  const avatarId = c.req.param("id");
  const body = await c.req.json<{ homepageImageUrl?: string | null }>();
  const homepageImageUrl =
    typeof body.homepageImageUrl === "string" ? body.homepageImageUrl.trim() : body.homepageImageUrl;

  if (homepageImageUrl !== null && typeof homepageImageUrl !== "string") {
    return c.json({ error: "Invalid homepageImageUrl" }, 400);
  }

  if (homepageImageUrl && !isManagedStorageUrl(homepageImageUrl)) {
    return c.json({ error: "Invalid homepageImageUrl" }, 400);
  }

  if (homepageImageUrl && !isPngUrl(homepageImageUrl)) {
    return c.json({ error: "Homepage image must be PNG" }, 400);
  }

  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (!["approved", "processing", "done"].includes(row.avatar.status)) {
    return c.json({ error: "Avatar must be approved, processing, or done" }, 400);
  }

  const [avatar] = await db
    .update(petAvatars)
    .set({ homepageImageUrl: homepageImageUrl || null })
    .where(eq(petAvatars.id, avatarId))
    .returning();

  return c.json({
    avatar: toAvatarResponse({
      ...row,
      avatar: avatar ?? {
        ...row.avatar,
        homepageImageUrl: homepageImageUrl || null,
      },
    }),
  });
});

avatarsRoute.post("/avatars/:id/actions", async (c) => {
  const avatarId = c.req.param("id");
  const body = await c.req.json<{ actionType?: string; imageUrl?: string; videoUrl?: string | null }>();
  const actionType = body.actionType;
  const imageUrl = body.imageUrl;
  const hasVideoUrl = Object.prototype.hasOwnProperty.call(body, "videoUrl");
  const videoUrl = body.videoUrl ?? null;

  if (typeof actionType !== "string" || !VALID_ACTIONS.has(actionType)) {
    return c.json({ error: "Invalid actionType" }, 400);
  }

  if (typeof imageUrl !== "string" || !isManagedStorageUrl(imageUrl)) {
    return c.json({ error: "Invalid imageUrl" }, 400);
  }

  if (hasVideoUrl && videoUrl !== null && (typeof videoUrl !== "string" || !isManagedStorageUrl(videoUrl))) {
    return c.json({ error: "Invalid videoUrl" }, 400);
  }

  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  const [existingAction] = await db
    .select()
    .from(petAvatarActions)
    .where(
      and(
        eq(petAvatarActions.petAvatarId, avatarId),
        eq(petAvatarActions.actionType, actionType),
      ),
    )
    .limit(1);

  const canReplaceDoneAction = row.avatar.status === "done" && !!existingAction;
  if (!EDITABLE_ACTION_STATUSES.has(row.avatar.status) && !canReplaceDoneAction) {
    return c.json(
      {
        error:
          row.avatar.status === "done"
            ? "Completed avatars can only replace existing actions"
            : "Avatar must be approved or processing",
      },
      400,
    );
  }

  const [action, avatar] = await db.transaction(async (tx) => {
    const [lastAction] = await tx
      .select()
      .from(petAvatarActions)
      .where(eq(petAvatarActions.petAvatarId, avatarId))
      .orderBy(desc(petAvatarActions.sortOrder), desc(petAvatarActions.id))
      .limit(1);

    const [createdOrUpdatedAction] = existingAction
      ? await tx
          .update(petAvatarActions)
          .set({
            imageUrl,
            ...(hasVideoUrl ? { videoUrl } : {}),
          })
          .where(eq(petAvatarActions.id, existingAction.id))
          .returning()
      : await tx
          .insert(petAvatarActions)
          .values({
            petAvatarId: avatarId,
            actionType,
            imageUrl,
            videoUrl,
            sortOrder: (lastAction?.sortOrder ?? -1) + 1,
          })
          .onConflictDoUpdate({
            target: [petAvatarActions.petAvatarId, petAvatarActions.actionType],
            set: {
              imageUrl,
              ...(hasVideoUrl ? { videoUrl } : {}),
            },
          })
          .returning();

    if (row.avatar.status === "approved") {
      const [updatedAvatar] = await tx
        .update(petAvatars)
        .set({ status: "processing" })
        .where(eq(petAvatars.id, avatarId))
        .returning();

      return [createdOrUpdatedAction, updatedAvatar];
    }

    return [createdOrUpdatedAction, row.avatar];
  });

  return c.json({
    action: toActionResponse(action),
    avatarStatus: avatar?.status ?? (row.avatar.status === "approved" ? "processing" : row.avatar.status),
  });
});

avatarsRoute.delete("/avatars/:id/actions/:actionId", async (c) => {
  const avatarId = c.req.param("id");
  const actionId = c.req.param("actionId");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (!EDITABLE_ACTION_STATUSES.has(row.avatar.status)) {
    return c.json({ error: "Avatar actions can only be deleted while approved or processing" }, 400);
  }

  const [action] = await db
    .select()
    .from(petAvatarActions)
    .where(and(eq(petAvatarActions.id, actionId), eq(petAvatarActions.petAvatarId, avatarId)));

  if (!action) {
    return c.json({ error: "Action not found" }, 404);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(petAvatarActions)
      .where(and(eq(petAvatarActions.id, actionId), eq(petAvatarActions.petAvatarId, avatarId)));

    const [remainingAction] = await tx
      .select({ id: petAvatarActions.id })
      .from(petAvatarActions)
      .where(eq(petAvatarActions.petAvatarId, avatarId))
      .limit(1);

    if (!remainingAction && row.avatar.status === "processing") {
      await tx
        .update(petAvatars)
        .set({ status: "approved" })
        .where(eq(petAvatars.id, avatarId));
    }
  });

  await republishDesktopConfigsForPet(row.avatar.petId, "avatar-action-delete");

  return c.json({ success: true });
});

avatarsRoute.post("/avatars/:id/action-categories/:category/save", async (c) => {
  const avatarId = c.req.param("id");
  const category = c.req.param("category") as ActionCategory;
  const categoryActionTypes = getActionCategoryTypes(category);

  if (!categoryActionTypes) {
    return c.json({ error: "Invalid action category" }, 400);
  }

  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (!EDITABLE_ACTION_STATUSES.has(row.avatar.status) && row.avatar.status !== "done") {
    return c.json({ error: "Avatar actions can only be saved while approved, processing or done" }, 400);
  }

  const actions = await getAvatarActions(avatarId);
  const categoryActionTypeSet = new Set(categoryActionTypes);
  const savedActions = actions.filter((action) => categoryActionTypeSet.has(action.actionType));
  const savedActionTypes = new Set(savedActions.map((action) => action.actionType));

  let nextStatus = row.avatar.status;

  if (row.avatar.status === "approved" && savedActionTypes.size > 0) {
    const [updatedAvatar] = await db
      .update(petAvatars)
      .set({ status: "processing" })
      .where(eq(petAvatars.id, avatarId))
      .returning();

    nextStatus = updatedAvatar?.status ?? "processing";
  }

  return c.json({
    category,
    saved: savedActionTypes.size,
    total: categoryActionTypes.length,
    actions: savedActions,
    avatarStatus: nextStatus,
  });
});

avatarsRoute.post("/avatars/:id/actions/:actionId/video", async (c) => {
  const avatarId = c.req.param("id");
  const actionId = c.req.param("actionId");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  const [action] = await db
    .select()
    .from(petAvatarActions)
    .where(and(eq(petAvatarActions.id, actionId), eq(petAvatarActions.petAvatarId, avatarId)))
    .limit(1);

  if (!action) {
    return c.json({ error: "Action not found" }, 404);
  }

  try {
    const body = await c.req.parseBody();
    const file = body.file;

    if (!file || typeof file === "string" || Array.isArray(file)) {
      return c.json({ error: "未检测到上传文件" }, 400);
    }

    const uploadedFile = file as File;
    const contentType = resolveActionVideoContentType(uploadedFile);

    if (!contentType) {
      return c.json({ error: "不支持的文件格式，请上传 MJPEG 文件" }, 400);
    }

    if (uploadedFile.size > MAX_ACTION_VIDEO_SIZE) {
      return c.json({ error: "文件过大，请上传 50MB 以内的视频" }, 400);
    }

    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const thumbnailBuffer = extractFirstJpegFrame(buffer);

    if (!thumbnailBuffer) {
      return c.json({ error: "无法从 MJPEG 文件中提取首帧" }, 400);
    }

    const videoHash = createHash("sha256").update(buffer).digest("hex");
    const videoUrl = await uploadFile(
      `avatars/${avatarId}/${action.actionType}.mjpeg`,
      buffer,
      contentType,
    );
    const imageUrl = await uploadFile(
      `avatars/${avatarId}/${action.actionType}-thumb.jpg`,
      thumbnailBuffer,
      "image/jpeg",
    );

    const [updatedAction] = await db
      .update(petAvatarActions)
      .set({ imageUrl, videoUrl, videoHash })
      .where(and(eq(petAvatarActions.id, actionId), eq(petAvatarActions.petAvatarId, avatarId)))
      .returning();

    return c.json({
      action: toActionResponse({
        ...(updatedAction ?? action),
        imageUrl,
        videoUrl,
        videoHash,
      }),
    });
  } catch (error) {
    console.error("Admin action video upload failed:", error);
    return c.json({ error: "视频上传失败，请稍后重试" }, 503);
  }
});

avatarsRoute.post("/avatars/:id/sync", async (c) => {
  const avatarId = c.req.param("id");
  const row = await getAvatarRow(avatarId);

  if (!row) {
    return c.json({ error: "Avatar not found" }, 404);
  }

  if (row.avatar.status === "done") {
    return c.json({ avatar: toAvatarResponse(row) });
  }

  const ownerContext = getAvatarOwnerContext(row);
  if (!ownerContext) {
    return c.json({ error: "Avatar relation not found" }, 400);
  }

  const actions = await getAvatarActions(avatarId);
  const completedActionTypes = new Set(actions.map((action) => action.actionType));

  if (completedActionTypes.size < ALL_ACTIONS.length) {
    return c.json({ error: `请先完成全部 ${ALL_ACTIONS.length} 个定制动作后再同步` }, 400);
  }

  if (row.avatar.status !== "processing" && row.avatar.status !== "approved") {
    return c.json({ error: "Avatar must be processing or approved" }, 400);
  }

  const [avatar] = await db.transaction(async (tx) => {
    const [updatedAvatar] = await tx
      .update(petAvatars)
      .set({ status: "done" })
      .where(eq(petAvatars.id, avatarId))
      .returning();

    await tx.insert(messages).values({
      userId: ownerContext.userId,
      type: "system",
      title: "形象已就绪",
      content: row.avatar.petDescription || row.avatar.funFact
        ? `${ownerContext.petName} 的新形象和定制描述已同步完成，快去主页看看吧。`
        : `${ownerContext.petName} 的新形象已生成，快去主页看看吧。`,
    });

    return [updatedAvatar];
  });

  broadcastSystemMessage(ownerContext.userId, {
    title: "形象已就绪",
    content:
      row.avatar.petDescription || row.avatar.funFact
        ? `${ownerContext.petName} 的新形象和定制描述已同步完成，快去主页看看吧。`
        : `${ownerContext.petName} 的新形象已生成，快去主页看看吧。`,
  });

  broadcast(ownerContext.userId, {
    type: "avatar:done",
    data: {
      petId: ownerContext.petId,
      avatarId,
      petName: ownerContext.petName,
    },
  });

  return c.json({
    avatar: toAvatarResponse({
      ...row,
      avatar: avatar ?? {
        ...row.avatar,
        status: "done",
      },
    }),
  });
});

avatarsRoute.get("/avatar-review/stats", async (c) => {
  const [row] = await db.execute<{
    pending_review: number | string;
    approved_total: number | string;
    synced_to_devices: number | string;
    today_new_uploads: number | string;
    today_completed: number | string;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE pa.status = 'pending')::int AS pending_review,
      COUNT(*) FILTER (
        WHERE pa.status IN ('approved', 'processing', 'done')
      )::int AS approved_total,
      COUNT(*) FILTER (
        WHERE pa.reviewed_at IS NOT NULL
          AND pa.status IN ('approved', 'processing', 'done', 'rejected')
      )::int AS synced_to_devices,
      COUNT(*) FILTER (
        WHERE (pa.created_at AT TIME ZONE ${ADMIN_TIME_ZONE})::date = (now() AT TIME ZONE ${ADMIN_TIME_ZONE})::date
      )::int AS today_new_uploads,
      COUNT(*) FILTER (
        WHERE pa.reviewed_at IS NOT NULL
          AND (pa.reviewed_at AT TIME ZONE ${ADMIN_TIME_ZONE})::date = (now() AT TIME ZONE ${ADMIN_TIME_ZONE})::date
      )::int AS today_completed
    FROM pet_avatars pa
  `);

  return c.json({
    pendingReview: Number(row?.pending_review ?? 0),
    approvedTotal: Number(row?.approved_total ?? 0),
    syncedToDevices: Number(row?.synced_to_devices ?? 0),
    todayNewUploads: Number(row?.today_new_uploads ?? 0),
    todayCompleted: Number(row?.today_completed ?? 0),
  });
});

export default avatarsRoute;
